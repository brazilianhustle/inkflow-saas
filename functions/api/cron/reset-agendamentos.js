// ── InkFlow — Cron: reseta agendamentos expirados ────────────────────────────
// Migrado do n8n workflow "INKFLOW - Reset Agendamentos Expirados" em 2026-04-21.
// Dispatch: cron-worker externo (06:00 BRT diario). Auth: Bearer CRON_SECRET.
//
// Logica:
//   UPDATE dados_cliente SET agendamento_ativo=false
//   WHERE agendamento_ativo=true AND data_agendamento < today
//
// A query original fazia SELECT + loop + UPDATE individual. Supabase REST
// suporta PATCH com filtro direto — uma unica call faz tudo.

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!env.CRON_SECRET || token !== env.CRON_SECRET) {
    return json({ error: 'Não autorizado' }, 401);
  }

  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/dados_cliente?agendamento_ativo=eq.true&data_agendamento=lt.${today}&select=id`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ agendamento_ativo: false }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('reset-agendamentos: PATCH error:', err);
      return json({ error: 'Erro ao resetar agendamentos' }, 500);
    }

    const updated = await res.json();
    console.log(`reset-agendamentos: ${updated.length} agendamentos resetados (data < ${today})`);
    return json({ reset: updated.length, cutoff: today });
  } catch (err) {
    console.error('reset-agendamentos exception:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
