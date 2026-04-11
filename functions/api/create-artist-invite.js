// ── InkFlow — Gera link de convite para artista do est&#250;dio ────────────────────
// Permite que o dono de um est&#250;dio (plano estudio/premium) convide artistas.
// Cria entrada em onboarding_links com parent_tenant_id e is_artist_invite=true.
//
// POST /api/create-artist-invite
// Body: { tenant_id: "uuid-do-dono" }
// Resposta sucesso: { success: true, key: "...", link: "https://..." }
// Resposta falha:   { error: "..." }

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

// Gera key aleat&#243;ria URL-safe (16 chars)
function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 16; i++) {
    key += chars[arr[i] % chars.length];
  }
  return key;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inv&#225;lido' }, 400); }

  const { tenant_id } = body;

  if (!tenant_id || typeof tenant_id !== 'string' || tenant_id.length < 10) {
    return json({ error: 'tenant_id &#233; obrigat&#243;rio' }, 400);
  }

  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configura&#231;&#227;o interna ausente' }, 503);

  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // ── 1. Buscar tenant pai e validar plano ────────────────────────────────
    const tenantRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=id,plano,max_artists,ativo,is_artist_slot,google_calendar_id`,
      { headers }
    );

    if (!tenantRes.ok) {
      console.error('create-artist-invite: erro ao buscar tenant:', await tenantRes.text());
      return json({ error: 'Erro ao verificar est&#250;dio' }, 500);
    }

    const tenants = await tenantRes.json();
    if (!tenants || tenants.length === 0) {
      return json({ error: 'Est&#250;dio n&#227;o encontrado' }, 404);
    }

    const tenant = tenants[0];

    // N&#227;o pode ser artista convidando artista
    if (tenant.is_artist_slot === true) {
      return json({ error: 'Apenas o dono do est&#250;dio pode convidar artistas' }, 403);
    }

    // Plano precisa ser estudio ou premium
    if (!['estudio', 'premium'].includes(tenant.plano)) {
      return json({ error: 'Convite de artistas dispon&#237;vel apenas nos planos Est&#250;dio e Premium' }, 403);
    }

    // Tenant precisa estar ativo
    if (tenant.ativo !== true) {
      return json({ error: 'Est&#250;dio precisa estar ativo para convidar artistas' }, 403);
    }

    // ── 2. Verificar limite de slots ────────────────────────────────────────
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?parent_tenant_id=eq.${encodeURIComponent(tenant_id)}&is_artist_slot=eq.true&select=id`,
      {
        headers: {
          ...headers,
          Prefer: 'count=exact',
        },
      }
    );

    if (!countRes.ok) {
      console.error('create-artist-invite: erro ao contar artistas:', await countRes.text());
      return json({ error: 'Erro ao verificar slots' }, 500);
    }

    // Pegar count do header content-range (formato: "0-N/total" ou "*/total")
    const contentRange = countRes.headers.get('content-range');
    let currentArtists = 0;
    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) currentArtists = parseInt(match[1], 10);
    }

    const maxArtists = tenant.max_artists || (tenant.plano === 'estudio' ? 5 : 10);
    // O dono ocupa 1 slot, ent&#227;o slots dispon&#237;veis = max - 1 - artistas atuais
    const slotsDisponiveis = maxArtists - 1 - currentArtists;

    if (slotsDisponiveis <= 0) {
      return json({
        error: `Limite de artistas atingido (${currentArtists} de ${maxArtists - 1} slots usados)`
      }, 409);
    }

    // ── 3. Contar convites pendentes (n&#227;o usados, n&#227;o expirados) ──────────────
    const pendingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/onboarding_links?parent_tenant_id=eq.${encodeURIComponent(tenant_id)}&is_artist_invite=eq.true&used=eq.false&expires_at=gt.${new Date().toISOString()}&select=id`,
      {
        headers: {
          ...headers,
          Prefer: 'count=exact',
        },
      }
    );

    let pendingInvites = 0;
    if (pendingRes.ok) {
      const pendingRange = pendingRes.headers.get('content-range');
      if (pendingRange) {
        const match = pendingRange.match(/\/(\d+)$/);
        if (match) pendingInvites = parseInt(match[1], 10);
      }
    }

    // Convites pendentes + artistas ativos n&#227;o podem exceder o limite
    if ((currentArtists + pendingInvites) >= (maxArtists - 1)) {
      return json({
        error: `J&#225; existem ${pendingInvites} convite(s) pendente(s). Aguarde serem aceitos ou expirem.`
      }, 409);
    }

    // ── 4. Gerar key e criar link de convite ─────────────────────────────────
    const key = generateKey();

    const insertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/onboarding_links`,
      {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          key: key,
          plano: tenant.plano,
          used: false,
          parent_tenant_id: tenant_id,
          is_artist_invite: true,
        }),
      }
    );

    if (!insertRes.ok) {
      const err = await insertRes.text();
      console.error('create-artist-invite: erro ao criar link:', err);
      return json({ error: 'Erro ao gerar convite' }, 500);
    }

    const created = await insertRes.json();

    // ── 5. Retornar link completo ────────────────────────────────────────────
    const link = `https://inkflowbrasil.com/onboarding.html?key=${key}`;

    console.log(`create-artist-invite: convite criado para estudio ${tenant_id}, key=${key}, slots restantes=${slotsDisponiveis - 1}`);

    return json({
      success: true,
      key: key,
      link: link,
      expires_at: created[0]?.expires_at,
      slots: {
        used: currentArtists,
        pending_invites: pendingInvites + 1,
        max: maxArtists - 1,
        remaining: slotsDisponiveis - 1,
      },
    }, 201);

  } catch (err) {
    console.error('create-artist-invite exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
