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
]);

// FIX AUDIT #4: Campos adicionais que o admin pode editar via dashboard
const ADMIN_EXTRA_FIELDS = new Set([
  'nome', 'email', 'cidade', 'endereco',
  'prompt_sistema', 'faq_texto',
  'status_pagamento', 'mp_subscription_id',
]);

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

  const { tenant_id, email, ...fields } = body;

  if (!tenant_id) return json({ error: 'tenant_id obrigatório' }, 400);

  // Validar formato UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant_id)) {
    return json({ error: 'tenant_id inválido' }, 400);
  }

  // ── AUTH: verificar identidade ────────────────────────────────────────────
  const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  const isAdmin = await verifyAdmin(request.headers.get('Authorization'), SUPABASE_KEY);

  // Se não é admin, precisa enviar email pra provar ownership
  if (!isAdmin && !email) {
    return json({ error: 'email obrigatório para autenticação' }, 403);
  }

  // ── Verificar ownership (se não é admin) ──────────────────────────────────
  if (!isAdmin) {
    try {
      const ownerRes = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=email`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (!ownerRes.ok) return json({ error: 'Erro ao verificar ownership' }, 500);
      const ownerData = await ownerRes.json();
      if (ownerData.length === 0) return json({ error: 'Tenant não encontrado' }, 404);
      if (ownerData[0].email !== email) {
        return json({ error: 'Acesso negado' }, 403);
      }
    } catch (err) {
      console.error('update-tenant: ownership check failed:', err);
      return json({ error: 'Erro interno' }, 500);
    }
  }

  // Filtra apenas campos permitidos (admin tem acesso expandido)
  const safeFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(k) || (isAdmin && ADMIN_EXTRA_FIELDS.has(k))) safeFields[k] = v;
  }

  if (Object.keys(safeFields).length === 0) {
    return json({ error: 'Nenhum campo válido para atualizar' }, 400);
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
