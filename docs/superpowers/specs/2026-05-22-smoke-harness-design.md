# Design — Harness de smoke universal (limpeza + tail + roteiro)

Data: 2026-05-22
Repo: `inkflow-saas`
Origem: pós-refator coleta/proposta (commit `82726de`), preparação do smoke E2E.
Backlog relacionado: `docs/backlog/2026-05-22-smoke-refactor-anchor.md`, `docs/backlog/2026-05-22-smoke-findings.md`.

## 1. Problema

Ao "preparar o terreno" pro smoke, o processo de limpeza quebrou com vários erros. Causa-raiz: os scripts (`cleanup-conversa-teste.sh`, `smoke-verify.sh`) **hardcodam nomes de coluna sem validar contra o schema real**. Falhas observadas:

- `column chat_messages.telefone does not exist` — a coluna real é `phone`. O DELETE retornava um objeto de erro do PostgREST que `jq 'length'` contava como "4 linhas deletadas" (4 = nº de chaves do erro), mascarando a falha.
- `column conversas.estado_atual does not exist` — a coluna real é `estado_agente`. Os docs/memória usam `estado_atual` informalmente (divergência de documentação).
- A limpeza só cobre 3 tabelas (`conversas`, `conversa_mensagens`, `agendamentos`), deixando **rastro órfão** em `orcamentos`, `agent_turn_logs`, `tool_calls_log`, `logs` — que contamina o "lead novo" do smoke.

Além disso, `chat_messages` é **dead code**: a tabela é vazia em todos os tenants e o único writer (`reentrada.js` `logChatMessage`) grava numa coluna inexistente desde #20 — falha silenciosa engolida por try/catch.

## 2. Objetivo e escopo

Criar um **processo universal, determinístico e Codex-runnable** (bash puro + `curl` + `jq`, sem MCP/PAT) que:

1. **Limpa todo o rastro de conversa de UM número de teste** (o número decidido), preservando config/stats do tenant.
2. **Valida o schema antes de tocar em dados** (preflight contra o OpenAPI do PostgREST) — nunca mais quebra por nome de coluna divergente.
3. **Liga o tail** de Pages (`inkflow-saas`) + cron Worker (`inkflow-cron`) em paralelo.
4. Oferece um **template de roteiro** (roteiro / o que testamos / resposta esperada / como verificar) e os 5 roteiros atuais preenchidos.

Como parte do processo, resolve os dois débitos: **remove o dead code de `chat_messages`** e **corrige a divergência `estado_atual` → `estado_agente`** nos docs/memória.

**Fora de escopo:** limpar config/portfolio/horários do tenant; multi-tenant em massa; parcelamento (S6) e batching/debounce (S7), que seguem em backlog próprio.

## 3. Fonte de verdade do schema

`GET ${SUPABASE_URL}/rest/v1/` retorna o OpenAPI completo do PostgREST (~120KB) com todas as tabelas/colunas em `.definitions.<tabela>.properties`. É a fonte de verdade **portável** — sem PAT, sem MCP, rodável em qualquer bash. O harness baixa e cacheia esse swagger uma vez por execução e valida o manifest contra ele.

## 4. Arquitetura

Novo diretório `scripts/smoke/`:

```
scripts/smoke/
  manifest.tsv     # fonte única: tabela -> estratégia de filtro -> descrição
  lib.sh           # carrega .dev.vars, helpers PostgREST, fetch+cache do swagger, validador de coluna
  preflight.sh     # valida manifest vs schema real; aborta com fix; avisa tabelas órfãs não cobertas
  clean.sh         # preflight -> preview -> (confirma) -> delete ordenado -> verify residuo 0
  tail.sh          # tail paralelo de Pages + cron worker, prefixado [pages]/[cron]
  verify.sh        # snapshot read-only schema-aware do estado da conversa de teste
```

Os scripts antigos `scripts/cleanup-conversa-teste.sh` e `scripts/smoke-verify.sh` são **substituídos** por `clean.sh`/`verify.sh` e removidos (evita dois caminhos divergentes).

### 4.1 Config compartilhada (em `lib.sh`)

- `TENANT_TESTE="db686ef2-ca42-43e4-a831-808984d8d6c6"` (InkFlow Sub4 Test) — default seguro.
- `PHONE_TESTE_DEFAULT="5521970789797"` — o número decidido; sobrescrevível por argumento.
- Carrega `.dev.vars` por nome de chave (nunca ecoa valores). Requer `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` e `jq`.
- Guard: qualquer tenant != `TENANT_TESTE` exige confirmação explícita (`--tenant <uuid>` + digitar "sei o que faço"). Nunca aponta pra cliente real por acidente.

## 5. Manifest (`manifest.tsv`)

Formato: `tabela <TAB> estrategia <TAB> descricao`. Curado à mão; só tabelas de **conversa**. Colunas confirmadas contra o schema real em 2026-05-22:

| tabela | estrategia | filtro resultante | confirmado |
|---|---|---|---|
| `conversas` | `tenant_telefone` | `tenant_id=eq.<T>&telefone=eq.<P>` | telefone, tenant_id ✓ |
| `conversa_mensagens` | `session_id` | `session_id=eq.<T>_<P>` | session_id ✓ |
| `agendamentos` | `tenant_cliente_telefone` | `tenant_id=eq.<T>&cliente_telefone=eq.<P>` | cliente_telefone, tenant_id ✓ |
| `orcamentos` | `tenant_telefone` | `tenant_id=eq.<T>&telefone=eq.<P>` | telefone, tenant_id ✓ |
| `tool_calls_log` | `tenant_telefone` | `tenant_id=eq.<T>&telefone=eq.<P>` | telefone, tenant_id ✓ |
| `logs` | `tenant_telefone` | `tenant_id=eq.<T>&telefone=eq.<P>` | telefone, tenant_id ✓ |
| `agent_turn_logs` | `via_conversa` | `conversa_id=in.(<ids resolvidos>)` | conversa_id, tenant_id ✓ |

Estratégias (cada uma implica colunas obrigatórias que o preflight valida):

- `tenant_telefone` → exige `tenant_id` + `telefone`.
- `tenant_cliente_telefone` → exige `tenant_id` + `cliente_telefone`.
- `session_id` → exige `session_id` (filtro = `<tenant>_<telefone>`).
- `via_conversa` → exige `conversa_id`; resolve os ids em `conversas` (tenant+telefone) **antes** de deletar `conversas`, depois deleta por `conversa_id=in.(...)`.

**Tabelas vestigiais n8n** (`chat_messages` phone, `chats` phone, `dados_cliente` telefone) — globalmente vazias. NÃO entram no manifest (são lixo morto; `chat_messages` tem seu writer removido neste mesmo trabalho). O preflight as listará como "órfãs com marcador de conversa não cobertas" → WARNING informativo, não erro.

**Tabelas tenant-level preservadas** (`payment_logs`, `signups_log`, `tenant_stats`) — só têm `tenant_id`, sem marcador de conversa → não disparam o aviso e nunca são tocadas.

## 6. Contratos dos scripts

### 6.1 `lib.sh` (sourced, não executado)
- `smoke_load_env` — carrega `.dev.vars`, valida `SUPABASE_URL`/`SUPA_KEY`/`jq`.
- `smoke_swagger` — baixa `/rest/v1/` pra cache (`scripts/smoke/.cache/swagger.json`, gitignored) se ausente/velho; ecoa o caminho.
- `smoke_col_exists <tabela> <coluna>` — retorna 0/1 consultando o swagger.
- `smoke_get <path>` / `smoke_del <path>` — wrappers curl PostgREST com apikey+Bearer; `smoke_del` usa `select=id` + inspeciona resposta crua (detecta objeto de erro em vez de contar chaves).
- `smoke_count <path-sem-select>` — nº de linhas via `Prefer: count=exact` (Content-Range), não `jq length` sobre erro.

### 6.2 `preflight.sh`
Entrada: nenhuma (usa manifest + swagger). Comportamento:
1. Para cada linha do manifest: tabela existe em `.definitions`? Colunas exigidas pela estratégia existem? Acumula TODOS os erros (não aborta no primeiro).
2. Em erro: imprime `tabela X: coluna Y ausente (estrategia Z); schema tem: [a, b, c]` + o fix sugerido. Exit 1.
3. Coverage: lista tabelas do swagger com marcador de conversa (`telefone`/`phone`/`cliente_telefone`/`session_id`/`conversa_id`) que **não** estão no manifest → WARNING (revisão humana). Não falha por padrão; `--strict` faz falhar.
4. Sucesso: exit 0, imprime "schema OK, N tabelas no manifest, M avisos".

Saída: exit 0 = seguro pra limpar; exit 1 = schema divergiu, NÃO limpar.

### 6.3 `clean.sh`
Args: `[telefone]` (default `PHONE_TESTE_DEFAULT`), `--yes`, `--tenant <uuid>`. Fluxo:
1. `smoke_load_env`; valida telefone (só dígitos); aplica guard de tenant.
2. Roda `preflight.sh`; se exit != 0, aborta ("schema divergiu — rode preflight").
3. **Resolve `conversa_id`s** (tenant+telefone) pras estratégias `via_conversa`, guardando antes de deletar `conversas`.
4. **Preview**: count por tabela do manifest + total. Se total 0 → "já limpo", exit 0.
5. Confirma (`y/N`) salvo `--yes`.
6. **Delete em ordem filhos→pai**: primeiro todas as tabelas filtradas por telefone/session/via_conversa, `conversas` por último. Cada delete inspeciona a resposta crua.
7. **Verify**: re-conta tudo; resíduo deve ser 0. Se sobrar, exit 1.

### 6.4 `tail.sh`
Args: `[--pages-only|--cron-only]`. Default: ambos em paralelo.
- Pages: `npx wrangler pages deployment tail --project-name inkflow-saas --format pretty`
- Worker: `npx wrangler tail inkflow-cron --format pretty`
- Cada stream prefixado `[pages]` / `[cron]` (via `sed -u`). `trap` mata os dois no Ctrl-C.
- Assume `wrangler login` feito (ou `CLOUDFLARE_API_TOKEN`); se faltar auth, wrangler reporta — o script não esconde.

### 6.5 `verify.sh`
Args: `[telefone] [N-mensagens]`. Read-only. Porta o conteúdo rico do `smoke-verify.sh` atual, mas lendo a lista de tabelas do manifest e usando `estado_agente` (não `estado_atual`):
- `[conversas]` estado_agente, dados_cadastro.data_nascimento, nome, valor_proposto, orcid.
- `[conversa_mensagens]` últimas N (type ai/human, content com `\n\n` visível como ⏎) + totais.
- `[agendamentos]` status/inicio/fim/mp_payment_id (Pix gerado?).
- `[orcamentos]` / `[agent_turn_logs]` / `[tool_calls_log]` / `[logs]` — counts (devem ser 0 num lead novo, >0 conforme o fluxo avança).
- Mapa roteiro→o que olhar (R1..R5).

## 7. Runbook (`docs/runbooks/smoke-coleta.md`)

Cria-se `docs/runbooks/` (novo). Conteúdo:
1. **Pré-requisitos**: `.dev.vars` com chaves Supabase; `jq`; `wrangler login`.
2. **Fluxo**: `preflight` → `clean <telefone>` → abrir `tail.sh` noutro terminal → executar roteiros pelo WhatsApp → `verify` entre passos.
3. **Template de roteiro** (tabela): `# | Roteiro (passos) | O que testamos | Resposta esperada | Como verificar`.
4. **Os 5 roteiros atuais** preenchidos (de `2026-05-22-smoke-refactor-anchor.md`):

| # | Roteiro | O que testamos | Resposta esperada | Como verificar |
|---|---|---|---|---|
| R1 | Ir até cadastro; dizer "tenho 30 anos"; depois "nasci em 15/03/1996" | S1: idade solta não vira data_nascimento | `data_nascimento` segue null após idade; bot pede a data; persiste só após data explícita | `verify.sh` → `[conversas] data_nasc` |
| R2 | Acionar reentrada automática; cliente responde depois | S2: reentrada entra no histórico do agente | Fala automática aparece em `conversa_mensagens` (type=ai); bot não age como se nada tivesse acontecido | `verify.sh` → `[conversa_mensagens]` |
| R3 | Em proposta, aceitar valor; antes de escolher slot, "manda o pix" | S3: sem Pix antes do horário | Bot pede pra escolher horário; sem agendamento/mp_payment_id | `verify.sh` → `[agendamentos]` vazio; `[cron]` tail sem reservar-horario |
| R4 | Resposta com confirmação+pergunta; reentrada; confirmação pós-pagamento | S4/S5: balões por `\n\n` | Textos separados por linha em branco saem como mensagens separadas | `verify.sh` → content com ⏎; tail Evolution |
| R5 | Briefing com local "perna"; pedir desconto; escolher horário | Proposta+briefing | Briefing "na perna"; bot não confirma desconto sozinho; confirma dia/horário ao escolher | `verify.sh` → `[conversas] valor_proposto`; tail briefing |

5. **Sinais de regressão** (copiados do anchor).

## 8. Mudanças de código

### 8.1 Remover dead code `chat_messages`
- `functions/api/telegram/reentrada.js`: remover a função `logChatMessage` e sua entrada no `Promise.all` (manter só `logConversaMensagem`, que funciona). Ajustar o comentário do cabeçalho ("loga em chat_messages" → "loga em conversa_mensagens").
- Testes: ajustar/remover qualquer asserção sobre `logChatMessage` em `tests/` (verificar `tests/**/reentrada*`). Rodar `npm test` verde.

### 8.2 Corrigir divergência de schema
- `docs/backlog/2026-05-22-smoke-refactor-anchor.md`: trocar `estado_atual` → `estado_agente` (Roteiro 3, resultado esperado).
- Memória `project_chat_messages_vestigial.md`: já documenta `estado_agente` correto; atualizar a decisão pendente para "RESOLVIDO: dead code removido em <commit>".

## 9. Plano de testes do harness

- **preflight detecta drift**: injetar linha falsa no manifest (coluna inexistente) → `preflight.sh` exit 1 com mensagem de fix. Reverter.
- **clean idempotente**: rodar `clean.sh <telefone> --yes` duas vezes → 2ª diz "já limpo", exit 0, resíduo 0.
- **clean cobre as 7 tabelas**: após popular dados de teste e limpar, `verify.sh` mostra todas as counts em 0.
- **código**: `npm test` verde após remover `logChatMessage`.
- **smoke real**: rodar o fluxo R1..R5 (validação manual, fora do CI).

## 10. Decisões fechadas

- Q1 (método de limpeza): **manifest curado + preflight via OpenAPI do PostgREST**. Determinístico, claro, Codex-runnable em bash puro.
- Escopo de "limpar tudo": **todo o rastro de conversa do número de teste decidido**, preservando config/stats do tenant.
- `chat_messages`: **remover dead code** (não consertar — tabela vestigial sem leitor).
- Tail: **Pages + cron worker** via wrangler (assume login feito).
