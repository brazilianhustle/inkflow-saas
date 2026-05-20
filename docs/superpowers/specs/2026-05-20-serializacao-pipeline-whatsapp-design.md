---
date: 2026-05-20
status: ready-to-plan
related:
  - functions/api/whatsapp/inbound.js
  - functions/_lib/whatsapp-pipeline.js
  - cron-worker/wrangler.toml
  - cron-worker/src/index.js
  - wrangler.toml
backlog_entry: "P0 — Race condition no pipeline WhatsApp (descoberto 2026-05-20, smoke PR-B)"
---

# Serialização do pipeline WhatsApp via Durable Object

## Contexto

O smoke E2E manual do PR-B (2026-05-20, tenant teste `db686ef2`) pegou o bot quebrado
antes de um cliente real: no 1º contato ele perdeu o estado — re-saudou 3× e ignorou
a foto recebida. A investigação (`systematic-debugging`, 3 fronteiras: código + DB + logs CF)
refutou a hipótese inicial (regressão do rename PR #77/#79) e cravou a causa raiz: **o
pipeline não tem serialização por sessão**.

`functions/api/whatsapp/inbound.js:94-98` dispara `processMessage` via `waitUntil`
**fire-and-forget, 1 invocação por mensagem**, coordenada apenas pelo Postgres. Quando o
cliente manda 2+ balões próximos (foto + legenda, ou vários textos — o comportamento
PADRÃO do WhatsApp), duas invocações do Worker rodam concorrentes pra mesma conversa. Isso
produz **três falhas simultâneas**:

1. **Histórico incompleto** — `whatsapp-pipeline.js:142-145` monta o histórico lendo só
   `status=eq.processed`. A msg atual só vira `processed` no fim do pipeline (`:295`, depois
   de `runAgent` + `evoSend`, ~5-12s). Msg N+1 começa antes de N marcar `processed` → não vê
   N nem a resposta a N.
2. **Lost update do estado** — ambas as invocações leem `conversa.estado_agente` /
   `dados_coletados` na Etapa 1 e dão PATCH na Etapa 5. Last-write-wins → a coleta de uma
   sobrescreve a da outra.
3. **Resposta duplicada** — ambas chamam `runAgent` + `evoSend` → o cliente recebe duas
   respostas (a re-saudação dupla observada no smoke).

Evidência crua: msgs `11782` (foto @03:56:32 UTC) + `11783` (texto @03:56:33) → respostas
`11784` "tu tem foto?" + `11785` saudação, ambas em ~2s, sem mensagem humana entre elas.

O comentário em `whatsapp-pipeline.js:140-141` documenta a race como "aceitável" — **não é**:
o impacto real é o atendimento reiniciando do zero. Bloqueia o PR-B na prática (cliente real
nunca chega ao handoff que envia a foto pro Telegram).

### Decisão de produto (cravada no brainstorm)

Quando o cliente dispara vários balões seguidos, o bot deve **agrupar e responder uma vez só**
(debounce), considerando o conjunto — como um humano atende. Isso resolve a corretude (as 3
dimensões da race) **e** a UX de "bot respondeu picado / não juntou as ideias". Serialização
pura (processar 1 por vez, N respostas pra N balões) foi descartada por não resolver a UX.

### Restrições da plataforma (confirmadas nas docs CF, 2026-05-20)

- O core API é **Cloudflare Pages Functions** (`wrangler.toml`: `pages_build_output_dir = "."`),
  não um Worker standalone. Único binding hoje: `AI`. Zero uso de Durable Objects ou Queues.
- **Pages Functions não pode definir/deployar uma DO class** — só fazer binding a uma class
  definida em outro Worker, via `script_name` (obrigatório em Pages). Já existe o Worker
  `inkflow-cron` (`cron-worker/`) no monorepo, que é o lar natural pra DO class.
- **Durable Objects rodam no plano Workers Free** (SQLite-backed): sem custo de storage no
  free, compute coberto. Pro volume atual (1 tenant teste): zero ou trivial.

## Escopo

### In-scope

- Serialização **por sessão** (`tenant_id + telefone`) do pipeline WhatsApp.
- **Debounce**: agrupar balões numa janela de silêncio e processar o lote como **um turno**.
- DO class `SessionQueue` no `cron-worker`, com binding no Pages project.
- Endpoint interno `/api/whatsapp/process-batch` que roda o pipeline pro lote.
- Refator de `processMessage` → `processBatch` (processa N mensagens como 1 turno).
- Modificação de `inbound.js` (enfileira no DO em vez de `waitUntil(processMessage)`).
- TDD: teste que **reproduz a race antes do fix** (regra do backlog) + testes de batch + DO.

### Out-of-scope (features separadas)

- **P1 — foto do cliente nunca chega ao LLM** (descoberto no mesmo smoke). O batch deixa o
  fix do P1 mais fácil depois (o turno já vem agrupado), mas passar imagens ao LLM (visão
  OpenAI vs corrigir prompt R4) é decisão de produto própria. Continua P1 no backlog.
- **Migrar `functions/` de Pages → Workers** (eliminaria a regra "Pages não define DO").
  Refator gigante; não agora.
- **Cron de varredura de órfãs** como rede de segurança secundária — mencionado como
  defense-in-depth fase 2 (o alarm durável do DO já cobre o caso normal). Não-bloqueador.

## Decisões cravadas (com rationale)

| # | Decisão | Rationale |
|---|---------|-----------|
| 1 | **Durable Object + alarm** (não advisory lock nem debounce DB caseiro) | Caso de uso canônico do DO: coordenação por chave + single-thread + alarm nativo. A plataforma garante a serialização → menos código de concorrência nosso (a parte mais difícil de testar). Bate com "o que um dev sênior faria do zero hoje". |
| 2 | **DO mora no `cron-worker`** (não worker novo) | Minimiza superfície de deploy num momento em que o deploy-via-Git do Pages está quebrado (item do backlog). O `cron-worker` já deploya separado e estável. |
| 3 | **Debounce: 4s de silêncio, teto de 15s** desde o 1º balão do lote | 4s agrupa balões digitados em sequência sem atrasar demais a resposta. Teto de 15s evita esperar pra sempre se o cliente não para de digitar. Calibráveis no smoke. |
| 4 | **Auth do endpoint via `CRON_SECRET`** | Secret já existe e o `cron-worker` já o usa pros endpoints cron. Endpoint interno, não-público. Zero secret novo. |
| 5 | **Histórico continua `status=eq.processed`** | Com serialização não há mais race; o lote atual é o turno corrente, o histórico são os turnos anteriores (já `processed`). Confiável agora. Não reintroduzir leitura de `received` (que trazia órfãs). |
| 6 | **`inbound.js` continua persist-first** (INSERT `received` idempotente antes de enfileirar) | Preserva a idempotência por `(session_id, evo_message_id)` e a durabilidade: se o enqueue falhar, a msg está no DB e o cron de varredura (fase 2) ou um retry a recupera. |

## Arquitetura

### Três peças

| Peça | Onde | Papel |
|------|------|-------|
| **`SessionQueue` (DO class)** | `cron-worker/src/session-queue.js` (novo), exportada por `inkflow-cron` | Uma instância por conversa (`idFromName(session_id)`). Acumula `msgRowId`s no storage, faz debounce via alarm, dispara o processamento serializado. |
| **`inbound.js`** (modificado) | `functions/api/whatsapp/inbound.js` | Persist-first inalterado. Troca `waitUntil(processMessage)` por `waitUntil(stub.fetch("/enqueue"))`. Responde 200 < 200ms. |
| **`process-batch`** (novo endpoint) | `functions/api/whatsapp/process-batch.js` | Recebe `{session_id, msgRowIds[]}` do DO (auth `CRON_SECRET`), roda `processBatch`. |

### Fluxo

```
Webhook Evolution (1 POST por balão)
  → inbound.js: auth + parse + INSERT conversa_mensagens status=received (idempotente)
  → id = SESSION_QUEUE.idFromName(session_id); stub = SESSION_QUEUE.get(id)
  → waitUntil(stub.fetch("https://do/enqueue", {msgRowId, telefone, tenantId}))
  → return 200 { accepted }

DO SessionQueue (single-threaded por session_id):
  POST /enqueue → storage.push(msgRowId)
                → set firstEnqueuedAt se for o 1º do lote
                → schedule alarm em min(now+4s, firstEnqueuedAt+15s)   (debounce + teto)
  alarm()       → msgRowIds = storage.list(); storage.clear()
                → POST /api/whatsapp/process-batch { session_id, msgRowIds } (AWAIT)
                → se chegou balão novo durante o processamento, ele já está na lista
                  → re-arma alarm pro próximo ciclo (serialização natural)

process-batch endpoint:
  → carrega conversa (LOAD/CREATE) + histórico (status=processed)
  → SELECT as N mensagens do lote por id; monta 1 turno (ver "Montagem do lote")
  → runAgent UMA vez
  → persiste estado, classifica fotos (Etapa 4.5 por foto), INSERT resposta AI,
    evoSend (split \n\n), side-effect handoff
  → marca os N msgRowIds processed
```

A serialização é **estrutural**: o runtime do DO nunca executa dois `alarm()` simultâneos pra
a mesma instância. Nunca há 2 processamentos concorrentes da mesma conversa → as 3 dimensões
da race deixam de existir. Nenhum lock, expiry ou "quem-é-o-último" caseiro.

### O que não muda

- Persist-first + idempotência em `inbound.js`.
- A lógica interna do pipeline (LOAD/CREATE conversa, estado terminal, runAgent, merge de
  `dados_coletados`/`dados_cadastro`, classificação de foto, evoSend multi-message, handoff).
  Ela migra de `processMessage(env, msg)` pra `processBatch(env, batch)` quase intacta — a
  diferença é que o "turno do usuário" é montado a partir de N mensagens em vez de 1.
- Histórico lido com `status=eq.processed`.
- `cron-worker` continua dispatcher de crons; ganha **adicionalmente** a DO class.

## Componentes

### Novos arquivos

#### `cron-worker/src/session-queue.js` — DO class `SessionQueue`

- `fetch(request)`: roteia `/enqueue` → adiciona `msgRowId` ao `storage`, grava
  `firstEnqueuedAt` se ausente, agenda alarm em `min(now+DEBOUNCE_MS, firstEnqueuedAt+MAX_WAIT_MS)`.
- `alarm()`: lê + limpa a lista de `msgRowId`s, `POST` pro `process-batch` (await), trata
  erro (lança → DO re-tenta o alarm com backoff durável). Se a lista voltou a ter itens
  (balões durante o processamento), re-agenda alarm.
- Constantes `DEBOUNCE_MS = 4000`, `MAX_WAIT_MS = 15000`.
- SQLite storage backend (free plan).

#### `functions/api/whatsapp/process-batch.js` — endpoint interno

- `onRequest`: valida método POST + header `x-cron-secret === env.CRON_SECRET` (401 senão).
- Body `{ session_id, msgRowIds[] }`. Chama `processBatch(env, {...})`.
- Retorna `{ ok }`. Erros propagam status != 2xx pro DO re-tentar.

### Arquivos modificados

#### `functions/api/whatsapp/inbound.js`

- Mantém tudo até o INSERT `received`.
- Substitui o bloco `waitUntil(processMessage(env, msg)...)` (linhas 87-98) por:
  obtém stub do DO via `env.SESSION_QUEUE.idFromName(session_id)` e
  `waitUntil(stub.fetch(enqueueRequest))`. O payload do enqueue carrega só o mínimo
  (`msgRowId`, `tenantId`, `telefone`) — `process-batch` recarrega o resto do DB.
- Trata ausência do binding (dev local sem DO) com fallback claro (log + erro), pra não
  silenciar.

#### `functions/_lib/whatsapp-pipeline.js`

- `processMessage(env, msg, depsOverride)` → `processBatch(env, batch, depsOverride)`, onde
  `batch = { session_id, tenantId, telefone, msgRowIds[] }`.
- Nova etapa 0: `SELECT * FROM conversa_mensagens WHERE id IN (msgRowIds) ORDER BY created_at`
  → as mensagens do lote.
- **Montagem do lote → 1 turno** (ver abaixo).
- Etapas 1-8 quase idênticas, operando sobre o turno montado.
- Etapa 4.5 (classificação de foto) roda **por mensagem-com-foto** do lote (loop), não 1×.
- Etapa final: marca **todos** os `msgRowIds` como `processed` (não só um).
- `defaultDeps` ganha o necessário pra o `SELECT` em lote (reusa `supaFetch`).

#### `wrangler.toml` (Pages project)

- Adiciona `[[durable_objects.bindings]]` com `name = "SESSION_QUEUE"`,
  `class_name = "SessionQueue"`, `script_name = "inkflow-cron"`.

#### `cron-worker/wrangler.toml`

- Adiciona `[[durable_objects.bindings]]` (name=`SESSION_QUEUE`, class_name=`SessionQueue`)
  + `[[migrations]]` com `new_sqlite_classes = ["SessionQueue"]`.
- `cron-worker/src/index.js` passa a **exportar** a class `SessionQueue` (re-export).

### Montagem do lote → 1 turno

- **Textos:** concatena os `content` não-vazios das N mensagens na ordem de `created_at`,
  separados por `\n`. Vira o `mensagem` único pro `runAgent`.
- **Fotos:** cada mensagem com `media_base64` de imagem passa pela classificação (Etapa 4.5)
  individualmente, gravando `foto_local_msg_id` / `refs_imagens_msg_ids` — comportamento
  por-mensagem inalterado.
- **Resposta:** uma só, ainda split por `\n\n` em balões de saída (UX multi-message atual).
- **Estado terminal / handoff:** avaliados uma vez no fim do lote.

## Error handling & recuperação

- **Alarm durável (rede primária):** se `process-batch` falha, o `alarm()` lança e o DO
  re-tenta automaticamente com backoff. Sem código de retry nosso.
- **Idempotência do lote:** o lote é definido pelos `msgRowId`s ainda `received`. Marca
  `processed` no fim. Janela de duplicação só existe se falhar **depois** do `evoSend` — raro.
  Mitigação detalhada no plan (marcar estado intermediário antes do envio, ou tolerar
  at-least-once dado o blast radius baixo).
- **Catch path:** mantém o comportamento atual — em falha, PATCH `status=failed` nas msgs do
  lote + alerta admin via Telegram.
- **Defense-in-depth (fase 2, fora de escopo):** cron de varredura pega `received` órfãs >
  2min e re-enfileira. O alarm durável já cobre o caso normal.

## Testes (TDD — reproduz a race antes do fix)

1. **Regressão da race (o teste que o backlog exige):** simula 2 balões próximos pra a mesma
   sessão e assere que `runAgent` é chamado **1×** e a resposta considera ambos. Hoje (pré-fix)
   rodaria 2× com histórico incompleto → o teste falha antes do fix, passa depois.
2. **`processBatch` (node:test, padrão atual com `depsOverride`):** N `msgRowId`s → 1
   `runAgent`, 1 resposta AI inserida, N msgs marcadas `processed`, textos concatenados na
   ordem certa, fotos classificadas individualmente.
3. **Lógica do DO isolada:** `enqueue` agenda alarm; balão novo re-arma (debounce); teto de
   15s respeitado; `alarm()` limpa a lista e chama `process-batch`; balão durante
   processamento re-agenda. Storage/alarm mockados (sem runtime de Workers).
4. **`inbound.js`:** enfileira no DO via stub (mockado), não chama mais `processMessage`
   diretamente; persist-first + idempotência intactos.
5. **Smoke E2E real:** o mesmo smoke que pegou o bug — cliente manda foto + legenda + vários
   balões → uma resposta coerente, estado preservado, sem re-saudação. Valida o DO real.

## Riscos & open questions

- **Deploy coordenado:** a DO class precisa existir no `inkflow-cron` (com a migration
  `new_sqlite_classes`) **antes** do Pages project bindar via `script_name`. Ordem: deploy
  do `cron-worker` primeiro, depois do Pages. Documentar no plan + no runbook de deploy.
- **Dev local:** DO de worker externo em `wrangler pages dev` exige `--do
  SESSION_QUEUE=SessionQueue@inkflow-cron` + `wrangler dev` no `cron-worker` em paralelo
  (doc CF). Testes unitários não dependem do runtime real (deps mockadas).
- **Calibração do debounce:** 4s/15s são chutes razoáveis; ajustar no smoke conforme a
  cadência real de digitação dos clientes.
- **Mídia no enqueue:** o payload do enqueue carrega só `msgRowId` (não o base64), pra não
  inflar o storage do DO nem o request. `process-batch` recarrega o base64 do DB. Confirmar
  que isso não conflita com a Etapa 4.5 / o zerar-base64 do PR-B.
