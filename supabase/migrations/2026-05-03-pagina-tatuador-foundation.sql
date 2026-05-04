-- ═════════════════════════════════════════════════════════════════════════
-- Migration: Página do Tatuador Refactor — PR 1 Foundation
-- Data: 2026-05-03
-- Spec: docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md
--
-- Objetivos:
-- 1. Drop colunas/valores relacionados a "Artistas do estúdio" (feature removida)
-- 2. Add colunas pra novos fluxos (cancelar plano, deletar conta, notificações)
-- 3. Add suporte ao kill-switch da IA (estado_agente_anterior, pausada_em + CHECK)
--
-- Idempotente: pode rodar múltiplas vezes sem erro.
-- Defaults seguros: zero breaking pra tenants existentes.
-- ═════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Drop colunas de Artistas em tenants ──────────────────────────────
-- Zero tenants com is_artist_slot=true em prod (validado 03/05). Sem migração de dados.
ALTER TABLE tenants DROP COLUMN IF EXISTS is_artist_slot;
ALTER TABLE tenants DROP COLUMN IF EXISTS parent_tenant_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS max_artists;

-- ─── 2. Drop colunas de invite de Artistas em onboarding_links ───────────
ALTER TABLE onboarding_links DROP COLUMN IF EXISTS is_artist_invite;
ALTER TABLE onboarding_links DROP COLUMN IF EXISTS parent_tenant_id;

-- ─── 3. Add colunas novas em tenants ─────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ativo_ate timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deletado_em timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS config_notificacoes jsonb
  DEFAULT '{"email_enabled": true, "push_enabled": false}'::jsonb;

-- Garantir que tenants existentes ganhem o default em config_notificacoes
UPDATE tenants
  SET config_notificacoes = '{"email_enabled": true, "push_enabled": false}'::jsonb
  WHERE config_notificacoes IS NULL;

-- ─── 4. Add colunas + CHECK constraint estendida em conversas ────────────
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS estado_agente_anterior text;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS pausada_em timestamptz;

-- Estende CHECK constraint de conversas.estado_agente pra aceitar 'pausada_tatuador'
-- (adicionado no PR 3, mas a constraint precisa ser tolerante já no PR 1).
ALTER TABLE conversas DROP CONSTRAINT IF EXISTS conversas_estado_agente_check;
ALTER TABLE conversas ADD CONSTRAINT conversas_estado_agente_check
  CHECK (estado_agente IN (
    'ativo',
    'coletando_tattoo',
    'coletando_cadastro',
    'aguardando_tatuador',
    'propondo_valor',
    'aguardando_decisao_desconto',
    'escolhendo_horario',
    'aguardando_sinal',
    'lead_frio',
    'fechado',
    'pausada_tatuador'
  ));

-- ─── 5. Limpar valor obsoleto modo_atendimento='artista_slot' ────────────
-- Reassign pra 'individual' (default razoável pra qualquer tenant órfão).
UPDATE tenants SET modo_atendimento = 'individual'
  WHERE modo_atendimento = 'artista_slot';

COMMIT;

-- ─── Verificação pós-migration (rodar manualmente no Dashboard) ──────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'tenants' AND column_name IN
--   ('is_artist_slot','parent_tenant_id','max_artists','ativo_ate','deletado_em','config_notificacoes');
-- Deve retornar 3 linhas: ativo_ate, deletado_em, config_notificacoes (sem as 3 primeiras).
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'onboarding_links' AND column_name IN
--   ('is_artist_invite','parent_tenant_id');
-- Deve retornar 0 linhas.
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'conversas' AND column_name IN ('estado_agente_anterior','pausada_em');
-- Deve retornar 2 linhas.
--
-- SELECT modo_atendimento, count(*) FROM tenants GROUP BY 1;
-- Não deve mostrar 'artista_slot'.
