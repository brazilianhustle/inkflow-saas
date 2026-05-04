const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const TENANT_SELECT = 'id,ativo,welcome_shown,config_precificacao,config_agente,evo_instance,nome,nome_estudio,nome_agente,email,cidade,plano';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function sbHeaders(sbKey) {
  return { apikey: sbKey, Authorization: `Bearer ${sbKey}` };
}

async function findTenant(sbKey, { email, onboardingKey }) {
  const queries = [];
  if (email) queries.push(`email=eq.${encodeURIComponent(email)}`);
  if (onboardingKey) queries.push(`onboarding_key=eq.${encodeURIComponent(onboardingKey)}`);

  for (const q of queries) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?${q}&select=${TENANT_SELECT}&order=created_at.desc&limit=1`,
        { headers: sbHeaders(sbKey) }
      );
      if (r.ok) {
        const rows = await r.json();
        if (rows[0]) return rows[0];
      }
    } catch {}
  }
  return null;
}

async function resetLinkUsed(sbKey, linkId) {
  await fetch(`${SUPABASE_URL}/rest/v1/onboarding_links?id=eq.${linkId}`, {
    method: 'PATCH',
    headers: { ...sbHeaders(sbKey), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ used: false }),
  });
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
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/onboarding_links?key=eq.${encodeURIComponent(key)}&select=id,key,plano,email,used,expires_at`,
      { headers: sbHeaders(SB_KEY) }
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

    if (new Date(link.expires_at) < new Date()) {
      return json({ valid: false, error: 'Link de onboarding expirado. Solicite um novo link ao suporte InkFlow.' });
    }

    let existingTenant = null;

    if (link.used) {
      existingTenant = await findTenant(SB_KEY, { email: link.email, onboardingKey: key });

      if (existingTenant) {
        await resetLinkUsed(SB_KEY, link.id);
        console.log('validate-onboarding-key: link reativado para retry, tenant:', existingTenant.id);
      } else {
        return json({ valid: false, error: 'Este link de onboarding já foi utilizado.' });
      }
    }

    // Se link não estava used, ainda verificar se tenant já existe (reload da página)
    if (!existingTenant) {
      existingTenant = await findTenant(SB_KEY, { email: link.email, onboardingKey: key });
    }

    const response = { valid: true, plano: link.plano, link_id: link.id };

    // Incluir estado do tenant pra frontend fazer smart-resume
    if (existingTenant) {
      response.tenant = {
        id: existingTenant.id,
        ativo: !!existingTenant.ativo,
        welcome_shown: !!existingTenant.welcome_shown,
        evo_instance: existingTenant.evo_instance || null,
        nome: existingTenant.nome || '',
        nome_estudio: existingTenant.nome_estudio || '',
        nome_agente: existingTenant.nome_agente || '',
        email: existingTenant.email || '',
        cidade: existingTenant.cidade || '',
        plano: existingTenant.plano || link.plano,
        config_precificacao: existingTenant.config_precificacao || null,
        config_agente: existingTenant.config_agente || null,
      };
    }

    console.log('validate-onboarding-key: key válida, plano:', link.plano, 'tenant:', existingTenant?.id || 'novo');
    return json(response);

  } catch (err) {
    console.error('validate-onboarding-key exception:', err);
    return json({ valid: false, error: 'Erro interno' }, 500);
  }
}
