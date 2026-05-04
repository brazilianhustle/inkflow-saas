// ── Endpoint — simular_conversa (Testador B) ──────────────────────────────
// POST /api/tools/simular-conversa
// Auth: studio_token (header X-Studio-Token OU body.studio_token)
//       OU admin JWT (Authorization: Bearer)
// Body: { tenant_id, messages: [{role:'user'|'assistant', content:string}, ...] }
// Retorna: { reply: string, tool_call?: {...}, usage: {today, limit} }
//
// Chama OpenAI com prompt v6 real do tenant. Tool calling: se LLM chama
// calcular_orcamento, motor local (pricing.js) resolve sem HTTP. Outras tools
// (consultar, reservar, sinal, handoff, portfolio) NÃO são expostas — no
// simulador não faz sentido.
//
// Rate limit: 50 mensagens/dia/tenant + 5/min (via tenant.config_agente.tester_usage).

import { toolJson, TOOL_HEADERS } from './_tool-helpers.js';
import { verifyStudioTokenOrLegacy } from '../_auth-helpers.js';
import { loadConfigPrecificacao, calcularOrcamento } from '../../_lib/pricing.js';
import { generateSystemPrompt } from '../../_lib/prompts/index.js';
import { runPreGuardrails, runPostGuardrails } from '../../_lib/guardrails.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const ADMIN_EMAIL = 'lmf4200@gmail.com';
const DAILY_LIMIT = 50;
const MINUTE_LIMIT = 5;

async function verifyAdmin(authHeader, supabaseKey) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: authHeader },
    });
    if (!r.ok) return false;
    const u = await r.json();
    return u.email === ADMIN_EMAIL;
  } catch { return false; }
}

async function supaFetch(env, path, init = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

// Retorna {ok, usage:{today, limit}} ou {ok:false, error}
async function checkAndBumpUsage(env, tenant_id, configAgente) {
  const tz = new Date();
  const hojeIso = tz.toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const agoraMs = Date.now();
  const um_minuto_atras = agoraMs - 60000;

  const usage = (configAgente && configAgente.tester_usage) || {};
  let contagem_hoje = (usage.data === hojeIso ? usage.count : 0) || 0;
  let ultimas = Array.isArray(usage.ultimas_ms) ? usage.ultimas_ms : [];
  // Limpa ultimas fora da janela de 1 min
  ultimas = ultimas.filter(ms => ms > um_minuto_atras);

  if (contagem_hoje >= DAILY_LIMIT) {
    return { ok: false, error: 'daily_limit_reached', usage: { today: contagem_hoje, limit: DAILY_LIMIT } };
  }
  if (ultimas.length >= MINUTE_LIMIT) {
    return { ok: false, error: 'minute_limit_reached', usage: { today: contagem_hoje, limit: DAILY_LIMIT }, retry_after_s: 60 };
  }

  // Incrementa
  contagem_hoje += 1;
  ultimas.push(agoraMs);

  // Persiste
  const novoTester = { data: hojeIso, count: contagem_hoje, ultimas_ms: ultimas };
  const novoConfig = { ...(configAgente || {}), tester_usage: novoTester };
  await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ config_agente: novoConfig }),
  });

  return { ok: true, usage: { today: contagem_hoje, limit: DAILY_LIMIT } };
}

// Schema da tool calcular_orcamento pro LLM
const TOOL_SCHEMA_CALC = {
  type: 'function',
  function: {
    name: 'calcular_orcamento',
    description: 'Calcula valor/faixa de preço com base em tamanho, estilo, região e cor. Use SEMPRE antes de falar valor.',
    parameters: {
      type: 'object',
      properties: {
        tamanho_cm: { type: 'number', description: 'Tamanho em cm de altura' },
        estilo: { type: 'string', description: 'Estilo (blackwork, fineline, realismo, tradicional, etc)' },
        regiao: { type: 'string', description: 'Região do corpo (antebraco, biceps, ombro, costela, etc)' },
        cor_bool: { type: 'boolean', description: 'true se colorida, false se preto e sombra' },
        nivel_detalhe: { type: 'string', enum: ['baixo', 'medio', 'alto'], description: 'Nível de detalhamento' },
      },
      required: ['tamanho_cm', 'estilo', 'regiao', 'cor_bool', 'nivel_detalhe'],
    },
  },
};

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: TOOL_HEADERS });
  if (request.method !== 'POST') return toolJson({ ok: false, error: 'method-not-allowed' }, 405);

  const OPENAI_KEY = env.OPENAI_API_KEY;
  if (!OPENAI_KEY) return toolJson({ ok: false, error: 'openai-not-configured' }, 503);

  let input;
  try { input = await request.json(); }
  catch { return toolJson({ ok: false, error: 'invalid-json' }, 400); }

  const { tenant_id, messages, studio_token } = input || {};
  if (!tenant_id) return toolJson({ ok: false, error: 'tenant_id obrigatorio' }, 400);
  if (!Array.isArray(messages) || messages.length === 0) {
    return toolJson({ ok: false, error: 'messages obrigatorio (array nao vazio)' }, 400);
  }
  if (messages.length > 30) {
    return toolJson({ ok: false, error: 'historico muito longo (max 30 msgs)' }, 400);
  }

  // Auth
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const authHeader = request.headers.get('Authorization') || '';
  const studio_tok = studio_token || request.headers.get('X-Studio-Token');

  let authorized = false;
  let isAdmin = false;
  // Eval-secret: token permanente pro harness (nunca expira). Bypassa auth e rate limit.
  const evalSecret = request.headers.get('X-Eval-Secret');
  if (evalSecret && env.EVAL_SECRET && evalSecret === env.EVAL_SECRET) {
    authorized = true;
    isAdmin = true;
  } else if (await verifyAdmin(authHeader, SB_KEY)) {
    authorized = true;
    isAdmin = true;
  } else if (studio_tok) {
    const verified = await verifyStudioTokenOrLegacy({
      token: studio_tok,
      secret: env.STUDIO_TOKEN_SECRET,
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SB_KEY,
    });
    if (verified && verified.tenantId === tenant_id) authorized = true;
  }

  if (!authorized) return toolJson({ ok: false, error: 'unauthorized' }, 401);

  // Carrega tenant completo (pro prompt + pro cálculo)
  const tFields = 'id,nome_agente,nome_estudio,plano,faq_texto,config_precificacao,config_agente,horario_funcionamento,duracao_sessao_padrao_h,sinal_percentual,gatilhos_handoff,portfolio_urls,modo_atendimento';
  const tRes = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=${tFields}`);
  if (!tRes.ok) return toolJson({ ok: false, error: 'db-error' }, 500);
  const tenants = await tRes.json();
  if (!tenants.length) return toolJson({ ok: false, error: 'tenant-nao-encontrado' }, 404);
  const tenant = tenants[0];

  // Rate limit (admin bypassa pra rodar evals em batch)
  let usageCheck = { ok: true, usage: { today: 0, limit: DAILY_LIMIT } };
  if (!isAdmin) {
    usageCheck = await checkAndBumpUsage(env, tenant_id, tenant.config_agente);
    if (!usageCheck.ok) {
      return toolJson({ ok: false, error: usageCheck.error, usage: usageCheck.usage, retry_after_s: usageCheck.retry_after_s }, 429);
    }
  }

  // Guardrails pré-LLM (shared module — mesma lógica exposta via /api/tools/guardrails/pre)
  const preResult = runPreGuardrails({ messages });
  if (preResult.bypass) {
    return toolJson({
      ok: true,
      reply: preResult.reply,
      tool_call: null,
      usage: usageCheck.usage,
      preview: true,
      guardrail: preResult.guardrail,
    });
  }

  // System prompt v6 (simula conversa = primeiro contato, estado qualificando)
  const systemPrompt = generateSystemPrompt(tenant, null, { is_first_contact: messages.length <= 2 });

  // Monta conversa pro OpenAI
  const openaiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) })),
  ];

  // Se pré-guardrail sinalizou nudge (ex: bot repetindo mesma pergunta), injeta
  if (preResult.nudge) {
    openaiMessages.push({ role: 'system', content: preResult.nudge });
  }

  // Chama OpenAI com tool calling
  let openaiRes;
  try {
    openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: openaiMessages,
        temperature: 0.7,
        max_tokens: 400,
        tools: [TOOL_SCHEMA_CALC],
        tool_choice: 'auto',
      }),
    });
  } catch (e) {
    return toolJson({ ok: false, error: 'openai-network-error', detail: String(e?.message || e) }, 502);
  }

  if (!openaiRes.ok) {
    const err = await openaiRes.text();
    return toolJson({ ok: false, error: 'openai-error', detail: err.slice(0, 500) }, 502);
  }
  const oaiData = await openaiRes.json();
  const choice = oaiData.choices?.[0]?.message;

  // Se LLM chamou tool, resolve local e faz 2a chamada com resultado
  if (choice?.tool_calls && choice.tool_calls.length > 0) {
    const toolCall = choice.tool_calls[0];
    if (toolCall.function?.name === 'calcular_orcamento') {
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch {}
      const tenantFull = await loadConfigPrecificacao((path) => supaFetch(env, path), tenant_id);
      const toolResult = calcularOrcamento(args, tenantFull);

      // 2ª chamada: LLM recebe resultado da tool e formula resposta final
      const followupRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            ...openaiMessages,
            choice,
            { role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(toolResult) },
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
      });
      if (followupRes.ok) {
        const followup = await followupRes.json();
        const rawReply = followup.choices?.[0]?.message?.content || '';

        // Guardrails pós-LLM (fact-checker de preço)
        const postResult = runPostGuardrails({ reply: rawReply, toolResult, messages });

        return toolJson({
          ok: true,
          reply: postResult.reply,
          tool_call: { name: 'calcular_orcamento', args, result: toolResult },
          usage: usageCheck.usage,
          preview: true,
          ...(postResult.guardrail ? { guardrail: postResult.guardrail } : {}),
        });
      }
    }
  }

  // Sem tool call — passa pelos guardrails pós-LLM mesmo assim pra detectar
  // alucinacao de R$ (bot inventou preço sem chamar tool).
  const rawReplyNoTool = choice?.content || '';
  const postResultNoTool = runPostGuardrails({ reply: rawReplyNoTool, toolResult: null, messages });
  return toolJson({
    ok: true,
    reply: postResultNoTool.reply,
    tool_call: null,
    usage: usageCheck.usage,
    ...(postResultNoTool.guardrail ? { guardrail: postResultNoTool.guardrail } : {}),
    preview: true,
  });
}
