# Smoke Test E2E — Auditores MVP Infra

**Data:** 2026-04-27
**Spec:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §9.0
**Plan:** `docs/superpowers/plans/2026-04-27-auditores-infra.md` Task 12
**Branch merged:** `feat/auditores-infra` → `main` (PR #10)

## Cenários executados

### Smoke #1 — Ack flow via curl simulado ✅

INSERT manual `audit_events critical` (auditor=`smoke-test`, id_short=`d500ee4f`) → POST simulado pra `/api/audit/telegram-webhook` com `X-Telegram-Bot-Api-Secret-Token` correto + `from.id == TELEGRAM_ADMIN_USER_ID` + `text="ack d500ee4f"` → endpoint resolveu UUID → PATCH `acknowledged_at` + `acknowledged_by` → bot reply `✅ Acknowledged: smoke-test critical` enviado.

**Validação DB:** `acknowledged_at = 2026-04-27 21:30:22.148+00`, `acknowledged_by = 8529665470`. ✅

### Smoke #1b — Ack flow via Telegram real ✅

INSERT novo evento (id_short=`e1bafd45`) → founder mandou `ack e1bafd45` no chat com bot `ink_flow_alerts` → Telegram → `setWebhook` URL → CF Pages Functions handler → resolveu → PATCH → bot reply chegou no Telegram do founder.

**Validação DB:** `acknowledged_at = 2026-04-27 21:43:15.403+00`, `acknowledged_by = 8529665470`. ✅

### Smoke #2 — Escalation Pushover ⏳ PENDENTE

INSERT evento (id_short=`bda45bdd`) com `detected_at = now() - interval '3 hours'` (atende todos os filtros do `audit-escalate`: severity=critical, resolved_at=null, acknowledged_at=null, escalated_at=null, detected_at < now-2h).

**Status:** evento criado mas `escalated_at` permaneceu null após múltiplos triggers do cron `*/5`. Causa provável: `PUSHOVER_APP_TOKEN` / `PUSHOVER_USER_KEY` não estão sendo lidos corretamente do CF Pages env (founder cadastrou mas não pôde validar runtime sem `CRON_SECRET` em mãos).

**O que falta validar pra fechar:**
- `CRON_SECRET` recuperado (Bitwarden ou regeneração) → trigger manual via `curl POST /api/cron/audit-escalate`
- Output do endpoint deve mostrar `escalated_count: 1` E founder deve receber notification Pushover priority=2 no celular
- `audit_events.escalated_at` preenchido após o trigger

**Tracking:** smoke #2 fica registrado como TODO no Painel; pode ser executado em sessão dedicada de rotação de secrets (founder mencionou isso como follow-up).

## Bugs encontrados e fixados durante smoke

Quatro bugs reais encontrados e corrigidos no caminho — todos via commits separados em `main`:

### Bug A: PostgREST wildcard `*` crasha CF Pages runtime (502 plain text)

**Sintoma:** endpoint `/api/audit/telegram-webhook` retorna 502 plain text (não JSON do nosso `json()` helper) APÓS passar Auth #1 + #2, exatamente no fetch lookup contra Supabase. Try/catch em 2 níveis (outer no `onRequest` + inner no fetch) não captura.

**Bisect:** GET trivial a Supabase com URL simples (`?limit=1&select=id`) funciona; GET com `?id=like.PREFIX*` crasha. Confirmado runtime-level (não capturável por JS).

**Fix:** substituir `?id=like.${idShort}*` por buscar todos eventos abertos (max 5 = 1 por auditor pela política de dedupe §6.2) e filtrar por prefix em JS via `String.startsWith`. Payload pequeno, runtime-agnostic. Commit `6c70e77`.

### Bug B: CF Pages env vars não propagam sem novo deploy

**Sintoma:** founder editou `TELEGRAM_WEBHOOK_SECRET` em CF Pages Settings → Environment variables, mas as Functions continuaram lendo o valor anterior (ou ausente). Status do deployment continuou "an hour ago" sem novo job rodando.

**Causa:** ao contrário do que eu havia assumido, edit de env var no CF Pages **não dispara redeploy automático**. Functions só pegam o env atualizado em deploys novos.

**Fix:** empty commit (`dc7f87d`) → push → GHA dispara `pages deploy` → env vars atualizadas chegam ao runtime.

**Doctrine pra futuro:** após editar qualquer env var em Pages, rodar `git commit --allow-empty -m "chore: trigger CF Pages redeploy" && git push`. Adicionar isso como nota em `docs/canonical/runbooks/secrets-expired.md` quando aplicável.

### Bug C: Mismatch `setWebhook` ↔ CF Pages env após múltiplas regenerações

**Sintoma:** `getWebhookInfo` retorna `last_error_message: "Wrong response from the webhook: 401 Unauthorized"`. Curl simulado com `/tmp/inkflow-webhook-secret.txt` passa OK, mas Telegram → webhook real retorna 401.

**Causa:** `setWebhook` configurou Telegram com secret X em algum momento; depois founder regenerou e CF Pages env passou a ter Y. Telegram continuou enviando X. Nenhum dos lados re-sincronizou automaticamente.

**Fix:** re-rodar `setWebhook` via script `/tmp/setwebhook.sh` lendo `/tmp/inkflow-webhook-secret.txt` (mesmo arquivo que era a fonte da verdade do CF Pages env). Após re-set, `getWebhookInfo` mostra `pending=0, last_error: none`.

**Lição operacional:** o `secret_token` no `setWebhook` e o `TELEGRAM_WEBHOOK_SECRET` no CF Pages env DEVEM ser cravados em uma única operação atômica. Se alguma regeneração acontece, ambos lados precisam ser atualizados juntos.

### Bug D: Zsh quebra paste de curl multi-line

**Sintoma:** comandos `curl -X POST ... \\` multi-line colados no terminal do founder são parseados como múltiplos comandos separados — `-d` vira "command not found", JSON body vira "no such file or directory".

**Causa:** integração zsh + iTerm/Terminal.app + paste de blocos com line continuations.

**Workaround:** usar scripts shell em `/tmp/*.sh` chamados com `VARS=val bash /tmp/script.sh`, ou usar variáveis de shell em comandos sequenciais (1 linha por var, depois 1 linha de curl referenciando vars).

## Findings / TODOs pós-MVP

- **Smoke #2 (escalation Pushover) pendente** — fechar antes de declarar Sub-projeto 3 DoD ✅. Coordenar com sessão de rotação geral de secrets do founder.
- **Doctrine de redeploy após env edit** — registrar em runbook (Bug B).
- **Doctrine de sincronização Telegram secret** — registrar em runbook (Bug C).
- **Bug latente:** outros endpoints novos (`audit-escalate`, `audit-cleanup`) também usam `AbortController + setTimeout` (substituição preventiva do `AbortSignal.timeout` durante debug do Bug A — descobriu-se depois que `AbortSignal.timeout` funcionava em CF Pages, era o `*` o real culpado). Nenhum deles tem o `*` da query Supabase, mas vale auditar futuros endpoints contra o pattern: **nunca colocar `*` literal em URL fetch**.

## Próximo passo

Sub-projeto 3 §9.0 (Infra) **substantivamente concluído** — pipeline core (lib + migration + endpoints + cron triggers + ack flow) operacional em produção. Próximos planos do roadmap:

1. Auditor #1 — `key-expiry` (`docs/superpowers/plans/2026-04-XX-auditores-key-expiry.md` quando criado)
2. Auditor #2 — `deploy-health`
3. Auditor #5 — `billing-flow`
4. Auditor #3 — `vps-limits` (Routine)
5. Auditor #4 — `rls-drift` (Routine)
6. Relatório semanal + admin panel
