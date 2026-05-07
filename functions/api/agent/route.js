// POST /api/agent/route — entry standalone do PoC TattooAgent (Sub-1).
//
// Body: { tenant_id, telefone, mensagem, estado_atual, dados_acumulados, historico, tenant?, conversa?, clientContext? }
// Response 200: { ok, resposta_cliente, estado_novo, dados_persistidos, proxima_acao, agent_usado }
// Response 400: body invalido
// Response 501: estado_atual nao implementado (cadastro/proposta/portfolio = Sub-2)
// Response 503: OPENAI_API_KEY ausente no env
// Response 500: erro interno (run() falhou)
//
// Sub-1: estado conversacional vem no payload (in-memory). Sub-3 puxa de Supabase.
import { run } from '@openai/agents';
import { selectAgentBuilder, isStateImplemented } from './router.js';
import { validateEnv } from './_lib/sdk-init.js';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method-not-allowed' }, 405);
  }

  const envCheck = validateEnv(env);
  if (!envCheck.ok) {
    return json({ ok: false, error: 'env-incomplete', missing: envCheck.missing }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'body-invalido' }, 400);
  }

  const tenant_id = String(body?.tenant_id || '').trim();
  const telefone = String(body?.telefone || '').trim();
  const mensagem = String(body?.mensagem || '').trim();
  const estado_atual = String(body?.estado_atual || '').trim();
  const dados_acumulados = body?.dados_acumulados || {};
  const historico = Array.isArray(body?.historico) ? body.historico : [];

  if (!tenant_id || !telefone) {
    return json({ ok: false, error: 'tenant_id e telefone obrigatorios' }, 400);
  }

  if (!isStateImplemented(estado_atual)) {
    return json({
      ok: false,
      error: `estado_atual='${estado_atual}' nao implementado no Sub-1 (sera Sub-2)`,
    }, 501);
  }

  const builder = selectAgentBuilder(estado_atual);

  // Stub tenant/conversa — Sub-1 recebe mock no payload em vez de puxar Supabase.
  // Sub-3 substitui por fetch real.
  const tenant = body?.tenant || { id: tenant_id, nome_estudio: 'Stub', config_agente: {}, gatilhos_handoff: [], faqs: [], fewshots: [] };
  const conversa = body?.conversa || { id: 'stub', telefone, estado_agente: estado_atual, dados_coletados: dados_acumulados, dados_cadastro: {} };
  const clientContext = body?.clientContext || {};

  const agent = builder({ env, tenant, conversa, clientContext });

  // Constroi messages do historico + mensagem atual.
  const messages = [
    ...historico.map(h => ({ role: h.role || 'user', content: h.content || '' })),
    { role: 'user', content: mensagem },
  ];

  let result;
  try {
    result = await run(agent, messages);
  } catch (e) {
    return json({ ok: false, error: 'agent-run-failed', detail: String(e?.message || e) }, 500);
  }

  const out = result.finalOutput;
  return json({
    ok: true,
    resposta_cliente: out.resposta_cliente,
    estado_novo: out.proxima_acao === 'handoff' ? 'cadastro' : estado_atual,
    dados_persistidos: out.dados_persistidos,
    dados_completos: out.dados_completos,
    campos_faltando: out.campos_faltando,
    campos_conflitantes: out.campos_conflitantes,
    proxima_acao: out.proxima_acao,
    agent_usado: 'tattoo',
  }, 200);
}
