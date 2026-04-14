// ── InkFlow — Solicita novo link do painel de estúdio (magic link reset) ──
// POST /api/request-studio-link
// Body: { email?: string, phone?: string } (um dos dois obrigatório)
// Resposta: { ok: true, channels_tried: ['whatsapp','email'] } — SEMPRE 200
//
// Segurança:
// - Sempre retorna 200 (não indica se email/telefone existe ou não)
// - Rate limit: TODO — implementar via KV ou coluna last_recovery_at
// - Token gerado é HMAC com TTL 30d (mesmo que flow normal)

import { generateStudioToken } from './_auth-helpers.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const MAILERLITE_GROUP_ID = '184440232841578230';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function normalizePhoneBR(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return digits;
}

async function findTenantByEmailOrPhone({ supabaseUrl, supabaseKey, email, phone }) {
  // Busca tenant ativo de plano elegível, por email OU por telefone (em ordem de preferência)
  const tryFetch = async (filter) => {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/tenants?${filter}&plano=in.(estudio,premium)&select=id,email,telefone,nome,nome_estudio,plano&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  };

  if (email) {
    const t = await tryFetch(`email=eq.${encodeURIComponent(email.toLowerCase())}`);
    if (t) return t;
  }
  if (phone) {
    const t = await tryFetch(`telefone=eq.${encodeURIComponent(phone)}`);
    if (t) return t;
  }
  return null;
}

async function sendViaWhatsApp({ env, tenant, token }) {
  const EVO_BASE_URL = env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';
  const CENTRAL = env.EVO_CENTRAL_INSTANCE;
  const CENTRAL_KEY = env.EVO_CENTRAL_APIKEY || env.EVO_GLOBAL_KEY;
  if (!CENTRAL || !CENTRAL_KEY) return { sent: false, reason: 'central-not-configured' };
  const phone = normalizePhoneBR(tenant.telefone);
  if (!phone) return { sent: false, reason: 'no-phone' };
  const firstName = (tenant.nome || '').split(' ')[0] || 'Tatuador';
  const link = `https://inkflowbrasil.com/studio.html?token=${token}`;
  const text =
    `Opa, ${firstName}! 🔐\n\n` +
    `Novo link de acesso ao painel do estúdio *${tenant.nome_estudio || 'seu estúdio'}*:\n\n` +
    `${link}\n\n` +
    `Válido por 30 dias. Não compartilhe.`;
  try {
    const r = await fetch(
      `${EVO_BASE_URL}/message/sendText/${encodeURIComponent(CENTRAL)}`,
      {
        method: 'POST',
        headers: { apikey: CENTRAL_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone, text }),
      }
    );
    return { sent: r.ok, status: r.status };
  } catch (e) {
    console.error('request-studio-link: WA send error:', e?.message);
    return { sent: false, reason: 'network' };
  }
}

async function sendViaEmail({ env, tenant, token }) {
  const ML_KEY = env.MAILERLITE_API_KEY;
  if (!ML_KEY || !tenant.email) return { sent: false, reason: 'no-mailerlite-or-email' };
  const link = `https://inkflowbrasil.com/studio.html?token=${token}`;
  const planLabel = tenant.plano === 'premium' ? 'Estúdio VIP' : 'Estúdio';
  const maxSlots = tenant.plano === 'premium' ? 9 : 4;
  try {
    const r = await fetch(
      `https://connect.mailerlite.com/api/subscribers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ML_KEY}` },
        body: JSON.stringify({
          email: tenant.email,
          fields: {
            name: tenant.nome || '',
            nome_estudio: tenant.nome_estudio || '',
            plano: planLabel,
            studio_link: link,
            max_artistas: maxSlots,
          },
          groups: [MAILERLITE_GROUP_ID],
          status: 'active',
        }),
      }
    );
    return { sent: r.ok, status: r.status };
  } catch (e) {
    console.error('request-studio-link: email send error:', e?.message);
    return { sent: false, reason: 'network' };
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  let { email, phone } = body || {};
  email = (email || '').toString().trim().toLowerCase();
  phone = normalizePhoneBR(phone || '');

  // Valida formato básico — retorna 400 apenas se ambos estão claramente inválidos
  const emailValid = email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!emailValid && !phone) {
    return json({ error: 'Informe email ou telefone válido' }, 400);
  }

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const TOKEN_SECRET = env.STUDIO_TOKEN_SECRET;
  if (!SB_KEY || !TOKEN_SECRET) return json({ error: 'Configuração interna ausente' }, 503);

  // Sempre retorna estrutura consistente — não vazamos se tenant existe
  const channels_tried = [];
  try {
    const tenant = await findTenantByEmailOrPhone({
      supabaseUrl: SUPABASE_URL, supabaseKey: SB_KEY,
      email: emailValid ? email : null, phone,
    });

    if (tenant) {
      // Gera token HMAC novo (TTL 30d)
      const token = await generateStudioToken(tenant.id, TOKEN_SECRET);

      // Envia via WhatsApp (preferencial)
      const waResult = await sendViaWhatsApp({ env, tenant, token });
      console.log(`[request-studio-link] tenant=${tenant.id} wa=${JSON.stringify(waResult)}`);
      if (waResult.sent) channels_tried.push('whatsapp');

      // Envia via email (backup — mesmo que WA tenha dado certo, usuário pode preferir email)
      const emailResult = await sendViaEmail({ env, tenant, token });
      console.log(`[request-studio-link] tenant=${tenant.id} email=${JSON.stringify(emailResult)}`);
      if (emailResult.sent) channels_tried.push('email');
    } else {
      console.log(`[request-studio-link] no tenant found for email=${email ? '***' : '-'} phone=${phone ? '***' : '-'}`);
    }
  } catch (e) {
    console.error('request-studio-link exception:', e?.message);
  }

  // Sempre 200 — usuário recebe msg genérica no frontend
  return json({ ok: true, channels_tried });
}
