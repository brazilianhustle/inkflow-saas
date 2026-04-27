# Sub-projeto 3 — Auditores em produção MVP

**Data:** 2026-04-27
**Autor:** Leandro Marques (founder) + Claude (assistente)
**Status:** Spec aprovado — aguarda `/plan`
**Tipo:** Sub-spec do plano-mestre Fábrica InkFlow ([§3](2026-04-25-fabrica-inkflow-design.md#sub-projeto-3--auditores-em-produção-mvp))

---

## Sumário executivo

5 auditores periódicos rodando em produção que detectam drift e alertam Telegram com severity (warn/critical/resolved). Cada auditor é uma função pura `detect(input)` com fixtures testáveis, persiste eventos em `audit_events` no Supabase, dedupe via política cravada, ack flow via reply Telegram, escalation via Pushover. Relatório semanal automático na segunda 09:00 BRT.

**Definition of Done deste sub-projeto:** 5 auditores rodando 7 dias contínuos em prod, ≥1 alerta `critical` (real ou simulado) reconhecido e resolvido ponta-a-ponta, 1 relatório semanal real entregue, documentação canônica atualizada.

**Cronograma:** semana 2 do plano-mestre Fábrica (paralelo com Sub-projeto 2 quando possível).

---

## §1. Visão e contexto

Spec-mestre §1 cravou: o objetivo da Fábrica é **evitar que o founder vire gargalo do próprio negócio**. Auditor é o primeiro nível de delegação — substitui "founder verifica produção manualmente toda manhã" por "produção alerta o founder quando precisa de atenção".

Posição estratégica do Sub-projeto 3:
- **Detect-only no MVP** — auditor é "olho", não "mão". Categoria distinta de subagent (spec-mestre §2.4)
- **Hooks pra evolução** — payload estruturado pavimenta v2 (auditor invoca subagent), sem refatorar detecção
- **Promoção por auditor individual** — cada um pode ganhar autonomia em ritmo próprio após 30d de baseline (alinhado com spec-mestre §2.1)

Histórico real que motivou o Sub-projeto 3:
- **2026-04-25/26** — `CF_API_TOKEN` sem permission `Cloudflare Pages: Edit` causou 5 GHA deploys silently failing por 24h. Sem auditor, founder só percebeu quando notou que mudança não chegou em prod. Auditor #1 (key-expiry) **teria pegado em horas**.

---

## §2. Decisões transversais

Cravadas pelo spec-mestre Fábrica + refinadas no brainstorm 2026-04-27.

### 2.1. Postura: detect-only

Auditor detecta drift e dispara alerta Telegram com payload estruturado. **NÃO invoca subagent, NÃO executa fix, NÃO age sem aprovação humana.**

Rationale (spec-mestre §2.4):
- Spec-mestre separa subagents (on-demand, autonomia média) de auditores (periódicos, alerta only)
- Spec-mestre §3 literal: output é "Telegram com `[SEV] [Auditor] msg + link`"
- `incident-response.md §6.1` Detect → Confirm → Contain → Fix → Postmortem: auditor cobre apenas **Detect**

Caminho de evolução pós-MVP:
- Pós 30d sem incidentes do auditor: spec novo "auditores autônomos" pode promover auditor X pra detect+propose ou detect+execute
- Promoção é decisão deliberada registrada em `docs/canonical/decisions/`

### 2.2. Stack split (fiel ao spec-mestre §3)

| Auditor | Onde roda | Justificativa |
|---|---|---|
| key-expiry | `inkflow-cron` Worker | Lógica simples (TTL math + HTTP self-check) |
| deploy-health | `inkflow-cron` Worker | Lógica simples (GHA API + comparação) |
| billing-flow | `inkflow-cron` Worker | Lógica simples (cross-source check) |
| vps-limits | Routine Anthropic | SSH ou API Vultr (spec-mestre §3) |
| rls-drift | Routine Anthropic | Advisor + reasoning Claude (spec-mestre §3) |

### 2.3. Categorias de severity (alinhada com `incident-response.md §6.2`)

| Severity (auditor) | Mapping doctrine | Sintoma | Tempo de resposta | Ack |
|---|---|---|---|---|
| `warn` | **P2** (medium/low) | Drift detectado, sem dano imediato | < 24h | Reply Telegram opcional |
| `critical` | **P1** (high) | Dano em curso ou iminente | < 2h | **Reply Telegram obrigatório**, escala via Pushover se ausente |
| `resolved` | n/a | Auditor próximo run em estado clean | n/a | Auto-resolve via `resolved_at=now()` |

**P0 não é coberto pelos auditores deste MVP.** Cenários P0 prototípicos (bot mudo, pagamento quebrado em janela <15min) ficam cobertos por instrumentação existente:
- **Bot mudo:** `monitor-whatsapp` cron a cada 30min (já em prod) — disparo direto Telegram em outage.
- **MP webhook silent <1h:** ainda não coberto — fica registrado como gap pós-MVP. `billing-flow` detecta com janela ≥6h (P1 timing), não <15min.

Escalation via Pushover (§6.5, cron `*/5`) tem timeout 2h — explicitamente **timing P1**, não P0. Promover algum auditor pra timing P0 (reduzir cron pra `*/1` e timeout 15min) é decisão pós-MVP após observar 30d de baseline.

**`info` removido** — spec-mestre §3 cita mas brainstorm 2026-04-27 cravou que info-only polui Telegram sem valor. Eventos info-equivalentes ficam em `audit_runs.status='success'` (heartbeat — §4.2), não em `audit_events`.

### 2.4. Canal único: Telegram com fallback Pushover

- **Telegram** — canal primário (ack via reply, alerts vêm pra cá)
- **Pushover** — fallback escalation pra `critical` sem ack >2h (priority=2, retry=60, expire=1800)
- **Pattern existente:** `runbooks/telegram-bot-down.md` Ação 0 + `matrix.md §5.1` heurística #4

---

## §3. Arquitetura

**Pattern do repo (importante — não inventar):** `cron-worker` é **PURE DISPATCHER** (HTTP fetch). Toda lógica de cron mora em `functions/api/cron/*.js` (CF Pages Functions). Helpers compartilhados em `functions/_lib/*.js`. Spec novo replica esse pattern.

```
cron-worker/ (CF Workers — dispatcher only)
  wrangler.toml
    └── triggers: 4 existentes + 6 novos (ver §9.0 pra confirmar limit do plano CF):
        ├── 0 6 * * *      → /api/cron/audit-key-expiry      (UTC 06:00 = 03:00 BRT, 24h)
        ├── 0 */6 * * *    → /api/cron/audit-deploy-health   (6h)
        ├── 30 */6 * * *   → /api/cron/audit-billing-flow    (6h, offset 30min)
        ├── */5 * * * *    → /api/cron/audit-escalate        (escalation Pushover)
        ├── 0 12 * * 1     → /api/cron/audit-weekly-report   (UTC seg 12:00 = 09:00 BRT)
        └── 0 4 * * 1      → /api/cron/audit-cleanup         (UTC seg 04:00 = 01:00 BRT)

  src/index.js
    └── SCHEDULE_MAP ganha 6 entries novas (sem outra lógica)

functions/_lib/ (NOVOS — lib compartilhada das Pages Functions)
  audit-state.js
    - insertEvent({ run_id, auditor, severity, payload, evidence, suggested_subagent })
    - getCurrentState(auditor)              # consulta view audit_current_state
    - dedupePolicy(current, new)            # 'fire' | 'silent' | 'escalate' | 'resolve' | 'supersede'
    - sendTelegram(env, event)              # formata e envia
    - sendPushover(env, event)              # escalation only
    - startRun(supabase, auditor)
    - endRun(supabase, run_id, {...})

  auditors/
    - key-expiry.js     # detect(input) puro — testável com fixtures
    - deploy-health.js  # detect(input) puro
    - billing-flow.js   # detect(input) puro

functions/api/cron/ (NOVOS — endpoints chamados pelo cron-worker)
  audit-key-expiry.js     # importa _lib/auditors/key-expiry + _lib/audit-state
  audit-deploy-health.js  # idem
  audit-billing-flow.js   # idem
  audit-escalate.js       # itera audit_events critical sem ack >2h, dispara Pushover
  audit-weekly-report.js  # gera report, INSERT audit_reports, dispara Telegram resumo
  audit-cleanup.js        # DELETE rows old

functions/api/audit/ (NOVOS — endpoints customer-facing do bot)
  telegram-webhook.js     # recebe update Telegram, parseia reply "ack <id>"

admin.html
  └── #reports            # list view dos audit_reports + modal markdown

Routines (Anthropic /schedule — capabilities a confirmar §9.0)
  ├── audit-vps-limits     (cron */6 hours, BRT)
  └── audit-rls-drift      (cron 24h, BRT)
  ambas chamam endpoints `/api/cron/audit-vps-limits` e `/api/cron/audit-rls-drift` em Pages
  (ou Supabase REST direto pra inserir audit_events). Decisão final em §9.0.

Supabase
  ├── audit_events           # uma row por evento
  ├── audit_runs             # liveness/heartbeat de cada execução
  ├── audit_reports          # relatórios semanais
  └── view audit_current_state

Telegram bot
  ├── setWebhook → /api/audit/telegram-webhook (NOTA: bot só tem 1 webhook — ver §9.0)
  ├── envia alerts com event_id curto + suggested_subagent
  └── recebe reply "ack <id>" → POST /api/audit/ack
```

---

## §4. Schema Supabase

Migration nova: `2026-04-27_auditores_mvp.sql`.

**Distinção vs `approvals` (Sub-projeto 5):** `audit_events` é estado de **detecção** (auditor → founder notification). `approvals` é flow de **aprovação** (subagent → founder ✅ → action). São tabelas distintas com finalidades distintas — não unificar nem cross-reference por design.

### 4.1. `audit_events`

```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  auditor TEXT NOT NULL,                          -- 'key-expiry' | 'deploy-health' | 'billing-flow' | 'vps-limits' | 'rls-drift'
  severity TEXT NOT NULL CHECK (severity IN ('warn','critical','resolved')),
  payload JSONB NOT NULL,                         -- { runbook_path, suggested_subagent, summary, ... }
  evidence JSONB,                                 -- raw source data (advisor finding, vultr API response, etc)
  detected_at TIMESTAMPTZ DEFAULT now(),          -- primeira detecção desse evento
  last_seen_at TIMESTAMPTZ DEFAULT now(),         -- última vez que auditor confirmou estado
  last_alerted_at TIMESTAMPTZ,                    -- última vez que Telegram disparou
  alert_count INT DEFAULT 1,                      -- quantos alertas pra esse evento (INSERT já é 1ª notificação)
  superseded_by UUID REFERENCES audit_events(id), -- preenchido quando severity escalou e novo evento substituiu
  escalated_at TIMESTAMPTZ,                       -- quando Pushover disparou (não confunde com ack humano)
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,                           -- telegram_user_id (humano) — escalation grava em escalated_at separado
  resolved_at TIMESTAMPTZ,
  resolved_reason TEXT                            -- 'next_run_clean' | 'manual' | 'superseded' | 'expired'
);

CREATE INDEX audit_events_open_critical
  ON audit_events (severity, detected_at DESC)
  WHERE resolved_at IS NULL AND severity = 'critical';

CREATE INDEX audit_events_auditor_recent
  ON audit_events (auditor, detected_at DESC);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_events_service_write ON audit_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY audit_events_admin_read ON audit_events
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');
```

### 4.2. `audit_runs`

Liveness / heartbeat. Sem essa tabela, auditor que crashou silenciosamente não é detectado.

```sql
CREATE TABLE audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  error_message TEXT,
  events_emitted INT DEFAULT 0
);

CREATE INDEX audit_runs_recent ON audit_runs (auditor, started_at DESC);

ALTER TABLE audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_runs_service_write ON audit_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY audit_runs_admin_read ON audit_runs
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');
```

### 4.3. `audit_reports`

Relatório semanal materializado.

```sql
CREATE TABLE audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE NOT NULL,               -- data de geração (segunda BRT, mesma data UTC pq trigger é 12:00 UTC = 09:00 BRT)
  generated_at TIMESTAMPTZ DEFAULT now(),
  metrics JSONB NOT NULL,                         -- { total_events, by_auditor: {...}, avg_ack_minutes, open_count, runs_health: {...} }
  markdown TEXT NOT NULL                          -- corpo renderizado
);

ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_reports_service_write ON audit_reports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY audit_reports_admin_read ON audit_reports
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');
```

### 4.4. View `audit_current_state`

Estado aberto por auditor. Usada pela política de dedupe.

```sql
CREATE VIEW audit_current_state AS
SELECT DISTINCT ON (auditor)
  auditor, id AS event_id, severity, payload, evidence,
  detected_at, last_seen_at, last_alerted_at, alert_count,
  acknowledged_at
FROM audit_events
WHERE resolved_at IS NULL
ORDER BY auditor, detected_at DESC;
```

---

## §5. Os 5 auditores

Cada subseção: frequência, source de dados, política de severity, payload, runbook linkado, suggested_subagent.

### 5.1. Auditor #1 — `key-expiry`

**Onde:** `inkflow-cron` Worker
**Frequência:** 24h (cron `0 6 * * *` — 03:00 BRT)
**suggested_subagent:** `deploy-engineer`
**Runbook:** [`runbooks/secrets-expired.md`](../../canonical/runbooks/secrets-expired.md)

#### Detecção em 3 camadas

**Camada 1 — TTL-based** (secrets com expiry conhecida):
- `CLOUDFLARE_API_TOKEN` (90 dias)
- Outros secrets sem TTL formal: skip

| Dias até expiry | Severity |
|---|---|
| > 14d | clean |
| 7-14d | warn |
| 1-6d | critical |
| ≤ 0 | critical |

**Camada 2 — Self-check API call** (todos os secrets críticos, em cada run):

| Secret | Endpoint self-check | 401 = critical imediato |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `/user/tokens/verify` | ✅ |
| `CF_API_TOKEN` (GHA Pages) | `/user/tokens/verify` | ✅ |
| `MP_ACCESS_TOKEN` | `/users/me` | ✅ |
| `TELEGRAM_BOT_TOKEN` | `/getMe` | ✅ |
| `OPENAI_API_KEY` | `/v1/models` | ✅ |
| `PUSHOVER_APP_TOKEN` | dispatch test priority=0 | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | `/rest/v1/?limit=1` | ✅ |
| `EVO_GLOBAL_KEY` | `/instance/fetchInstances` | ✅ |

**Camada 3 — Cross-replica drift** (CF Pages env vs Worker env) — ⚠️ **OPT-IN, EXPERIMENTAL:**

Proxy frágil: comparar `modified_on` entre Pages e Worker via API. **Risco alto de false positive** — Pages deploy normal toca Pages.modified_on sem tocar Worker, gerando |diff|>24h legítimo.

**Política do MVP:**
- Camada 3 fica **desabilitada por default** (env flag `AUDIT_KEY_EXPIRY_LAYER3=true` pra ligar).
- Ligar opcionalmente após Camadas 1+2 estabilizadas (≥7d sem falsa-positiva).
- Se 7d ligada gerar ≥2 false positive → cortar definitivamente, repensar pós-MVP quando CF API expor algo melhor (hash dos secrets, lastUpdated por secret).

API calls necessários (quando ligada):
- CF Pages: `GET /accounts/{account_id}/pages/projects/{project_name}` retorna `latest_deployment.modified_on`
- Workers: `GET /accounts/{account_id}/workers/scripts/{script_name}` retorna `modified_on`
- Comparação: se `|cf_pages.modified_on - worker.modified_on| > 24h` → warn

**Caveat:** requer `CLOUDFLARE_API_TOKEN` com scope `Account → Cloudflare Pages → Read` + `Account → Workers Scripts → Read`. Adicionar ao pré-req §9.0 (validar token atual ou criar dedicado). Campo exato (`modified_on`, `latest_deployment.modified_on`) pode variar — validar response da API durante implementação e ajustar comparação.

#### Payload

```json
{
  "runbook_path": "docs/canonical/runbooks/secrets-expired.md",
  "suggested_subagent": "deploy-engineer",
  "summary": "CLOUDFLARE_API_TOKEN expira em 5 dias",
  "secret_name": "CLOUDFLARE_API_TOKEN",
  "layer": "ttl",
  "days_until_expiry": 5,
  "expires_at": "2026-05-02T12:00:00Z"
}
```

`evidence` = response bruto do `/user/tokens/verify` ou metadata da camada 3.

### 5.2. Auditor #2 — `deploy-health`

**Onde:** `inkflow-cron` Worker
**Frequência:** 6h (cron `0 */6 * * *`)
**suggested_subagent:** `deploy-engineer`
**Runbook:** [`runbooks/rollback.md`](../../canonical/runbooks/rollback.md)

#### Detecção

Source: GitHub Actions API + Cloudflare Workers API.

| Sintoma | Severity | Critério |
|---|---|---|
| 1 GHA workflow `failure` em "Deploy to Cloudflare Pages" nas últimas 6h | warn | `gh run list --workflow="Deploy to Cloudflare Pages" --json conclusion --limit 3` |
| 2+ GHA workflow `failure` consecutivos | critical | mesmo source |
| Wrangler version drift (Worker em prod vs `wrangler.toml`) | critical | `GET /accounts/{id}/workers/scripts/{name}` retorna `etag` ≠ esperado |
| CF Pages build failed nas últimas 6h | warn | `GET /accounts/{id}/pages/projects/{name}/deployments?limit=5` |

#### Payload

```json
{
  "runbook_path": "docs/canonical/runbooks/rollback.md",
  "suggested_subagent": "deploy-engineer",
  "summary": "2 GHA deploys consecutivos falharam",
  "failed_runs": [
    { "id": 12345, "conclusion": "failure", "created_at": "..." }
  ],
  "last_successful_deploy": "2026-04-27T03:00:00Z"
}
```

### 5.3. Auditor #3 — `vps-limits`

**Onde:** Routine Anthropic (`/schedule`)
**Frequência:** 6h (cron BRT)
**suggested_subagent:** `vps-ops`
**Runbook:** _gap registrado_ — `runbook_path: null` significa founder cai no Telegram alert sem runbook (escolha consciente do MVP, alinha com regra do `runbooks/README.md` de criar runbook na 2ª ocorrência ad-hoc). Adjacente a `outage-wa.md`.

#### Hierarquia de coleta de dados — **default = endpoint custom**

⚠️ **Realismo operacional:** Routines Anthropic rodam em contexto remoto. SSH key local do founder NÃO é acessível pela Routine. Vultr API requer API key no contexto. Por isso, **default = endpoint custom** desde dia 1. SSH/API ficam como aspiracionais teóricos só se Routine API expandir capabilities.

**Default (implementar primeiro):**
- `vps-ops` agent cria endpoint `/health/metrics` no VPS (Express simples ou nginx static? — decisão na implementação) retornando JSON:
  ```json
  {
    "ram_used_pct": 0.42,
    "ram_total_mb": 4096,
    "disk_used_pct": 0.31,
    "disk_total_gb": 50,
    "load_avg_5m": 0.7,
    "vcpu_count": 2,
    "egress_month_pct": 0.18,
    "ts": "2026-04-27T03:00:00Z"
  }
  ```
- Auth via header `X-Health-Token` (secret `VPS_HEALTH_TOKEN` em CF Pages env + VPS env)
- Routine faz `curl` com header, parsea JSON, aplica thresholds

**Aspiracional (avaliar pós-MVP, não bloqueia DoD):**

1. **Vultr API** se Routine ganhar `VULTR_API_KEY` no contexto:
   - `GET /v2/instances/{id}` → `ram`, `disk`, `vcpu_count`
   - `GET /v2/instances/{id}/bandwidth` → egress mensal
   - Limitação conhecida: sem RAM/disk usage live granular

2. **SSH via Routine Bash** se Routine ganhar SSH key forwarding:
   - `ssh root@<vps> "free -m && df -h / && uptime"` — granularidade máxima

Decisão final + capability check fica registrada em `docs/canonical/decisions/<data>-vps-limits-data-source.md` durante implementação (Task 9.4).

#### Política de severity

```js
// Policy ref: docs/canonical/limits.md §Vultr (last_reviewed: <data>)
const THRESHOLDS = {
  ram: { warn: 0.75, critical: 0.90 },
  disk: { warn: 0.75, critical: 0.90 },
  load_avg: { warn: 1.0, critical: 1.5 },  // multiplier × vcpu_count
  egress_monthly: { warn: 0.70, critical: 0.90 },
};
```

#### Payload

```json
{
  "runbook_path": null,
  "suggested_subagent": "vps-ops",
  "summary": "VPS disco em 92%",
  "resource": "disk",
  "live_value": 0.92,
  "threshold_critical": 0.90,
  "source": "ssh|vultr_api|custom_endpoint"
}
```

### 5.4. Auditor #4 — `rls-drift`

**Onde:** Routine Anthropic (`/schedule`)
**Frequência:** 24h
**suggested_subagent:** `supabase-dba`
**Runbook:** _gap registrado_ — `runbook_path: null` (mesma regra do auditor #3). "Supabase advisor crítico" listado em `incident-response.md §6.3` como gap. Se incidente real, criar runbook dedicado.

#### Detecção

Source: **Supabase Management API REST direto** (não MCP — Routines remotas não têm MCP plugins).

- `GET https://api.supabase.com/v1/projects/{ref}/advisors?lint_type=security` (security findings)
- `GET https://api.supabase.com/v1/projects/{ref}/advisors?lint_type=performance` (performance findings)
- Auth: `Authorization: Bearer <SUPABASE_PAT>` — usa Personal Access Token (escopo project-specific se Supabase suportar; se não, PAT global do founder).
- Cross-ref `git log --since='7 days ago' -- supabase/migrations/` pra correlacionar findings com migrations recentes.

**Pré-req §9.0:** confirmar que Routine pode (a) fazer outbound HTTP com Bearer token, (b) ter `SUPABASE_PAT` no contexto seguro. Se não, considerar fallback: Routine chama endpoint `/api/cron/audit-rls-drift` em CF Pages, que tem acesso ao token e roda a lógica.

#### Reasoning Claude (justificativa pra Routine)

1. **Allowlist contextual**: tabelas internas intencionalmente sem RLS-public (ex: `audit_events`, `audit_runs`, `approvals`). Lista cresce com produto. Reasoning lê `git log` de migrations dos últimos 7d e decide se nova tabela sem RLS é intencional ou esquecimento.
2. **Severity calibration**: `policy WITH CHECK true` em endpoint anon = critical; em endpoint authenticated = warn. Reasoning correlaciona com uso real do endpoint.
3. **Narrativa**: Telegram alert ganha contexto narrativo ("nova tabela `X` adicionada em PR #N sem RLS habilitada — provavelmente esquecimento, sugere ALTER TABLE...") em vez de dump bruto do advisor.

#### Política de severity

| Finding | Severity |
|---|---|
| Nova tabela sem RLS habilitada (não-allowlisted) | warn |
| Function sem `search_path` definido (security risk) | critical |
| Policy `WITH CHECK true` em endpoint anon | critical |
| Policy `WITH CHECK true` em endpoint authenticated | warn |
| Advisor `level=ERROR` outros | critical |
| Advisor `level=WARN` outros | warn |

#### Allowlist inicial (pode crescer)

```js
const RLS_INTENTIONAL_NO_PUBLIC = [
  'audit_events',     // service_role write, admin read via RLS — OK
  'audit_runs',       // mesmo
  'audit_reports',    // mesmo
  'approvals',        // service_role + endpoint validado
  'tool_calls_log',   // observability interna
];
```

#### Payload

```json
{
  "runbook_path": null,
  "suggested_subagent": "supabase-dba",
  "summary": "Function `compute_billing` sem search_path (security risk)",
  "advisor_finding": { "level": "ERROR", "name": "function_search_path_mutable", ... },
  "narrative": "Function adicionada em migration 2026-04-26_billing_compute.sql. Sem `SET search_path = public, pg_catalog` declarado."
}
```

### 5.5. Auditor #5 — `billing-flow`

**Onde:** `inkflow-cron` Worker
**Frequência:** 6h (cron `30 */6 * * *`)
**suggested_subagent:** _none_ (MP é manual, sem agent dedicado no MVP)
**Runbook:** [`runbooks/mp-webhook-down.md`](../../canonical/runbooks/mp-webhook-down.md)

#### Detecção

Source: Supabase queries (subscriptions, mp_subscription_id) + MailerLite API (groups).

| Sintoma | Severity | Critério |
|---|---|---|
| Webhook MP atrasado: último `mp_webhook_received_at` >6h | warn | query `tenants WHERE plano!='trial' ORDER BY mp_webhook_received_at DESC LIMIT 1` |
| Webhook MP ausente: último >24h E há subscriptions ativas | critical | mesma query + verificação de subscription ativa via MP API |
| MailerLite sync drift: tenant `ativo=true plano!='trial'` mas não em group `MAILERLITE_GROUP_CLIENTES_ATIVOS` | warn | cross-source check |
| Tenant `status_pagamento='trial_expirado' ativo=true` (deveria ser false) | critical | DB consistency check |

#### Payload

```json
{
  "runbook_path": "docs/canonical/runbooks/mp-webhook-down.md",
  "suggested_subagent": null,
  "summary": "Último webhook MP recebido há 28h (esperado <6h)",
  "last_webhook_at": "2026-04-26T05:00:00Z",
  "active_subscriptions_count": 3,
  "drift_type": "webhook_silent"
}
```

---

## §6. Pipeline core

### 6.1. `lib/audit-state.js`

Funções compartilhadas entre Worker auditors e Routines (Routines chamam via Supabase REST):

```js
// Insere row em audit_events. Aplica policy de dedupe ANTES de chamar.
async function insertEvent(supabase, { run_id, auditor, severity, payload, evidence, suggested_subagent });

// Retorna estado aberto desse auditor (max 1 row).
async function getCurrentState(supabase, auditor);

// Decide ação dada estado atual + novo evento detectado.
function dedupePolicy(currentState, newEvent) {
  // Retorna: 'fire' | 'silent' | 'escalate' | 'resolve' | 'supersede'
}

// Envia Telegram formatado.
async function sendTelegram(env, event);

// Envia Pushover priority=2 (escalation only).
async function sendPushover(env, event);

// Inicia run (insert audit_runs status='running').
async function startRun(supabase, auditor);

// Finaliza run (update audit_runs completed_at, status, events_emitted, error_message).
async function endRun(supabase, run_id, { status, events_emitted, error_message });
```

### 6.2. Política de dedupe (cravada)

Dado `current` (de `audit_current_state`) e `new` (output de `detect()`):

| Caso | Ação |
|---|---|
| `current` vazio + `new.severity ∈ {warn, critical}` | **fire** — INSERT + Telegram + alert_count=1 |
| `current.severity == new.severity` + `last_alerted_at > now() - 24h` | **silent** — UPDATE last_seen_at + payload + evidence (estado atualizado), no Telegram |
| `current.severity == new.severity` + `last_alerted_at ≤ now() - 24h` | **fire** (lembrete) — UPDATE last_seen_at + last_alerted_at + alert_count++ + payload + evidence, Telegram |
| `current.severity == 'warn'` + `new.severity == 'critical'` | **supersede** — INSERT novo (critical) + UPDATE antigo `resolved_at, resolved_reason='superseded', superseded_by=<new_id>` + Telegram |
| `current.severity == 'critical'` + `new.severity == 'warn'` | **silent** (não rebaixa automaticamente — exige humano avaliar) — UPDATE last_seen_at |
| `current` existe + `new.severity == 'clean'` | **resolve** — UPDATE `resolved_at=now() resolved_reason='next_run_clean'` + Telegram `[resolved]` |
| `current` vazio + `new.severity == 'clean'` | **no-op** — sem INSERT |

### 6.3. Format Telegram

```
[<severity>] [<auditor>] <summary>
ID: <event_id_short> | Runbook: <runbook_filename>
Suggested: @<subagent> (ou omitir linha se null)
Evidence: <evidence_summary_short>
Reply "ack <event_id_short>" pra acknowledge.
```

`event_id_short` = primeiros 8 chars do UUID. Validação no endpoint `/api/audit/ack` filtra por prefix match no UUID completo, com unique constraint dentro dos eventos abertos.

### 6.4. Ack flow

1. Founder lê alert no Telegram → "ack a3f1b9c2"
2. Bot Telegram dispara update pro webhook `/api/audit/telegram-webhook`
3. Webhook valida:
   - `X-Telegram-Bot-Api-Secret-Token` header bate com `TELEGRAM_WEBHOOK_SECRET`
   - `update.message.from.id == TELEGRAM_ADMIN_USER_ID` (whitelist 1 user)
   - texto começa com `ack `
4. Webhook parsea event_id_short → resolve full UUID via query (`WHERE id::text LIKE 'a3f1b9c2%' AND resolved_at IS NULL`)
5. UPDATE `audit_events SET acknowledged_at=now(), acknowledged_by=<user_id>`
6. Bot envia confirmação: `"✅ Acknowledged: <auditor> <severity>"`

**Nota:** `TELEGRAM_ADMIN_USER_ID` é distinto de `TELEGRAM_CHAT_ID` (usado pelo cron-worker pra envio outbound). Se o bot está em DM com founder (caso atual), os dois valores SÃO IGUAIS. Se virar group chat futuro, são diferentes (`CHAT_ID` = id do grupo, `ADMIN_USER_ID` = user id do founder). MVP assume DM — coletar `ADMIN_USER_ID` 1x via `@userinfobot` no Telegram.

### 6.5. Escalation flow (cron `*/5 * * * *`)

Endpoint `/api/cron/audit-escalate`:

```sql
SELECT id, auditor, payload
FROM audit_events
WHERE severity = 'critical'
  AND resolved_at IS NULL
  AND acknowledged_at IS NULL
  AND escalated_at IS NULL
  AND detected_at < now() - interval '2 hours';
```

Pra cada row:
1. Dispara Pushover priority=2, retry=60, expire=1800
2. UPDATE `escalated_at=now()` (coluna dedicada — não confunde com ack humano que vem em campo separado)
3. Loga em `audit_runs` (campo `error_message` reutilizado pra audit trail) ou cria entry específica em `tool_calls_log`

Vantagem da coluna dedicada `escalated_at`: humano que dá ack DEPOIS do escalation grava `acknowledged_at + acknowledged_by=user_id` sem sobrescrever fato do escalation. Histórico preservado.

### 6.6. Cleanup flow (cron `0 4 * * 1`)

Endpoint `/api/cron/audit-cleanup`:

```sql
DELETE FROM audit_events
WHERE resolved_at IS NOT NULL
  AND resolved_at < now() - interval '90 days';

DELETE FROM audit_runs
WHERE started_at < now() - interval '30 days';
```

---

## §7. Relatório semanal

Cron `0 12 * * 1` (segunda 09:00 BRT). Endpoint `/api/cron/audit-weekly-report`.

### 7.1. Janela de cálculo

**Rolling 7 dias.** Query base:

```sql
SELECT auditor, severity, COUNT(*), AVG(EXTRACT(EPOCH FROM (acknowledged_at - detected_at))/60) AS avg_ack_minutes
FROM audit_events
WHERE detected_at > now() - interval '7 days'
GROUP BY auditor, severity;
```

### 7.2. Métricas calculadas (`metrics` JSONB)

```json
{
  "total_events": 47,
  "by_auditor": {
    "key-expiry": { "warn": 1, "critical": 0, "resolved": 1 },
    "deploy-health": { "warn": 3, "critical": 1, "resolved": 4 },
    "billing-flow": { "warn": 2, "critical": 0, "resolved": 2 },
    "vps-limits": { "warn": 5, "critical": 0, "resolved": 5 },
    "rls-drift": { "warn": 1, "critical": 0, "resolved": 1 }
  },
  "open_count": 2,
  "avg_ack_minutes": 18.4,
  "runs_health": {
    "key-expiry": { "expected": 7, "success": 7, "error": 0 },
    "deploy-health": { "expected": 28, "success": 27, "error": 1 },
    ...
  },
  "top_3_auditors": ["deploy-health", "vps-limits", "billing-flow"],
  "diff_vs_last_week": { "total_events": "+8", "open_count": "-1" }
}
```

### 7.3. Markdown gerado

Template renderiza métricas em formato legível, salva em `audit_reports.markdown`.

### 7.4. Telegram resumo (após gerar)

```
[weekly-report] Audit semana <YYYY-WW>
Eventos: 47 (+8 vs semana anterior)
Open: 2 critical/warn
Top: deploy-health (8) | vps-limits (10) | billing-flow (4)
Health runs: 4/5 auditores 100% — deploy-health 96% (1 error)
Detalhes: https://inkflowbrasil.com/admin.html#reports/<report_date>
```

### 7.5. Admin panel `/admin.html#reports`

**MVP:** list view com colunas (`report_date`, `total_events`, `open_count`) + click abre modal com markdown rendered.
**Pós-MVP:** drill-down inline pra eventos individuais (founder usa Supabase Dashboard via SQL no MVP).

---

## §8. Cross-references nos agents existentes

`deploy-engineer.md`, `supabase-dba.md`, `vps-ops.md` ganham seção idêntica:

> ## Quando founder mencionar trigger por auditor
>
> Você PODE consultar `audit_events WHERE auditor='<X>' AND resolved_at IS NULL ORDER BY detected_at DESC LIMIT 5` pra entender contexto histórico (quando começou o drift, severity escalou, evidência coletada).
>
> **Restrições:**
> - NUNCA inicie fix com base só em `audit_events` sem confirmação humana explícita do founder.
> - `audit_events` é estado de auditor, NÃO substitui investigação direta da fonte (logs, dashboards, queries primárias).
> - Em dúvida, prefira consultar a fonte primária. `audit_events` é resumo, fonte primária é verdade.

### Como cada agent consulta (tools whitelists divergem)

| Agent | Tools disponíveis | Como consulta `audit_events` |
|---|---|---|
| `supabase-dba` | `mcp__plugin_supabase_supabase__execute_sql` | Direto via MCP — query SQL nativa |
| `deploy-engineer` | Bash + MCP cloudflare/github (sem MCP supabase) | Via `Bash` com `curl` Supabase REST: `GET /rest/v1/audit_events?auditor=eq.<X>&resolved_at=is.null&order=detected_at.desc&limit=5` + `apikey: <SERVICE_ROLE>` |
| `vps-ops` | Read + Bash (Haiku) | Via `Bash` com `curl` Supabase REST (mesmo pattern do `deploy-engineer`). Founder passa `SUPABASE_SERVICE_KEY` no prompt quando relevante — agent não busca em arquivo. |

**Não** adicionar `mcp__plugin_supabase_supabase__execute_sql` ao `deploy-engineer` ou `vps-ops` — cada agent fica com tools whitelist enxuta. `curl` REST resolve sem expandir surface area.

`.claude/agents/README.md` ganha seção:

```markdown
## Mapping auditor → agent

| Auditor | suggested_subagent |
|---|---|
| key-expiry | deploy-engineer |
| deploy-health | deploy-engineer |
| vps-limits | vps-ops |
| rls-drift | supabase-dba |
| billing-flow | (none — manual + runbook) |
```

---

## §9. Ordem de implementação

Sequencial. Cada item é gate pro próximo.

### 9.0. Infra (1 sprint, antes do auditor #1)

**Pré-requisitos de capability (validar PRIMEIRO — antes de qualquer code):**

- [ ] **Cron triggers limit** — confirmar plano CF Workers atual (Free vs Paid Bundled vs Unbound) e limite de cron triggers por Worker. Hoje `inkflow-cron` tem 4 triggers; spec adiciona 6 (total 10). Se ultrapassar limite: agrupar (`audit-cleanup` + `audit-weekly-report` num cron único) ou criar Worker dedicado `inkflow-cron-audit`. Atualizar `limits.md` seção CF Workers.
- [ ] **Telegram webhook conflict** — `getWebhookInfo` no bot atual; se já existe webhook, decidir merge ou bot dedicado pra audit. Convention "webhook do bot é dedicado a audit ack" cravada se MVP único.
- [ ] **Routine capabilities** — smoke test mínimo via `/schedule`: confirmar (a) Bash com `curl` outbound autenticado funciona, (b) acesso a secrets/env no contexto. Se falhar (a), Routines viram fallback "chamar `/api/cron/audit-vps-limits` em CF Pages".

**Implementação infra:**

- [ ] Migration `2026-04-27_auditores_mvp.sql` aplicada em prod (audit_events + audit_runs + audit_reports + view + RLS + `escalated_at`)
- [ ] `functions/_lib/audit-state.js` implementado (insertEvent, getCurrentState, dedupePolicy, sendTelegram, sendPushover, startRun, endRun)
- [ ] Endpoint `functions/api/audit/telegram-webhook.js` deployado
- [ ] `setWebhook` configurado no bot Telegram pra `https://inkflowbrasil.com/api/audit/telegram-webhook` com secret token
- [ ] `TELEGRAM_ADMIN_USER_ID` cadastrado em CF Pages env (coletado via @userinfobot 1x)
- [ ] `TELEGRAM_WEBHOOK_SECRET` cadastrado em CF Pages env
- [ ] `CLOUDFLARE_API_TOKEN` validado com scopes Account/Pages/Workers Read (criar dedicado se necessário) — só obrigatório se Camada 3 do auditor #1 for ligada
- [ ] `cron-worker/src/index.js` SCHEDULE_MAP ganha 6 entries novas
- [ ] `cron-worker/wrangler.toml` triggers atualizado (após confirmação do limit)
- [ ] Cron `*/5 * * * *` (escalation) deployado e testado com event simulado
- [ ] Cron `0 4 * * 1` (cleanup) deployado
- [ ] Smoke test infra: INSERT manual `audit_events critical` → Telegram chega → reply "ack <id>" → `acknowledged_at` preenchido → próximo run clean → `resolved_at` preenchido

### 9.1. Auditor #1 — `key-expiry`

- [ ] `auditors/key-expiry.js` com `detect(input)` puro
- [ ] Unit tests: 3+ fixtures (clean / warn / critical) por camada (TTL, self-check, drift)
- [ ] Endpoint `/api/cron/audit-key-expiry` integra `detect` + `audit-state` lib
- [ ] Cron `0 6 * * *` configurado
- [ ] Smoke test: simular `CLOUDFLARE_API_TOKEN` com expires_at=tomorrow → critical
- [ ] 48h em prod sem falsa-positiva

### 9.2. Auditor #2 — `deploy-health`

- [ ] `auditors/deploy-health.js` com `detect(input)` puro
- [ ] Unit tests com fixtures GHA API + CF API
- [ ] Endpoint `/api/cron/audit-deploy-health`
- [ ] Cron `0 */6 * * *` configurado
- [ ] Smoke test: simular 2 GHA failed consecutivos via fixture
- [ ] 48h em prod sem falsa-positiva

### 9.3. Auditor #5 — `billing-flow`

- [ ] `auditors/billing-flow.js` com `detect(input)` puro
- [ ] Unit tests com fixtures Supabase + MP + MailerLite
- [ ] Endpoint `/api/cron/audit-billing-flow`
- [ ] Cron `30 */6 * * *` configurado
- [ ] Smoke test: simular ausência de webhook MP via fixture
- [ ] 48h em prod sem falsa-positiva

### 9.4. Auditor #3 — `vps-limits` (primeira Routine)

**Pré-requisitos específicos deste auditor:**

- [ ] **Resolver `[confirmar]`s de Vultr em `limits.md`**: RAM total (2GB ou 4GB), Disk total (50GB ou 80GB), vCPU count (1 ou 2), egress mensal contratado. Sem estes valores o auditor não consegue calcular % de usage corretamente (denominador ausente).
- [ ] `vps-ops` agent cria endpoint `/health/metrics` no VPS com auth `X-Health-Token` (default da hierarquia §5.3)
- [ ] `VPS_HEALTH_TOKEN` em CF Pages env + VPS env (rotacionado simultâneo)
- [ ] Decisão de hierarquia final (default endpoint custom + aspiracionais) registrada em `docs/canonical/decisions/<data>-vps-limits-data-source.md`

**Implementação:**

- [ ] Routine criada via `/schedule` skill com prompt que invoca `detect` + chama `/api/cron/audit-vps-limits` (que faz fetch ao endpoint custom + INSERT audit_events) — OU chama Supabase REST direto se Routine tiver capability
- [ ] Smoke test: simular VPS >90% via fixture (mock response do endpoint custom)
- [ ] 48h em prod sem falsa-positiva

### 9.5. Auditor #4 — `rls-drift` (última)

- [ ] Routine criada via `/schedule` skill
- [ ] Allowlist `RLS_INTENTIONAL_NO_PUBLIC` cravada no prompt
- [ ] Reasoning prompt validado com 3+ fixtures de advisor findings (real ones de `mcp__supabase__get_advisors`)
- [ ] 48h em prod sem falsa-positiva

### 9.6. Relatório semanal

- [ ] Endpoint `/api/cron/audit-weekly-report` implementado
- [ ] Admin panel `/admin.html#reports` (list view + markdown)
- [ ] Cron `0 12 * * 1` configurado
- [ ] 1 report real entregue na primeira segunda pós-implementação

---

## §10. Definition of Done

Checklist binário. Sub-projeto 3 declarado done quando 100% PASS.

### Infra (1x)

- [ ] Migration aplicada em prod (audit_events + audit_runs + audit_reports + view + RLS)
- [ ] Cron de cleanup audit_events resolved >90d configurado
- [ ] Cron de cleanup audit_runs >30d configurado
- [ ] Cron de escalation `*/5 * * * *` configurado
- [ ] `functions/_lib/audit-state.js` implementado (todas as 7 funções)
- [ ] Endpoint `/api/audit/telegram-webhook` deployado e testado
- [ ] `setWebhook` Telegram configurado com secret token
- [ ] `TELEGRAM_ADMIN_USER_ID`, `TELEGRAM_WEBHOOK_SECRET`, `CLOUDFLARE_API_TOKEN` (com scopes Read) em CF Pages env
- [ ] CF observability ligado em `inkflow-cron` (já está, validar)
- [ ] Smoke test infra ponta-a-ponta: INSERT critical → Telegram → reply ack → resolve

### Por auditor (5x)

Cada auditor declara done quando TODOS:

- [ ] `detect()` pura implementada com 3+ fixtures (clean/warn/critical)
- [ ] Unit tests passando (`npm test` no `cron-worker/` ou test inline da Routine)
- [ ] Smoke test 1x: trigger condition simulado → Telegram chega → ack flow fecha → `audit_events.resolved_at` preenchido
- [ ] 48h em prod sem falsa-positiva
- [ ] Heartbeat presente: row em `audit_runs` por execução agendada
- [ ] Payload inclui `runbook_path` válido (caminho existe ou explicitamente null pra gap registrado)
- [ ] Payload inclui `suggested_subagent` (ou explícito null)
- [ ] Cross-reference no prompt do agent correspondente atualizada (deploy-engineer/supabase-dba/vps-ops, conforme aplicável)
- [ ] Entry em `.claude/agents/README.md` seção "Mapping auditor → agent"

### Relatório semanal

- [ ] Cron `0 12 * * 1` configurado
- [ ] Endpoint `/api/cron/audit-weekly-report` gera report → grava `audit_reports` Supabase → dispara Telegram resumo + link admin panel
- [ ] Admin panel `/admin.html#reports` lista reports históricos + renderiza markdown
- [ ] 1 report real gerado e validado pelo founder (formato OK, números batem)

### Documentação

- [ ] `docs/canonical/auditores.md` criado, seção por auditor (frequência, severity, source de cap, threshold const, runbook linkado, suggested_subagent)
- [ ] `docs/canonical/methodology/incident-response.md §6.3` atualizado com novos auditores (mapping sintoma → runbook quando aplicável)
- [ ] `docs/canonical/limits.md` `[confirmar]`s relevantes resolvidos por auditor:
  - Auditor #3 pré-req (§9.4): Vultr RAM total, Disk total, vCPU count, egress mensal
  - Auditor #5 pré-req (§9.3): MailerLite plano + limit subscribers, Supabase plano + limits
  - Auditor #1 pré-req se Camada 3 ligada (§9.1): plano CF + cron triggers limit (já no §9.0)
- [ ] Spec do Sub-projeto 3 (`docs/superpowers/specs/2026-04-27-auditores-mvp-design.md`) committado em main
- [ ] Nota-âncora vault Obsidian criada (link pro spec + status)

### Validação ponta-a-ponta (gate final)

- [ ] **5 auditores rodando em prod por 7 dias contínuos**
- [ ] Pelo menos 1 alerta `critical` real disparado (ou simulado por trigger condition real, não INSERT manual) → reconhecido via reply Telegram → resolved
- [ ] 1 relatório semanal real entregue (segunda 09:00 BRT)
- [ ] Founder confirma "DoD-MVP Sub-projeto 3 cumprido"

---

## §11. Não-objetivos (escopo NÃO coberto)

- ❌ **Auditor invoca subagent pra propor fix** — pós-MVP. Hooks de payload pavimentam mas o swap é spec novo após 30d sem incidentes.
- ❌ **Auditor executa fix automaticamente** — pós-MVP, mesmo critério.
- ❌ **6º auditor "funil health"** — Sub-projeto 3 mas ativado na Fase 6.1 do plano-mestre (escopo do Sub-projeto 6).
- ❌ **Auditor `doc-freshness`** — pós-MVP (Sub-projeto 1 se ativado), valida `last_reviewed` do Mapa Canônico.
- ❌ **Auditor "auditor-watcher"** — escalation flow do MVP cobre o caso (cron `*/5` de critical sem ack >2h). Auditor formal pós-MVP só se justificar mais lógica.
- ❌ **BWS auto-rotation no key-expiry** — pré-req P2 BWS está fora do MVP. key-expiry detecta, founder rotaciona manual seguindo `secrets-expired.md`.
- ❌ **Drill-down de eventos no admin panel** — pós-MVP. MVP = list view + markdown. Founder usa Supabase Dashboard pra detalhe.
- ❌ **Multi-canal de alerta além de Telegram + Pushover** — fora. Spec-mestre §3 só lista Telegram + escalation.
- ❌ **Severity `info`** — removido (brainstorm 2026-04-27). Eventos info-equivalentes ficam em CF observability heartbeat.

---

## §12. Próximos passos

1. ✅ Spec escrito e committed
2. Self-review do spec (placeholder scan, internal consistency, scope check, ambiguity check) — executado inline pelo assistente
3. Founder revisa o arquivo
4. `/plan` no spec → executar implementação
5. Sequência de sessões: implementação seguindo §9 (Infra → key-expiry → deploy-health → billing-flow → vps-limits → rls-drift → relatório)

---

## §13. Glossário

- **Auditor** — função periódica (Worker scheduled trigger ou Routine) que detecta drift e dispara alerta. Categoria distinta de subagent (spec-mestre §2.4).
- **detect(input)** — função pura, recebe input parametrizável, retorna lista de eventos potenciais. Testável com fixtures.
- **Pipeline core** — `lib/audit-state.js` + endpoints + crons que sustentam todos os auditores. Implementado uma vez na Infra (§9.0).
- **Política de dedupe** — regra cravada em §6.2 que decide `fire | silent | escalate | resolve | supersede` dado estado atual + novo evento.
- **Ack flow** — founder → reply Telegram → webhook → `acknowledged_at`. Em §6.4.
- **Escalation flow** — cron `*/5` que dispara Pushover quando critical sem ack >2h. Em §6.5.
- **Routine** — scheduled agent Anthropic-managed (skill `/schedule`). Roda em cron na cloud, com reasoning Claude.
- **Suggested subagent** — campo no payload que sugere qual agent é especialista no domínio do alerta. Founder vê e roteia.

---

## §14. Histórico de revisões

| Data | Versão | Mudança |
|---|---|---|
| 2026-04-27 | v1.0 | Spec inicial criado em sessão de brainstorm 2026-04-27. 11 perguntas de clarificação (postura, secret-expiry pre-BWS, estado, stack split, ack, thresholds, ordem, relatório, validação, cross-refs, DoD). 2 retratações registradas (Inc-1 rls-drift mover, Inc-2 vps-limits mover) — ambas reverted após análise de fidelidade ao spec-mestre §3. 8 gaps identificados e refinados antes de escrever spec. Decisões finais alinhadas com spec-mestre Fábrica §2.1, §2.4, §3. |
| 2026-04-27 | v1.1 | Auditoria pós-brainstorm (sessão `/daily-start` 2026-04-27 manhã). 4 blockers + 6 atenções + 3 explicitações corrigidos antes de `/plan`: **B1** stack split corrigido (lib em `functions/_lib/` não em `cron-worker/src/lib/` — pattern do repo); **B2** pré-req cron triggers limit no §9.0; **B3** severity scheme mapeado pra P1/P2 doctrine + P0 reconhecido como não-coberto pelos auditores MVP; **B4** Routines viabilidade — vps-limits default = endpoint custom, rls-drift via Management API REST direto (sem MCP); **A1** limits.md `[confirmar]`s movidos pra pré-req específico do auditor #3 e #5; **A2** access pattern de `audit_events` por agent (MCP supabase-dba, REST deploy/vps-ops); **A3** coluna `escalated_at` separada de `acknowledged_by`; **A4** Camada 3 de key-expiry opt-in via env flag; **A5** TELEGRAM_ADMIN_USER_ID vs CHAT_ID clarificado; **A6** setWebhook conflict check no §9.0; **O1** `audit_events` ≠ `approvals` explicitado em §4; **O2** `runbook_path: null` como gap consciente em #3 e #4; **O3** runs clean ficam em `audit_runs.status='success'` (heartbeat). |
