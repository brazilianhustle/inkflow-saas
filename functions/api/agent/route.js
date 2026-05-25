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
import { detectBodyLocation } from '../../_lib/conversation-policy.js';

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

function mentionsAgeOnly(text) {
  const s = String(text || '').toLowerCase();
  const hasAge = /\b\d{1,3}\s*(anos?|aninhos?)\b/.test(s);
  if (!hasAge) return false;
  const hasDate =
    /\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/.test(s)
    || /\b\d{4}-\d{2}-\d{2}\b/.test(s)
    || /\b\d{1,2}\s+de\s+(jan|janeiro|fev|fevereiro|mar|marco|março|abr|abril|mai|maio|jun|junho|jul|julho|ago|agosto|set|setembro|out|outubro|nov|novembro|dez|dezembro)\b/.test(s);
  return !hasDate;
}

function isGreetingOnly(text) {
  const s = String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[!?.\s]/g, ' ')
    .trim();
  return /^(oi|oii|oiii|ola|olaa|opa|bom dia|boa tarde|boa noite|e ai|salve)$/.test(s);
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isImageQuestion(text) {
  const s = normalizeText(text);
  return /\b(o que|que)\s+(voce|vc|tu)\s+(viu|ve|consegue ver|entendeu|achou)\b.*\b(imagem|foto|referencia|desenho)\b/.test(s)
    || /\b(voce|vc|tu)\s+(viu|ve|consegue ver|entendeu|achou)\b.*\b(imagem|foto|referencia|desenho)\b/.test(s)
    || /\b(o que|que)\s+(aparece|tem)\b.*\b(nessa|na|imagem|foto)\b/.test(s);
}

function isWeakVisualLimitationReply(text) {
  const s = normalizeText(text);
  return /\bdesculpe\b/.test(s)
    || /\bnao consigo (identificar|ver|entender)\b/.test(s)
    || /\bnao consegui (identificar|ver|entender)\b/.test(s)
    || /\bnao deu para (identificar|ver|entender)\b/.test(s);
}

function shouldForceAmbiguousImageQuestion(out, mensagem, imagens) {
  return Array.isArray(imagens)
    && imagens.length > 0
    && isImageQuestion(mensagem)
    && isWeakVisualLimitationReply(out?.resposta_cliente || '');
}

function forceAmbiguousImageQuestion(out, tenant, clientContext = {}) {
  const nomeAgente = tenant?.nome_agente || 'atendente';
  const intro = clientContext?.is_first_contact
    ? `Oii, tudo bem?\n\nMe chamo ${nomeAgente}, muito prazer!\n\n`
    : '';
  return {
    ...out,
    proxima_acao: 'pergunta',
    resposta_cliente: `${intro}Vi a imagem, mas fiquei em dúvida se ela é referência do desenho ou o local do corpo.\n\nQual dos dois fica valendo?`,
    dados_completos: false,
    campos_faltando: Array.from(new Set([...(out.campos_faltando || []), 'tipo_foto'])),
    campos_conflitantes: [],
    analise_imagens: Array.isArray(out.analise_imagens) && out.analise_imagens.length
      ? out.analise_imagens
      : [{ tipo: 'incerto', descricao: 'imagem ambigua', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
  };
}

function forceFirstContactGreeting(out, tenant) {
  const nomeAgente = tenant?.nome_agente || 'atendente';
  return {
    ...out,
    proxima_acao: 'pergunta',
    resposta_cliente: `Oii, tudo bem?\n\nMe chamo ${nomeAgente}, muito prazer! Como posso te chamar?`,
    dados_persistidos: {
      descricao_curta: null,
      local_corpo: null,
      altura_cm: null,
      estilo: null,
      tamanho_cm: null,
      cor_preferencia: null,
      foto_local: null,
    },
    dados_completos: false,
    campos_faltando: ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo'],
    campos_conflitantes: [],
    payload_portfolio: null,
  };
}

function hasFirstContactIntro(text) {
  const s = String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\bme chamo\b/.test(s) || /\bmeu nome e\b/.test(s);
}

function stripLeadingGenericGreeting(text) {
  return String(text || '')
    .replace(/^\s*(oii?|ol[aá]|opa),?\s*tudo bem\?\s*(?:e\s+)?/i, '')
    .trim();
}

function ensureFirstContactIntro(out, tenant) {
  if (!out?.resposta_cliente || hasFirstContactIntro(out.resposta_cliente)) return out;
  const nomeAgente = tenant?.nome_agente || 'atendente';
  const body = stripLeadingGenericGreeting(out.resposta_cliente);
  const intro = `Oii, tudo bem?\n\nMe chamo ${nomeAgente}, muito prazer!`;
  return {
    ...out,
    resposta_cliente: body ? `${intro}\n\n${body}` : `${intro} Como posso te chamar?`,
  };
}

function hasValue(v) {
  return v !== null && v !== undefined && v !== '';
}

function mergePreservingExisting(existing = {}, patch = {}) {
  const out = { ...existing };
  for (const [k, v] of Object.entries(patch || {})) {
    if (hasValue(v) || !hasValue(out[k])) out[k] = v;
  }
  return out;
}

function tattooMissingFields(dados) {
  return ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo'].filter(k => !hasValue(dados?.[k]));
}

function asksForCollectedField(text, dados, firstMissing) {
  const s = String(text || '').toLowerCase();
  return (firstMissing !== 'altura_cm' && hasValue(dados.altura_cm) && /\b(altura|alto|alta)\b/.test(s))
    || (firstMissing !== 'estilo' && hasValue(dados.estilo) && /\bestilo\b/.test(s))
    || (firstMissing !== 'local_corpo' && hasValue(dados.local_corpo) && /\b(local|parte do corpo|onde)\b/.test(s));
}

function tattooQuestionFor(field, dados, mensagem) {
  const askedPrice = /\b(quanto|valor|pre[cç]o|fica|custa|orcamento|orçamento)\b/i.test(String(mensagem || ''));
  const prefix = askedPrice
    ? 'Sobre valor o tatuador confirma quando avaliar tua ideia'
    : null;
  if (field === 'estilo') {
    const confirm = hasValue(dados.altura_cm) ? `Fechou, ${dados.altura_cm}cm` : 'Fechou';
    const ask = prefix
      ? `${prefix}. Me diz o estilo que tu prefere?`
      : 'Me diz o estilo que tu prefere?';
    return `${confirm}\n\n${ask}`;
  }
  if (field === 'altura_cm') {
    return prefix
      ? `${prefix}. Qual a tua altura?`
      : 'Qual a tua altura?';
  }
  if (field === 'local_corpo') return 'Em qual parte do corpo tu quer fazer?';
  if (field === 'descricao_curta') return 'Me conta o que tu quer tatuar?';
  return 'Me confirma esse detalhe pra eu seguir?';
}

const STYLE_ALIASES = new Map([
  ['realismo', 'realismo'],
  ['realista', 'realismo'],
  ['fineline', 'fineline'],
  ['fine line', 'fineline'],
  ['blackwork', 'blackwork'],
  ['black work', 'blackwork'],
  ['tradicional', 'tradicional'],
  ['aquarela', 'aquarela'],
]);

function normalizeTokenText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectShortStyleAnswer(text) {
  const s = normalizeTokenText(text);
  const stripped = s.replace(/^(estilo|quero|queria|prefiro|pode ser|seria)\s+/, '').trim();
  return STYLE_ALIASES.get(stripped) || null;
}

function bodyLocationPhrase(localCorpo) {
  const local = String(localCorpo || '').trim();
  if (!local) return 'no corpo';
  return /^(perna|coxa|panturrilha|canela|costela|barriga|m[aã]o)$/i.test(local)
    ? `na ${local}`
    : `no ${local}`;
}

function applyShortStyleAnswer(out, dadosApos, mensagem) {
  if (hasValue(dadosApos?.estilo)) return { out, dadosApos, changed: false };
  const estilo = detectShortStyleAnswer(mensagem);
  if (!estilo) return { out, dadosApos, changed: false };
  const nextDados = { ...dadosApos, estilo };
  return {
    out: {
      ...out,
      dados_persistidos: { ...(out.dados_persistidos || {}), estilo },
      campos_faltando: (out.campos_faltando || []).filter(c => c !== 'estilo'),
    },
    dadosApos: nextDados,
    changed: true,
  };
}

function asksForStyleAgain(text) {
  const s = normalizeTokenText(text);
  return /\bestilo\b/.test(s) || /\b(fineline|realismo|blackwork|tradicional)\b/.test(s);
}

function reanchorShortStyleTurn(out, dadosApos, styleChanged) {
  if (!styleChanged || out?.proxima_acao !== 'pergunta') return out;
  const resposta = String(out.resposta_cliente || '');
  const asksLocal = (out.campos_faltando || []).includes('local_corpo')
    || /\b(onde|local|parte do corpo)\b/i.test(resposta);
  const confirmsOldHeight = hasValue(dadosApos?.altura_cm)
    && new RegExp(`\\b${dadosApos.altura_cm}\\s*cm\\b`, 'i').test(resposta);
  if (!asksLocal || !confirmsOldHeight) return out;
  const estilo = dadosApos?.estilo || 'esse estilo';
  return {
    ...out,
    resposta_cliente: `Fechou, ${estilo}\n\nOnde exatamente ${bodyLocationPhrase(dadosApos?.local_corpo)} tu quer a tattoo?`,
  };
}

function shouldForceHandoffAfterCompletedObr(out, dadosApos, mensagem, styleChanged) {
  if (out?.proxima_acao !== 'pergunta') return false;
  if ((out?.campos_faltando || []).includes('tipo_foto')) return false;
  if ((out?.campos_faltando || []).some(c => ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo'].includes(c))) {
    return false;
  }
  if ((out.campos_conflitantes?.length ?? 0) > 0) return false;
  const obrCompletos = ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo']
    .every(k => hasValue(dadosApos?.[k]));
  if (!obrCompletos) return false;
  const resposta = String(out.resposta_cliente || '').trim();
  const echoedUser = normalizeTokenText(resposta) === normalizeTokenText(mensagem);
  return styleChanged || echoedUser || asksForStyleAgain(resposta);
}

function enforceTattooQuestionCoherence(out, dadosApos, mensagem) {
  if (!out || out.proxima_acao !== 'pergunta') return out;
  const missing = tattooMissingFields(dadosApos);
  if (missing.length === 0) return out;
  const resposta = String(out.resposta_cliente || '').trim();
  const invalid = !/\?/.test(resposta)
    || /^\d+(?:[,.]\d+)?\s*(?:cm|m)?$/i.test(resposta)
    || asksForCollectedField(resposta, dadosApos, missing[0]);
  if (!invalid) return out;
  return {
    ...out,
    resposta_cliente: tattooQuestionFor(missing[0], dadosApos, mensagem),
    dados_completos: false,
    campos_faltando: missing,
  };
}

function hasAmbiguousTattooBodyPhoto(out, imagens) {
  if (!Array.isArray(imagens) || imagens.length === 0) return false;
  if (out?.cobertura_suspeita) return false;
  const analise = Array.isArray(out?.analise_imagens) ? out.analise_imagens : [];
  return analise.some(a => a?.tipo === 'corpo' && a?.corpo_tem_tattoo === true);
}

function forceAmbiguousTattooPhotoQuestion(out, dadosApos, conversa) {
  const local = String(dadosApos?.local_corpo || '').trim() || 'local do corpo';
  const analise = Array.isArray(out?.analise_imagens)
    ? out.analise_imagens.map(a => (
      a?.tipo === 'corpo' && a?.corpo_tem_tattoo === true
        ? { ...a, tipo: 'incerto' }
        : a
    ))
    : out?.analise_imagens;
  return {
    ...out,
    proxima_acao: 'pergunta',
    resposta_cliente: `Vi a foto, mas fiquei em dúvida: ela é referência do desenho/estilo ou é pra mostrar o local (${local})?`,
    dados_persistidos: {
      ...dadosApos,
      foto_local: conversa?.dados_coletados?.foto_local ?? null,
      foto_local_msg_id: conversa?.dados_coletados?.foto_local_msg_id ?? null,
    },
    dados_completos: false,
    campos_faltando: ['tipo_foto'],
    campos_conflitantes: [],
    payload_portfolio: null,
    analise_imagens: analise ?? null,
  };
}

function detectBodyRegion(text) {
  return detectBodyLocation(text);
}

function findVisualBodyRegion(out) {
  const analise = Array.isArray(out?.analise_imagens) ? out.analise_imagens : [];
  for (const a of analise) {
    if (a?.tipo !== 'corpo') continue;
    const region = detectBodyRegion(a.descricao || '');
    if (region) return region;
  }
  return null;
}

function forceBodyRegionMismatchQuestion(out, dadosApos) {
  const textual = detectBodyRegion(dadosApos?.local_corpo || '');
  const visual = findVisualBodyRegion(out);
  if (!textual || !visual || textual.key === visual.key) return { out, changed: false };
  return {
    out: {
      ...out,
      proxima_acao: 'pergunta',
      resposta_cliente: `Pela foto parece ${visual.label}, mas tu tinha falado ${textual.label}. Qual local fica valendo?`,
      dados_persistidos: {
        ...(out.dados_persistidos || {}),
        local_corpo: dadosApos.local_corpo,
      },
      dados_completos: false,
      campos_faltando: ['local_corpo'],
      campos_conflitantes: ['local_corpo'],
      payload_portfolio: null,
    },
    changed: true,
  };
}

function applyTextLocalHint(out, dadosApos, mensagem) {
  if (hasValue(dadosApos?.local_corpo)) return { out, dadosApos, changed: false };
  const region = detectBodyRegion(mensagem);
  if (!region) return { out, dadosApos, changed: false };
  const nextDados = { ...dadosApos, local_corpo: region.label };
  return {
    out: {
      ...out,
      dados_persistidos: { ...(out.dados_persistidos || {}), local_corpo: region.label },
      campos_faltando: (out.campos_faltando || []).filter(c => c !== 'local_corpo'),
    },
    dadosApos: nextDados,
    changed: true,
  };
}

function isPhotoLocalClarification(text) {
  const s = String(text || '').toLowerCase();
  return /\b(do local|foto do local|local da tatuagem|local do corpo)\b/.test(s)
    || /\bsem\s+(tattoo|tatuagem|tatuagens)\b/.test(s)
    || /\bpele\s+limpa\b/.test(s)
    || /\b(do outro lado|outro lado)\b/.test(s);
}

function promoteClarifiedLocalPhoto(out, dadosApos, mensagem, conversa) {
  if (!out || hasValue(dadosApos?.foto_local) || hasValue(dadosApos?.foto_local_msg_id)) {
    return { out, dadosApos, promoted: false };
  }
  if (!isPhotoLocalClarification(mensagem)) return { out, dadosApos, promoted: false };
  const refs = Array.isArray(conversa?.dados_coletados?.refs_imagens_msg_ids)
    ? conversa.dados_coletados.refs_imagens_msg_ids
    : [];
  const msgId = refs[refs.length - 1];
  if (!msgId) return { out, dadosApos, promoted: false };
  const local = String(dadosApos?.local_corpo || '').trim() || 'local confirmado';
  const nextDados = {
    ...dadosApos,
    foto_local: `foto do local confirmada pelo cliente (${local})`,
    foto_local_msg_id: msgId,
  };
  return {
    out: { ...out, dados_persistidos: { ...(out.dados_persistidos || {}), ...nextDados } },
    dadosApos: nextDados,
    promoted: true,
  };
}

function shouldForceCadastroAfterTattooPhoto(out, dadosApos, mensagem, promotedPhoto) {
  if (!promotedPhoto) return false;
  if ((out?.campos_faltando || []).includes('tipo_foto')) return false;
  const obrCompletos = ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo']
    .every(k => hasValue(dadosApos?.[k]));
  if (!obrCompletos) return false;
  const resposta = String(out?.resposta_cliente || '').trim();
  const askedPrice = /\b(quanto|valor|pre[cç]o|fica|custa|orcamento|orçamento)\b/i.test(String(mensagem || ''));
  const pediuFotoDeNovo = /\bfoto\b/i.test(resposta);
  return out?.proxima_acao !== 'handoff' && (askedPrice || pediuFotoDeNovo || !/\?/.test(resposta));
}

function forceTattooCadastroHandoff(out, dadosApos, mensagem) {
  const askedPrice = /\b(quanto|valor|pre[cç]o|fica|custa|orcamento|orçamento)\b/i.test(String(mensagem || ''));
  const prefix = askedPrice
    ? 'Sobre valor, o tatuador confirma certinho depois de avaliar tua ideia.'
    : 'Combinado, com a ideia e o local anotados.';
  return {
    ...out,
    proxima_acao: 'handoff',
    resposta_cliente: `${prefix}\n\nPra liberar teu orçamento personalizado, me passa nome completo e data de nascimento?`,
    dados_persistidos: {
      descricao_curta: dadosApos.descricao_curta,
      local_corpo: dadosApos.local_corpo,
      altura_cm: dadosApos.altura_cm,
      estilo: dadosApos.estilo,
      tamanho_cm: dadosApos.tamanho_cm ?? null,
      cor_preferencia: dadosApos.cor_preferencia ?? null,
      foto_local: dadosApos.foto_local ?? null,
      foto_local_msg_id: dadosApos.foto_local_msg_id,
    },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    payload_portfolio: null,
  };
}

export function rejectCadastroDateFromAgeOnly(out, mensagem, existingDate = null) {
  const persisted = out?.dados_persistidos || {};
  if (!persisted.data_nascimento || !mentionsAgeOnly(mensagem)) return { out, violated: null };
  if (existingDate && persisted.data_nascimento === existingDate) return { out, violated: null };
  return {
    out: {
      ...out,
      proxima_acao: 'pergunta',
      resposta_cliente: 'Entendi. Pra seguir com o orçamento certinho, preciso confirmar tua data de nascimento completa por segurança e registro de maioridade. Pode mandar no formato dia/mês/ano?',
      dados_persistidos: { ...persisted, data_nascimento: null },
      dados_completos: false,
      campos_faltando: Array.from(new Set([...(out.campos_faltando || []), 'data_nascimento'])),
    },
    violated: { reason: 'data_nascimento persistida a partir de idade sem data explicita' },
  };
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
    if (mergedClientContext.is_first_contact) {
      out = isGreetingOnly(mensagem)
        ? forceFirstContactGreeting(out, tenant)
        : ensureFirstContactIntro(out, tenant);
    }
    // ─── Bug 1: trava leve foto do local pedida >=1x antes do handoff ───
    // Contador vive em dados_coletados.tentativas_foto_local (estado_extra
    // NAO existe na tabela conversas). Se o LLM tentar handoff sem nunca ter
    // pedido a foto e sem foto presente, forca um turno pergunta pedindo a
    // foto (a foto continua OPCIONAL — basta ter sido pedida 1x).
    let dadosApos = mergePreservingExisting(conversa?.dados_coletados || {}, out.dados_persistidos || {});
    out = { ...out, dados_persistidos: mergePreservingExisting(out.dados_persistidos || {}, dadosApos) };
    const localPatch = applyTextLocalHint(out, dadosApos, mensagem);
    out = localPatch.out;
    dadosApos = localPatch.dadosApos;
    const stylePatch = applyShortStyleAnswer(out, dadosApos, mensagem);
    out = stylePatch.out;
    dadosApos = stylePatch.dadosApos;
    out = reanchorShortStyleTurn(out, dadosApos, stylePatch.changed);
    out = enforceTattooQuestionCoherence(out, dadosApos, mensagem);
    const regionMismatch = forceBodyRegionMismatchQuestion(out, dadosApos);
    out = regionMismatch.out;
    if (hasAmbiguousTattooBodyPhoto(out, imagens)) {
      out = forceAmbiguousTattooPhotoQuestion(out, dadosApos, conversa);
    }
    if (shouldForceAmbiguousImageQuestion(out, mensagem, imagens)) {
      out = forceAmbiguousImageQuestion(out, tenant, mergedClientContext);
    }
    const promotedPhoto = promoteClarifiedLocalPhoto(out, dadosApos, mensagem, conversa);
    out = promotedPhoto.out;
    dadosApos = promotedPhoto.dadosApos;
    if (shouldForceCadastroAfterTattooPhoto(out, dadosApos, mensagem, promotedPhoto.promoted)) {
      out = forceTattooCadastroHandoff(out, dadosApos, mensagem);
    }
    if (shouldForceHandoffAfterCompletedObr(out, dadosApos, mensagem, stylePatch.changed) && !regionMismatch.changed) {
      out = forceTattooCadastroHandoff(out, dadosApos, mensagem);
    }
    const tentativasFoto = conversa?.dados_coletados?.tentativas_foto_local || 0;
    const temFotoLocal = hasValue(out.dados_persistidos?.foto_local)
      || hasValue(out.dados_persistidos?.foto_local_msg_id)
      || hasValue(dadosApos?.foto_local_msg_id);
    const obrCompletos = ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo']
      .every(k => out.dados_persistidos?.[k] != null && out.dados_persistidos?.[k] !== '');
    if (out.proxima_acao === 'handoff' && tentativasFoto === 0 && !temFotoLocal) {
      out = {
        ...forcePergunta(out, PEDIDO_FOTO_LOCAL),
        dados_completos: false,
        campos_faltando: ['foto_local'],
      };
      pediuFotoLocal = true;
    } else if (out.proxima_acao === 'pergunta' && obrCompletos && tentativasFoto === 0
               && !temFotoLocal && (out.campos_conflitantes?.length ?? 0) === 0
               && !(out.campos_faltando || []).includes('tipo_foto')
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
    const ageOnlyGuard = rejectCadastroDateFromAgeOnly(out, mensagem, conversa?.dados_cadastro?.data_nascimento);
    if (ageOnlyGuard.violated) {
      console.warn('[agent/route] silently force pergunta (cadastro age-only):', ageOnlyGuard.violated.reason);
      out = ageOnlyGuard.out;
      invariantCheck = { valid: false, reason: ageOnlyGuard.violated.reason };
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
  const enforced = estado_atual === 'cadastro' ? enforceMenorIdade(working, mensagem) : working;

  // Sub-3.2: orquestrator side-effects pra Proposta
  const sideEffects = [];
  let finalOut = enforced;
  if (PROPOSTA_SUBSTATES.has(estado_atual)) {
    finalOut = await executeOrchestration(enforced, {
      env, tenant, conversa, telefone, sideEffects, estado_atual,
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
    escalation: finalOut.escalation || null,
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

export async function executeOrchestration(out, { env, tenant, conversa, telefone, sideEffects, clientContext, estado_atual }) {
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
      if (!existing && estado_atual && estado_atual !== 'escolhendo_horario') {
        sideEffects.push({ tool: 'reservar-horario', ok: false, skipped: `estado_${estado_atual}` });
        return forcePergunta(out, 'Antes de gerar o sinal, escolhe um dos horarios que te mandei?');
      }
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
      const respostaDesconto = 'Geralmente, pela qualidade do trabalho, esse é o valor que o tatuador passou.\n\nMas vou passar tua proposta pra ele e te retorno aqui, beleza?';
      const r = await callTool(env, 'enviar-objecao-tatuador', {
        tenant_id: tenant.id,
        telefone,
        valor_pedido_cliente: out.valor_pedido_cliente,
      });
      sideEffects.push({ tool: 'enviar-objecao-tatuador', ok: r.ok });
      if (!r.ok) return forcePergunta(out, respostaDesconto);
      return { ...out, resposta_cliente: respostaDesconto };
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
