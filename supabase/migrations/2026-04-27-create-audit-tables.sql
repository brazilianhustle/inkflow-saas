-- Migration: create audit_events + audit_runs + audit_reports + view + RLS
-- Spec: docs/superpowers/specs/2026-04-27-auditores-mvp-design.md §4
-- Plan: docs/superpowers/plans/2026-04-27-auditores-infra.md Task 2
-- Purpose: storage do estado dos 5 auditores MVP (detect-only).

-- ── audit_events ───────────────────────────────────────────────────────────
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  auditor TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warn','critical','resolved')),
  payload JSONB NOT NULL,
  evidence JSONB,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_alerted_at TIMESTAMPTZ,
  alert_count INT NOT NULL DEFAULT 1,
  superseded_by UUID REFERENCES audit_events(id),
  escalated_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_reason TEXT
);

CREATE INDEX audit_events_open_critical
  ON audit_events (severity, detected_at DESC)
  WHERE resolved_at IS NULL AND severity = 'critical';

CREATE INDEX audit_events_auditor_recent
  ON audit_events (auditor, detected_at DESC);

CREATE INDEX audit_events_open_by_auditor
  ON audit_events (auditor)
  WHERE resolved_at IS NULL;

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_events_admin_read ON audit_events
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');

-- service_role bypassa RLS automaticamente — sem policy explícita.

COMMENT ON TABLE audit_events IS 'Eventos de detecção dos auditores. Distinto de approvals (Sub-projeto 5).';
COMMENT ON COLUMN audit_events.escalated_at IS 'Quando Pushover disparou (cron */5 critical sem ack >2h). Distinto de acknowledged_* (humano).';

-- ── audit_runs (heartbeat / liveness) ──────────────────────────────────────
CREATE TABLE audit_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','error')),
  error_message TEXT,
  events_emitted INT NOT NULL DEFAULT 0
);

CREATE INDEX audit_runs_recent ON audit_runs (auditor, started_at DESC);

ALTER TABLE audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_runs_admin_read ON audit_runs
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');

COMMENT ON TABLE audit_runs IS 'Liveness/heartbeat de cada execução. Sem essa tabela, auditor crashado silencioso não é detectado.';

-- ── audit_reports (relatório semanal materializado) ────────────────────────
CREATE TABLE audit_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics JSONB NOT NULL,
  markdown TEXT NOT NULL
);

ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_reports_admin_read ON audit_reports
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');

COMMENT ON TABLE audit_reports IS 'Relatório semanal. Cron 0 12 * * 1 (segunda 09:00 BRT).';

-- ── view audit_current_state ───────────────────────────────────────────────
CREATE VIEW audit_current_state AS
SELECT DISTINCT ON (auditor)
  auditor, id AS event_id, severity, payload, evidence,
  detected_at, last_seen_at, last_alerted_at, alert_count,
  acknowledged_at, escalated_at
FROM audit_events
WHERE resolved_at IS NULL
ORDER BY auditor, detected_at DESC;

COMMENT ON VIEW audit_current_state IS 'Estado aberto por auditor (max 1 row). Usada pela política de dedupe (spec §6.2).';
