// POST /api/agent/route — entry standalone do PoC TattooAgent (Sub-1).
//
// Body: { tenant_id, telefone, mensagem, estado_atual, dados_acumulados, historico, tenant?, conversa?, clientContext? }
// Response 200: { ok, resposta_cliente, estado_novo, dados_persistidos, proxima_acao, agent_usado }
// Response 400: body invalido
// Response 501: estado_atual nao implementado (proposta/portfolio = Sub-3.2/Sub-3.3)
// Response 503: OPENAI_API_KEY ausente no env
// Response 500: erro interno (run() falhou)
//
// Sub-1: estado conversacional vem no payload (in-memory). Sub-3 puxa de Supabase.
// Sub-4.1: logica do agent extraida pra runAgent({...}) — onRequest vira wrapper HTTP fino.
// Pipeline WhatsApp (whatsapp-pipeline.js) chama runAgent direto sem HTTP.
import { run } from '@openai/agents';
import { setDefaultOpenAIKey } from '@openai/agents-openai';
import { selectAgentBuilder, isStateImplemented, getNextState } from './router.js';
import { validateEnv } from './_lib/sdk-init.js';
import { enforceMenorIdade } from './_lib/enforce-menor-idade.js';
import { prefetchPropostaContext } from './_lib/prefetch-proposta.js';
import { prefetchPortfolio } from './_lib/prefetch-portfolio.js';
import { callTool } from './_lib/call-tool.js';
import { calcularValorSinal } from './_lib/calcular-sinal.js';
import { formatLinkSinalMessage } from './_lib/format-link-sinal-msg.js';
import { logAgentTurn } from '../../_lib/telemetry/agent-turn-logger.js';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Substates do Proposta agent (Sub-3.2) — definidos no module-level pra
// reuso em runAgent + (futuro) outros call-sites.
const PROPOSTA_SUBSTATES = new Set(['propondo_valor', 'escolhendo_horario', 'aguardando_sinal']);

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

// runAgent — funcao pura-ish exportavel que executa o agent loop + invariants
// + side-effects, sem dependencias HTTP. Chamada por:
//   - onRequest (HTTP wrapper, retro-compat)
//   - whatsapp-pipeline.js (Sub-4.1, sem HTTP)
//
// Args:
//   env, tenant_id, telefone, mensagem, estado_atual, dados_acumulados, historico,
//   tenant (resolvido), conversa (resolvido), clientContext (bare; runAgent merge prefetch)
//
// Return success: { ok: true, resposta_cliente, estado_novo, dados_persistidos,
//   dados_completos, campos_faltando, campos_conflitantes, proxima_acao, agent_usado,
//   side_effects?, urls_portfolio }
// Return failure: { ok: false, error, status, reason? }
//   - estado nao implementado: status 501
//   - run() throw: error 'agent-run-failed', status 500
//   - sem finalOutput: error 'no-final-output', status 500
//   - invariant violation hard-fail: error 'invariant-violation', reason, status 500
// Mapeia estado_atual -> agent_name canonico pra telemetria (Pilar 3).
function inferAgentName(estado) {
  if (estado === 'tattoo') return 'tattoo';
  if (estado === 'cadastro') return 'cadastro';
  if (PROPOSTA_SUBSTATES.has(estado)) return 'proposta';
  return estado;
}

export async function runAgent({
  env,
  ctx,
  tenant_id,
  telefone,
  mensagem,
  estado_atual,
  dados_acumulados,
  historico,
  tenant,
  conversa,
  clientContext,
}) {
  if (!isStateImplemented(estado_atual)) {
    return {
      ok: false,
      error: `estado_atual='${estado_atual}' nao implementado no Sub-1 (sera Sub-2)`,
      status: 501,
    };
  }

  const t0 = Date.now();
  const builder = selectAgentBuilder(estado_atual);

  // Set definido tambem mais abaixo no orchestrator — declarado em escopo
  // mais alto pra reuso. Subsumir o `const clientContext = body?.clientContext || {};`
  // existente.
  let mergedClientContext = clientContext || {};
  // Sub-3.3: pre-fetch portfolio_disponivel para QUALQUER agent (transversal)
  const portfolioCtx = await prefetchPortfolio(env, tenant);
  mergedClientContext = { ...mergedClientContext, ...portfolioCtx };
  if (PROPOSTA_SUBSTATES.has(estado_atual)) {
    const prefetched = await prefetchPropostaContext({
      env, tenant, conversa, telefone, estado_atual,
    });
    mergedClientContext = { ...mergedClientContext, ...prefetched };
  }

  const { agent, validator } = builder({ env, tenant, conversa, clientContext: mergedClientContext, estado_atual });

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
    return { ok: false, error: 'agent-run-failed', status: 500 };
  }

  // finalOutput pode ser undefined (max turns, refusal, schema violation).
  // Sem guard, acesso a out.resposta_cliente joga TypeError fora do try/catch.
  const out = result?.finalOutput;
  if (!out) {
    console.error('[agent/route] no finalOutput', { result });
    return { ok: false, error: 'no-final-output', status: 500 };
  }

  // Validator vem do builder (closure pattern Sub-3.2).
  let working = out;
  const invariantCheck = validator(working);

  if (!invariantCheck.valid) {
    if (estado_atual === 'cadastro' && invariantCheck.reason?.startsWith('data_nascimento nao-ISO')) {
      // Caso especial Sub-3.1: data_nascimento mal-formatada — silently force
      // pergunta. Agente reformula no proximo turno.
      console.warn('[agent/route] silently force pergunta (data_nascimento nao-ISO):', invariantCheck.reason);
      working = {
        ...working,
        dados_persistidos: { ...(working.dados_persistidos || {}), data_nascimento: null },
        dados_completos: false,
        campos_faltando: Array.from(new Set([...(working.campos_faltando || []), 'data_nascimento'])),
        proxima_acao: 'pergunta',
        resposta_cliente: 'Nao consegui ler a data — pode mandar tipo 12/03/1995?',
      };
    } else if (PROPOSTA_SUBSTATES.has(estado_atual) && /(nao-ISO|fora da lista)/.test(invariantCheck.reason || '')) {
      // Caso especial Sub-3.2: slot mal-formatado ou inexistente — silently
      // force pergunta com lista atualizada de slots.
      console.warn('[agent/route] silently force pergunta (slot invalido):', invariantCheck.reason);
      const slots = mergedClientContext.horarios_livres || [];
      const legendas = slots.map(s => s.legenda).join(', ') || '(nenhum slot disponivel)';
      const msg = invariantCheck.reason.startsWith('slot fora')
        ? `Esse horario nao esta na lista — escolhe um destes? ${legendas}`
        : `Nao consegui ler o horario — pode escolher um da lista? ${legendas}`;
      working = { ...working, proxima_acao: 'pergunta', resposta_cliente: msg };
    } else {
      // Hard-fail: violacao de contrato (proxima_acao nao permitida no estado,
      // payload obrigatorio missing, valor_pedido > valor_proposto, etc).
      // Bug do agent — nao UX issue.
      console.error('[agent/route] invariant violation:', invariantCheck.reason, out);
      return { ok: false, error: 'invariant-violation', reason: invariantCheck.reason, status: 500 };
    }
  }

  // Aplica enforceMenorIdade APOS invariante. So afeta cadastro (helper
  // checa data_nascimento; outros estados nao tem o campo, retorna out unchanged).
  const enforced = estado_atual === 'cadastro' ? enforceMenorIdade(working) : working;

  // Sub-3.2: orquestrator side-effects pra Proposta
  const sideEffects = [];
  let finalOut = enforced;
  if (PROPOSTA_SUBSTATES.has(estado_atual)) {
    finalOut = await executeOrchestration(enforced, {
      env, tenant, conversa, telefone, sideEffects,
    });
  }

  // Sub-3.3: branch transversal portfolio (qualquer agent pode emitir)
  const { urls_portfolio } = await executePortfolioIntent(finalOut, { env, tenant });

  // Pilar 3 InkFlow Agent — telemetria fire-and-forget
  try {
    logAgentTurn(ctx, env, {
      conversa_id: conversa?.id || 'stub',
      tenant_id,
      turn_index: (historico?.length || 0) + 1,
      agent_name: inferAgentName(estado_atual),
      agent_version: env.AGENT_VERSION || '2026-05-15',
      estado_agente: estado_atual,
      model: env.OPENAI_MODEL_AGENT || 'gpt-4o-mini',
      client_input_text: mensagem,
      client_input_type: 'text',
      prompt_full: null,
      context_metadata: { dados_acumulados, history_turns_n: historico?.length || 0 },
      llm_output_parsed: finalOut,
      invariant_passed: invariantCheck.valid,
      invariant_failure_reason: invariantCheck.valid ? null : invariantCheck.reason,
      tool_calls: sideEffects?.length ? sideEffects : null,
      latency_total_ms: Date.now() - t0,
    });
  } catch (e) {
    console.warn('[telemetry] buildPayload failed:', e?.message);
  }

  return {
    ok: true,
    resposta_cliente: finalOut.resposta_cliente,
    estado_novo: getNextState(estado_atual, finalOut),
    dados_persistidos: finalOut.dados_persistidos,
    dados_completos: finalOut.dados_completos,
    campos_faltando: finalOut.campos_faltando,
    campos_conflitantes: finalOut.campos_conflitantes,
    proxima_acao: finalOut.proxima_acao,
    agent_usado: estado_atual,
    side_effects: PROPOSTA_SUBSTATES.has(estado_atual) ? sideEffects : undefined,
    urls_portfolio,
  };
}

export async function onRequest({ request, env, waitUntil }) {
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

  // Cloudflare Workers nao tem process.env — SDK precisa receber a key explicita.
  // setDefaultOpenAIKey e idempotente; chama-se a cada request pra cobrir multi-tenant futuro.
  setDefaultOpenAIKey(env.OPENAI_API_KEY);

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

  // Stub tenant/conversa — Sub-1 recebe mock no payload em vez de puxar Supabase.
  // Sub-3 substitui por fetch real.
  const tenant = body?.tenant || { id: tenant_id, nome_estudio: 'Stub', config_agente: {}, gatilhos_handoff: [], faqs: [], fewshots: [] };
  const conversa = body?.conversa || { id: 'stub', telefone, estado_agente: estado_atual, dados_coletados: dados_acumulados, dados_cadastro: {} };

  const r = await runAgent({
    env,
    ctx: typeof waitUntil === 'function' ? { waitUntil } : undefined,
    tenant_id,
    telefone,
    mensagem,
    estado_atual,
    dados_acumulados,
    historico,
    tenant,
    conversa,
    clientContext: body?.clientContext || {},
  });

  if (r.ok) {
    return json(r, 200);
  }
  // Strip `status` do body — campo e meta pro wrapper, nao parte do response
  // public. Preserva shape { ok: false, error, reason? } que onRequest sempre devolveu.
  const { status, ...errorBody } = r;
  return json(errorBody, status || 500);
}

export function forcePergunta(out, msg) {
  return { ...out, proxima_acao: 'pergunta', resposta_cliente: msg };
}

export async function executeOrchestration(out, { env, tenant, conversa, telefone, sideEffects }) {
  switch (out.proxima_acao) {
    case 'pergunta':
    case 'oferecendo_horario':
    case 'adiou':
      return out;

    case 'reservar_horario': {
      const nome = conversa?.dados_cadastro?.nome || conversa?.nome || telefone;
      const ag = await callTool(env, 'reservar-horario', {
        tenant_id: tenant.id,
        telefone, nome,
        inicio: out.slot_inicio,
        fim: out.slot_fim,
      });
      sideEffects.push({ tool: 'reservar-horario', ok: ag.ok, agendamento_id: ag.agendamento_id });
      if (!ag.ok) {
        return forcePergunta(out, 'Esse horario acabou de sair — pode escolher outro?');
      }
      // Fallback chain dupla — config_precificacao.sinal_percentual (jsonb)
      // OR tenant.sinal_percentual (legacy column) OR 30 default.
      const sinal_pct = tenant?.config_precificacao?.sinal_percentual ?? tenant?.sinal_percentual ?? 30;
      const valor_sinal = calcularValorSinal(conversa.valor_proposto, sinal_pct);
      const lk = await callTool(env, 'gerar-link-sinal', {
        tenant_id: tenant.id,
        agendamento_id: ag.agendamento_id,
        valor_sinal,
      });
      sideEffects.push({ tool: 'gerar-link-sinal', ok: lk.ok });
      if (!lk.ok) {
        return forcePergunta(out, 'Tive um problema gerando o link — me da um minuto?');
      }
      const resposta_cliente = formatLinkSinalMessage({
        agent_text: out.resposta_cliente,
        sinal_pct, valor_sinal,
        link_pagamento: lk.link_pagamento,
        hold_horas: lk.hold_horas ?? 24,
      });
      return { ...out, resposta_cliente };
    }

    case 'pediu_desconto': {
      const r = await callTool(env, 'enviar-objecao-tatuador', {
        tenant_id: tenant.id,
        telefone,
        valor_pedido_cliente: out.valor_pedido_cliente,
      });
      sideEffects.push({ tool: 'enviar-objecao-tatuador', ok: r.ok });
      if (!r.ok) return forcePergunta(out, 'Anota ai — vou consultar e ja volto.');
      return out;
    }

    case 'reagendamento':
    case 'cliente_agressivo': {
      const r = await callTool(env, 'acionar-handoff', {
        tenant_id: tenant.id,
        telefone,
        motivo: out.proxima_acao,
      });
      sideEffects.push({ tool: 'acionar-handoff', ok: r.ok, motivo: out.proxima_acao });
      return out;
    }

    default:
      return out;
  }
}

// Sub-3.3: branch transversal enviar_portfolio.
// Roda independente do estado_atual — qualquer agent (tattoo/cadastro/proposta)
// pode emitir essa intent. Tool enviar-portfolio retorna URLs; route.js
// devolve em urls_portfolio na response. Estado nao muda.
//
// Args: (out, { env, tenant })
// Return: { urls_portfolio: string[] }
export async function executePortfolioIntent(out, { env, tenant }) {
  if (out?.proxima_acao !== 'enviar_portfolio') {
    return { urls_portfolio: [] };
  }
  const payload = out.payload_portfolio || {};
  const r = await callTool(env, 'enviar-portfolio', {
    tenant_id: tenant.id,
    estilo: payload.estilo ?? null,
    max: payload.max ?? 5,
  });
  // call-tool retorna { ok, status, ...data } — body da tool spread direto.
  // Tool retorna { ok: true, urls: [...] } ou { ok: false, error }.
  if (!r.ok || !Array.isArray(r.urls)) {
    return { urls_portfolio: [] };
  }
  return { urls_portfolio: r.urls };
}
