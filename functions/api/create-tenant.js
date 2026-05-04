// ── InkFlow — Criação de tenant (server-side) ──────────────────────────────
// Substitui o sbFetch('POST', '/rest/v1/tenants', ...) do onboarding.html
// Usa service_role para INSERT, eliminando necessidade de anon INSERT via RLS.
//
// POST /api/create-tenant
// Body: { nome, nome_agente, nome_estudio, nome_agente, email, cidade, endereco,
//         evo_instance, plano, prompt_sistema }
// Resposta sucesso: { tenant: { id, evo_instance } }
// Resposta falha:   { error: "..." }
//
// BACKUP PRÉ-CORREÇÃO — 2026-04-05
// Issues originais:
//   🔴 evo_instance pode ser undefined no retry → .replace() em undefined = throw
//   🟡 nome_agente não validado como obrigatório
//   🟡 Sem rate limiting (mitigar via Cloudflare WAF rules por IP)

import { isValidPlan } from '../_lib/plans.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Campos que o frontend pode enviar no INSERT (whitelist)
const ALLOWED_FIELDS = new Set([
  'nome', 'nome_agente', 'nome_estudio', 'email', 'telefone', 'cidade', 'endereco',
  'evo_instance', 'webhook_path', 'evo_base_url', 'plano', 'prompt_sistema',
  'google_calendar_id',
  // [FIX] onboarding_key precisa ser persistido para que update-tenant/get-studio-token
  // possam autenticar via verifyOnboardingKey (sem isso, todas as auth pos-criacao falham 403)
  'onboarding_key',
  // [v5 agente IA] Configs opcionais que o onboarding pode preencher ja na criacao
  'config_agente', 'config_precificacao',
  'horario_funcionamento', 'duracao_sessao_padrao_h',
  'sinal_percentual', 'gatilhos_handoff', 'portfolio_urls',
  'faq_texto', 'modo_atendimento',
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  // ── Validações obrigatórias ─────────────────────────────────────────────
  const { nome, nome_agente, nome_estudio, email, plano } = body;

  if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
    return json({ error: 'Nome é obrigatório (mín. 2 caracteres)' }, 400);
  }
  if (!nome_estudio || typeof nome_estudio !== 'string' || nome_estudio.trim().length < 2) {
    return json({ error: 'Nome do estúdio é obrigatório' }, 400);
  }
  // FIX: nome_agente agora validado como obrigatório
  if (!nome_agente || typeof nome_agente !== 'string' || nome_agente.trim().length < 2) {
    return json({ error: 'Nome do agente é obrigatório (mín. 2 caracteres)' }, 400);
  }
  if (!email || !email.includes('@') || email.length > 254) {
    return json({ error: 'Email válido é obrigatório' }, 400);
  }
  if (!plano || !isValidPlan(plano)) {
    return json({ error: 'Plano inválido' }, 400);
  }

  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  try {
    // ── Filtrar body pela whitelist ─────────────────────────────────────────
    const tenantData = {};
    for (const [key, val] of Object.entries(body)) {
      if (ALLOWED_FIELDS.has(key) && val !== undefined && val !== '') {
        tenantData[key] = typeof val === 'string' ? val.trim() : val;
      }
    }

    // ── Campos forçados pelo server (não confia no frontend) ────────────────
    tenantData.evo_apikey = 'pending';
    tenantData.webhook_path = tenantData.webhook_path || 'inkflow';
    tenantData.evo_base_url = tenantData.evo_base_url || env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';

    // ── Campos forçados pelo server ─────────────────────────────────────────────
    tenantData.ativo = false;
    tenantData.status_pagamento = 'rascunho';   // Bug 3 fix: marca como rascunho até pagamento ser confirmado

    // Gerar studio_token para planos estúdio/premium (acesso à página de gestão)
    if (['estudio', 'premium'].includes(tenantData.plano)) {
      tenantData.studio_token = crypto.randomUUID();
    }

    // ── Check duplicata telefone/email ──────────────────────────────────────
    // 1. Bloqueia se ja existe tenant em status pago/autorizado/pendente (409).
    // 2. Se so existe em "rascunho" (card recusado, retry, race de duplo-submit),
    //    REUSA o tenant existente em vez de criar outro — evita acumular lixo.
    const BLOCKED_STATUS = ['approved', 'authorized', 'pending', 'paid'];
    const statusFilter = `status_pagamento=in.(${BLOCKED_STATUS.join(',')})`;

    async function lookupDup(field, value) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?${field}=eq.${encodeURIComponent(value)}&select=id,email,telefone,status_pagamento,ativo,plano,evo_instance,nome_estudio,nome_agente&order=created_at.desc`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (!r.ok) return [];
      const rows = await r.json();
      return Array.isArray(rows) ? rows : [];
    }

    // Checa email + telefone (ambos podem dar match em tenants diferentes)
    const matches = [];
    const byEmail = await lookupDup('email', tenantData.email);
    matches.push(...byEmail);
    if (tenantData.telefone) {
      const normTel = String(tenantData.telefone).replace(/\D/g, '');
      if (normTel.length >= 10) {
        const byTel = await lookupDup('telefone', tenantData.telefone);
        // dedup por id
        for (const t of byTel) if (!matches.find(m => m.id === t.id)) matches.push(t);
      }
    }

    // Se qualquer match esta em status bloqueado → 409
    const blocked = matches.find(m => BLOCKED_STATUS.includes(m.status_pagamento));
    if (blocked) {
      const campo = blocked.email === tenantData.email ? 'Email' : 'Telefone';
      return json({ error: `${campo} ja em uso. Use outro ou entre em contato com suporte.`, code: campo.toLowerCase() + '_in_use' }, 409);
    }

    // Se so ha rascunho → reusa (retorna o tenant existente como sucesso)
    const rascunho = matches.find(m => m.status_pagamento === 'rascunho');
    if (rascunho) {
      console.log(`create-tenant: reusando rascunho id=${rascunho.id} email=${rascunho.email}`);
      return json({ tenant: rascunho, reused: true });
    }

    // ── INSERT no Supabase ──────────────────────────────────────────────────
    let res = await fetch(`${SUPABASE_URL}/rest/v1/tenants`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(tenantData),
    });

    // ── Colunas opcionais inexistentes: dropa e retenta (deploy antes de migration) ──
    // Cobre onboarding_key, telefone, ou qualquer outra coluna recém-adicionada.
    const OPTIONAL_COLS = ['onboarding_key', 'telefone'];
    for (let attempt = 0; attempt < OPTIONAL_COLS.length && !res.ok; attempt++) {
      const peek = await res.clone().text();
      const isMissingCol = peek.includes('PGRST204') || peek.includes('42703') || peek.includes('does not exist');
      if (!isMissingCol) break;
      const missing = OPTIONAL_COLS.find(c => peek.includes(c) && tenantData[c] !== undefined);
      if (!missing) break;
      console.warn(`create-tenant: coluna ${missing} ausente no DB — retentando sem ela. RODE: ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ${missing} TEXT;`);
      delete tenantData[missing];
      res = await fetch(`${SUPABASE_URL}/rest/v1/tenants`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(tenantData),
      });
    }

    // ── Colisão de slug (unique constraint) — até 5 tentativas ──────────────
    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes('unique') || errText.includes('duplicate') || errText.includes('23505')) {
        let retryOk = false;
        // FIX: fallback 'inkflow' evita .replace() em undefined
        const base = (tenantData.evo_instance || 'inkflow').replace(/\d+$/, '');
        for (let attempt = 0; attempt < 5; attempt++) {
          const suffix = Date.now().toString().slice(-5) + attempt;
          tenantData.evo_instance = base + suffix;
          res = await fetch(`${SUPABASE_URL}/rest/v1/tenants`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify(tenantData),
          });
          if (res.ok) { retryOk = true; break; }
        }
        if (!retryOk) {
          console.error('create-tenant: slug collision after 5 retries');
          return json({ error: 'Erro ao criar perfil após várias tentativas' }, 500);
        }
      } else {
        console.error('create-tenant: insert error:', errText);
        return json({ error: 'Erro ao criar perfil' }, 500);
      }
    }

    const data = await res.json();
    const tenant = Array.isArray(data) ? data[0] : data;

    if (!tenant || !tenant.id) {
      return json({ error: 'Não foi possível obter o ID do tenant' }, 500);
    }

    // [FIX AUDIT5 #2] Marcar onboarding key como usada (uso unico)
    const onboardingKey = body.onboarding_key;
    if (onboardingKey && typeof onboardingKey === 'string' && onboardingKey.length >= 8) {
      try {
        await fetch(
          `${SUPABASE_URL}/rest/v1/onboarding_links?key=eq.${encodeURIComponent(onboardingKey)}`,
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
      } catch (keyErr) {
        console.warn('create-tenant: falha ao marcar onboarding key como usada:', keyErr);
      }
    }

    // Retorna apenas id e evo_instance (nunca retornar dados sensíveis)
    return json({
      tenant: {
        id: tenant.id,
        evo_instance: tenant.evo_instance,
      }
    }, 201);

  } catch (err) {
    console.error('create-tenant exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
