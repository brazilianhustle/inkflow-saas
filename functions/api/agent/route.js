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
import { isStateImplemented, getNextState, validateAction } from './router.js';
import { runTattooAgent } from './agents/tattoo.js';
import { runCadastroAgent } from './agents/cadastro.js';
import { runPropostaAgent } from './agents/proposta.js';
import { buildFallbackOutput } from '../../_lib/agent-runtime/fallbacks.js';
import { validateEnv } from './_lib/sdk-init.js';
import { enforceMenorIdade } from './_lib/enforce-menor-idade.js';
import { prefetchPropostaContext } from './_lib/prefetch-proposta.js';
import { prefetchPortfolio } from './_lib/prefetch-portfolio.js';
import { callTool } from './_lib/call-tool.js';
import { calcularValorSinal } from './_lib/calcular-sinal.js';
import { formatLinkSinalMessage, formatPixSinalMessage } from './_lib/format-link-sinal-msg.js';
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

// Bug 1: copy canônica do pedido de foto do local (espelha §4.4 do prompt tattoo).
// Usada como backstop quando o LLM tenta handoff sem nunca ter pedido a foto.
const PEDIDO_FOTO_LOCAL = 'Fechou! Consegue mandar também uma foto do local? É importante pro tatuador ter noção do espaço e passar o valor certinho.';

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
//   imagens (tattoo-only), tenant (resolvido), conversa (resolvido), clientContext (bare; runAgent merge prefetch)
//
// Return success: { ok: true, resposta_cliente, estado_novo, dados_persistidos,
//   dados_completos, campos_faltando, campos_conflitantes, proxima_acao, agent_usado,
//   side_effects?, urls_portfolio, analise_imagens, cobertura_suspeita }
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

// Validador residual cross-field: 'handoff' com email=null exige email_recusado=true.
// Codificar via discriminated union exigiria 5 branches (split handoff em
// handoff_com_email vs handoff_sem_email_recusado), custo maior que beneficio.
// Mantemos esse residual unico no Cadastro (spec Fase 2 section 2.1).
export function validateCadastroHandoffEmail(out) {
  if (!out || out.proxima_acao !== 'handoff') return null;
  if (out.dados_persistidos?.email == null && out.email_recusado !== true) {
    return { reason: 'handoff sem email nem email_recusado=true' };
  }
  return null;
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
  imagens,
  tenant,
  conversa,
  clientContext,
  openaiClient, // Caminho C Fase 1: DI pra testes do path tattoo (default undefined)
}) {
  if (!isStateImplemented(estado_atual)) {
    return {
      ok: false,
      error: `estado_atual='${estado_atual}' nao implementado no Sub-1 (sera Sub-2)`,
      status: 501,
    };
  }

  const t0 = Date.now();

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

  let working;
  let invariantCheck = { valid: true };
  let pediuFotoLocal = false;

  if (estado_atual === 'tattoo') {
    // ─── Caminho C Fase 1: path novo, schema strict ────────────────────
    // runTattooAgent + Responses API + discriminated union strict. Sem
    // validator pos-parse — schema garante invariantes do handoff.
    let out;
    try {
      out = await runTattooAgent({
        env, tenant, conversa, clientContext: mergedClientContext,
        mensagem, historico, imagens,
        openaiClient,
      });
    } catch (e) {
      // Todos os retries falharam (network down, 401, context_length, etc).
      // UX: cliente nao recebe HTTP 500 — recebe mensagem amigavel.
      // Telemetria: erro detalhado logado pra ops investigar.
      console.error('[agent/route] runTattooAgent exhausted retries:', {
        message: e?.message, status: e?.status, code: e?.code,
      });
      out = buildFallbackOutput('tattoo');
    }
    // ─── Bug 1: trava leve foto do local pedida >=1x antes do handoff ───
    // Contador vive em dados_coletados.tentativas_foto_local (estado_extra
    // NAO existe na tabela conversas). Se o LLM tentar handoff sem nunca ter
    // pedido a foto e sem foto presente, forca um turno pergunta pedindo a
    // foto (a foto continua OPCIONAL — basta ter sido pedida 1x).
    const dadosApos = { ...(conversa?.dados_coletados || {}), ...(out.dados_persistidos || {}) };
    const tentativasFoto = conversa?.dados_coletados?.tentativas_foto_local || 0;
    const temFotoLocal = !!dadosApos.foto_local;
    const obrCompletos = ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo']
      .every(k => dadosApos[k] != null && dadosApos[k] !== '');
    if (out.proxima_acao === 'handoff' && tentativasFoto === 0 && !temFotoLocal) {
      out = {
        ...forcePergunta(out, PEDIDO_FOTO_LOCAL),
        dados_completos: false,
        campos_faltando: ['foto_local'],
      };
      pediuFotoLocal = true;
    } else if (out.proxima_acao === 'pergunta' && obrCompletos && tentativasFoto === 0
               && !temFotoLocal && (out.campos_conflitantes?.length ?? 0) === 0
               && /foto/i.test(out.resposta_cliente || '')) {
      // LLM ja pediu a foto organicamente neste turno (4 OBR completos, sem
      // conflito) E a resposta menciona foto. O guard /foto/ evita contar como
      // "foto pedida" um turno de fallback de rede (mensagem generica) ou uma
      // pergunta de outro assunto (confirmacao/FAQ) com OBR ja completos.
      pediuFotoLocal = true;
    }
    // Valida payload do handoff contra contrato cross-agent (so quando
    // proxima_acao=handoff). validateTransition retorna payload extraido
    // ou throw ZodError se shape invalido.
    if (out.proxima_acao === 'handoff') {
      try {
        validateAction('tattoo', out, mergedClientContext);
      } catch (e) {
        console.error('[agent/route] handoff contract violation:', e?.message);
        return { ok: false, error: 'invariant-violation', reason: e?.message, status: 500 };
      }
    }
    working = out;
  } else if (estado_atual === 'cadastro') {
    // ─── Caminho C Fase 2A: path novo Cadastro ─────────────────────────
    // runCadastroAgent + Responses API + discriminated union strict.
    // Schema garante invariantes do handoff exceto cross-field email-or-recusado,
    // que e checado abaixo via validateCadastroHandoffEmail (silently force pergunta).
    let out;
    try {
      out = await runCadastroAgent({
        env, tenant, conversa, clientContext: mergedClientContext,
        mensagem, historico,
        openaiClient,
      });
    } catch (e) {
      console.error('[agent/route] runCadastroAgent exhausted retries:', {
        message: e?.message, status: e?.status, code: e?.code,
      });
      out = buildFallbackOutput('cadastro');
    }
    // Validador residual cross-field (silently force pergunta).
    // NAO usa forcePergunta() — esse helper so flipa proxima_acao+resposta_cliente,
    // deixando dados_completos:true + campos_faltando:[] do handoff (estado
    // inconsistente). Aqui mutamos dados_completos:false + adicionamos 'email' em
    // campos_faltando, espelhando o silent force de data_nascimento nao-ISO no
    // legacy path abaixo. NAO mutamos dados_persistidos.email — cliente pode ter
    // passado email valido E recusado ou estar prestes a passar; nao invalida o
    // que ja foi coletado. Tambem atualiza invariantCheck pra telemetria
    // (invariant_passed=false + reason) — sem isso logAgentTurn reportaria valid:true
    // e perderiamos observabilidade de quantas vezes o LLM produz essa violacao.
    const violated = validateCadastroHandoffEmail(out);
    if (violated) {
      console.warn('[agent/route] silently force pergunta (cadastro residual):', violated.reason);
      out = {
        ...out,
        proxima_acao: 'pergunta',
        resposta_cliente: 'Pra avancar preciso do email — ou me confirma que prefere seguir sem.',
        dados_completos: false,
        campos_faltando: Array.from(new Set([...(out.campos_faltando || []), 'email'])),
      };
      invariantCheck = { valid: false, reason: violated.reason };
    }
    // Contract handoff cross-agent.
    if (out.proxima_acao === 'handoff') {
      try {
        validateAction('cadastro', out, mergedClientContext);
      } catch (e) {
        console.error('[agent/route] cadastro handoff contract violation:', e?.message);
        return { ok: false, error: 'invariant-violation', reason: e?.message, status: 500 };
      }
    }
    working = out;
  } else if (PROPOSTA_SUBSTATES.has(estado_atual)) {
    // ─── Caminho C Fase 2B: PropostaAgent path novo (3 substates) ──────
    let out;
    try {
      out = await runPropostaAgent({
        env, tenant, conversa, clientContext: mergedClientContext,
        mensagem, historico, estado_atual,
        openaiClient,
      });
    } catch (e) {
      console.error('[agent/route] runPropostaAgent exhausted retries:', {
        message: e?.message, status: e?.status, code: e?.code,
      });
      out = buildFallbackOutput('proposta');
    }
    // Valida payload da acao contra contract (slot em ctx, valor<=proposto,
    // portfolio_disponivel). Schema strict ja garante shape (slot ISO,
    // valor>0). Aqui sao invariantes context-dependent.
    try {
      validateAction(estado_atual, out, mergedClientContext);
      working = out;
    } catch (e) {
      const reason = e?.message || '';
      if (/fora da lista/.test(reason)) {
        console.warn('[agent/route] silently force pergunta (slot fora):', reason);
        // Em aguardando_sinal so populamos slots_reservados (sem horarios_livres) —
        // se LLM alucinou slot fora do reservado, oferece o reservado em vez de
        // dizer "(nenhum slot disponivel)" enganosamente.
        const reservados = mergedClientContext.slots_reservados || [];
        if (estado_atual === 'aguardando_sinal' && reservados.length > 0) {
          working = forcePergunta(out, `Seu horario reservado ainda esta valido — quer que eu reenvie o link desse horario?`);
        } else {
          const slots = mergedClientContext.horarios_livres || [];
          const legendas = slots.map(s => s.legenda).filter(Boolean).join(', ') || '(nenhum slot disponivel)';
          working = forcePergunta(out, `Esse horario nao esta na lista — escolhe um destes? ${legendas}`);
        }
        invariantCheck = { valid: false, reason };
      } else if (/> valor_proposto/.test(reason)) {
        console.warn('[agent/route] silently force pergunta (valor > proposto):', reason);
        working = forcePergunta(out, `O valor pedido excede o proposto — pode confirmar o valor?`);
        invariantCheck = { valid: false, reason };
      } else if (/portfolio_disponivel/.test(reason)) {
        console.warn('[agent/route] silently force pergunta (portfolio indisp):', reason);
        working = forcePergunta(out, `Posso te mostrar referencias depois — bora seguir?`);
        invariantCheck = { valid: false, reason };
      } else {
        console.error('[agent/route] proposta action contract violation:', reason);
        return { ok: false, error: 'invariant-violation', reason, status: 500 };
      }
    }
  } else {
    return { ok: false, error: `estado_atual='${estado_atual}' nao implementado`, status: 501 };
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
      clientContext: mergedClientContext,
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
    analise_imagens: finalOut.analise_imagens ?? null,
    cobertura_suspeita: finalOut.cobertura_suspeita ?? null,
    pediu_foto_local: estado_atual === 'tattoo' ? pediuFotoLocal : undefined,
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
    imagens: Array.isArray(body?.imagens) ? body.imagens : undefined,
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

export async function executeOrchestration(out, { env, tenant, conversa, telefone, sideEffects, clientContext }) {
  switch (out.proxima_acao) {
    case 'pergunta':
    case 'oferecendo_horario':
    case 'adiou':
      return out;

    case 'reservar_horario': {
      // TC-P09: se o slot ja esta em ctx.slots_reservados (cliente avisando
      // que link venceu), SKIPa reservar-horario e regenera link direto via
      // gerar-link-sinal com o agendamento_id existente. Sem skip, a conflict
      // query de reservar-horario (que nao filtra por telefone) bateria
      // contra a propria tentative do cliente -> 409 "slot-ocupado" -> bot
      // diria "acabou de sair" sobre o slot que ainda e dele.
      const ctxSlots = clientContext?.slots_reservados || [];
      const existing = ctxSlots.find(
        s => s.inicio === out.slot_inicio && s.fim === out.slot_fim && s.agendamento_id
      );
      let agendamento_id;
      if (existing) {
        agendamento_id = existing.agendamento_id;
        sideEffects.push({ tool: 'reservar-horario', ok: true, agendamento_id, skipped: 'slot_em_reservados' });
      } else {
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
        agendamento_id = ag.agendamento_id;
      }
      // Fallback chain dupla — config_precificacao.sinal_percentual (jsonb)
      // OR tenant.sinal_percentual (legacy column) OR 30 default.
      const sinal_pct = tenant?.config_precificacao?.sinal_percentual ?? tenant?.sinal_percentual ?? 30;
      const valor_sinal = calcularValorSinal(conversa.valor_proposto, sinal_pct);
      const lk = await callTool(env, 'gerar-link-sinal', {
        tenant_id: tenant.id,
        agendamento_id,
        valor_sinal,
        metodo: 'pix', // Pix é o padrão; a tool cai pro cartão se ENABLE_PIX_SINAL=false
      });
      sideEffects.push({ tool: 'gerar-link-sinal', ok: lk.ok, metodo: lk.metodo_usado });
      if (!lk.ok) {
        return forcePergunta(out, 'Tive um problema gerando o link — me da um minuto?');
      }
      const resposta_cliente = lk.metodo_usado === 'pix'
        ? formatPixSinalMessage({
            agent_text: out.resposta_cliente,
            sinal_pct, valor_sinal,
            copia_e_cola: lk.copia_e_cola,
            hold_horas: lk.hold_horas ?? 48,
          })
        : formatLinkSinalMessage({
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
