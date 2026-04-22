// ── InkFlow — Cron: monitor WhatsApp (2-strike rule + alertas Telegram) ──────
// Migrado do n8n workflow "InkFlow - Monitor WhatsApp" em 2026-04-21.
// Dispatch: cron-worker externo a cada 30min. Auth: Bearer CRON_SECRET.
//
// Logica:
//   1. SELECT tenants ativos
//   2. Pra cada: GET {evo_base_url}/instance/connectionState/{evo_instance}
//   3. Regra 2-strikes: so considera "desconectado" se falhar 2 checks seguidos
//      (tolera flap transitorio). Campos rastreados em tenants:
//      whatsapp_status, whatsapp_check_fails, whatsapp_status_changed_at
//   4. Telegram alert em: (a) novo outage confirmado (fails==THRESHOLD),
//      (b) recuperacao apos outage, (c) relatorio diario 8h/18h BRT
//   5. Persiste novo status no Supabase via PATCH individual

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const FAIL_THRESHOLD = 2;

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn('monitor-whatsapp: TELEGRAM_* ausente, alerta nao enviado');
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
    if (!res.ok) console.error('monitor-whatsapp: Telegram error:', await res.text());
  } catch (e) {
    console.error('monitor-whatsapp: Telegram exception:', e.message);
  }
}

async function checkEvoInstance(t) {
  try {
    const res = await fetch(
      `${t.evo_base_url}/instance/connectionState/${encodeURIComponent(t.evo_instance)}`,
      { headers: { apikey: t.evo_apikey }, signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.instance?.state || data?.state || null;
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
    return json({ error: 'Não autorizado' }, 401);
  }

  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

  // 1. Buscar tenants ativos
  const tenantsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/tenants?ativo=eq.true&evo_instance=not.is.null&select=id,nome_estudio,evo_instance,evo_base_url,evo_apikey,whatsapp_status,whatsapp_check_fails,whatsapp_status_changed_at`,
    { headers: sbHeaders },
  );
  if (!tenantsRes.ok) {
    return json({ error: 'Erro ao buscar tenants' }, 500);
  }
  const tenants = await tenantsRes.json();
  if (!Array.isArray(tenants) || tenants.length === 0) {
    return json({ tenants_checked: 0, alerts_sent: 0, message: 'Nenhum tenant ativo' });
  }

  // 2. Checar Evolution + rodar regra 2-strikes
  const alerts = [];
  const updates = [];
  const statusTenants = [];
  const nowIso = new Date().toISOString();

  await Promise.all(
    tenants.map(async (t) => {
      const currentState = await checkEvoInstance(t);
      const isConnected = currentState === 'open';
      const prevStatus = t.whatsapp_status || 'unknown';
      const prevFails = Number(t.whatsapp_check_fails) || 0;
      const prevChangedAt = t.whatsapp_status_changed_at;
      const nome = t.nome_estudio || 'Sem nome';

      let newStatus, newFails, statusChangedAt, alert;

      if (isConnected) {
        newStatus = 'open';
        newFails = 0;
        if (prevFails >= FAIL_THRESHOLD) {
          const durMin = prevChangedAt
            ? Math.round((Date.now() - new Date(prevChangedAt).getTime()) / 60000)
            : null;
          alert = { nome, type: 'RECUPERADO', duration_min: durMin };
          statusChangedAt = nowIso;
        } else {
          statusChangedAt = prevStatus === 'open' && prevChangedAt ? prevChangedAt : nowIso;
        }
      } else {
        newStatus = currentState || 'erro';
        newFails = prevFails + 1;
        if (prevFails < FAIL_THRESHOLD && newFails >= FAIL_THRESHOLD) {
          alert = { nome, type: 'DESCONECTADO', new_status: newStatus };
          statusChangedAt = nowIso;
        } else {
          statusChangedAt = prevChangedAt || nowIso;
        }
      }

      statusTenants.push({ nome, status: newStatus });
      updates.push({
        id: t.id,
        whatsapp_status: newStatus,
        whatsapp_check_fails: newFails,
        whatsapp_status_changed_at: statusChangedAt,
      });
      if (alert) alerts.push(alert);
    }),
  );

  // 3. Montar mensagem Telegram
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = parseInt(
    new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }),
    10,
  );

  let text = '';
  if (alerts.length > 0) {
    text = `🔔 MONITOR INKFLOW — ${agora}\n\n`;
    for (const a of alerts) {
      if (a.type === 'RECUPERADO') {
        const durTxt = a.duration_min ? ` (offline por ${a.duration_min}min)` : '';
        text += `✅ ${a.nome} reconectou${durTxt}\n`;
      } else {
        text += `❌ ${a.nome} desconectado (${a.new_status})\n`;
      }
    }
    text += `\n⏱ Confirmado apos ${FAIL_THRESHOLD} checks consecutivos.`;
  } else if (hora === 8 || hora === 18) {
    const todosOk = statusTenants.every((t) => t.status === 'open');
    text = `📊 RELATORIO DIARIO — ${agora}\n\n`;
    text += todosOk ? '✅ Todos conectados:\n\n' : '⚠️ Status atual:\n\n';
    for (const t of statusTenants) {
      text += `${t.status === 'open' ? '✅' : '❌'} ${t.nome}: ${t.status}\n`;
    }
  }

  if (text) {
    await sendTelegram(env, text);
  }

  // 4. Persistir novos status (PATCH individual — PostgREST nao suporta bulk)
  await Promise.all(
    updates.map((u) =>
      fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${u.id}`, {
        method: 'PATCH',
        headers: {
          ...sbHeaders,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          whatsapp_status: u.whatsapp_status,
          whatsapp_check_fails: u.whatsapp_check_fails,
          whatsapp_status_changed_at: u.whatsapp_status_changed_at,
        }),
      }).catch((e) => console.warn(`monitor-whatsapp: falha ao salvar status de ${u.id}:`, e.message)),
    ),
  );

  console.log(
    `monitor-whatsapp: ${tenants.length} tenants checados, ${alerts.length} alertas, daily_report=${Boolean(text && text.includes('RELATORIO'))}`,
  );

  return json({
    tenants_checked: tenants.length,
    alerts_sent: alerts.length,
    has_daily_report: Boolean(text && text.includes('RELATORIO')),
    timestamp: agora,
  });
}
