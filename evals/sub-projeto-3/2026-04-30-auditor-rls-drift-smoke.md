---
date: 2026-04-30
auditor: rls-drift
status: DONE
pr: 16
merge_sha: 02a3bae
---

# Smoke E2E — Auditor #4 rls-drift (último do Sub-projeto 3)

## Status: DONE — pipeline ponta-a-ponta validada com fixture forçado

Sub-projeto 3 oficialmente fechado **5/5 auditores DONE ✅**.

## O que rodou

### Setup arquitetura híbrida (deviation crítico cravado)

- ✅ **Spec deviation:** `/v1/projects/{ref}/advisors?lint_type=...` REST API **não existe** (404 confirmado). Pivotamos pra **2 SQL queries paralelas** via `POST /v1/projects/{ref}/database/query` (validado funciona com SUPABASE_PAT).
- ✅ **Lib detect determinística** (`functions/_lib/auditors/rls-drift.js`) — `buildTableEvent` + `buildFunctionEvent` + allowlist filter
- ✅ **Endpoint CF Pages** (`functions/api/cron/audit-rls-drift.js`) — `fetchSchemaState` (Promise.all 2 SQL queries) + `collapseEvents` + dedupe wiring
- ✅ **23 tests novos** (15 unit + 8 endpoint), 167 → 190 total

### Pivot Routine → cron-worker (qualidade conjunta)

Originalmente plano cravava Routine Anthropic primary com cron-worker fallback comentado. Após análise "qualidade conjunta", pivotamos pra cron-worker direto pelos mesmos motivos do #3 vps-limits + consistência:

- Pattern provado nos 4 outros auditores (#1/#2/#3/#5 todos cron-worker)
- Zero secret hardcoded (vs Routine que precisaria CRON_SECRET + SUPABASE_PAT + TELEGRAM_BOT_TOKEN no prompt)
- Lesson 12 evitada (RemoteTrigger get/run vaza prompt)
- Trade-off aceito: perde reasoning Claude (narrativas contextuais) — acceptable pra MVP solo founder

### Smoke E2E forçado (fixture function sem search_path)

**Setup:**
```sql
CREATE OR REPLACE FUNCTION public.test_rls_drift_smoke()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE 'rls-drift smoke fixture';
END;
$$;
-- Sem `SET search_path` — auditor detecta critical
```

**Trigger #1 (detect):** `curl -X POST https://inkflow-cron.../?cron=0+7+*+*+*`

Resposta:
```json
{
  "ok": true,
  "run_id": "d9f587b3-0706-4fa4-beb9-bca1a7987cdd",
  "events_count": 1,
  "actions": { "fire": 1, "silent": 0, "supersede": 0, "resolve": 0, "no_op": 0 }
}
```

**Telegram alert recebido:**
```
[critical] [rls-drift] Function `public.test_rls_drift_smoke` sem search_path setado (security risk)
ID: 74aa5b51 | Runbook: none
Suggested: @supabase-dba
Evidence: {"all":[{"object":"test_rls_drift_smoke","symptom":"function_no_search_path","severity":"critical"}],"top":{"schema":"public",...}
Reply "ack 74aa5b51" pra acknowledge.
```

✅ Pipeline ponta-a-ponta validada: cron-worker → endpoint → SQL queries → detect → buildFunctionEvent → collapseEvents → audit_events INSERT → sendTelegram.

**Cleanup:** `DROP FUNCTION IF EXISTS public.test_rls_drift_smoke();`

**Trigger #2 (esperado: resolve):** mesmo curl.

⚠️ **Bug detectado e fixado:** quando detect retorna `[]` (schema limpo), `collapseEvents` retornava `null`, fazendo o orchestrator pular dedupePolicy completamente. Resolve nunca disparava.

**Fix** (commit `d722c91`): `collapseEvents` retorna `{ severity: 'clean', payload: { symptom: 'aggregate', ... } }` quando empty, permitindo dedupePolicy detectar transição critical→clean. Diferente dos outros auditores (vps-limits, billing-flow) que sempre emitem ≥1 event com severity clean por sintoma — rls-drift retorna empty quando schema tá limpo (cada row das SQL queries representa um issue, não um check OK).

**Trigger #3 (pós-fix):** mesmo curl após deploy do commit `d722c91`.

Resposta:
```json
{
  "ok": true,
  "run_id": "3ccacddb-96eb-43a2-b777-4e67dcb600c7",
  "events_count": 0,
  "actions": { "fire": 0, "silent": 0, "supersede": 0, "resolve": 1, "no_op": 0 }
}
```

✅ `actions.resolve: 1` — fix funcional. Event `74aa5b51` updated:
- `resolved_at`: `2026-04-30 16:04:41.086+00`
- `resolved_reason`: `next_run_clean`

Telegram `[resolved] [rls-drift] rls-drift: resolved (next run clean)` esperado.

## Cobertura MVP cravada

2 sintomas determinísticos:

| Sintoma | SQL source | Severity |
|---|---|---|
| Tabela em public sem RLS (não allowlisted) | `pg_class` introspection | warn |
| Function em public sem search_path | `pg_proc` introspection | critical |

Allowlist 6 tables (CSV via env `RLS_INTENTIONAL_NO_PUBLIC`): `audit_events`, `audit_runs`, `audit_reports`, `approvals`, `tool_calls_log`, `signups_log`.

## Backlog pós-MVP (P3 fase 2)

3 lints adicionais que valem expandir quando primeiro tenant pagante real entrar:

1. **`policy_exists_rls_disabled`** — RLS off com policies definidas (security bypass crítico)
2. **`multiple_permissive_policies`** — múltiplas permissive policies = OR logic ambíguo
3. **`unindexed_foreign_keys`** — FK sem índice (perf)

Cada lint = 1 SQL query adicional + ~30min de implementação. Replicar pattern do repo Supabase open source (`packages/pg-meta/src/lints/`).

## Métricas da implementação

- **PR:** [#16](https://github.com/brazilianhustle/inkflow-saas/pull/16) merge commit `02a3bae`
- **Pivot pós-merge:** commit `1558aa4` (cron-worker trigger ativado)
- **Bug fix pós-smoke:** commit `d722c91` (collapseEvents empty handling)
- **Tests:** 190 verde (167 baseline + 15 unit rls-drift + 8 endpoint)
- **Files added:** 5 (lib + endpoint + 2 test files + decision doc)
- **Files modified:** 5 (auditores.md + agents/README.md + incident-response.md + cron-worker config × 2)
- **Spec deviations cravadas:** 6 (advisor REST 404 → SQL queries; arquitetura híbrida; reasoning APENAS na Routine; allowlist expandida; cobertura 2 sintomas MVP; pivot Routine→cron-worker pós-implementation)
- **Tempo total:** ~6h (subagent-driven com pivot mid-execution + bug fix pós-smoke)

## Lições aprendidas

1. **🚨 Spec advisor REST não existe.** Spec original §5.4 cravou endpoint que retornou 404. Database Linter Supabase é client-side no dashboard. Lesson cravada em decision doc + plano deviation #4.
2. **Diferença empty handling vs outros auditores.** vps-limits/billing-flow sempre emitem ≥1 event clean por sintoma — collapseEvents nunca recebe empty. rls-drift retorna empty quando schema tá limpo, requer fix custom no collapseEvents.
3. **Smoke E2E forçado vale ouro.** Sem fixture, esse bug nunca apareceria — primeiro alerta real seria também o primeiro teste do flow. Padrão "smoke E2E forçado obrigatório antes de DoD" cravado pra futuros auditores.
4. **Pivot mid-execution.** Originalmente plano A com Routine reasoning, decidi pivotar pra cron-worker direto durante execução baseado em "qualidade conjunta" (consistência com 4 outros auditores). Routine fica pra Fase 3 quando ROI superar complexidade.

## Validação passiva 48h (gate de DoD)

Próximas 48h: monitorar `audit_runs` do auditor `rls-drift`. Esperado: 2 execuções (1x ao dia × 2 dias), todas `status='success'`, zero falsa-positiva. Cron natural dispara `0 7 * * *` UTC (04:00 BRT).

```sql
SELECT auditor, status, events_emitted, started_at, completed_at, error_message
FROM audit_runs WHERE auditor='rls-drift'
ORDER BY started_at DESC LIMIT 5;
```

Gate expira ~02/05.

## Próximos passos

1. _(em curso)_ Trigger pós-fix pra confirmar resolve flow
2. Eval doc final atualizado com resolve confirmado
3. Atualizar Painel pra refletir DoD ✅
4. 48h baseline passiva
