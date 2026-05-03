// ── InkFlow — Atualiza dados do tenant (server-side) ────────────────────────
// POST /api/update-tenant
//
// AUTH: Requer uma das formas:
//   1. Body inclui email → endpoint verifica que email é dono do tenant
//   2. Header Authorization: Bearer <supabase_jwt> de admin → acesso total
//
// Body: { tenant_id, email, ...campos }
// Campos BLOQUEADOS (para não-admin): status_pagamento, mp_subscription_id, prompt_sistema, faq_texto
// FIX AUDIT #4: Admin pode editar campos adicionais (nome, email, cidade, etc.)

import { verifyOnboardingKey, verifyStudioTokenOrLegacy } from './_auth-helpers.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const ADMIN_EMAIL  = 'lmf4200@gmail.com';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Campos que o onboarding pode atualizar
const ALLOWED_FIELDS = new Set([
  'evo_instance', 'evo_apikey', 'evo_base_url', 'webhook_path',
  'grupo_notificacao', 'grupo_orcamento',
  'google_calendar_id', 'google_drive_folder',
  'nome_agente', 'nome_estudio', 'ativo', 'plano', 'trial_ate',
  'parent_tenant_id', 'is_artist_slot',
  'welcome_shown',
  // [v5 agente IA] Configs do agente editaveis pelo dono via studio.html
  'config_agente',          // JSONB: persona, tom, emoji_level, usa_giria, expressoes_proibidas, frases_naturais, usa_identificador, aceita_cobertura, estilos_aceitos, estilos_recusados, few_shot_exemplos, tester_usage
  'config_precificacao',    // JSONB: modo, tabela_tamanho, multiplicadores, sinal_percentual, minimo, formula, tamanho_maximo_sessao_cm, valor_maximo_orcado, estilo_fallback, observacoes_tatuador, herda_do_pai
  'horario_funcionamento',  // JSONB: { 'seg-sex': '10:00-19:00', 'sab': '10:00-15:00' }
  'duracao_sessao_padrao_h',
  'sinal_percentual',
  'gatilhos_handoff',       // TEXT[]: ['cobertura','retoque','rosto',...]
  'portfolio_urls',         // TEXT[]: URLs de portfolio
  'faq_texto',              // texto livre de FAQ
  'modo_atendimento',       // TEXT: individual | tatuador_dono | recepcionista | artista_slot
  'fewshots_por_modo',      // JSONB: { coleta_tattoo, coleta_cadastro, coleta_proposta, exato } — Modo Coleta v2
  'tatuador_telegram_chat_id',    // TEXT: chat_id Telegram do tatuador (canal handoff Coleta v2)
  'tatuador_telegram_username',   // TEXT: @username Telegram (display)
]);

// FIX AUDIT #4: Campos adicionais que o admin pode editar via dashboard
const ADMIN_EXTRA_FIELDS = new Set([
  'nome', 'email', 'cidade', 'endereco',
  'prompt_sistema',
  'status_pagamento', 'mp_subscription_id',
]);

// Valida tipo basico de campos JSONB/array antes de mandar pro Supabase.
// Retorna { ok: boolean, erro?: string }
const MODOS_ATENDIMENTO = ['individual', 'tatuador_dono', 'recepcionista', 'artista_slot'];
const MODOS_VALIDOS = ['coleta', 'exato']; // Modo Coleta v2: 'faixa' REMOVIDO; 'coleta' default novo
const FEWSHOT_KEYS_VALIDAS = ['coleta_tattoo', 'coleta_cadastro', 'coleta_proposta', 'exato'];

// Valida o sub-objeto config_precificacao (campos relevantes pra Modo Coleta v2).
// Retorna { ok: boolean, erro?: string }.
export function validateConfigPrecificacao(cfg) {
  if (!cfg || typeof cfg !== 'object') return { ok: true }; // campo não enviado = sem validação
  if (cfg.modo !== undefined) {
    if (cfg.modo === 'faixa') {
      return { ok: false, erro: 'modo faixa removido na v2 — use coleta (recomendado) ou exato (beta)' };
    }
    if (!MODOS_VALIDOS.includes(cfg.modo)) {
      return { ok: false, erro: `modo deve ser um de: ${MODOS_VALIDOS.join(', ')}` };
    }
  }
  // Campos legacy v1 (coleta_submode, trigger_handoff) silenciosamente ignorados —
  // v2 só tem reentrada e callback Telegram. Migration de banco já apagou esses.
  return { ok: true };
}

export function validateFieldTypes(fields) {
  const jsonbFields = ['config_agente', 'config_precificacao', 'horario_funcionamento'];
  const arrayFields = ['gatilhos_handoff', 'portfolio_urls'];
  const intFields = ['duracao_sessao_padrao_h', 'sinal_percentual'];

  for (const f of jsonbFields) {
    if (fields[f] !== undefined) {
      if (typeof fields[f] !== 'object' || Array.isArray(fields[f])) {
        return { ok: false, erro: `${f} deve ser objeto JSON` };
      }
    }
  }
  for (const f of arrayFields) {
    if (fields[f] !== undefined) {
      if (!Array.isArray(fields[f])) return { ok: false, erro: `${f} deve ser array` };
      if (fields[f].some(x => typeof x !== 'string')) return { ok: false, erro: `${f} deve conter apenas strings` };
    }
  }
  for (const f of intFields) {
    if (fields[f] !== undefined) {
      const n = Number(fields[f]);
      if (!Number.isFinite(n) || n < 0 || n > 10000) return { ok: false, erro: `${f} deve ser numero entre 0 e 10000` };
    }
  }
  if (fields.modo_atendimento !== undefined && !MODOS_ATENDIMENTO.includes(fields.modo_atendimento)) {
    return { ok: false, erro: `modo_atendimento deve ser um de: ${MODOS_ATENDIMENTO.join(', ')}` };
  }
  if (fields.fewshots_por_modo !== undefined) {
    const v = fields.fewshots_por_modo;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      return { ok: false, erro: 'fewshots_por_modo deve ser objeto' };
    }
    const keys = Object.keys(v);
    const invalidKey = keys.find(k => !FEWSHOT_KEYS_VALIDAS.includes(k));
    if (invalidKey) {
      return { ok: false, erro: `fewshots_por_modo: chave invalida "${invalidKey}" (validas: ${FEWSHOT_KEYS_VALIDAS.join(', ')})` };
    }
    // Element-level validation (cliente/agente shape) deferida pra PR 2 quando o schema for ativo.
    for (const k of keys) {
      if (!Array.isArray(v[k])) {
        return { ok: false, erro: `fewshots_por_modo.${k} deve ser array` };
      }
    }
  }
  if (fields.config_precificacao !== undefined) {
    const r = validateConfigPrecificacao(fields.config_precificacao);
    if (!r.ok) return r;
  }
  return { ok: true };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// [FIX AUDIT4 #2] Verifica JWT via Supabase Auth API (antes apenas decodificava sem verificar assinatura)
async function verifyAdmin(authHeader, supabaseKey) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  try {
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: supabaseKey, Authorization: authHeader }
    });
    if (!userRes.ok) return false;
    const user = await userRes.json();
    return user.email === ADMIN_EMAIL;
  } catch { return false; }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const { tenant_id, email, onboarding_key, studio_token, ...fields } = body;

  if (!tenant_id) return json({ error: 'tenant_id obrigatório' }, 400);

  // Validar formato UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant_id)) {
    return json({ error: 'tenant_id inválido' }, 400);
  }

  // ── AUTH: verificar identidade via 1 de 3 mecanismos ─────────────────────
  // 1. Bearer JWT admin (acesso total + campos extras)
  // 2. onboarding_key que bate com tenants.onboarding_key (prova de posse do link)
  // 3. studio_token HMAC/legacy que bate com este tenant_id
  // Email sozinho NÃO autoriza (antes era vulneravel — qualquer um que soubesse
  // o email do cliente podia impersonar).
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  const isAdmin = await verifyAdmin(request.headers.get('Authorization'), SUPABASE_KEY);

  let authorized = isAdmin;
  let authSource = isAdmin ? 'admin' : null;

  if (!authorized && onboarding_key) {
    const check = await verifyOnboardingKey({
      tenantId: tenant_id,
      onboardingKey: onboarding_key,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });
    if (check.ok) { authorized = true; authSource = 'onboarding_key'; }
  }

  if (!authorized && studio_token) {
    const verified = await verifyStudioTokenOrLegacy({
      token: studio_token,
      secret: env.STUDIO_TOKEN_SECRET,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });
    if (verified && verified.tenantId === tenant_id) {
      authorized = true; authSource = 'studio_token';
    }
  }

  if (!authorized) {
    console.warn(`update-tenant: auth rejeitada tenant_id=${tenant_id} email_sent=${!!email}`);
    return json({ error: 'Autenticação requerida: onboarding_key, studio_token ou admin JWT' }, 403);
  }

  // Filtra apenas campos permitidos (admin tem acesso expandido)
  const safeFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(k) || (isAdmin && ADMIN_EXTRA_FIELDS.has(k))) safeFields[k] = v;
  }

  if (Object.keys(safeFields).length === 0) {
    return json({ error: 'Nenhum campo válido para atualizar' }, 400);
  }

  // Valida tipos dos novos campos agente/precificacao (evita JSON malformado no DB)
  const typeCheck = validateFieldTypes(safeFields);
  if (!typeCheck.ok) {
    return json({ error: typeCheck.erro, code: 'invalid_field_type' }, 400);
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(safeFields),
      }
    );

    if (!res.ok) {
      console.error('update-tenant error:', await res.text());
      return json({ error: 'Erro ao atualizar tenant' }, 500);
    }

    // [FIX Bug #2 Onboarding] Quando tenant é ativado (ativo=true),
    // marcar o onboarding_link associado como used=true.
    // Isso garante que o link só é invalidado APÓS o onboarding completar com sucesso.
    // Se o pagamento falhar, o link continua disponível para retry.
    if (safeFields.ativo === true) {
      try {
        // Buscar email do tenant para encontrar o link associado
        const tenantRes = await fetch(
          `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=email`,
          {
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
            },
          }
        );
        if (tenantRes.ok) {
          const tenantData = await tenantRes.json();
          const tenantEmail = tenantData?.[0]?.email;
          if (tenantEmail) {
            await fetch(
              `${SUPABASE_URL}/rest/v1/onboarding_links?email=eq.${encodeURIComponent(tenantEmail)}&used=eq.false`,
              {
                method: 'PATCH',
                headers: {
                  apikey: SUPABASE_KEY,
                  Authorization: `Bearer ${SUPABASE_KEY}`,
                  'Content-Type': 'application/json',
                  Prefer: 'return=minimal',
                },
                body: JSON.stringify({ used: true }),
              }
            );
            console.log('update-tenant: onboarding link marcado como used para:', tenantEmail);
          }
        }
      } catch (linkErr) {
        // Não-fatal: se falhar, o link pode ser reutilizado mas o tenant já está ativo
        // então validate-onboarding-key vai bloquear de qualquer forma (tenant.ativo=true)
        console.warn('update-tenant: falha ao marcar onboarding link como used:', linkErr.message);
      }
    }

    return json({ ok: true, updated: Object.keys(safeFields) });

  } catch (err) {
    console.error('update-tenant exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
