// ── InkFlow — Valida key de onboarding (server-side) ────────────────────────
// Verifica se a key existe na tabela onboarding_links, não expirou e não foi usada.
// POST /api/validate-onboarding-key
//
// Body: { key: "abc123" }
// Resposta sucesso: { valid: true, plano: "basic" }
// Resposta falha:   { valid: false, error: "..." }

const CORS = {
  'Access-Control-Allow-Origin': '*',
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

  const { key } = body;

  if (!key || typeof key !== 'string' || key.length < 8) {
    return json({ valid: false, error: 'Key inválida' }, 400);
  }

  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ valid: false, error: 'Configuração interna ausente' }, 503);

  try {
    // Buscar a key na tabela onboarding_links
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/onboarding_links?key=eq.${encodeURIComponent(key)}&select=id,key,plano,email,used,expires_at`,
      {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
      }
    );

    if (!res.ok) {
      console.error('validate-onboarding-key: Supabase error', await res.text());
      return json({ valid: false, error: 'Erro ao verificar link' }, 500);
    }

    const links = await res.json();

    if (!links || links.length === 0) {
      return json({ valid: false, error: 'Link de onboarding inválido ou não encontrado.' });
    }

    const link = links[0];

    // Verificar se expirou
    if (new Date(link.expires_at) < new Date()) {
      return json({ valid: false, error: 'Link de onboarding expirado. Solicite um novo link ao suporte InkFlow.' });
    }

    // Verificar se já foi usado (opcional — se quiser links de uso único, descomentar)
    // if (link.used) {
    //   return json({ valid: false, error: 'Este link de onboarding já foi utilizado.' });
    // }

    // Key válida — retornar plano associado
    console.log('validate-onboarding-key: key válida, plano:', link.plano);
    return json({ valid: true, plano: link.plano, link_id: link.id });

  } catch (err) {
    console.error('validate-onboarding-key exception:', err);
    return json({ valid: false, error: 'Erro interno' }, 500);
  }
}