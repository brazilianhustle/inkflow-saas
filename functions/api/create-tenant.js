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

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

// Campos que o frontend pode enviar no INSERT (whitelist)
const ALLOWED_FIELDS = new Set([
  'nome', 'nome_agente', 'nome_estudio', 'email', 'cidade', 'endereco',
  'evo_instance', 'webhook_path', 'evo_base_url', 'plano', 'prompt_sistema',
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
  if (!plano || !['free', 'teste', 'basic', 'pro', 'enterprise'].includes(plano)) {  // TEMPORARIO: 'teste' adicionado para teste R$1
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
    tenantData.ativo = false;
    tenantData.status_pagamento = 'rascunho';   // Bug 3 fix: marca como rascunho até pagamento ser confirmado
    tenantData.evo_apikey = 'pending';
    tenantData.webhook_path = tenantData.webhook_path || 'inkflow';
    tenantData.evo_base_url = tenantData.evo_base_url || env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';

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
