// ── Tool — prompt ──────────────────────────────────────────────────────────
// GET ou POST /api/tools/prompt
// Headers: X-Inkflow-Tool-Secret
// Query/Body: { tenant_id, telefone }
// Retorna o system prompt montado + estado atual da conversa.
// O n8n chama este endpoint antes do agent, substituindo prompt_sistema cru.

import { withTool, supaFetch, authTool, toolJson, TOOL_HEADERS, logToolCall } from './_tool-helpers.js';
import { generateSystemPrompt } from '../../_lib/prompts/index.js';

const TENANT_FIELDS = [
  'id', 'nome_agente', 'nome_estudio', 'plano',
  'prompt_sistema', 'faq_texto',
  'config_precificacao', 'config_agente',
  'horario_funcionamento', 'duracao_sessao_padrao_h',
  'sinal_percentual', 'gatilhos_handoff',
  'portfolio_urls',
].join(',');

async function loadContext(env, tenant_id, telefone) {
  const [tr, cr, ar] = await Promise.all([
    supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=${TENANT_FIELDS}`),
    telefone
      ? supaFetch(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&select=id,estado,dados_coletados,slot_expira_em`)
      : Promise.resolve(null),
    telefone
      ? supaFetch(env, `/rest/v1/agendamentos?tenant_id=eq.${encodeURIComponent(tenant_id)}&cliente_telefone=eq.${encodeURIComponent(telefone)}&status=in.(confirmed,done)&select=id,cliente_nome,status&order=created_at.desc&limit=5`)
      : Promise.resolve(null),
  ]);
  if (!tr.ok) throw new Error(`tenant-db-error-${tr.status}`);
  const tenants = await tr.json();
  if (!Array.isArray(tenants) || tenants.length === 0) return { tenant: null };
  const tenant = tenants[0];

  let conversa = null;
  if (cr && cr.ok) {
    const rows = await cr.json();
    if (Array.isArray(rows) && rows.length > 0) conversa = rows[0];
  }

  let agendamentos_passados = [];
  if (ar && ar.ok) {
    const rows = await ar.json();
    if (Array.isArray(rows)) agendamentos_passados = rows;
  }

  // Monta contexto do cliente pro prompt
  const is_first_contact = !conversa && agendamentos_passados.length === 0;
  const nome_cliente = conversa?.dados_coletados?.nome
    || agendamentos_passados[0]?.cliente_nome
    || null;

  const clientContext = {
    is_first_contact,
    eh_recorrente: agendamentos_passados.length > 0,
    total_sessoes: agendamentos_passados.length,
    nome_cliente,
  };

  return { tenant, conversa, clientContext };
}

async function handle({ env, input }) {
  const { tenant_id, telefone } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };

  const { tenant, conversa, clientContext } = await loadContext(env, tenant_id, telefone);
  if (!tenant) return { status: 404, body: { ok: false, error: 'tenant-nao-encontrado' } };

  const prompt = generateSystemPrompt(tenant, conversa, clientContext);
  return {
    status: 200,
    body: {
      ok: true,
      prompt,
      estado: conversa?.estado || 'qualificando',
      conversa_id: conversa?.id || null,
      cliente: clientContext,
      tenant: {
        nome_estudio: tenant.nome_estudio,
        nome_agente: tenant.nome_agente,
      },
    },
  };
}

// Suporta GET (mais conveniente pro n8n) e POST.
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: TOOL_HEADERS });

  const auth = authTool(request, env);
  if (!auth.ok) return toolJson({ ok: false, error: auth.reason }, 401);

  let input = {};
  if (request.method === 'GET') {
    const url = new URL(request.url);
    input.tenant_id = url.searchParams.get('tenant_id');
    input.telefone = url.searchParams.get('telefone');
  } else if (request.method === 'POST') {
    try { input = await request.json(); }
    catch { return toolJson({ ok: false, error: 'invalid-json' }, 400); }
  } else {
    return toolJson({ ok: false, error: 'method-not-allowed' }, 405);
  }

  const t0 = Date.now();
  let res, erro = null, sucesso = false;
  try {
    res = await handle({ env, input });
    sucesso = (res?.status ?? 200) < 400;
  } catch (e) {
    erro = String(e?.message || e);
    res = { status: 500, body: { ok: false, error: 'internal', detail: erro } };
  }
  const latency_ms = Date.now() - t0;

  context.waitUntil(logToolCall(env, {
    tenant_id: input?.tenant_id,
    telefone: input?.telefone,
    tool: 'prompt',
    input,
    output: res.body,
    sucesso,
    latency_ms,
    erro,
  }));

  return toolJson(res.body, res.status || 200);
}
