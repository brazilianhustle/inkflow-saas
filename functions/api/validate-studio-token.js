// ── InkFlow — Valida studio_token (acesso à página de gestão do estúdio) ─────
// POST /api/validate-studio-token
// Body: { token: "uuid-do-studio-token" }
// Resposta sucesso: { valid: true, tenant: { id, nome_estudio, plano, email, evo_instance } }
// Resposta falha:   { valid: false, error: "..." }

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ valid: false, error: 'JSON inválido' }, 400); }

  const { token } = body;
  if (!token || typeof token !== 'string' || token.length < 10) {
    return json({ valid: false, error: 'Token inválido' }, 400);
  }

  try {
    const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;

    // Buscar tenant pelo studio_token
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?studio_token=eq.${encodeURIComponent(token)}&select=id,nome_estudio,plano,email,evo_instance,ativo,nome`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (!res.ok) {
      console.error('validate-studio-token: Supabase error', res.status);
      return json({ valid: false, error: 'Erro ao validar token' }, 500);
    }

    const tenants = await res.json();
    if (!tenants || tenants.length === 0) {
      return json({ valid: false, error: 'Token inválido ou expirado' }, 404);
    }

    const tenant = tenants[0];
    if (!tenant.ativo) {
      return json({ valid: false, error: 'Estúdio ainda não está ativo. Complete o onboarding primeiro.' }, 403);
    }

    // Contar artistas já vinculados
    const slotsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?parent_tenant_id=eq.${tenant.id}&is_artist_slot=eq.true&select=id,nome,evo_instance,ativo`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    let artists = [];
    if (slotsRes.ok) {
      artists = await slotsRes.json();
    }

    const maxSlots = tenant.plano === 'premium' ? 10 : 5;
    const usedSlots = artists.length;

    return json({
      valid: true,
      tenant: {
        id: tenant.id,
        nome_estudio: tenant.nome_estudio,
        nome: tenant.nome,
        plano: tenant.plano,
        email: tenant.email,
        evo_instance: tenant.evo_instance,
      },
      slots: {
        max: maxSlots,
        used: usedSlots,
        remaining: maxSlots - usedSlots - 1, // -1 porque o dono ocupa 1 slot
      },
      artists: artists.map(a => ({
        id: a.id,
        nome: a.nome,
        evo_instance: a.evo_instance,
        ativo: a.ativo,
      })),
    });

  } catch (err) {
    console.error('validate-studio-token:', err);
    return json({ valid: false, error: 'Erro interno' }, 500);
  }
}
