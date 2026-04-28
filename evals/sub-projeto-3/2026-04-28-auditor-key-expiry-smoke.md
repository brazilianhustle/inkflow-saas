# Smoke Test E2E — Auditor #1 key-expiry

**Data:** 2026-04-28 (madrugada UTC, sessão de rotação geral de secrets)
**Spec:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.1
**Plan:** `docs/superpowers/plans/2026-04-27-auditor-key-expiry.md`
**PR mergeado:** #11 (`cd262ab`) — code-deployed em prod desde 2026-04-27 noite tardia
**Smoke executado pós-rotação CRON_SECRET** (mesma sessão).

## Pré-condições

- `CRON_SECRET` recém-rotacionado (sha256[0:16] `b7344c755776afeb`) em CF Pages env + cron-worker
- Cron-worker validado (POST `?cron=invalid` com novo → 400; com errado → 401)
- CF Pages validado (POST `/api/cron/audit-cleanup` com novo → 200; errado → 401)
- Empty commit + push (Bug B doctrine) → CF Pages redeploy completou em ~30s

## Cenários executados

### Cenário 4a — trigger sem TTL env → events_count=0 ✅

**Setup:** sem `CLOUDFLARE_API_TOKEN_EXPIRES_AT` setada em CF Pages env. Auditor deve rodar Layer 1 skip + Layer 2 todos OK + Layer 3 skip (sem `AUDIT_KEY_EXPIRY_LAYER3` flag).

**Trigger:** `curl POST https://inkflow-cron.lmf4200.workers.dev/?cron=0+6+*+*+*` com Bearer CRON_SECRET.

**Response endpoint:**
```json
{"ok":true,"run_id":"0e7e3868-c14b-4b41-9d4a-20ffe7bb2610","events_count":0,
 "actions":{"fire":0,"silent":0,"supersede":0,"resolve":0,"no_op":0}}
```

**Validação DB:** `audit_runs` row criada (status=success, events_emitted=0, duration ~3.5s).

✅ PASS — slate clean, nenhum evento gerado, run registrado.

### Cenário 4b — TTL=ontem → critical fire + Telegram ✅ (após 2 fixes)

**Setup:** `wrangler pages secret put CLOUDFLARE_API_TOKEN_EXPIRES_AT=2026-04-27T01:41:08Z` (ontem) → empty commit + push → redeploy.

**Trigger 1:** retornou HTTP 500.

**Bug #1 descoberto:** `audit_runs.error_message = "insertEvent failed: 400 PGRST204 'Could not find the suggested_subagent column of audit_events in the schema cache'"`. Endpoint passava `suggested_subagent: 'deploy-engineer'` como campo top-level pra `insertEvent`, mas a coluna não existe — só dentro de `payload` JSONB. Top-level era dead code.

**Fix #1 (commit `62f036d`):** remover linha redundante. `payload.suggested_subagent` já carrega o valor pra `sendTelegram` (que lê de `payload.suggested_subagent`). Tests 45/45 pass.

**Trigger 2 (após deploy do fix):**
```json
{"ok":true,"run_id":"d81a286a-1c60-4d19-8b3e-602b8da0fbed","events_count":1,
 "actions":{"fire":1,"silent":0,"supersede":0,"resolve":0,"no_op":0}}
```

**Validação DB:** evento `7b87d062-fb3d-4f1e-948a-4ff0e469d5dd` criado:
- severity=critical, layer=ttl, days_until_expiry=-2
- summary "CLOUDFLARE_API_TOKEN expira em -2d"

**Validação Telegram:** founder confirmou message recebida no chat `ink_flow_alerts`:
```
[critical] [key-expiry] CLOUDFLARE_API_TOKEN expira em -2d
ID: 7b87d062 | Runbook: secrets-expired.md
Suggested: @deploy-engineer
Evidence: {"all":[{"layer":"ttl","secret":"CLOUDFLARE_API_TOKEN","severity":"critical"}],"top":...}
Reply "ack 7b87d062" pra acknowledge.
```

✅ PASS — Layer 1 detecta, collapseEvents preserva top-severity, sendTelegram formata, ack instructions corretas.

### Cenário 4c — reply ack via Telegram → acknowledged_at preenchido ✅

**Trigger:** founder respondeu `ack 7b87d062` no chat com bot.

**Validação Telegram:** bot replicou `✅ Acknowledged: key-expiry critical`.

**Validação DB:**
- `acknowledged_at = 2026-04-28 01:50:30.226+00`
- `acknowledged_by = 8529665470` (TELEGRAM_ADMIN_USER_ID)
- `resolved_at = null` (ack não resolve, só acknowledge)

✅ PASS — webhook telegram-webhook → resolução de UUID via prefix → PATCH preservou valor crítico (não substituiu `acknowledged_by` por `'auto-escalated'`, conforme decisão v1.1 do spec).

### Cenário 4d — TTL=+60d → resolve flow + Telegram resolved ✅ (após fix #2)

**Setup intencional desviado do plan original:** plan dizia "deletar env de teste". Mas:
- `audit-key-expiry.js` Layer 1: env ausente → `[]` (skip), não evento clean
- `dedupePolicy(current, next)`: requer `next.severity === 'clean'` pra resolver
- "deletar env" → `rawEvents=[]` → `collapsed=null` → dedupePolicy NÃO é chamado → resolve nunca dispara

**Decisão pragmática:** setar TTL=+60d (futuro distante) → Layer 1 retorna `severity='clean'` → collapseEvents → dedupePolicy retorna `'resolve'`. Mais fiel à semântica produção (rotação real do secret resulta em TTL > 14d, não em "env deletada").

**Setup:** `wrangler pages secret put CLOUDFLARE_API_TOKEN_EXPIRES_AT=2026-06-27T01:51:35Z` → empty commit + push → redeploy.

**Trigger 1:** retornou `resolve=1` mas DB mostrou `resolved_at=null`!

**Bug #2 descoberto:** view `audit_current_state` expõe a chave do evento como `event_id` (FK pra `audit_events.id`), não `id`. Endpoint usava `current.id` em 3 lugares (PATCH supersede, PATCH resolve, sendTelegram resolved) → `current.id` era `undefined` → PATCH com `?id=eq.undefined` → 0 rows updated (sem erro), evento ficava aberto.

Não pego pelos 45 testes locais porque integration test mockava `audit_current_state` com `[]` (current=null) — branches resolve/supersede nunca executavam.

**Fix #2 (commit `0bbcd69`):** 3 ocorrências `current.id → current.event_id` (replace_all). Tests 45/45 pass.

**Trigger 2 (após deploy):**
```json
{"ok":true,"run_id":"fe9ddd22-31f3-4191-92b5-0ba21a01efe8","events_count":1,
 "actions":{"fire":0,"silent":0,"supersede":0,"resolve":1,"no_op":0}}
```

**Validação DB (evento `7b87d062`):**
- `resolved_at = 2026-04-28 01:54:39.429+00` ✅
- `resolved_reason = 'next_run_clean'` ✅
- `acknowledged_at` preservado (não foi sobrescrito)

**Validação Telegram:** founder confirmou message `[resolved] [key-expiry] key-expiry: resolved (next run clean)`.

✅ PASS — resolve flow completo end-to-end.

## Bugs encontrados e fixados

| # | Bug | Sintoma | Fix | Commit |
|---|-----|---------|-----|--------|
| 1 | `suggested_subagent` top-level inválido em insertEvent | HTTP 500, audit_runs.status=error | Remover linha redundante (já tá em payload) | `62f036d` |
| 2 | `current.id` undefined (view col é `event_id`) | resolve=1 mas DB sem resolved_at | `current.id → current.event_id` (3 callsites) | `0bbcd69` |

**Doctrine:** integration tests com `audit_current_state` mockado como `[]` cobrem só caminhos `fire`/`no-op`. Próximos auditores precisam **adicionar fixture de current state aberto** pra cobrir resolve/supersede flow. Issue P3 implícito.

## Findings pra spec/auditor lib

### Decisão "deletar env vs setar futuro" pra resolve

Plan original do backlog dizia "deletar env de teste → resolved". Mas a semântica produção é "rotação resulta em TTL > 14d", não em ausência de env. Documentar no spec §5.1: **resolve dispara quando Layer 1 retorna `severity='clean'`**, não quando rawEvents=[].

Alternativa pra futuro (P3 backlog): mudar Layer 1 pra retornar evento `severity='clean'` mesmo quando env ausente (semântica "no TTL configured = no expiry to worry about"). Trade-off: ruído menor vs sinal mais consistente. Manter comportamento atual no MVP.

## Cleanup pós-smoke

- Evento `7b87d062` resolvido naturalmente via fluxo (não cleanup manual)
- `CLOUDFLARE_API_TOKEN_EXPIRES_AT` env var deletado de CF Pages (`wrangler pages secret delete`) — não é fixture real do prod, foi só pro smoke
- Empty commits de redeploy ficam em main como evidência do timeline

## Conclusão

Auditor #1 `key-expiry` **completo end-to-end em produção**:
- Layer 1 (TTL): detecção + thresholds (clean/warn/critical) ✅
- Layer 2 (self-check): 5 secrets ativos validados em backgound (PASS no 4a, sem critical) ✅
- Layer 3 (drift): opt-in via flag (não exercitado neste smoke — flag ausente) ⏳
- Severity collapsing (multi-event → top + affected_secrets) ✅
- Dedupe policy (fire/silent/supersede/resolve) — fire ✅, resolve ✅, silent/supersede não exercitados
- Telegram outbound (critical, ack, resolved) ✅
- Webhook ack flow (UUID resolution + PATCH + bot reply) ✅
- Pushover escalation (deferida — exercitada em smoke #2 do PR #10)

**Sub-projeto 3 §9.1** (Auditor #1) substantivamente concluído. Próximo: Auditor #2 `deploy-health`.
