---
title: Auditor Self-Remediation Framework
date: 2026-05-06
status: design
author: Leandro + Claude
related_alert: c4934661 (rls-drift, dashboard_resumo_periodo +3 findings)
related_specs:
  - 2026-04-27-auditores-mvp-design.md (Sub-projeto 3 — auditores)
  - Mentalidade — Runbook incidentes (estrutura mãe das 5 etapas)
---

# Auditor Self-Remediation Framework

## TL;DR

Hoje os auditores InkFlow detectam e alertam, mas o caminho **alert → fix** é manual e indocumentado. Resultado: alerta crítico `rls-drift` (id `c4934661`, 4 funções sem `search_path`) ficou >2h sem ack e escalou pra emergency. Propomos um framework genérico que estende cada auditor com uma função `remediate(event)` pura, um slash command `/fix-incident <id>` que materializa o fix em PR, e um verify loop que fecha a malha automaticamente quando a migration aplicada zera o drift.

## Contexto e motivação

### O incidente disparador

Em 2026-05-06 04:01 BRT o auditor `rls-drift` (cron CF Pages) detectou 4 funções em `public` sem `SET search_path`:

| # | Function | Origem | Linguagem |
|---|---|---|---|
| 1 | `dashboard_resumo_periodo` | PR #26 (mig 2026-05-05-pr2-dashboard-rpc.sql) | sql STABLE |
| 2 | `dashboard_sinal_recebido` | PR #26 (mig 2026-05-05-pr2-dashboard-rpc.sql) | sql STABLE |
| 3 | `dashboard_taxa_conversao` | PR #26 (mig 2026-05-05-pr2-dashboard-rpc.sql) | sql STABLE |
| 4 | `update_conversa_last_msg_at` | trigger antigo | plpgsql |

Postgres sem `search_path` explícito permite **search-path injection** (role com permissão de criar objetos em qualquer schema do path consegue sequestrar chamadas de função built-in como `count`, `sum`, `SPLIT_PART`).

Telegram alert chegou às 04:01 com `Runbook: none`. Escalation push notification às 06:05 (>2h sem ack). Leandro acordou e abriu ticket sem caminho automatizado de fix.

### O gap de processo

| Camada | Estado |
|---|---|
| 1. Detect (SQL via Mgmt API) | ✅ funciona |
| 2. Classify (severity + symptom + collapse) | ✅ funciona |
| 3. Alert (Telegram + push + escalation 2h) | ✅ funciona |
| 4. **Diagnose** (runbook + fix preview) | ❌ `RUNBOOK_PATH = null` hard-coded em `rls-drift.js:18` |
| 5. **Remediate** (gera fix concreto) | ❌ não existe |
| 6. Verify (re-run detect, ack auto) | ⚠️ resolve flow existe mas só por cron natural (próxima rodada de 12h) |
| 7. Postmortem (vault note + Painel) | ⚠️ manual via `/incidente` |

Camadas 4 e 5 são novas. Camada 6 ganha trigger manual além do cron natural. Camada 7 ganha stub auto.

### Por que agora

`rls-drift` é o primeiro auditor com alerta crítico que precisa de ação dev (DDL em prod). Os outros (`vps-limits`, `billing-flow`, `whatsapp-disconnects`, `mapa-canonico-divergence`) historicamente alertaram comportamento transitório que auto-resolveu (ex: vps-limits 30/04 falsa-positiva). Resolver esse caso end-to-end é o forcing function pra codificar o framework.

## Goals

1. **Fechar o alerta `c4934661`** com migration aplicada e ack confirmado (Fase 1).
2. **Documentar o procedimento de fix** num runbook canônico — base pra automação posterior (Fase 1, output).
3. **Genericizar** o caminho fix: cada auditor expõe `remediate(event)` pura. Slash command `/fix-incident <id>` consome qualquer auditor que tenha `remediate()` definido (Fase 2).
4. **Fechar a malha** com verify loop automatizado pós-merge: re-roda `detect()`, marca event resolved, manda ack pro Telegram, cria stub de postmortem (Fase 2).
5. **Manter PR como único gate humano** entre detect e apply — DDL não-trivial em prod nunca é auto-aplicado sem review visual.

## Non-goals

- **Auto-apply DDL sem human gate** — fora de escopo. Approval do PR no GitHub é a UI de gate certa.
- **Refactor dos auditores existentes além de `remediate()`** — não vou tocar `detect()`, `collapseEvents`, `dedupePolicy`. Adições onde possível, edits mínimas.
- **Resolver os 4 outros auditores nesta spec** — Fase 3 é JIT (just-in-time), só quando reincidir alerta crítico daquele auditor.
- **Re-architectar Telegram bot ou MCP** — só estendo formatter de alert e reply handler com novos casos.
- **Criar Sub-projeto 2 (Subagents) por causa disso** — `suggested_subagent: 'supabase-dba'` continua sendo hint pra futuro, não consumido neste framework.

## Success criteria

| Critério | Como medir | Quando |
|---|---|---|
| Alerta `c4934661` resolvido | Telegram ack confirmado + audit_events row.resolved_at preenchido | Fase 1 |
| Postmortem criado | `vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md` existe | Fase 1 |
| Runbook canônico exists | `docs/canonical/runbooks/rls-drift.md` versionado em git | Fase 1 |
| `RUNBOOK_PATH` populado em `rls-drift.js` | Telegram alert mostra link real (não "none") em próximo fire | Fase 2 |
| `/fix-incident <id>` funciona end-to-end | Smoke E2E: forçar drift em dev, rodar comando, validar PR aberto + migration correta | Fase 2 |
| Verify loop fecha a malha | Smoke E2E: pós-merge, audit_events marca resolved + Telegram ack auto + postmortem stub criado | Fase 2 |
| Contract testado | `remediate.test.mjs` snapshot do migration content pra rls-drift | Fase 2 |

## Architecture

### As 7 camadas do framework

```
[1 Detect]    auditor SQL → events                       ✅ existe
[2 Classify]  severity + symptom + collapse              ✅ existe
[3 Alert]     Telegram + push + escalation 2h            ✅ existe (formatter recebe minor update — camada 4)
[4 Diagnose]  runbook canônico + fix preview no alert    🆕 NOVO
[5 Remediate] gera migration + abre PR                   🆕 NOVO
[6 Verify]    re-run detect + ack auto                   ⚠️ trigger manual + cron, antes era só cron
[7 Postmortem] vault note stub + Painel link             ⚠️ stub auto, antes só /incidente manual
```

### Design principles

1. **PR como gate humano** — DDL em prod nunca é auto-aplicado. Approval visual via diff no GitHub UI.
2. **`remediate()` como pure function** — sem I/O, sem side effect. Recebe event + ctx, retorna artefatos. Testável via snapshot.
3. **Idempotência** — `remediate()` lê estado atual do schema (não confia 100% no payload do event). Se já fixed, gera migration vazia ou no-op.
4. **Naked runbook → canônico** — Fase 1 captura o procedimento manual cru. Fase 2 só formaliza esse output em formato canônico. Runbook não é fanfic.
5. **Verify fecha a malha** — sem verify automático, "auto-fix" é só "auto-PR" (metade do trabalho). O critério de "resolved" tem que vir do auditor, não de quem mergeou.
6. **JIT roll-out** — outros auditores ganham `remediate()` quando primeiro alerta crítico bater. Não pago custo de N stubs upfront.

## Components

### A. Contract `remediate(event, ctx)` em cada auditor

Cada `functions/_lib/auditors/<name>.js` ganha um export paralelo ao `detect()`. Pure function, async (precisa ler schema state pra idempotência).

**Signature:**

```js
/**
 * @param {AuditEvent} event - row de audit_events com payload + evidence
 * @param {RemediateCtx} ctx - { env, fetchImpl, executeSql }
 * @returns {Promise<RemediationPlan | null>}
 *   null = não há remediação automática disponível pra este event (manual_only)
 */
export async function remediate(event, ctx) { ... }

type RemediationPlan = {
  migration?: { filename: string, content: string };  // SQL DDL/DML
  shell?: string[];                                    // raros, ex: redeploy
  summary: string;                                     // 1-line pro PR title + Telegram
  runbook_path: string;                                // canonical
  verify: {
    auditor: string;                                   // qual auditor re-rodar
    expect: 'clean' | 'severity_lower';                // 'clean' = espera zero findings (rls-drift, mapa-canonico). 'severity_lower' = aceita warn/info se era critical (vps-limits, billing-flow onde fix parcial é OK)
    timeout_seconds?: number;                          // default 60
  };
  manual_only?: boolean;                               // true = abrir issue, não PR
};
```

**Implementação `rls-drift.js` (Fase 2):**

```js
export async function remediate(event, ctx) {
  const findings = (event.evidence?.all || [])
    .filter(f => f.symptom === 'function_no_search_path' && f.severity === 'critical');

  if (findings.length === 0) return null;

  // Re-check current schema state (idempotência)
  const stillDirty = await fetchFunctionsWithoutSearchPath(ctx);
  const targets = findings
    .map(f => f.object)
    .filter(name => stillDirty.has(name));

  if (targets.length === 0) {
    return {
      summary: 'rls-drift: schema já clean (no-op)',
      runbook_path: 'docs/canonical/runbooks/rls-drift.md',
      verify: { auditor: 'rls-drift', expect: 'clean' },
    };
  }

  const stmts = targets.map(name =>
    `ALTER FUNCTION public.${name} SET search_path = '';`
  );
  const filename = `${todayISO()}-fix-rls-drift-search-path.sql`;
  const content = `-- Auto-generated by remediate() for event ${event.id}\n-- ${targets.length} functions\n\nBEGIN;\n${stmts.join('\n')}\nCOMMIT;\n`;

  return {
    migration: { filename, content },
    summary: `Set search_path='' em ${targets.length} funções (${targets.join(', ')})`,
    runbook_path: 'docs/canonical/runbooks/rls-drift.md',
    verify: { auditor: 'rls-drift', expect: 'clean', timeout_seconds: 120 },
  };
}
```

**Decisão de DDL:** `ALTER FUNCTION ... SET search_path = ''` (string vazia) é a recomendação Supabase oficial pra Postgres ≥15. Equivalente a `SET LOCAL search_path = ''` dentro do body. Empty string força qualificação total (`pg_catalog.count`, `public.tenants`) — mais seguro que `pg_catalog, public`.

### B. Slash command `/fix-incident <event_id>`

Pipeline server-side (executado por Claude Code):

1. **Lookup event** via Supabase MCP: `SELECT * FROM audit_events WHERE id::text LIKE '<short_id>%' AND resolved_at IS NULL` (short_id = primeiros 8 chars do UUID).
2. **Validate** — event existe, ainda aberto, severity ≥ warn.
3. **Load auditor module** — dynamic import `functions/_lib/auditors/${event.auditor}.js`.
4. **Call `remediate(event, ctx)`** — recebe `RemediationPlan`.
5. **Branch** — `git checkout -b fix/${event.auditor}-${short_id}` em `inkflow-saas`.
6. **Write artifacts:**
   - `supabase/migrations/${plan.migration.filename}` se migration.
   - Notas no commit message: link pro audit_events row, runbook, summary.
7. **Push + open PR** via `gh pr create` com:
   - Title: `fix(${event.auditor}): ${plan.summary}`
   - Body autogenerated (template em §C abaixo).
8. **Comment back no Telegram** — reply na thread do alert original com `🔧 PR #N aberto: <url>`.

**Telegram reply handler (`functions/api/webhooks/telegram-reply.js`)** ganha caso novo:
- `ack <id>` → existing behavior.
- `fix <id>` → invokes equivalent server-side via API call (worker → endpoint `/api/admin/fix-incident`).

**Segurança:** endpoint `/api/admin/fix-incident` precisa de `Authorization: Bearer ${ADMIN_SECRET}` + valida `event.id` shape. Telegram reply handler já tem rate-limit + chat_id allowlist (só Leandro).

### C. Runbook canônico `docs/canonical/runbooks/rls-drift.md`

Estrutura mãe (segue `Mentalidade — Runbook incidentes` 5 etapas):

```markdown
# Runbook — rls-drift

## Detect
- Auditor: `functions/_lib/auditors/rls-drift.js` (cron 12h)
- Telegram alert format: `[critical] [rls-drift] ...`
- Audit events query: `SELECT * FROM audit_events WHERE auditor = 'rls-drift' AND resolved_at IS NULL`

## Confirm (manual SQL)
\`\`\`sql
SELECT n.nspname, p.proname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prokind = 'f'
  AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) WHERE unnest LIKE 'search_path=%'));
\`\`\`

## Contain
N/A — search-path injection requer adversário com privilégio CREATE em schema do path.
Mitigação suficiente é o fix DDL.

## Fix
### Auto (recomendado)
1. Telegram reply: `fix <short_id>` OR slash command `/fix-incident <short_id>`
2. Aprovar PR no GitHub
3. Aplicar migration via Supabase MCP (`apply_migration`)
4. Verify loop dispara ack + postmortem stub auto

### Manual (escape hatch)
\`\`\`sql
ALTER FUNCTION public.<function_name> SET search_path = '';
\`\`\`
Por function. Aplicar via Supabase MCP `execute_sql` ou Studio SQL Editor.

## Verify
\`\`\`sh
# Re-rodar detect via cron endpoint:
curl -X POST https://inkflowbrasil.com/api/cron/audit-rls-drift \
  -H "Authorization: Bearer $CRON_SECRET"
# Esperado: {"ok":true, "events_count": 0}
\`\`\`

## Postmortem
Template em `vault/InkFlow — Incidentes/<data>-rls-drift-<slug>.md`. Auto-criado pelo verify loop quando applicable.
```

**Update no auditor:** `RUNBOOK_PATH = 'docs/canonical/runbooks/rls-drift.md'` (era `null`).

### D. Verify loop

**Endpoint novo:** `functions/api/admin/verify-fix.js`
- Input: `{ event_id }`
- Auth: `ADMIN_SECRET` ou `CRON_SECRET`
- Pipeline:
  1. Load event de `audit_events`.
  2. Load auditor module + chama `detect({ env, schemaState: ..., now })`.
  3. Compara com `event.payload.symptom` — se sumiu da lista de findings, marca resolved.
  4. PATCH `audit_events SET resolved_at, resolved_reason='auto_verified'`.
  5. Telegram: `[resolved] [<auditor>] ${event.payload.summary}` reply na thread.
  6. Cria stub `vault/InkFlow — Incidentes/${date}-${auditor}-${short_id}.md` com template (5 etapas pré-preenchidas com dados do event + PR url + verify timestamp).

**Trigger:** GitHub webhook on `pull_request.merged` com filtro `branch ~ /^fix\//` → POST `/api/admin/verify-fix`. Setup webhook no `inkflow-saas` repo (escopo `pull_request` events).

**Fallback:** se webhook falha (entrega), próximo cron natural (12h) acaba pegando via `dedupePolicy` → `resolve` action existing.

**Postmortem stub template** (escrito pelo verify loop):

```markdown
# <date> — <auditor>: <summary>

**Severity:** <severity>
**Event ID:** <event_id>
**Run ID:** <run_id>
**PR fix:** <pr_url>
**Resolved at:** <timestamp> (auto via verify loop)

## Detect
<copy do payload>

## Fix aplicado
<migration content do PR>

## Verify
<output do detect re-run>

## Lessons / TODOs
- [ ] <preencher manualmente — por que o drift entrou em prod?>
- [ ] <prevenção: pre-commit hook? CI check? template de migration?>
```

### E. Telegram alert enriquecido

`functions/_lib/telegram.js` — formatter atual cospe `Runbook: ${payload.runbook_path || 'none'}`.

Adições:
1. **Linha runbook** — quando `runbook_path` populado, renderiza link clicável (Telegram suporta MarkdownV2 + URL).
2. **Linha auto-fix** (NOVA) — `🔧 Auto-fix: reply 'fix ${short_id}'` se auditor tem `remediate()` exportado (introspection no module load do worker).
3. Fallback continua sendo `Reply 'ack <id>' pra acknowledge`.

## Data flow (diagrama)

```
[Cron 12h: audit-rls-drift]
    ├─ detect() → 4 findings → collapse → critical event
    ├─ insertEvent(audit_events) → row id c4934661
    └─ sendTelegram(env, event)
         ├─ Telegram msg w/ runbook_path + "reply 'fix c4934661'"
         └─ push notification

[User reply: "fix c4934661"] OR [/fix-incident c4934661]
    ├─ telegram-reply webhook → POST /api/admin/fix-incident { event_id }
    ├─ load event → load auditor module → remediate(event)
    ├─ git: branch + write migration + commit + push
    ├─ gh pr create → PR url
    └─ Telegram reply: "🔧 PR #N aberto: <url>"

[User merges PR no GitHub]
    └─ webhook pull_request.merged → POST /api/admin/verify-fix { event_id }
         ├─ apply_migration via Supabase MCP (idempotente — migration ALTER FUNCTION)
         ├─ re-run detect() → 0 findings
         ├─ PATCH audit_events: resolved_at + resolved_reason='auto_verified'
         ├─ Telegram: "✅ [resolved] rls-drift cleared"
         └─ create vault stub: 2026-05-06-rls-drift-search-path.md
```

## Phasing

### Fase 1 — Hotfix manual + naked runbook (~45-75min, esta sessão)

**Objetivo:** matar alerta `c4934661` aberto + capturar procedimento cru.

1. Criar migration `supabase/migrations/2026-05-06-fix-rls-drift-search-path.sql`:
   ```sql
   BEGIN;
   ALTER FUNCTION public.dashboard_resumo_periodo SET search_path = '';
   ALTER FUNCTION public.dashboard_sinal_recebido SET search_path = '';
   ALTER FUNCTION public.dashboard_taxa_conversao SET search_path = '';
   ALTER FUNCTION public.update_conversa_last_msg_at SET search_path = '';
   COMMIT;
   ```
2. Aplicar via Supabase MCP `apply_migration`.
3. Validar via SQL — re-rodar query `SQL_FUNCTIONS_NO_SEARCH_PATH` do auditor → expected zero rows.
4. Trigger audit cron manual: `curl -X POST .../api/cron/audit-rls-drift -H "Authorization: Bearer $CRON_SECRET"` → expected `events_count: 0` + Telegram resolved message.
5. Ack manual: Telegram reply `ack c4934661` (se ainda não tiver auto-resolvido).
6. Capturar **cada comando rodado** num arquivo cru `docs/canonical/runbooks/rls-drift.md` formato esboço.
7. Criar postmortem manual em `vault/InkFlow — Incidentes/2026-05-06-rls-drift-search-path.md` (template 5 etapas).
8. Atualizar Painel + entry em [[InkFlow — Anomalias observadas]] (1ª ocorrência).
9. Branch dedicada `fix/rls-drift-search-path-2026-05-06` → PR → merge (alerta crítico tem que fechar em prod). Migration já está aplicada (step 2) — PR é registro versionado pós-fato.
10. Verificar audit_events row: `resolved_at` populado, `resolved_reason='next_run_clean'` (auto via cron) ou manual via PATCH se não auto-resolveu.

**Saída:** alerta resolvido em prod + migration commitada + naked runbook (raw, sem framework refs) + postmortem em vault.

**Branch separada da Fase 2:** Fase 2 roda em sessão dedicada com branch própria (`feat/auditor-self-remediation-framework`). Esta spec aplica a ambas.

### Fase 2 — Framework completo (próxima sessão dedicada, ~1-2 dias)

**Objetivo:** componentes A-E. Refatora naked runbook → canônico. Smoke E2E.

Tasks (ordem):
1. Adicionar `remediate()` em `rls-drift.js` (componente A) + tests snapshot.
2. Atualizar `RUNBOOK_PATH` em `rls-drift.js` + revisar runbook canônico (formatar componente C).
3. Implementar `/api/admin/fix-incident` endpoint (componente B server-side).
4. Adicionar caso `fix <id>` no `telegram-reply.js` handler (componente B trigger).
5. Implementar `/api/admin/verify-fix` endpoint (componente D).
6. Setup GitHub webhook on `pull_request.merged` (componente D trigger).
7. Atualizar formatter `telegram.js` (componente E).
8. Smoke E2E em dev: criar function dummy sem search_path no projeto staging Supabase → forçar audit run → testar caminho ponta-a-ponta.
9. Documentar troubleshooting (PR aberto mas falha CI, migration não aplica, verify falha).

**Saída:** framework genérico funcional, testado, com runbook formatado, alerta enriquecido.

### Fase 3 — Roll-out outros auditores (JIT)

Quando primeiro alerta crítico de outro auditor bater (`vps-limits`, `billing-flow`, `whatsapp-disconnects`, `mapa-canonico-divergence`), repetir Fase 1 + adicionar `remediate()` daquele auditor + runbook canônico daquele cenário.

**Sinal de "agora":** event aberto >2h sem ack OU reincidência (severity ↑) OU manual call.

**Default:** se auditor não tem `remediate()` exportado, alert continua como hoje (só `ack <id>`, sem `fix <id>`). Telegram formatter detecta via introspection.

## Error handling

| Cenário | Comportamento |
|---|---|
| `remediate()` retorna `null` | `/fix-incident` reply: "este auditor não tem fix automático — ver runbook ${runbook_path}" |
| `remediate()` lança exception | reply: "remediate falhou: ${err.message} — fix manual via runbook" + log audit_runs.errorMessage |
| Schema mudou entre detect e remediate (drift sumiu) | `remediate()` retorna no-op plan (sem migration) → `/fix-incident` reply: "schema já clean, marcando resolved" + dispara verify direto |
| Branch já existe (idempotência) | `git checkout -B` (force) — assume retry |
| `gh pr create` falha (auth, conflicts) | reply: "PR não criou: ${err}" + mantém branch local pra inspeção manual |
| PR aberto mas CI quebra | sem auto-merge — Leandro investiga manual; verify só dispara on merge real |
| Migration aplica mas detect ainda dirty (parcial) | verify loop: PATCH event w/ resolved_reason='partial' + Telegram: "⚠️ fix incompleto, re-checar" + mantém event aberto (vai escalar de novo em 2h) |
| Verify webhook não dispara | fallback: próximo cron natural (12h) detecta clean → dedupePolicy `resolve` action existing |
| Telegram reply rate-limit | Telegram já tem rate-limit handler em `telegram.js`; ignora retries duplicados |

## Testing

### Fase 1 (manual)
- Validar SQL `SQL_FUNCTIONS_NO_SEARCH_PATH` retorna zero pós-migration.
- Trigger cron manual + observar Telegram resolve.
- Confirmar entry em `audit_events` tem `resolved_at` populado.

### Fase 2 (automatizado)

**Unit:**
- `remediate.test.mjs` em `inkflow-saas/tests/auditors/`:
  - rls-drift event with 4 findings → snapshot da migration content.
  - rls-drift event idempotente: re-call sem alterações → no-op plan.
  - rls-drift event vazio → null (manual_only).
  - Contract test: cada auditor que exporta `detect` deve exportar `remediate` ou explicitamente flagar `manual_only: true`.

**Integration (smoke real, dev project):**
1. Criar function dummy sem search_path no projeto staging.
2. Forçar audit run via cron endpoint.
3. Confirmar event criado + Telegram alert (em chat de teste, não prod).
4. Trigger `/fix-incident` manual.
5. Confirmar branch + PR criados.
6. Merge PR.
7. Confirmar webhook → verify → Telegram resolve + audit_events.resolved_at + vault stub.

**Não-vai-rodar:**
- Não testo Telegram delivery em prod (uso chat de teste).
- Não testo failure modes que dependem de bug em `gh` ou GitHub API — assumo bem documented.

## Riscos e mitigations

| Risco | Severidade | Mitigation |
|---|---|---|
| Migration auto-gerada quebra prod (DDL incorreto) | high | PR como gate humano + smoke E2E em dev primeiro + idempotência check |
| Verify loop marca resolved prematuramente (race) | medium | `expect: 'clean'` + delay de 5s pós-migration apply antes de re-detect |
| GitHub webhook entrega flaky | low | fallback: próximo cron natural pega via dedupePolicy resolve |
| Endpoint `/api/admin/fix-incident` exposed | high | Auth via `ADMIN_SECRET` + chat_id allowlist no Telegram handler + IP allowlist se necessário |
| Spam de fixes (alert reincide rápido) | low | dedupePolicy existing já filtra `silent`/`supersede` |
| `remediate()` lê schema state com permissão errada | low | usa `SUPABASE_PAT` (Mgmt API) ou `SUPABASE_SERVICE_KEY` — mesmo nível do auditor base |
| Naked runbook fica desatualizado vs framework | medium | refactor da Fase 2 obriga revisitar; CI lint pode validar shape do runbook |

## Open questions / decisões tentativas

Decisões tentativas marcadas com **(D)** — tomadas aqui, validar / refinar na fase de plan. Sem marca = pendente real.

1. **GitHub webhook secret storage** — onde guardar o secret de validação do webhook payload (`X-Hub-Signature-256`)? Opções: `wrangler.toml` env (mesmo padrão de `CRON_SECRET`) ou Bitwarden Secrets Manager (já configurado em 2026-04-28). Pendente — decidir no plan.

2. **`remediate()` schema introspection auth (D)** — usa `SUPABASE_PAT` (Mgmt API), igual ao `audit-rls-drift.js`. Mantém paridade — auditor já tem permissão de ler pg_proc; remediate precisa do mesmo nível.

3. **`/fix-incident` CLI vs server-side endpoint (D)** — duas faces da mesma operação:
   - **Canonical:** endpoint server-side `/api/admin/fix-incident` (chamado pelo Telegram reply).
   - **Dev:** slash command Claude Code só monta payload e POSTa no endpoint via curl + `ADMIN_SECRET`.
   - Single implementation, dois entry points. Sem drift.

4. **Vault stub do postmortem (D)** — worker CF Pages não tem acesso ao filesystem local do user. Solução: stub vai pra `audit_events.postmortem_stub TEXT` (coluna nova — migration na Fase 2) + hook em `/session-end` (ou `/daily-start`) copia stubs novos pra `vault/InkFlow — Incidentes/`. Plan detalha schema da coluna.

5. **Aplicar migration via Supabase MCP server-side (D)** — MCP é Claude-side only. Endpoint server-side aplica via Mgmt API REST: `POST /v1/projects/${ref}/database/query` com body do migration content (`SUPABASE_PAT` auth). MCP `apply_migration` continua sendo o caminho dev/manual (Fase 1 hotfix).

6. **Migration apply timing — antes do PR merge ou depois?** — Pendente real. Tradeoffs:
   - **Antes (auto-apply on PR open):** verify roda mais cedo, ack chega antes. Risco: migration aplicada em prod com PR ainda em review (rollback = revert + nova migration).
   - **Depois (apply on merge):** PR merge é o ponto de no-return. Convencional Git workflow. Verify atrasa ~tempo até user mergear.
   - Sugestão pra resolver no plan: **depois (on merge)** — PR é gate humano de verdade, sem efeito até approval.

7. **Telegram reply syntax pra `fix <id>` curto** — short_id é prefix-match de UUID. Risco de colisão? Com 8 chars hex (32 bits) e 30 events ativos historicamente, probabilidade de colisão = ~10^-8. Aceitável. Plan adiciona validação: se short_id matches >1 row, reply rejeita pedindo full UUID.

## Referências

- [[Mentalidade — Runbook incidentes]] (estrutura mãe 5 etapas)
- [[InkFlow — Painel]] (estado atual + próximas ações)
- `docs/superpowers/specs/2026-04-27-auditores-mvp-design.md` (spec original Sub-projeto 3)
- `docs/canonical/decisions/2026-04-30-rls-drift-architecture.md` (decisão pivot SQL via Mgmt API)
- `functions/_lib/auditors/rls-drift.js:18` (`RUNBOOK_PATH = null` — gap visado)
- Postgres docs: [search_path attack vector](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY)
- Supabase advisor: [Function Search Path Mutable](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0011_function_search_path_mutable)
