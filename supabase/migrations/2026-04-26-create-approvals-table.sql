-- Migration: create approvals table
-- Spec: docs/superpowers/specs/2026-04-26-telegram-bot-down-design.md §6.1
-- Purpose: estado compartilhado pra approval async via Pushover quando Telegram falhar.

CREATE TABLE approvals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_payload jsonb NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('P0','P1','P2')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  expires_at      timestamptz NOT NULL,
  approved_at     timestamptz,
  approved_by     text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index pra polling rápido de pendentes
CREATE INDEX approvals_status_idx ON approvals (status) WHERE status = 'pending';

-- Index pra expiry sweep (cron pode usar futuramente)
CREATE INDEX approvals_expires_at_idx ON approvals (expires_at) WHERE status = 'pending';

-- RLS: somente admin autenticado lê/atualiza; service role insere (agents).
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

-- Admin (auth.users mapeado) tem acesso total via JWT
CREATE POLICY approvals_admin_full ON approvals
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'lmf4200@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'lmf4200@gmail.com');

-- Service role bypass RLS automaticamente (PostgREST não aplica policies pra service_role)
-- Não precisa policy explícita pra service role.

COMMENT ON TABLE approvals IS 'Approvals async pra heurística #4 (matrix.md). Agent insere, admin decide via /api/approvals/decide.';
COMMENT ON COLUMN approvals.request_payload IS 'JSON da operação destrutiva pendente (ex: {action: "drop_column", table: "tenants", column: "legacy_field"})';
COMMENT ON COLUMN approvals.severity IS 'P0=15min total, P1=2h, P2=24h. Determina polling interval e timeout.';
COMMENT ON COLUMN approvals.status IS 'pending → approved | rejected | expired. Transitions via /api/approvals/decide ou cron de expiry.';
