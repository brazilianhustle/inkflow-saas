const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CUIDADOS_TEMPLATE = `Oi {nome}! Aqui é o {agente} do {estudio}.
Espero que tenha curtido a sessão!

Alguns cuidados importantes pra sua tattoo ficar perfeita:
• Mantenha o filme por 2-4h, depois lave com água e sabão neutro
• Aplique pomada cicatrizante (Bepantol ou similar) 3x ao dia por 15 dias
• Não coce e não arranque casquinhas — deixe cair naturalmente
• Evite sol direto, piscina e mar por 30 dias
• Use roupas leves que não apertem a região

Qualquer dúvida sobre a cicatrização, é só me chamar!`;

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

  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const hoje = new Date().toISOString().split('T')[0];

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agendamentos?status=eq.confirmed&cuidados_enviados=eq.false&inicio=gte.${ontem}T00:00:00Z&inicio=lt.${hoje}T00:00:00Z&select=id,tenant_id,telefone,nome`,
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

    const msg = CUIDADOS_TEMPLATE
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
        { method: 'PATCH', headers: { ...sbHeaders(SB_KEY), Prefer: 'return=minimal' }, body: JSON.stringify({ cuidados_enviados: true }) }
      );
      enviados++;
    } catch (e) {
      console.error('cuidados-pos: erro envio', ag.id, e?.message);
    }
  }

  return new Response(JSON.stringify({ ok: true, enviados, total: agendamentos.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
