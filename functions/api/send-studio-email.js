// ── InkFlow — Dispara email de boas-vindas do estúdio via MailerLite ─────────
// Chamado pelo frontend após onboarding bem-sucedido de plano estudio/premium.
// Adiciona o subscriber ao grupo "Donos de Estúdio" no MailerLite com os campos
// customizados (studio_link, plano, etc.), o que dispara a automação de email.
//
// POST /api/send-studio-email
// Body: { tenant_id: "uuid" }
// Resposta: { success: true } ou { error: "..." }

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MAILERLITE_GROUP_ID = '184440232841578230'; // grupo "Donos de Estúdio"

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

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

  const { tenant_id } = body;
  if (!tenant_id) return json({ error: 'tenant_id é obrigatório' }, 400);

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const ML_KEY = env.MAILERLITE_API_KEY;

  if (!ML_KEY) {
    console.error('send-studio-email: MAILERLITE_API_KEY não configurada');
    return json({ success: true, email_sent: false, reason: 'MailerLite API key ausente' });
  }

  try {
    // ── 1. Buscar tenant com studio_token ──────────────────────────────────
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=id,nome_estudio,nome,email,plano,studio_token,ativo`,
      {
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
        },
      }
    );

    if (!res.ok) {
      console.error('send-studio-email: Supabase fetch error', res.status);
      return json({ error: 'Erro ao buscar dados do estúdio' }, 500);
    }

    const tenants = await res.json();
    if (!tenants || tenants.length === 0) {
      return json({ error: 'Estúdio não encontrado' }, 404);
    }

    const tenant = tenants[0];

    // Só envia para planos estudio/premium
    if (!['estudio', 'premium'].includes(tenant.plano)) {
      return json({ success: true, skipped: true, reason: 'Plano não elegível' });
    }

    if (!tenant.studio_token) {
      console.warn('send-studio-email: tenant sem studio_token, gerando...');
      const newToken = crypto.randomUUID();
      await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SB_KEY,
            Authorization: `Bearer ${SB_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ studio_token: newToken }),
        }
      );
      tenant.studio_token = newToken;
    }

    if (!tenant.email) {
      console.warn('send-studio-email: tenant sem email');
      return json({ success: true, skipped: true, reason: 'Sem email' });
    }

    // ── 2. Adicionar subscriber ao MailerLite com campos customizados ──────
    const studioLink = `https://inkflowbrasil.com/studio.html?token=${tenant.studio_token}`;
    const planLabel = tenant.plano === 'premium' ? 'Estúdio VIP' : 'Estúdio';
    const maxSlots = tenant.plano === 'premium' ? 9 : 4;

    const mlRes = await fetch(
      `https://connect.mailerlite.com/api/subscribers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ML_KEY}`,
        },
        body: JSON.stringify({
          email: tenant.email,
          fields: {
            name: tenant.nome || '',
            nome_estudio: tenant.nome_estudio || '',
            plano: planLabel,
            studio_link: studioLink,
            max_artistas: maxSlots,
          },
          groups: [MAILERLITE_GROUP_ID],
          status: 'active',
        }),
      }
    );

    if (!mlRes.ok) {
      const mlErr = await mlRes.text().catch(() => 'unknown');
      console.error('send-studio-email: MailerLite API failed:', mlRes.status, mlErr);
      return json({ success: true, email_sent: false, reason: 'MailerLite falhou' });
    }

    console.log(`send-studio-email: subscriber adicionado ao MailerLite — ${tenant.email} (${tenant.plano})`);
    return json({ success: true, email_sent: true });

  } catch (err) {
    console.error('send-studio-email:', err);
    return json({ success: true, email_sent: false, reason: err.message });
  }
}
