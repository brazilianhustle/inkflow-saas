// ── InkFlow — Envia link do painel de estúdio via WhatsApp (Evolution API) ──
// POST /api/send-whatsapp-link
// Body: { tenant_id, onboarding_key }
// Resposta: { ok: true, sent: boolean, reason?: string }
//
// Usa uma instância "central" do InkFlow (configurada via env) para mandar uma
// mensagem de texto pro WhatsApp do dono com o link do painel. Backup ao email
// do MailerLite — útil quando email cai no spam ou cliente erra o endereço.
//
// Env vars necessárias:
//   EVO_BASE_URL               — base da API (já existente)
//   EVO_CENTRAL_INSTANCE       — nome da instância central (ex: "inkflow_central")
//   EVO_CENTRAL_APIKEY         — apikey da instância central (recomendado)
//     OU
//   EVO_GLOBAL_KEY             — fallback (usa global key pra autenticar)
//   STUDIO_TOKEN_SECRET        — pra gerar o token HMAC
//
// Se EVO_CENTRAL_INSTANCE não estiver definido, retorna { sent: false } sem erro.

import { generateStudioToken, verifyOnboardingKey } from './_auth-helpers.js';

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

function normalizePhoneBR(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10) return null;
  // Adiciona prefixo 55 (Brasil) se não tiver
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  // Remove 9 extra (formato novo celular já fica com 11 dígitos, mas as vezes vira 12 com 55+11)
  return digits;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const { tenant_id, onboarding_key } = body;
  if (!tenant_id || !onboarding_key) {
    return json({ error: 'tenant_id e onboarding_key obrigatórios' }, 400);
  }

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const TOKEN_SECRET = env.STUDIO_TOKEN_SECRET;
  const EVO_BASE_URL = env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com';
  const CENTRAL_INSTANCE = env.EVO_CENTRAL_INSTANCE;
  const CENTRAL_APIKEY = env.EVO_CENTRAL_APIKEY || env.EVO_GLOBAL_KEY;

  if (!SB_KEY || !TOKEN_SECRET) return json({ error: 'Configuração interna ausente' }, 503);

  // Se não há instância central configurada, retorna sem erro (não bloqueia o fluxo)
  if (!CENTRAL_INSTANCE || !CENTRAL_APIKEY) {
    console.warn('send-whatsapp-link: EVO_CENTRAL_INSTANCE/EVO_CENTRAL_APIKEY não configuradas — skip');
    return json({ ok: true, sent: false, reason: 'central-instance-not-configured' });
  }

  // Auth via onboarding_key
  const ownership = await verifyOnboardingKey({
    tenantId: tenant_id,
    onboardingKey: onboarding_key,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SB_KEY,
  });
  if (!ownership.ok) {
    return json({ error: 'Autenticação falhou' }, 403);
  }

  // Buscar tenant info
  let tenant;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=telefone,nome,nome_estudio,plano,ativo`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!r.ok) return json({ error: 'Erro ao buscar tenant' }, 500);
    const rows = await r.json();
    tenant = rows?.[0];
    if (!tenant) return json({ error: 'Tenant não encontrado' }, 404);
  } catch (e) {
    console.error('send-whatsapp-link: lookup error:', e?.message);
    return json({ error: 'Erro interno' }, 500);
  }

  if (!['estudio', 'premium'].includes(tenant.plano)) {
    return json({ ok: true, sent: false, reason: 'plan-not-eligible' });
  }

  const phone = normalizePhoneBR(tenant.telefone);
  if (!phone) {
    console.warn(`send-whatsapp-link: tenant ${tenant_id} sem telefone válido`);
    return json({ ok: true, sent: false, reason: 'invalid-phone' });
  }

  // Gerar token + link
  let token;
  try {
    token = await generateStudioToken(tenant_id, TOKEN_SECRET);
  } catch (e) {
    console.error('send-whatsapp-link: token generation failed:', e?.message);
    return json({ error: 'Falha ao gerar token' }, 500);
  }

  const link = `https://inkflowbrasil.com/studio.html?token=${token}&welcome=true`;
  const firstName = (tenant.nome || '').split(' ')[0] || 'Tatuador';
  const text =
    `Opa, ${firstName}! 🎨\n\n` +
    `Seu InkFlow está pronto. Acesse o painel do estúdio *${tenant.nome_estudio || 'seu estúdio'}* aqui:\n\n` +
    `${link}\n\n` +
    `No painel você conecta o WhatsApp do estúdio, convida artistas e gerencia tudo.\n\n` +
    `Esse link é pessoal — não compartilhe.`;

  // Enviar via Evolution API — POST /message/sendText/{instance}
  try {
    const sendRes = await fetch(
      `${EVO_BASE_URL}/message/sendText/${encodeURIComponent(CENTRAL_INSTANCE)}`,
      {
        method: 'POST',
        headers: { apikey: CENTRAL_APIKEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone, text }),
      }
    );
    const sendTxt = await sendRes.text().catch(() => '');
    console.log(`[send-whatsapp-link] status=${sendRes.status} phone=${phone} resp=${sendTxt.slice(0, 200)}`);
    if (!sendRes.ok) {
      return json({ ok: true, sent: false, reason: 'evolution-error', status: sendRes.status });
    }
    return json({ ok: true, sent: true });
  } catch (e) {
    console.error('send-whatsapp-link: send error:', e?.message);
    return json({ ok: true, sent: false, reason: 'network-error' });
  }
}
