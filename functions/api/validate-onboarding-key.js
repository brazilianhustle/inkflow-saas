// ── InkFlow — Valida key de onboarding (server-side) ────────────────────────
// Verifica se a key existe na tabela onboarding_links, não expirou e não foi usada.
// POST /api/validate-onboarding-key
//
// Body: { key: "abc123" }
// Resposta sucesso: { valid: true, plano: "basic" }
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

  const { key } = body;

  if (!key || typeof key !== 'string' || key.length < 8) {
    return json({ valid: false, error: 'Key inválida' }, 400);
  }

  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ valid: false, error: 'Configuração interna ausente' }, 503);

  try {
    // Buscar a key na tabela onboarding_links (inclui campos de convite artista)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/onboarding_links?key=eq.${encodeURIComponent(key)}&select=id,key,plano,email,used,expires_at,parent_tenant_id,is_artist_invite`,
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

    // [FIX Bug #7 + Bug #2 Onboarding] Links de uso único COM retry inteligente
    // Se o link está marcado como usado, verifica se o tenant associado já completou
    // o onboarding (ativo=true). Se NÃO completou (ex: cartão recusado), permite retry.
    if (link.used) {
      // Verificar se existe tenant ativo com este email
      if (link.email) {
        try {
          const tenantCheck = await fetch(
            `${SUPABASE_URL}/rest/v1/tenants?email=eq.${encodeURIComponent(link.email)}&select=ativo&order=created_at.desc&limit=1`,
            {
              headers: {
                apikey: SB_KEY,
                Authorization: `Bearer ${SB_KEY}`,
              },
            }
          );
          if (tenantCheck.ok) {
            const tenants = await tenantCheck.json();
            const tenant = tenants[0];
            if (!tenant || tenant.ativo !== true) {
              // Tenant não existe ou não está ativo → permitir retry
              // Resetar flag used para estado limpo
              await fetch(
                `${SUPABASE_URL}/rest/v1/onboarding_links?id=eq.${link.id}`,
                {
                  method: 'PATCH',
                  headers: {
                    apikey: SB_KEY,
                    Authorization: `Bearer ${SB_KEY}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal',
                  },
                  body: JSON.stringify({ used: false }),
                }
              );
              console.log('validate-onboarding-key: link reativado para retry (tenant não ativo)');
              // Não retornar erro — continuar validação normalmente
            } else {
              // Tenant ESTÁ ativo → link realmente já foi usado com sucesso
              return json({ valid: false, error: 'Este link de onboarding já foi utilizado.' });
            }
          } else {
            // Falha na verificação → bloquear por segurança
            return json({ valid: false, error: 'Este link de onboarding já foi utilizado.' });
          }
        } catch (e) {
          console.warn('validate-onboarding-key: erro ao verificar tenant para retry:', e);
          // Em caso de erro, bloquear por segurança
          return json({ valid: false, error: 'Este link de onboarding já foi utilizado.' });
        }
      } else {
        // Link sem email → não consegue verificar tenant, bloquear
        return json({ valid: false, error: 'Este link de onboarding já foi utilizado.' });
      }
    }

    // Key válida — retornar plano associado + info de artista se aplicável
    const response = { valid: true, plano: link.plano, link_id: link.id };

    // Se for convite de artista, buscar google_calendar_id do tenant pai
    if (link.is_artist_invite && link.parent_tenant_id) {
      response.is_artist_invite = true;
      response.parent_tenant_id = link.parent_tenant_id;

      try {
        const parentRes = await fetch(
          `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(link.parent_tenant_id)}&select=google_calendar_id,nome_estudio,evo_base_url`,
          {
            headers: {
              apikey: SB_KEY,
              Authorization: `Bearer ${SB_KEY}`,
            },
          }
        );
        if (parentRes.ok) {
          const parents = await parentRes.json();
          if (parents && parents[0]) {
            response.parent_google_calendar_id = parents[0].google_calendar_id;
            response.parent_nome_estudio = parents[0].nome_estudio;
            response.parent_evo_base_url = parents[0].evo_base_url;
          }
        }
      } catch (e) {
        console.warn('validate-onboarding-key: erro ao buscar dados do tenant pai:', e);
        // Não bloqueia — artista pode prosseguir sem calendar
      }
    }

    console.log('validate-onboarding-key: key válida, plano:', link.plano, 'artista:', !!link.is_artist_invite);
    return json(response);

  } catch (err) {
    console.error('validate-onboarding-key exception:', err);
    return json({ valid: false, error: 'Erro interno' }, 500);
  }
}
