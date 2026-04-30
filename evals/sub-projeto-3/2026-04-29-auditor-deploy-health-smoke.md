# Smoke E2E — Auditor #2 deploy-health

**Data:** 2026-04-29
**Branch:** feat/auditor-deploy-health (mergeada via PR #12, merge commit `4250be0`)
**Spec:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.2
**Plano:** `docs/superpowers/plans/2026-04-29-auditor-deploy-health.md`
**Status:** ✅ DONE 2026-04-30 (parte 2, pós-rotação token) — bug discovery + fix + retest completo.

## Update 2026-04-30 (parte 2 final) — smoke E2E full DONE pós-rotação

**Sequência completa:**

1. **Bug discovery** (via fixture INSERT inicial — ver seção abaixo): GHA self-check 401, token classic PAT inválido em prod.
2. **Rotação completa GITHUB_API_TOKEN** (~10min):
   - Founder gerou fine-grained PAT novo via GitHub UI (`inkflow-audit-deploy-health-v2`, scopes `Actions:Read + Contents:Read`, repo `inkflow-saas` only)
   - Validação `curl` retornou HTTP 200 (309 runs visíveis)
   - BWS secret id `1336556a-...` updated via `bws secret edit`
   - CF Pages env updated via `wrangler pages secret put GITHUB_API_TOKEN --project-name=inkflow-saas` (production)
   - Empty/eval-doc commit `fe7a84a` + push → GHA `Deploy to Cloudflare Pages` run `25183241465` deployed CF Pages com novo token
3. **Trigger pós-rotação** validou clean state: run `4822a902-015c-49aa-aaa9-dc54f508b5a9` retornou `events_count=0`, `actions.resolve=1`. Event warn `11a347b7` (cron natural 18:01) resolveu automaticamente. 2 warns antigos (`92a62c88` 12:00, `05615b25` 06:00) resolvidos manualmente com `resolved_reason='token_rotated'`.
4. **Smoke E2E full retest (cenário resolve flow):**
   - Fixture INSERT critical event `52c4800b-14dc-4236-9df3-42123699e919` simulando 2 GHA failures consecutivas
   - Trigger `0 */6 * * *` → run `c09840ac-e67d-47be-b03b-a0eeb9129dee`, **`events_count=0`, `actions.resolve=1`**
   - Event `52c4800b` updated: `resolved_at=2026-04-30 18:58:02.711+00`, `resolved_reason='next_run_clean'`
   - Cleanup fixture: DELETE event + DELETE run row
5. **Estado final:** 0 open events, 3 resolved (1 `next_run_clean` real + 2 `token_rotated` manual + fixture cleanup).

✅ **Pipeline completo validado:** trigger → endpoint → fetchGitHubRuns (com token novo) → detect (sintoma A clean) → collapseEvents → dedupePolicy (current=critical fixture, next=clean → resolve) → audit_events UPDATE → sendTelegram resolved → audit_runs status=success.

**Sintomas B/C cobertura:**
- B (CF Pages build failures): mesmo pipeline, validado via 21 unit tests + cron natural quando primeiro CF Pages build falhar
- C (wrangler-drift): opt-in via env (default OFF), validado por unit tests

**Telegram alert esperado:**
- `[resolved] [deploy-health] resolved (next run clean)` ~18:58 UTC

**Sub-projeto 3 agora 5/5 smokes E2E full DONE.** Gate 48h passivo único restante (~02/05).

---

## Update 2026-04-30 (parte 2 inicial) — bug discovery via fixture

**Tentativa:** fixture INSERT em `audit_events` simulando 2 GHA failures consecutivas críticas, depois trigger auditor real esperando `actions.resolve=1`.

**Resultado:** trigger retornou `actions.silent=1` (não resolve). Investigação revelou:

🚨 **Bug real em prod descoberto:** auditor #2 deploy-health tem emitido `warn` "GHA API self-check returned 401" desde 06:00 UTC do mesmo dia. Validei diretamente: `curl -H "Authorization: Bearer $GITHUB_API_TOKEN" https://api.github.com/repos/.../actions/runs?per_page=1` retorna **HTTP 401**. Token salvo em BWS + CF Pages é classic PAT (`ghp_3wYSuT...`, length 40) — esperava-se fine-grained PAT (`github_pat_*`, scope `inkflow-audit-deploy-health` cadastrado em 2026-04-29 com expiração 2026-07-29).

**Hipótese:** rotação manual em algum momento substituiu o fine-grained pelo classic, ou o salvamento em BWS gravou o classic antigo (não o fine-grained novo). Sem visibilidade de quando exatamente.

**Validação dedupePolicy:** com fixture critical inserido + detect retornando warn (401 self-check) → dedupePolicy linha 88 (`current=critical && next=warn → silent`). Lógica está **correta**, mas significa que silent path do dedupePolicy é o que foi exercitado, não resolve.

**Cleanup:** fixture event `14b7df2c-dfbc-48b1-bfd6-69fb0515fd28` + audit_runs row `6f539df1-...` deletados. Estado DB limpo. Os 2 warns reais (`92a62c88` 12:00, `05615b25` 06:00) ficam abertos como **evidência forense** do bug.

**Followup P1 (criado no backlog):** rotacionar `GITHUB_API_TOKEN` — gerar fine-grained PAT novo, atualizar CF Pages env + BWS, validar GHA self-check passa, retesar smoke E2E full quando token funcional.

---

## Por que smoke parcial

CRON_SECRET não está em BWS nem em Bitwarden Personal — só em CF Pages env + cron-worker secret (ambos write-only). Pra disparar smoke manual `curl -H "Authorization: Bearer $CRON_SECRET"`, precisaria regenerar e propagar nos 3 lugares (CF Pages + cron-worker + BWS).

Decisão da sessão (2026-04-29 ~14h BRT): aceitar smoke parcial nesta sessão. Justificativas:
1. **Pipeline core já validado em prod** — `audit-state.js` lib (insertEvent + sendTelegram + dedupePolicy + getCurrentState) provada ponta-a-ponta no smoke do auditor #1 key-expiry (`2026-04-28-auditor-key-expiry-smoke.md`). Auditor #2 reusa 100% sem mudanças.
2. **Unit tests cobrem todos os paths** — 24 unit tests `tests/auditor-deploy-health.test.mjs` (clean/warn/critical por sintoma + non-consecutive + HTTP error + network error) + 7 endpoint tests `tests/audit-deploy-health-endpoint.test.mjs` (auth/method/config/empty/fire/supersede/resolve). 76 tests verdes incluindo regression.
3. **Cron natural dispara sozinho** — `0 */6 * * *` em UTC. Próximo fire: 18:00 UTC = 15:00 BRT (~1h após o merge). `audit_runs` vai mostrar `status='success'` e `events_emitted` automaticamente, sem ação manual.
4. **48h em prod sem falsa-positiva** é o gate real do DoD por auditor (spec §10) — passa do que smoke manual cobriria.

---

## O que foi validado nesta sessão

### Sanity check pós-deploy

```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST https://inkflowbrasil.com/api/cron/audit-deploy-health
# HTTP 401
```

✅ Endpoint deployado em prod, auth guard ativo (CRON_SECRET requerido). Confirma que o GHA `deploy.yml` rodou com sucesso e CF Pages picked up o novo arquivo `functions/api/cron/audit-deploy-health.js`.

### cron-worker (`inkflow-cron`)

```bash
cd cron-worker && npx wrangler deploy
```

Output confirmou 8 schedules:
- `0 12 * * *` → expira-trial
- `0 2 * * *` → cleanup-tenants
- `0 9 * * *` → reset-agendamentos
- `*/30 * * * *` → monitor-whatsapp
- `*/5 * * * *` → audit-escalate
- `0 4 * * 1` → audit-cleanup
- `0 6 * * *` → audit-key-expiry
- **`0 */6 * * *` → audit-deploy-health** (NEW)

`Current Version ID: 492ee774-ae78-452f-aac0-390f5ccc00da`

### Test suite local (76/76 passing)

```
tests/auditor-deploy-health.test.mjs       — 24 pass
tests/audit-deploy-health-endpoint.test.mjs — 7 pass
tests/auditor-key-expiry.test.mjs           — 19 pass (regression)
tests/audit-key-expiry-endpoint.test.mjs    — 5 pass (regression)
tests/audit-state.test.mjs                  — 21 pass (regression)
                                             ─────────
                                             76 pass / 0 fail
```

### Env vars cadastradas em prod

- ✅ `GITHUB_API_TOKEN` (fine-grained PAT, scope: Actions:Read + Contents:Read, expires 2026-07-29) — CF Pages production env + BWS project `inkflow`
- ✅ `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (já em prod desde PR #11)
- ⏸️ `AUDIT_DEPLOY_HEALTH_WRANGLER_DRIFT` — não cadastrado (Sintoma C fica OFF, default seguro)

---

## Smokes pendentes (próxima sessão ou cenário real)

### Smoke 1 — trigger sem failures (no-op esperado)
**Status:** Vai rodar naturalmente em **18:00 UTC** (cron natural). Validar via Supabase MCP:

```sql
SELECT auditor, status, events_emitted, started_at, completed_at, error_message
FROM audit_runs
WHERE auditor='deploy-health'
ORDER BY started_at DESC LIMIT 3;
```

Esperado: `status='success'`, `events_emitted=0` (assumindo nenhum failure recente em GHA/Pages).

### Smoke 2 — forçar critical (2 GHA failures)
**Pré-req:** CRON_SECRET acessível + workflow temporário com `name: Deploy to Cloudflare Pages` e `exit 1`. Disparar 2x via `gh workflow run`. Trigger auditor manual via curl. Esperado: Telegram message `[critical] [deploy-health]` + `audit_events.severity='critical'`.

### Smoke 3 — ack flow via Telegram
**Pré-req:** Smoke 2 disparado. Reply `ack <id>` no Telegram. Esperado: bot reply `✅ Acknowledged: deploy-health critical` + `audit_events.acknowledged_at` preenchido.

### Smoke 4 — resolve via next-run-clean
**Pré-req:** Smoke 3 fechado. Cleanup workflow temporário OU override `AUDIT_DEPLOY_HEALTH_WINDOW_HOURS=1` em CF Pages env + redeploy (bug B PR #10). Trigger novo run. Esperado: Telegram `[resolved]` + `audit_events.resolved_at` + `resolved_reason='next_run_clean'`.

---

## Operational followups

- [ ] **CRON_SECRET → BWS:** próxima rotação ou regeneração, salvar em BWS pra desbloquear smokes manuais sem regen extra. Memo pra runbook `secrets-expired.md`.
- [ ] **Validar cron natural** quando 18:00 UTC chegar — query `audit_runs` + `audit_current_state` + confirmar zero false-positive nas próximas 48h.
- [ ] **Smokes 2-4** quando primeiro deploy real falhar OU em sessão dedicada quando outro CRON_SECRET refresh ocorrer.

---

## Bugs descobertos durante implementação

Nenhum bug em prod descoberto nesta sessão (em contraste com auditor #1 key-expiry que descobriu 2 bugs durante o smoke). Razão: auditor #2 reusa lib `audit-state` já depurada + clone-pattern do endpoint key-expiry com fix #2 (`current.event_id`) replicado preventivamente.

Issue cosmética encontrada pelo final code reviewer (commit `c187cb0` corrigiu): linha "Próximos auditores" em `auditores.md` ainda listava deploy-health como pending — removido.

## Status final

⚠️ **PARTIAL — code-deployed em prod, full E2E pendente**

Critério prático adotado: 48h em prod sem falsa-positiva é o gate real do DoD por auditor (spec §10). Cron natural dispara 4x ao dia (00:00/06:00/12:00/18:00 UTC). Após 48h, terão sido ~8 execuções reais — mais robusto que smoke manual de 4 cenários.

Smoke full pode ser executado em sessão dedicada com CRON_SECRET regenerado, ou pula direto pro caso real (primeiro deploy quebrado em prod = primeira fire genuína).
