---
date: 2026-05-19
status: ready-to-plan
related:
  - functions/api/tools/enviar-orcamento-tatuador.js
  - functions/api/whatsapp/inbound.js
  - functions/_lib/whatsapp-pipeline.js
  - functions/_lib/evolution-parser.js
  - functions/api/telegram/webhook.js
backlog_entry: "P0 — Coleta fotos REAIS no Telegram (descoberto 2026-05-06)"
---

# Coleta de fotos REAIS no Telegram do tatuador

## Contexto

Decisão estratégica cravada no smoke noite PR #29 (2026-05-06): tatuador
deve receber **TODAS as fotos relevantes** do briefing (foto do local do
corpo + referências do desenho) **junto com o orçamento** no Telegram.
Hoje, o orçamento mostra apenas a contagem em texto (`📸 Fotos: 1 do local,
3 referências`) — as fotos reais ficam órfãs no banco.

Pré-condições mudaram desde a descoberta em 06/05:
- n8n foi decommissionado do hot path (Cutover Sub-4.1, 13/05) — webhook
  Evolution chega direto em `/api/whatsapp/inbound` (CF Pages Functions)
- Cadeia customer-facing strict schema completa em main (Tattoo PR #71 +
  Cadastro PR #75 + Proposta PR #76, mergeada 19/05)

### Gap real descoberto na exploração

O sistema **já recebe e persiste** o base64 das fotos:

- `inbound.js` extrai `mediaBase64 + mediaMimetype` do payload Evolution
- INSERT em `n8n_chat_histories.message.media_base64` (JSONB blob)

Mas nunca conecta os pontos seguintes:

- `whatsapp-pipeline.processMessage` faz destruct de `mediaBase64` na
  linha 61 e **nunca o usa** — não passa pro agent, não envia ao
  Telegram, não classifica.
- `enviar-orcamento-tatuador.js` monta `sendMessage` Markdown sem
  anexar foto alguma.
- Não há cleanup do `media_base64` em DB — cresce indefinidamente.

A feature **não cria storage novo** — conecta classificação + dispatch +
cleanup que estão faltando.

## Escopo

### In-scope

- Pipeline classifica cada foto que chega como `foto_local` ou
  `refs_imagens` baseado em heurística L1 (estado de pedido) + L2
  (keywords texto) + L3 (default ref).
- Tool `enviar-orcamento-tatuador` envia fotos via Telegram
  `sendMediaGroup` (ou `sendPhoto` se 1) antes do `sendMessage` do
  orçamento, capturando `file_id` eternos.
- Cleanup imediato do `media_base64` após upload OK.
- Fotos pós-handoff (chegando em estado terminal) re-encaminhadas com
  caption curta.
- HEIC/HEIF/TIFF (formatos comuns iPhone via "enviar como documento")
  via `sendDocument` fallback.
- Refator UX dos botões: `✅ Fechar valor` → `💵 Informar valor`;
  remoção do `orcid` visual; briefing natural em vez de lista de
  campos.

### Out-of-scope (issue separada)

- Vision LLM (descrever foto pra popular `foto_local`/`refs_imagens`
  com texto rico) — pode entrar como follow-up se virar dor.
- Mídia não-imagem (áudio, vídeo, documento PDF) — skip silencioso por
  enquanto.
- Compressão/conversão de fotos > 10MB ou HEIC → JPEG via
  WASM/Cloudflare Images — adiar pra quando casuística virar dor real.
- Dashboard admin web pra ver fotos fora do Telegram — não precisa pro
  MVP; `file_id` permite re-fetch se um dia for necessário.

## Pré-requisito: PR-A — rename `n8n_chat_histories` → `conversa_mensagens`

Renome legacy (resíduo do n8n decommission) executado como PR mecânico
separado, mergeado **antes** da feature de fotos.

Escopo do PR-A:

- Migration SQL: `ALTER TABLE n8n_chat_histories RENAME TO conversa_mensagens`
  + drop/recreate RLS policies + rename UNIQUE constraints e indexes que
  usam o nome antigo
- Update código JS: `functions/api/whatsapp/inbound.js`,
  `functions/_lib/whatsapp-pipeline.js`, `functions/api/conversas/list.js`,
  `functions/api/conversas/thread.js`
- Update tests que referenciam a tabela
- Update `supabase/baseline-schema.sql`
- Update docs canonical: `docs/canonical/stack.md`,
  `docs/canonical/methodology/*`, `docs/canonical/runbooks/*` (referências
  ao nome antigo)

Risco: baixo (rename atomic no Postgres). Plan próprio + execução isolada.

A feature de fotos abaixo assume nome novo `conversa_mensagens` em
todos os trechos de código.

## Decisões cravadas (com rationale)

| # | Decisão | Rationale |
|---|---------|-----------|
| 1 | Escopo: só `foto_local` + `refs_imagens` | Tatuador filtra mentalmente. Outras fotos (small talk, off-topic) viram ruído. |
| 2 | Storage: **Telegram-as-storage** | Zero infra nova, zero custo, zero policy LGPD. `file_id` eterno cobre re-fetch via `getFile` se um dia precisarmos exibir fora do Telegram (URL renovável a qualquer momento). |
| 3 | Classificação: **heurística L1+L2+L3 default ref** | Cobre cenários A/B/C/D mapeados na seção Data Flow. Custo zero, função pura testável. Vision LLM (alternativa rejeitada) adiciona dep + latência sem retorno proporcional. |
| 4 | Dispatch: **fotos primeiro → orçamento+botões depois** | UX natural (como receber email com anexo). Tatuador vê briefing visual primeiro, decide com texto+botões. |
| 5 | Pós-handoff: **re-encaminha foto + caption curta** | Tatuador agrega contexto sem precisar reabrir conversa. |
| 6 | Retenção: **apaga base64 imediatamente pós-upload OK** | LGPD por design (storage minimization). Telegram vira controller real das fotos. |
| 7 | HEIC/HEIF/TIFF: **`sendDocument` fallback** | Garante entrega quando WhatsApp não converte (raros casos: "enviar como documento", WhatsApp Web). UX degrada graceful em vez de perder material. ~10 linhas. |
| 8 | UX botões: **`💵 Informar valor`** (rename label, mantém callback_data `fechar:`) | Bate com backlog P1 separado. Callback handler já usa `force_reply` — só renome semântico. Compat com mensagens antigas preservada. |
| 9 | Visual: **sem `orcid`, com briefing natural, data em linha própria** | Tatuador não precisa do ID interno. Thread Telegram + nome do cliente já dão contexto. |

## Arquitetura

```
[cliente manda foto via WhatsApp]
        ↓
Evolution webhook → inbound.js
  → extrai mediaBase64 + mediaMimetype (já acontece)
  → persiste em conversa_mensagens.message.media_base64 (já acontece)
        ↓
whatsapp-pipeline.processMessage()
  → runAgent (já acontece)
  → 🆕 ETAPA 4.5: se mediaBase64 e image/*, classifica
       (L1 estado + L2 keywords + L3 default) → 'local' | 'ref'
       PATCH conversas: dados_coletados.foto_local_msg_id OU
       refs_imagens_msg_ids[] (FK pra conversa_mensagens.id)
  → segue pipeline normal (evoSend, callTool, etc)
        ↓
[turnos seguintes... eventualmente agent chama enviar-orcamento-tatuador]
        ↓
enviar-orcamento-tatuador.js
  → valida 4+2 OBR (já acontece)
  → gera orcid (já acontece)
  → 🆕 enviarFotosOrcamento():
       • SELECT batch base64 dos histórico
       • separa por mimetype: JPEGs em sendMediaGroup, HEICs em sendDocument
       • envia (cap 10, prioridade: foto_local + 9 refs mais recentes)
       • captura file_ids da response
       • PATCH dados_coletados: foto_local_file_id + refs_imagens_file_ids[]
       • UPDATE conversa_mensagens: zera media_base64 das rows usadas
  → sendMessage orçamento (com briefing natural) + botões 💵 Informar valor / ❌ Recusar
        ↓
[cliente manda foto em estado terminal: aguardando_tatuador / etc]
        ↓
whatsapp-pipeline (early-return modificada)
  → sendTelegram texto preview (já acontece)
  → 🆕 se mediaBase64 e image/*: sendTelegramPhoto (ou sendDocument se HEIC)
       com caption "📸 {nome} mandou +1 foto"
       cleanup base64
```

### O que não muda

- Agent schemas strict Zod (`tattoo-schema.js`, `cadastro-schema.js`,
  `proposta-schema.js`, contratos handoff) — campos novos são
  auto-injetados pelo pipeline, não vêm do output LLM.
- Prompts dos agents — `foto_local: "presente"/null` continua sendo o
  sinal semântico.
- `inbound.js`, `evolution-parser.js` — já extraem base64 corretamente.
- `route.js`, agents per se.
- Storage externo — zero R2/Supabase Storage adicionado.

## Componentes

### Novos arquivos

#### `functions/_lib/foto-classifier.js` (~50 linhas)

Função pura, zero deps.

```js
export const KEYWORDS_LOCAL = /\b(aqui|braço|braco|antebraço|antebraco|perna|coxa|panturrilha|costas|peito|ombro|pulso|tornozelo|nuca|pescoço|pescoco|virilha|costela|bíceps|biceps|gluteo|glúteo|tô mostrando|to mostrando|no meu|na minha)\b/i;

export function classificarFoto({ tentativas_foto_local, foto_local_atual, texto_turno }) {
  // L1 forte: agent pediu E ainda não tem
  if (tentativas_foto_local > 0 && !foto_local_atual) return 'local';
  // L2 médio: texto sugere local do corpo
  if (texto_turno && KEYWORDS_LOCAL.test(texto_turno)) return 'local';
  // L3 default: assume referência (cliente mostra inspiração)
  return 'ref';
}
```

#### `functions/_lib/telegram-media.js` (~120 linhas)

Separado de `telegram.js` (que é alerts/sendMessage focado). Usa
`FormData` nativo do Workers pra `multipart/form-data`.

API pública:

- `sendTelegramPhoto(env, chatId, base64, mimetype, caption?) → { file_id }`
- `sendTelegramDocument(env, chatId, base64, mimetype, caption?, filename?) → { file_id }`
- `sendTelegramMediaGroup(env, chatId, items) → [{ file_id }, ...]`
  - `items: [{ base64, mimetype, caption? }, ...]` (2-10)
  - Caption só na primeira foto (enforced internamente)
- `enviarMidia(env, chatId, base64, mimetype, caption?) → { file_id, modo: 'photo'|'document' }`
  - Router: JPEG/PNG/WEBP → `sendTelegramPhoto`; outros → `sendTelegramDocument`

Constantes:

```js
const TELEGRAM_PHOTO_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TELEGRAM_TIMEOUT_MS = 15000;  // upload multipart é pesado
const TELEGRAM_RETRY_ON = [429];    // retry só em rate limit
```

Comportamento:

- Timeout: 15s (vs 3s do `telegram.js` alert)
- Retry: 1× em 429 com backoff de `retry_after` (campo da response Telegram)
- Throws com causa específica: `RateLimitError`, `FileTooLargeError`,
  `InvalidMimetypeError`, `ChatNotFoundError`, `BotTokenError`
- Helper interno `base64ToBlob(b64, mimetype)` pra `FormData`

### Arquivos modificados

#### `functions/_lib/whatsapp-pipeline.js`

**Etapa 4.5 nova** (entre runAgent e callTool):

```js
// Localização: depois do bloco runAgent (linha ~147) e antes do callTool
if (mediaBase64 && mediaMimetype?.startsWith('image/')) {
  try {
    const tentativas = conversa.estado_extra?.tentativas_foto_local || 0;
    const fotoLocalAtual = conversa.dados_coletados?.foto_local;
    const tipo = classificarFoto({
      tentativas_foto_local: tentativas,
      foto_local_atual: fotoLocalAtual,
      texto_turno: texto,
    });

    if (tipo === 'local') {
      const dados = { ...(conversa.dados_coletados || {}), foto_local_msg_id: msgRowId };
      await deps.supaFetch(`/rest/v1/conversas?id=eq.${conversa.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ dados_coletados: dados }),
      });
    } else {
      const idsAtuais = conversa.dados_coletados?.refs_imagens_msg_ids || [];
      const dados = { ...(conversa.dados_coletados || {}), refs_imagens_msg_ids: [...idsAtuais, msgRowId] };
      await deps.supaFetch(`/rest/v1/conversas?id=eq.${conversa.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ dados_coletados: dados }),
      });
    }
  } catch (e) {
    console.warn(`[pipeline] etapa-4.5 classificador falhou: ${e.message}`);
    // não-fatal: pipeline segue, foto fica órfã (sem msg_id correlacionado)
  }
}
```

**Etapa terminal modificada** (linha ~93-109, branch `TERMINAL_STATES.has`):

```js
// Após o sendTelegram texto preview existente, adicionar:
if (mediaBase64 && mediaMimetype?.startsWith('image/') && tenant.tatuador_telegram_chat_id) {
  try {
    const nome = conversa.dados_cadastro?.nome || pushName || telefone;
    await enviarMidia(
      env,
      tenant.tatuador_telegram_chat_id,
      mediaBase64,
      mediaMimetype,
      `📸 ${nome} mandou +1 foto`,
    );
    // cleanup base64 dessa row — usa RPC pra UPDATE jsonb_set in-place
    // (evita read-modify-write race condition)
    await deps.supaFetch(`/rest/v1/rpc/zerar_media_base64`, {
      method: 'POST',
      body: JSON.stringify({ p_msg_id: msgRowId }),
    });
  } catch (e) {
    console.warn(`[pipeline] pos-handoff foto falhou: ${e.message}`);
  }
}
```

#### `functions/api/tools/enviar-orcamento-tatuador.js`

Mudanças principais:

1. **Rename label botão** (linha 86): `'✅ Fechar valor'` → `'💵 Informar valor'`. Callback_data permanece `fechar:${orcid}` (compat com mensagens já no chat).

2. **Nova função `montarBriefing(conv)`**: gera texto natural em vez de
   lista de campos. Já documentada na seção Data Flow.

3. **Nova função `formatarDataBr(iso)` + `montarLinhaIdade(cad)`**:
   data em linha separada `🎂 25 anos (15/03/2001)`. Defensivo: omite
   linha se ISO ausente.

4. **`montarTextoOrcamento(conv, resultadoFotos?)` refatorada**:
   compõe header + linha idade + email + briefing. Append condicional
   se `resultadoFotos.falhas` > 0. Remove `🆔 orcid` visual.

5. **Nova função `selecionarFotosOrcamento(conv)`**: aplica cap de 10
   (foto_local + 9 refs mais recentes). Retorna `[{ msg_id, tipo }, ...]`.

6. **Nova função `enviarFotosOrcamento(env, chatId, conv)`**:
   - Lê msg_ids via `selecionarFotosOrcamento`
   - SELECT batch base64 + mimetype das rows
   - Separa por categoria:
     - JPEGs/PNGs/WEBPs → bucket "carrossel"
     - HEICs/outros → bucket "documents"
   - Envia documents primeiro (1 sendDocument cada, sem caption)
   - Envia carrossel: 0 fotos → skip; 1 → `sendTelegramPhoto`; 2-10 →
     `sendTelegramMediaGroup`. Caption no primeiro item:
     `"📸 ${nome} — fotos do briefing"`
   - Captura file_ids; PATCH `dados_coletados` (foto_local_file_id +
     refs_imagens_file_ids[])
   - Chama RPC `zerar_media_base64(msg_id)` pra cada row usada (evita
     read-modify-write race; ver seção Schema)
   - Return `{ tentadas, enviadas, falhas, falhas_total? }`

7. **`handle()` modificada**: depois de reservar orcid+estado, chama
   `enviarFotosOrcamento` com try/catch. Resultado passa pro
   `montarTextoOrcamento` pra append de nota se houver falhas. Depois
   chama `enviarTelegram` (sendMessage) existente.

8. **Idempotência ajustada** (linha 134): se `conv.orcid` existe E
   há fotos pendentes (msg_ids sem file_ids correspondentes), NÃO
   retornar idempotente cedo. Executa só `enviarFotosOrcamento` pra
   completar o upload pendente, retorna `{ ok: true, orcid, retry_fotos: true }`.

#### `functions/api/telegram/webhook.js`

**Mensagens com `orcid` substituídas por nome do cliente:**

- Linha 177: `\`${orcid}\`` → `*${escapeMarkdown(nomeCliente)}*`
- Linha 192: `\`${orcid}\`` → `*${escapeMarkdown(nomeCliente)}*`

Exemplos:

```js
const nomeCliente = conv.dados_cadastro?.nome || 'cliente';
await sendMessage(env, cb.from.id,
  `Qual valor pra *${escapeMarkdown(nomeCliente)}*? Manda só o número (ex: 750)`,
  { reply_markup: { force_reply: true, selective: false } }
);
// ...
await sendMessage(env, cb.from.id,
  `📝 Orçamento da *${escapeMarkdown(nomeCliente)}* recusado. Cliente será avisado pelo bot.`
);
```

#### `functions/api/tools/dados-coletados.js`

Guard contra LLM hallucinar campos do pipeline:

```js
// Adicionar à lista interna de campos read-only (não-aceitos via LLM):
const PIPELINE_ONLY_FIELDS = [
  'foto_local_msg_id', 'foto_local_file_id',
  'refs_imagens_msg_ids', 'refs_imagens_file_ids',
];

// Se LLM tentar gravar qualquer um, return 400 com erro 'campo-pipeline-readonly'.
```

## Schema

### Tabela `conversa_mensagens` (ex-`n8n_chat_histories`)

**Sem mudança estrutural na tabela.** Mantém `message` JSONB existente.

**Nova RPC `zerar_media_base64(p_msg_id BIGINT)`** em migration
`supabase/migrations/2026-05-19-add-zerar-media-base64-rpc.sql`, pra
UPDATE in-place sem race condition de read-modify-write:

```sql
CREATE OR REPLACE FUNCTION zerar_media_base64(p_msg_id BIGINT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.conversa_mensagens
  SET message = jsonb_set(message, '{media_base64}', '""')
  WHERE id = p_msg_id;
$$;

REVOKE ALL ON FUNCTION zerar_media_base64(BIGINT) FROM public;
GRANT EXECUTE ON FUNCTION zerar_media_base64(BIGINT) TO service_role;
```

Mantém `media_mimetype` (útil pra auditoria) e zera só o blob pesado.
RPC chamada via `supaFetch('/rest/v1/rpc/zerar_media_base64', ...)` tanto
do pipeline (pós-handoff) quanto da tool (pós-upload do orçamento).

### Tabela `conversas` — campos novos em `dados_coletados` (JSONB, sem migration formal)

| Campo | Tipo | Origem | Pra quê |
|-------|------|--------|---------|
| `foto_local_msg_id` | `number \| null` | pipeline classifier (Etapa 4.5) | FK pra `conversa_mensagens.id` |
| `foto_local_file_id` | `string \| null` | tool `enviar-orcamento-tatuador` | Telegram file_id eterno |
| `refs_imagens_msg_ids` | `number[]` | pipeline classifier (append) | Array de FKs |
| `refs_imagens_file_ids` | `string[]` | tool `enviar-orcamento-tatuador` | Array de file_ids |

Campos legacy `foto_local: string|null` (descrição/null) e
`refs_imagens: string[]` (descrições textuais) **continuam existindo e
mantêm sua semântica** — são o sinal pro agent (gating do handoff).
Novos campos `_msg_id` / `_file_id` são metadata técnica paralela.

### Tabela `tenants` — sem mudanças

`tatuador_telegram_chat_id` (já existe) é o único campo necessário.
Bot token `INKFLOW_TELEGRAM_BOT_TOKEN` (env var, já configurado).

### Indexes / RLS

Zero indexes novos. RLS já cobre `conversa_mensagens` via `tenant_id`
(do PR-A prévio). Sem mudança de policies.

## Data flow detalhado (turn-by-turn)

Cenário canônico: Maria, 25, quer borboleta no pulso.

### Turno 1 — só texto

```
WhatsApp: "oi, queria fazer uma tattoo"
```

- inbound: `mediaBase64=null`, INSERT row em `conversa_mensagens`
- pipeline: runAgent persiste `descricao_curta="borboleta"` (eventual)
- **Etapa 4.5**: mediaBase64 null → SKIP
- evoSend: bot responde

### Turno 2 — cliente manda foto LOCAL proativa (cenário A)

```
WhatsApp: "aqui ó, no pulso 📸" + foto(2MB JPEG)
```

- inbound: INSERT row id=42 (`message.media_base64=<blob>`, `mimetype="image/jpeg"`)
- runAgent: persiste `local_corpo="pulso"`, `foto_local="presente"`
- **Etapa 4.5**: `classificarFoto({tentativas:0, foto_local:null, texto:"aqui ó, no pulso"})`
  - L1: tentativas=0 → fail
  - L2: KEYWORDS_LOCAL match "pulso" → **'local'** ✅
  - PATCH: `dados_coletados.foto_local_msg_id=42`

### Turno 3 — cliente manda 2 refs (webhooks separados)

```
WhatsApp 3a: "tipo essas aqui 📸" + foto1
WhatsApp 3b: foto2 (sem caption)
```

Webhook 3a:
- INSERT row id=43
- runAgent: `refs_imagens=["borboleta inspiração"]`
- **Etapa 4.5**: classifier → 'ref' (foto_local já presente; texto sem
  keyword) → PATCH `refs_imagens_msg_ids=[43]`

Webhook 3b:
- INSERT row id=44
- runAgent: `refs_imagens=["...", "ref adicional"]`
- **Etapa 4.5**: classifier → 'ref' → PATCH `refs_imagens_msg_ids=[43, 44]`

### Turnos 4-6 — coleta OBR restantes + cadastro

Sem mídia. Agent completa `altura_cm=8`, `estilo="fineline"`. Handoff
pra cadastro. CadastroAgent normaliza `data_nascimento="2001-03-15"`,
nome, email. Próxima ação: `enviar_orcamento`.

### Turno 7 — orchestrator chama `enviar-orcamento-tatuador`

Estado pré-tool:

```js
dados_coletados: {
  descricao_curta: "borboleta", local_corpo: "pulso", altura_cm: 8, estilo: "fineline",
  foto_local: "presente", foto_local_msg_id: 42,
  refs_imagens: [...], refs_imagens_msg_ids: [43, 44]
}
dados_cadastro: { nome: "Maria", data_nascimento: "2001-03-15", email: "maria@x.com" }
```

Passos:
1. valida 4+2 OBR → passa
2. gera `orcid = "orc_a3f9k2"`
3. PATCH reserva orcid + estado=`aguardando_tatuador`
4. **`enviarFotosOrcamento`**:
   - `selecionarFotosOrcamento` → 3 itens (local + 2 refs)
   - SELECT batch `conversa_mensagens` WHERE id IN (42, 43, 44)
   - separa por mimetype: 3 JPEGs → bucket carrossel
   - `sendTelegramMediaGroup(chatId, [{base64:42,caption:"📸 Maria — fotos do briefing"}, {base64:43}, {base64:44}])`
   - Response Telegram: `[{file_id:"AgAC...1"}, {file_id:"AgAC...2"}, {file_id:"AgAC...3"}]`
   - PATCH: `dados_coletados.foto_local_file_id="AgAC...1"`, `refs_imagens_file_ids=["AgAC...2","AgAC...3"]`
   - UPDATE conversa_mensagens (42, 43, 44): `message.media_base64=''`
5. `enviarTelegram` sendMessage + botões

### Tatuador vê (final)

```
📸 Maria — fotos do briefing
[carrossel 3 fotos: pulso + 2 refs]

📋 Novo orçamento

👤 Maria
🎂 25 anos (15/03/2001)
📧 maria@example.com

Maria quer uma tatuagem de borboleta, estilo fineline, no pulso, ~8cm.
Mandou a foto do local + 2 referências.

[💵 Informar valor]  [❌ Recusar]
```

### Turno 8 — foto pós-handoff

```
WhatsApp: "achei mais essa aqui 📸" + foto extra
```

- inbound: INSERT row id=99
- processMessage: estado terminal → early-return
- **Etapa terminal modificada**: sendTelegram texto preview +
  `enviarMidia(chatId, base64, mimetype, "📸 Maria mandou +1 foto")` +
  cleanup row 99

Tatuador vê:

```
📩 Cliente Maria mandou msg:
achei mais essa aqui

📸 Maria mandou +1 foto
[foto]
```

### Turno 9 — tatuador clica "💵 Informar valor"

```
Qual valor pra *Maria*? Manda só o número (ex: 750)
                                           ↑ force_reply ativado
```

Tatuador responde `550`. Webhook handler grava `valor_proposto=550`,
estado=`propondo_valor`. Bot reentra na conversa com cliente.

### Cenários alternativos cobertos

#### Cenário A — foto LOCAL proativa sem ser pedida
Coberto via L2 (keywords body match).

#### Cenário B — cliente IGNORA pedido foto, manda turnos depois
`tentativas=1`, `foto_local=null` → L1 hit → 'local'. ✅

#### Cenário C — 2 fotos juntas (1 local + 1 ref)
1ª: tentativas=1, foto_local=null → 'local'. 2ª: foto_local agora
"presente" (atualizado) → 'ref'. ✅

#### Cenário D — refs proativas sem keyword body
"tipo essa daqui" → L1 fail, L2 fail, L3 default → 'ref'. ✅

#### Cenário "cliente seco" — 5 fotos sem texto + "quanto fica?"
Turnos 1-5 fotos. Texto só no T1. Classifier rodando turno-a-turno:
todas as fotos → L3 default → 'ref'. `refs_imagens_msg_ids=[id1..id5]`.
Agent coleta OBR nos turnos 6-13. Orçamento sai com 5 refs no carrossel.

#### Cenário cap 10 fotos — cliente manda 15 refs
`selecionarFotosOrcamento` aplica cap: pega foto_local (se houver) + 9
refs mais recentes (assume últimas = melhores escolhas). Briefing nota:
"Mandou 15 referências (anexamos as 9 mais recentes + foto local)."

## Error handling

### Tabela de falhas

| Tipo | Causa | Tratamento |
|------|-------|------------|
| Rate limit 429 | Telegram throttle | Retry interno 1× com backoff `retry_after` |
| File too large 413 | Foto > 10MB | Skip a foto, conta como falha, briefing menciona |
| Invalid mimetype 400 | HEIC/HEIF/TIFF/GIF animado | Fallback `sendDocument` automático (decisão 7) |
| Bot token inválido 401 | Env var expirada | Throw fatal, alerta admin Telegram |
| Chat not found 400 | Tatuador bloqueou bot | Tool retorna 400 `tatuador-bloqueou-bot` com dica acionável |
| Timeout (15s) | Latência Telegram | Retry 1× |
| Outro erro | Erro desconhecido | Conta como falha total, orçamento texto sai mesmo assim |

### Política de falha parcial

**Premissa:** o orçamento texto sempre tenta sair, mesmo se as fotos
falharem totalmente. Tatuador prefere briefing sem foto a não receber nada.

`enviar-orcamento-tatuador.handle()`:

```js
let resultadoFotos;
try {
  resultadoFotos = await enviarFotosOrcamento(env, chatId, conv);
} catch (e) {
  console.error('[enviar-orcamento] enviarFotosOrcamento failed:', e.message);
  resultadoFotos = { enviadas: 0, falhas_total: true, error: e.message };
}

const tgResult = await enviarTelegram(env, chatId,
  montarTextoOrcamento(conv, resultadoFotos),
  inlineKeyboard(orcid)
);
```

Append condicional no briefing:

```js
if (resultadoFotos?.falhas_total) {
  texto += '\n\n📸 ⚠️ Não foi possível anexar as fotos do briefing. Abra a conversa pra ver.';
} else if (resultadoFotos?.falhas > 0) {
  texto += `\n\n📸 ⚠️ ${resultadoFotos.falhas} de ${resultadoFotos.tentadas} fotos não anexaram.`;
}
```

### Cleanup base64 — só se upload OK

`media_base64` só é zerado **após `file_id` confirmado**. Se
`sendMediaGroup` falhar mid-batch, deixa todo o base64 intacto. Retry
manual via re-call da tool com idempotência ajustada (próximo bloco).

### Idempotência com retry parcial

Patch na lógica existente (linha 134):

```js
if (conv.orcid) {
  const fotosPendentes = (conv.dados_coletados?.foto_local_msg_id && !conv.dados_coletados?.foto_local_file_id)
    || ((conv.dados_coletados?.refs_imagens_msg_ids?.length || 0) > (conv.dados_coletados?.refs_imagens_file_ids?.length || 0));

  if (!fotosPendentes) {
    return { status: 200, body: { ok: true, orcid: conv.orcid, idempotente: true, estado_agente: conv.estado_agente } };
  }

  // tem orcid mas faltam fotos → roda só enviarFotosOrcamento
  const resultadoFotos = await enviarFotosOrcamento(env, tenant.tatuador_telegram_chat_id, conv);
  return { status: 200, body: { ok: true, orcid: conv.orcid, retry_fotos: true, enviadas: resultadoFotos.enviadas } };
}
```

### Fotos órfãs antigas (pré-deploy)

Conversas em andamento criadas antes desta feature têm `media_base64`
sem `foto_local_msg_id` correlacionado. Quando essas conversas chegarem
em orçamento:
- `enviarFotosOrcamento` lê msg_ids vazios → return `{enviadas: 0}`
- Orçamento sai sem fotos (igual hoje — sem regressão)
- Sem backfill mágico (risco de mandar fotos não-relevantes)

### Race conditions

**Foto chega durante envio do orçamento:** webhook chega no momento exato
em que `enviar-orcamento-tatuador` está executando. Pipeline lê estado
da conversa — se já transicionou pra `aguardando_tatuador`, segue
caminho terminal (envia foto avulsa). Se ainda `coletando_*`, runAgent
processa normal mas a tool já carregou snapshot sem essa foto. Resultado:
foto avulsa chega como mensagem separada via pós-handoff. Aceitável.

### Mimetype edge cases

- `mediaMimetype.startsWith('image/')` é o gate de entrada
- `aceitaTelegramPhoto(mimetype)` decide carrossel vs document
- Áudio/vídeo/documento (não-image): SKIP silencioso na Etapa 4.5
  (não classifica) e na Etapa terminal (não re-encaminha)

### Tamanho excedendo limites

- CF Pages Functions: 100MB request body — folga (10 fotos × 5MB base64
  inflado ≈ 67MB)
- Foto > 10MB (limite Telegram sendPhoto): skip + conta como falha

### Observabilidade

```js
console.log(JSON.stringify({
  evento: 'fotos-orcamento-enviadas',
  orcid, tenant_id, telefone,
  tentadas, enviadas, falhas,
  duracao_ms: Date.now() - started,
}));
```

Permite query Cloudflare Logpush / Wrangler tail pra debug.

## Testing strategy

### Unit tests (Vitest)

| Arquivo | Cobertura |
|---------|-----------|
| `tests/unit/foto-classifier.test.mjs` | L1 hit, L1 fail (foto_local já presente), L2 hit (keywords pulso/braço/etc), L2 fail ("tipo essa daqui"), L3 default, edge cases (texto null, mimetype undefined). 8-10 cases. |
| `tests/unit/telegram-media.test.mjs` | Mock fetch: sendPhoto OK, sendMediaGroup OK retornando file_ids, sendDocument OK, retry on 429, error on 413, multipart/form-data shape, caption só na primeira foto do mediaGroup |
| `tests/unit/enviar-orcamento-tatuador.test.mjs` (expandir) | `montarBriefing` com variações de campos, `montarLinhaIdade` defensivo, `formatarDataBr` ISO→BR, `selecionarFotosOrcamento` cap de 10 |
| `tests/unit/enviar-midia.test.mjs` | Roteamento JPEG→sendPhoto, HEIC→sendDocument, mimetype null→sendDocument com octet-stream |

### Integration tests

| Arquivo | Cenário |
|---------|---------|
| `tests/integration/orcamento-com-fotos.test.mjs` | E2E canônico: 1 local + 2 refs → sendMediaGroup(3) → file_ids persistidos → media_base64 zerado → sendMessage final |
| `tests/integration/orcamento-sem-fotos.test.mjs` | Sem msg_ids → `enviarFotosOrcamento` return `{enviadas:0}` → orçamento texto sai normal |
| `tests/integration/orcamento-falha-parcial.test.mjs` | sendMediaGroup falha 2× → degrada pra envio só do texto com nota → media_base64 mantido pra retry |
| `tests/integration/orcamento-heic-mix.test.mjs` | Fotos = [JPEG, HEIC, JPEG] → 1 sendDocument(HEIC) + 1 sendMediaGroup([JPEG, JPEG]) → 3 file_ids |
| `tests/integration/pos-handoff-foto.test.mjs` | Estado terminal + mediaBase64 chega → sendTelegram texto + sendTelegramPhoto caption "📸 {nome} mandou +1 foto" → row zerada |
| `tests/integration/pipeline-classifier.test.mjs` | Cenários A (proativo local via L2), B (ignorou pedido via L1), C (2 fotos juntas), D (refs proativas via L3) |
| `tests/integration/idempotencia-retry-fotos.test.mjs` | 1ª chamada: sendMediaGroup falha → fotos NÃO marcadas. 2ª chamada: detecta gap → retry só upload → file_ids preenchidos |
| `tests/integration/orcamento-multi-refs-seco.test.mjs` | **Cliente seco**: 5 fotos sequenciais "quanto fica?" → todas L3→ref → orçamento sai com sendMediaGroup(5) |
| `tests/integration/orcamento-cap-10-fotos.test.mjs` | 15 refs no histórico → sendMediaGroup chamado com 10 (9 refs últimas + 1 local) → briefing menciona truncamento |

### Eval scenarios (novos)

Adicionar em `tattoo-agent.eval.mjs`:

- `per-foto-local-proativa`: T1 "queria tatuagem no pulso 📸" + foto.
  Assert: classifier marca local, agent persiste `foto_local="presente"`,
  `tentativas_foto_local` permanece 0.
- `per-refs-multiplas-proativas`: T1 "tipo essas aqui 📸📸📸". Assert:
  3 refs classificadas, `refs_imagens_msg_ids` tem 3 entries.
- `per-cliente-seco-multifoto`: T1 "quanto fica?" + foto1; T2-T5 fotos
  sem texto. Assert: agent transita pra perguntar OBR no T6 sem assumir
  que cliente vai mandar mais fotos; `refs_imagens_msg_ids` com 5
  entries no fim.

### Smoke E2E manual (pós-deploy)

Roteiro com tenant de teste ou bot dummy:

1. WhatsApp: "oi, queria tatuagem"
2. "no antebraço 📸" + foto braço
3. "tipo essa 📸" + foto referência
4. "Maria Silva, 15/03/2001, maria@x.com"
5. Bot chama `enviar-orcamento-tatuador`
6. Verificar no Telegram do tatuador:
   - Carrossel 2 fotos com caption "📸 Maria — fotos do briefing"
   - Mensagem orçamento estruturada (briefing natural + botões "💵 Informar valor" / "❌ Recusar")
   - Sem orcid visível
   - `🎂 25 anos (15/03/2001)`
7. Verificar no DB:
   - `conversa_mensagens` rows fotos: `media_base64=""` (vazio)
   - `conversas.dados_coletados.foto_local_file_id` + `refs_imagens_file_ids` preenchidos
8. Cliente manda +1 foto pós-handoff → tatuador recebe "📸 Maria mandou +1 foto"
9. Tatuador clica "💵 Informar valor" → bot pergunta "Qual valor pra *Maria*?" → tatuador responde "550" → `valor_proposto=550`

### Regressão

Suite atual (888 tests) deve continuar verde. Atenção especial:
- `tests/integration/proposta-agent-*.test.mjs` — pipeline pós-orçamento intacto (botões callback funcionando)
- `tests/regression/strict-schema-tattoo-handoff.test.mjs` — agent
  schema não acidentalmente alterado

### Gates do DoD (Pilar 3)

- [ ] Todos unit + integration novos passando
- [ ] Suite total verde (888 + novos)
- [ ] CI 7/7 verde
- [ ] Smoke E2E manual executado com tenant de teste
- [ ] Logs Cloudflare confirmam `fotos-orcamento-enviadas` com `falhas: 0` em ≥3 orçamentos consecutivos
- [ ] Manual: verificar DB pós-smoke (media_base64 zerado, file_ids preenchidos)
- [ ] Confirmar PR-A (rename) já está mergeado em main

## Rollout plan

### Ordem de execução

1. **PR-A — rename `n8n_chat_histories` → `conversa_mensagens`**
   - Plan próprio (`/plan` separado)
   - Migration + 4 arquivos JS + tests + docs canonical
   - Smoke pós-deploy: inserção + leitura via webhook real
   - Merge antes de iniciar PR-B

2. **PR-B — feature coleta fotos Telegram** (este spec)
   - Plan próprio (`/plan` consumindo este spec)
   - Componentes novos + modificações descritas
   - Tests unit + integration
   - Eval scenarios novos
   - Smoke E2E manual pós-deploy

### Rollback

Reverter código JS via git revert. Campos JSONB novos em `dados_coletados`
ficam órfãos em conversas existentes — inertes, não quebram nada. Base64
nas rows zeradas é **irrecuperável** (Telegram tem file_id mas só
accessible via bot autenticado) — risco aceito porque cleanup só roda
após upload OK.

### Feature flag

Não há feature flag explícita. A feature pode ser ativada/desativada
parcialmente removendo as Etapas 4.5 + terminal modificada do pipeline
(revert do whatsapp-pipeline.js) sem afetar o restante. Tool de
orçamento degrada graceful se msg_ids estiverem vazios (return
`{enviadas:0}` + orçamento texto normal).

## Estimativa

~5-7h para PR-B (este spec), conforme backlog. Sub-estimativa:

- Componentes novos (foto-classifier, telegram-media): ~1.5h
- Modificações pipeline + tool: ~2h
- Webhook handler nome em vez de orcid: ~0.5h
- Tests unit + integration: ~2h
- Smoke E2E + verify: ~0.5h

PR-A (rename): ~1.5-2h (mecânico).

## Open questions / known limitations

- **Vision LLM pra descrever foto:** fora de escopo. Se um dia
  `foto_local: "presente"` (string opaca) virar dor pro tatuador
  entender a foto sem clicar, considerar adicionar vision pass pra
  popular `foto_local: "antebraço direito, lado dorsal"`.
- **Compressão HEIC:** `sendDocument` é graceful mas perde preview
  inline. Se taxa de HEIC virar alta, considerar Cloudflare Images
  ($5/mês) ou libheif-js WASM.
- **Cleanup retroativo:** rows antigas em `conversa_mensagens` (pré-deploy)
  com `media_base64` cheio continuarão crescendo o DB até serem
  manualmente limpas via cron one-shot. Anotar como follow-up (não
  bloqueia esta feature).
- **Re-fetch via `getFile`:** o `file_id` Telegram persiste no DB.
  Se um dia construirmos dashboard admin web pra ver fotos fora do
  Telegram, vamos precisar chamar `bot.getFile(file_id)` (URL HTTP
  renovável a cada 1h). Não é problema agora — só registrar pro
  futuro.
- **Cliente apaga foto no WhatsApp pós-envio:** Evolution já entregou
  o base64 no momento do webhook; cleanup só zera nosso DB pós-upload
  pro Telegram. Tatuador continua vendo no chat dele independente.
- **Pipeline race no Etapa 4.5:** se 2 webhooks de mesma conversa
  chegarem em paralelo (raro mas possível com Evolution batch),
  PATCH `dados_coletados` pode ter race condition no append do array
  `refs_imagens_msg_ids`. Mitigação: usar PostgreSQL RPC com
  `jsonb_set` em vez de READ-MODIFY-WRITE no nível aplicação.
  Considerar se virar dor (improvável MVP).
