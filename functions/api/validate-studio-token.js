// ── InkFlow — Valida studio_token (acesso à página de gestão do estúdio) ─────
// POST /api/validate-studio-token
// Body: { token: "v1.<...>" | "<uuid-legacy>" }
// Resposta sucesso: { valid: true, tenant: {...}, slots: {...}, artists: [...], refreshed_token? }
// Resposta falha:   { valid: false, error: "..." }

import { verifyStudioTokenOrLegacy, generateStudioToken } from './_auth-helpers.js';

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

  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const TOKEN_SECRET = env.STUDIO_TOKEN_SECRET;

  try {
    // Verifica HMAC ou UUID legacy
    const verified = await verifyStudioTokenOrLegacy({
      token,
      secret: TOKEN_SECRET,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SUPABASE_KEY,
    });

    if (!verified) {
      return json({ valid: false, error: 'Token inválido ou expirado. Solicite um novo link.' }, 401);
    }

    // Buscar dados completos do tenant pelo id validado
    // Inclui configs do agente IA pra UI "Agente & Preços" carregar valores atuais.
    const tenantFields = [
      'id', 'nome_estudio', 'plano', 'email', 'evo_instance', 'ativo', 'nome', 'welcome_shown',
      'nome_agente', 'faq_texto',
      'config_agente', 'config_precificacao',
      'horario_funcionamento', 'duracao_sessao_padrao_h',
      'sinal_percentual', 'gatilhos_handoff', 'portfolio_urls',
    ].join(',');
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(verified.tenantId)}&select=${tenantFields}`,
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
      return json({ valid: false, error: 'Tenant não encontrado' }, 404);
    }

    const tenant = tenants[0];
    // Não bloqueia se ativo=false — studio.html mostra seção "Conectar WhatsApp"
    // quando tenant.ativo=false. Se tivesse bloqueado aqui, cliente nunca chegaria
    // no painel pra conectar.

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

    // Sliding window: se HMAC e restam <7d, emite token renovado.
    // Se token UUID legacy, também renova promovendo para HMAC.
    let refreshedToken = null;
    if (TOKEN_SECRET) {
      const shouldRefresh = verified.source === 'legacy-uuid' || verified.shouldRefresh;
      if (shouldRefresh) {
        try {
          refreshedToken = await generateStudioToken(tenant.id, TOKEN_SECRET);
          console.log(`validate-studio-token: token renovado para tenant=${tenant.id} (source=${verified.source})`);
        } catch (e) {
          console.warn('validate-studio-token: falha ao renovar token:', e?.message);
        }
      }
    }

    return json({
      valid: true,
      tenant: {
        id: tenant.id,
        nome_estudio: tenant.nome_estudio,
        nome: tenant.nome,
        plano: tenant.plano,
        email: tenant.email,
        evo_instance: tenant.evo_instance,
        welcome_shown: !!tenant.welcome_shown,
        ativo: !!tenant.ativo,
        // [v5 agente IA] campos pra aba "Agente & Preços" pre-popular os forms
        nome_agente: tenant.nome_agente || null,
        faq_texto: tenant.faq_texto || null,
        config_agente: tenant.config_agente || null,
        config_precificacao: tenant.config_precificacao || null,
        horario_funcionamento: tenant.horario_funcionamento || null,
        duracao_sessao_padrao_h: tenant.duracao_sessao_padrao_h || null,
        sinal_percentual: tenant.sinal_percentual || null,
        gatilhos_handoff: tenant.gatilhos_handoff || null,
        portfolio_urls: tenant.portfolio_urls || null,
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
      token_exp: verified.exp || null,
      refreshed_token: refreshedToken,
    });

  } catch (err) {
    console.error('validate-studio-token:', err);
    return json({ valid: false, error: 'Erro interno' }, 500);
  }
}
