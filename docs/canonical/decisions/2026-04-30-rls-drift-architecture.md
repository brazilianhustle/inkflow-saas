---
last_reviewed: 2026-04-30
status: stable
related: [auditores.md, decisions/2026-04-29-vps-limits-data-source.md]
---

# Decisão arquitetural — Auditor `rls-drift` (híbrida resiliente)

**Data:** 2026-04-30
**Sub-projeto:** 3 (Time de Auditores) §9.5
**Spec ref:** `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` §5.4 + §9.5

## Decisão

**Arquitetura híbrida resiliente:**

1. **Lib detect determinística** (`functions/_lib/auditors/rls-drift.js`) — pura, sem reasoning Claude, sem chamadas externas. Recebe `schemaState: { tables_no_rls, functions_no_search_path }` + env (allowlist) e retorna eventos.
2. **Endpoint CF Pages funcional** (`functions/api/cron/audit-rls-drift.js`) — orchestrator completo (auth + fetchSchemaState com 2 SQL queries paralelas + detect + collapseEvents + dedupe + Telegram). Funciona standalone como auditor determinístico.
3. **Routine Anthropic via `/schedule`** (caminho primary) — executa as 2 SQL queries via `https://api.supabase.com/v1/projects/{ref}/database/query` + git log de migrations + aplica reasoning Claude por cima do detect determinístico (narrativa contextual: "tabela X adicionada em commit Y sem RLS — provavelmente esquecimento") + INSERT em audit_events via SQL.
4. **cron-worker trigger no SCHEDULE_MAP mas COMENTADO no wrangler.toml** — pivot path = descomentar 1 linha + redeploy = ~30min.

## 🚨 Deviation crítico vs spec §5.4

Spec assumiu API REST `/v1/projects/{ref}/advisors?lint_type=...` baseado no Database Linter. **Esse endpoint não existe** (404 confirmado em testes diretos 2026-04-30 com SB_PAT válido). Database Linter é implementado client-side no dashboard Supabase, sem REST público.

**Pivot:** SQL queries diretas via `POST /v1/projects/{ref}/database/query`:

- **Query A (RLS):** `SELECT n.nspname AS schema, c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid WHERE c.relkind = 'r' AND n.nspname = 'public' AND NOT c.relrowsecurity ORDER BY c.relname`
- **Query B (search_path):** `SELECT n.nspname AS schema, p.proname AS function_name FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f' AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search_path=%')) ORDER BY p.proname`

**Cobertura MVP:** 2 sintomas (RLS + search_path) — outros lints do dashboard (performance, policies WITH CHECK, RLS-on-com-policies-zero) ficam backlog P3 (fase 2 do auditor #4).

## Por quê arquitetura híbrida (vs Routine pura)

Aprendizado de 2026-04-30 (auditor #3 vps-limits): CCR sandbox bloqueia outbound HTTPS pra hosts não-allowlisted. Pivot emergencial sem mitigação prévia leva ~3-4h. Investir 1h adicional agora pra ter endpoint stub funcional reduz custo de pivot futuro pra ~30min se Anthropic mudar allowlist.

**Probabilidade de pivot futuro:**
- Anthropic remover `api.supabase.com` da allowlist → **baixa** (Supabase é parceiro com MCP oficial)
- Anthropic remover `api.telegram.org` → **muito baixa** (universal)
- Allowlist ficar mais restrita por security review futura → **possível**

**Custo estimado:**
- Implementação A pura (Routine) sem mitigação: 3h + 4h × 30% pivot prob = **4.2h esperado**
- Implementação A com mitigação design (este plano): 4h + 0.5h × 30% pivot prob = **4.15h esperado**
- Implementação B direta (cron-worker): 2.5h + 0h pivot = **2.5h esperado, mas perde reasoning**

Reasoning Claude vale ~1.5h adicional por trazer narrativas contextuais (PR refs, migration timing) ao alerta Telegram.

## Pivot path (se Routine quebrar)

**Sintomas que indicam pivot necessário:**
- `audit_runs` tabela com `auditor='rls-drift'` para de receber rows após X horas (esperado: 1 row/dia às 07:00 UTC)
- Logs da Routine no UI claude.ai/code/routines mostram `Host not in allowlist` 403 OU outros erros de network
- Alerta crítico real ocorreu mas Telegram não disparou (silencioso)

**Procedimento de pivot (~30min):**

1. Editar `cron-worker/wrangler.toml` — descomentar a linha:
   ```toml
   "0 7 * * *",   # 04:00 BRT diario → /api/cron/audit-rls-drift (PIVOT FALLBACK)
   ```
2. Verificar que `cron-worker/src/index.js` SCHEDULE_MAP já tem entry pra `'0 7 * * *'` (deveria estar lá).
3. Deploy: `cd cron-worker && npx wrangler deploy`
4. Validar: deploy mostra `0 7 * * *` na lista de triggers.
5. Smoke: trigger manual via fetch handler:
   ```bash
   CRON_SECRET=$(BWS_ACCESS_TOKEN=$(security find-generic-password -s BWS_ACCESS_TOKEN -w) bws secret get 180b8bf9-36ea-490a-9d0d-b43c002ff013 | jq -r '.value')
   curl -sS -X POST "https://inkflow-cron.lmf4200.workers.dev/?cron=0+7+*+*+*" -H "Authorization: Bearer ${CRON_SECRET}"
   ```
6. Verificar audit_runs nova row pra `rls-drift`.
7. Desabilitar Routine via UI (claude.ai/code/routines/<id> toggle off).
8. Atualizar `docs/canonical/auditores.md ## rls-drift` (campo "Onde:" muda Routine → cron-worker).
9. Commit + push: `git add -A && git commit -m "chore: pivot rls-drift Routine→cron-worker (CCR allowlist)" && git push`

**Tempo total:** ~30min (vs ~3-4h sem mitigação prévia).

## Alternativas avaliadas

### A. Routine pura (sem endpoint stub) — rejeitado

- **Como funcionaria:** spec original §5.4 — só Routine, sem endpoint CF Pages.
- **Por que NÃO:** se CCR allowlist mudar, pivot leva 3-4h pra criar endpoint do zero. Custo de implementação igual mas risco residual maior.

### B. cron-worker direto (sem Routine) — rejeitado

- **Como funcionaria:** só endpoint CF Pages dispatched via cron-worker, sem Routine.
- **Por que NÃO:** perde reasoning Claude (narrativas contextuais, decisão sobre allowlist crescer com PR refs). Spec §5.4.2 explicitamente listou 3 valor-adds de reasoning. Reasoning vale ~1.5h adicional de implementação.

### C. MCP Supabase em vez de REST direto (rejeitado pra MVP)

- **Como funcionaria:** Routine usa MCP Supabase pra query SQL em vez de curl REST.
- **Por que NÃO pra MVP:** MCP Supabase está allowlisted nas Routines, mas REST `database/query` é mais simples e funciona com `SUPABASE_PAT` standard. MCP fica como evolução futura.

### D. Advisor REST API original (rejeitado — não existe)

- **Como funcionaria:** spec §5.4 cravou `/v1/.../advisors?lint_type=...`.
- **Por que NÃO:** endpoint retorna 404. Database Linter é client-side no dashboard, sem REST público. Pivot pra SQL queries diretas.

## Capability check (executado durante Task 5 do plano)

| Verificação | Resultado |
|---|---|
| `node --test tests/auditor-rls-drift.test.mjs` 15 unit tests | ✅ |
| `node --test tests/audit-rls-drift-endpoint.test.mjs` 8 endpoint tests | ✅ |
| Endpoint CF Pages prod retorna 401 sem auth (sanity) | ⏳ Validado em Task 9 |
| Endpoint CF Pages prod retorna 200 + run_id com auth válido | ⏳ Validado em Task 10 |
| Routine Anthropic chama `api.supabase.com/database/query` sem 403 | ⏳ Validado em Task 11 |
| Routine Anthropic chama `api.telegram.org` sem 403 | ⏳ Validado em Task 11 |

## Limitações conhecidas

1. **Endpoint fallback NÃO tem reasoning Claude.** Se Routine quebrar e fallback ativar, alertas Telegram perdem narrativa contextual. Vira detect determinístico — alerta funcional mas menos informativo.
2. **Allowlist via env var é estática até redeploy.** Adicionar tabela ao `RLS_INTENTIONAL_NO_PUBLIC` requer atualizar CF Pages env (no deploy de código, mas precisa empty commit pra propagar). Pós-MVP: considerar tabela `rls_drift_allowlist` no Supabase pra updates dinâmicos sem deploy.
3. **Cobertura: só 2 sintomas (RLS + search_path).** Outros lints do dashboard (performance, policies WITH CHECK true, RLS-on-com-policies-zero) ficam backlog P3 fase 2.

## Pós-MVP (TODOs registrados)

- [ ] Migrar allowlist pra tabela Supabase (atualizar sem redeploy)
- [ ] Auditor #4 fase 2: adicionar policies WITH CHECK true em endpoint anon → critical
- [ ] Auditor #4 fase 2: adicionar RLS-on-com-policies-zero (silent fail comum em dev) → warn
- [ ] MCP Supabase como source alternativo (se Routines ganharem MCP capability nativamente)
- [ ] Auto-allowlist via PR detection (Routine reasoning marca tabela como intentionally_no_rls em PR comment)
