const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const FOLLOWUP_TEMPLATE = `Oi {nome}! Tudo bem? Aqui é o {agente} do {estudio}.

Já faz uma semana da sua sessão! Como está ficando a tattoo?
Se puder mandar uma foto da cicatrização, ajuda muito o tatuador acompanhar o resultado.

Se precisar de retoque, é só me avisar que agendo pra você!`;

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export async function onRequest(context) {
  const { request, env } = context;

  const secret = request.headers.get('X-Cron-Secret');
  if (secret !== env.CRON_SECRET && secret !== env.INKFLOW_TOOL_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const SB_KEY = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_KEY) return new Response('missing key', { status: 503 });

  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const seisDiasAtras = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agendamentos?status=eq.confirmed&followup_enviado=eq.false&inicio=gte.${seteDiasAtras}T00:00:00Z&inicio=lt.${seisDiasAtras}T00:00:00Z&select=id,tenant_id,telefone,nome`,
    { headers: sbHeaders(SB_KEY) }
  );

  if (!res.ok) return new Response('erro busca', { status: 500 });
  const agendamentos = await res.json();

  let enviados = 0;

  for (const ag of agendamentos) {
    const tenantRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(ag.tenant_id)}&select=nome_agente,nome_estudio,evo_instance,evo_base_url,evo_apikey`,
      { headers: sbHeaders(SB_KEY) }
    );
    if (!tenantRes.ok) continue;
    const tenants = await tenantRes.json();
    const t = tenants[0];
    if (!t?.evo_instance) continue;

    const msg = FOLLOWUP_TEMPLATE
      .replace('{nome}', ag.nome || 'cliente')
      .replace('{agente}', t.nome_agente || 'assistente')
      .replace('{estudio}', t.nome_estudio || 'estúdio');

    const evoBase = t.evo_base_url || 'https://evo.inkflowbrasil.com';
    try {
      await fetch(`${evoBase}/message/sendText/${encodeURIComponent(t.evo_instance)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: t.evo_apikey || env.EVO_GLOBAL_KEY || '' },
        body: JSON.stringify({ number: ag.telefone, text: msg }),
      });

      await fetch(
        `${SUPABASE_URL}/rest/v1/agendamentos?id=eq.${ag.id}`,
        { method: 'PATCH', headers: { ...sbHeaders(SB_KEY), Prefer: 'return=minimal' }, body: JSON.stringify({ followup_enviado: true }) }
      );
      enviados++;
    } catch (e) {
      console.error('followup: erro envio', ag.id, e?.message);
    }
  }

  return new Response(JSON.stringify({ ok: true, enviados, total: agendamentos.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
