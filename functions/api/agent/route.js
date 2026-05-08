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
import { validateTattooOutputInvariant } from './agents/tattoo.js';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

// Transforma item do historico no shape que @openai/agents espera.
// Assistant items requerem content como array tipado + status. User items aceitam string.
function normalizeHistoryItem(h) {
  const role = h?.role || 'user';
  const content = h?.content ?? '';
  if (role === 'assistant') {
    return {
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: String(content) }],
    };
  }
  return { role: 'user', content: String(content) };
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS });
  }

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
  // Historico: items com role=assistant precisam shape tipado (SDK valida via Zod).
  const messages = [
    ...historico.map(normalizeHistoryItem),
    { role: 'user', content: mensagem },
  ];

  let result;
  try {
    // maxTurns 20: default 10 aperta cenarios multi-turn com tools.
    result = await run(agent, messages, { maxTurns: 20 });
  } catch (e) {
    // Detail intencionalmente generico — evita info-leak do SDK/OpenAI errors.
    // Logs server-side carregam o detalhe completo.
    console.error('[agent/route] run() failed:', e);
    return json({ ok: false, error: 'agent-run-failed' }, 500);
  }

  // finalOutput pode ser undefined (max turns, refusal, schema violation).
  // Sem guard, acesso a out.resposta_cliente joga TypeError fora do try/catch.
  const out = result?.finalOutput;
  if (!out) {
    console.error('[agent/route] no finalOutput', { result });
    return json({ ok: false, error: 'no-final-output' }, 500);
  }

  // Invariante handoff (movida pra ca apos remover .refine() do schema —
  // SDK so suporta ZodObject puro como outputType, .refine() vira ZodEffects).
  const invariantCheck = validateTattooOutputInvariant(out);
  if (!invariantCheck.valid) {
    console.error('[agent/route] invariant violation:', invariantCheck.reason, out);
    return json({ ok: false, error: 'invariant-violation', reason: invariantCheck.reason }, 500);
  }

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
