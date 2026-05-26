// functions/_lib/conversation-router.js
// Router leve de atendimento antes dos agents operacionais.
//
// Slice 1: intents texto-only de atendimento lateral em estados de coleta:
// - preco_generico
// - tempo_sessao
// - processo_tatuagem
// - pergunta_imagem
//
// O contrato retorna um output compatível com runAgent para o pipeline poder
// persistir/enviar sem criar um segundo caminho de side effects.

import { extractLocalAnswer, extractStyleAnswer, resolvePendingFormQuestion } from './conversation-policy.js';
import { composeRouterResponse } from './conversation-response-composer.js';

const HANDLED_STATES = new Set(['tattoo', 'cadastro']);

function stripAccents(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalize(text) {
  return stripAccents(text)
    .replace(/[^\p{L}\p{N}\s$,.?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasValue(v) {
  return v !== null && v !== undefined && v !== '';
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

function missingTattooFields(dados = {}) {
  return ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo'].filter(k => !hasValue(dados[k]));
}

function nextTattooField(conversa = {}) {
  const dados = conversa.dados_coletados || {};
  const missing = missingTattooFields(dados);
  return missing[0] || 'foto_local';
}

function cleanDescricao(raw) {
  return String(raw || '')
    .replace(/\b(quanto|quantop|qnto)\s+tempo.*$/i, '')
    .replace(/\bquanto\s+(fica|custa|e).*$/i, '')
    .replace(/\bqual\s+valor.*$/i, '')
    .replace(/\bme\s+passa\s+(o\s+)?preco.*$/i, '')
    .replace(/\b(no|na|em)\s+(braco|antebraco|perna|costas|peito|ombro|pulso|mao|pescoco|panturrilha|coxa|canela|barriga|costela|virilha|bunda|gluteo|gluteos|nadega|nadegas)\b.*$/i, '')
    .replace(/\b(realismo|realista|fineline|fine line|blackwork|old school|minimalista|colorida|colorido|preto e cinza|preto e branco)\b/gi, '')
    .replace(/\b(uma?|uns|umas|de|do|da|tatuagem|tattoo|tauagem)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTattooHints(message, dados = {}) {
  const s = normalize(message);
  const extracted = {};

  if (!hasValue(dados.local_corpo)) {
    const local = extractLocalAnswer(s);
    if (local) extracted.local_corpo = local;
  }

  if (!hasValue(dados.estilo)) {
    const estilo = extractStyleAnswer(s);
    if (estilo) extracted.estilo = estilo;
  }

  if (!hasValue(dados.descricao_curta)) {
    const patterns = [
      /\b(?:tatuagem|tattoo|tauagem)\s+de\s+(?:um|uma|uns|umas)?\s*([a-z0-9 ]+?)(?=\b(?:no|na|em|com|realismo|realista|fineline|fine line|blackwork|old school|minimalista|colorida|colorido|preto|quanto|quantop|qnto|qual|me passa|$))/,
      /\b(?:quero|queria|penso em|pretendo)\s+(?:fazer\s+)?(?:uma?\s+)?(?:tatuagem|tattoo|tauagem)?\s*(?:de\s+)?(?:um|uma)?\s*([a-z0-9 ]+?)(?=\b(?:no|na|em|realismo|realista|fineline|fine line|blackwork|old school|minimalista|colorida|colorido|preto|quanto|quantop|qnto|qual|me passa|$))/,
      /\b(?:um|uma)\s+([a-z0-9 ]+?)(?=\s+\b(?:no|na|em)\b)/,
    ];
    for (const re of patterns) {
      const m = s.match(re);
      const desc = cleanDescricao(m?.[1]);
      if (desc && desc.length >= 3 && !/^(fazer|tatuagem|tattoo|tauagem)$/.test(desc)) {
        extracted.descricao_curta = desc;
        break;
      }
    }
    if (!extracted.descricao_curta && /\bhomenagem\b/.test(s)) {
      const alvo = s.match(/\b(pai|mae|mãe|avo|avô|avó|irmao|irmão|irma|irmã|filho|filha)\b/)?.[1];
      const elementos = [];
      if (/\bpassaros?\b/.test(s)) elementos.push('passaros');
      if (/\bfrase\b/.test(s)) elementos.push('frase');
      if (alvo || elementos.length > 0) {
        extracted.descricao_curta = [
          'homenagem',
          alvo ? `ao ${alvo}` : null,
          elementos.length ? `com ${elementos.join(' e ')}` : null,
        ].filter(Boolean).join(' ');
      }
    }
  }

  return extracted;
}

function tattooResumeQuestion(conversa = {}) {
  const next = nextTattooField(conversa);
  if (next === 'descricao_curta') return 'Me conta o que tu pensa em tatuar?';
  if (next === 'local_corpo') return 'Tu imagina fazer em qual parte do corpo?';
  if (next === 'altura_cm') return 'Qual tua altura?';
  if (next === 'estilo') return 'Tu prefere qual estilo pra essa tattoo?';
  return 'Consegue mandar uma foto do local onde tu quer tatuar?';
}

function cadastroResumeQuestion(conversa = {}) {
  const dados = conversa.dados_cadastro || {};
  if (!hasValue(dados.nome) && !hasValue(dados.data_nascimento)) {
    return 'Pra liberar teu orçamento, me passa nome completo e data de nascimento?';
  }
  if (!hasValue(dados.nome)) return 'Me passa teu nome completo?';
  if (!hasValue(dados.data_nascimento)) return 'Me passa tua data de nascimento completa?';
  if (!hasValue(dados.email) && dados.email_recusado !== true) return 'E o e-mail? Se preferir seguir sem, me avisa';
  const nome = firstName(dados.nome);
  const prefix = nome ? `Fechado, ${nome}! ` : 'Fechado! ';
  return `${prefix}O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho.`;
}

function resumeQuestionForState(estado, conversa) {
  if (estado === 'cadastro') return cadastroResumeQuestion(conversa);
  return tattooResumeQuestion(conversa);
}

function isNegotiation(text) {
  return /\b(faz|fecha|consegue|deixa|rola|aceita|topa)\b/.test(text)
    && /\b(?:r\$ ?)?\d{2,5}(?:[,.]\d{2})?\b/.test(text);
}

function isNonPriceValueContext(text) {
  return /\bvalor sentimental\b/.test(text)
    || /\bvalor emocional\b/.test(text)
    || /\bvalor afetivo\b/.test(text);
}

function intentDecision(intent, { confidence, risk, reason, can_mutate_state = false }) {
  return { intent, confidence, risk, reason, can_mutate_state };
}

const DEFAULT_TENANT_HANDOFF_TRIGGERS = ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'];
const GENERIC_HANDOFF_TRIGGER_ALIASES = new Map([
  ['mao', ['mao', 'maos']],
  ['pescoco', ['pescoco']],
  ['rosto', ['rosto', 'face', 'facial']],
  ['retoque', ['retoque', 'retocar']],
]);
const ROUTER_HANDLED_HANDOFF_TRIGGERS = new Set(['cobertura']);

function tenantHandoffTriggers(clientContext = {}, tenant = {}) {
  const fromContext = clientContext?.tenant_rules?.gatilhos_handoff;
  const fromTenant = tenant?.gatilhos_handoff;
  const source = Array.isArray(fromContext) && fromContext.length
    ? fromContext
    : Array.isArray(fromTenant) && fromTenant.length
      ? fromTenant
      : DEFAULT_TENANT_HANDOFF_TRIGGERS;
  return source
    .map(trigger => normalize(trigger))
    .filter(Boolean);
}

function triggerTerms(trigger) {
  const aliases = GENERIC_HANDOFF_TRIGGER_ALIASES.get(trigger) || [trigger];
  return aliases
    .map(term => normalize(term))
    .filter(Boolean);
}

function detectTenantHandoffTrigger(text, { tenant, clientContext } = {}) {
  const s = normalize(text);
  if (!s) return null;
  const triggers = tenantHandoffTriggers(clientContext, tenant);
  for (const trigger of triggers) {
    if (ROUTER_HANDLED_HANDOFF_TRIGGERS.has(trigger)) continue;
    if (trigger.includes('_')) continue;
    for (const term of triggerTerms(trigger)) {
      const re = new RegExp(`(^|\\s)${term}(\\s|$)`);
      if (re.test(s)) {
        return {
          ...intentDecision('tenant_handoff_trigger', {
            confidence: 0.88,
            risk: 'high',
            reason: 'tenant_configured_handoff_trigger_detected',
            can_mutate_state: true,
          }),
          matched_trigger: trigger,
        };
      }
    }
  }
  return null;
}

function detectIntent(text) {
  const s = normalize(text);
  if (!s) return null;

  const pedidoHumano =
    /\b(quero|queria|preciso|posso|pode|consegue|tem como|da pra|d[aá] pra)\b.{0,40}\b(falar|conversar|chamar|atender|passar|encaminhar)\b.{0,40}\b(tatuador|humano|atendente|pessoa|responsavel|responsável)\b/.test(s)
    || /\b(falar|conversar)\b.{0,30}\b(com|com o|com a)\b.{0,20}\b(tatuador|humano|atendente|responsavel|responsável)\b/.test(s)
    || /\bme\s+(passa|encaminha|chama|bota)\b.{0,30}\b(tatuador|humano|atendente|responsavel|responsável)\b/.test(s);
  if (pedidoHumano) return intentDecision('human_requested', {
    confidence: 0.9,
    risk: 'high',
    reason: 'explicit_human_or_tattoo_artist_request',
    can_mutate_state: true,
  });

  const clienteIrritado =
    /\b(voces|vocês|atendimento|ninguem|ninguém|bot|robo|robô)\b.{0,60}\b(demoram|demora|demorando|nao respondem|não respondem|nao responde|não responde|ruim|horrivel|horrível|pessimo|péssimo|irritado|irritada|chateado|chateada|cansado|cansada)\b/.test(s)
    || /\b(estou|to|tô|fiquei)\b.{0,30}\b(irritado|irritada|chateado|chateada|cansado|cansada)\b/.test(s);
  if (clienteIrritado) return intentDecision('client_upset', {
    confidence: 0.86,
    risk: 'high',
    reason: 'complaint_or_frustration_about_service',
    can_mutate_state: true,
  });

  const cobertura =
    /\b(cobrir|cobertura|cover up|coverup|tapar|disfarcar|disfarçar)\b/.test(s)
    && /\b(tattoo|tatuagem|desenho|nome|frase|antiga|velha|ja tenho|já tenho|tenho uma)\b/.test(s);
  if (cobertura) return intentDecision('cobertura', {
    confidence: 0.9,
    risk: 'high',
    reason: 'cover_up_or_existing_tattoo_detected',
    can_mutate_state: true,
  });

  const perguntaImagem =
    /\b(o que|que)\s+(voce|vc|tu)\s+(viu|ve|consegue ver|entendeu|achou)\b.*\b(imagem|foto|referencia|desenho)\b/.test(s)
    || /\b(voce|vc|tu)\s+(viu|ve|consegue ver|entendeu|achou)\b.*\b(imagem|foto|referencia|desenho)\b/.test(s)
    || /\b(o que|que)\s+(aparece|tem)\b.*\b(nessa|na|nessa foto|imagem|foto)\b/.test(s)
    || /\b(essa|a)\s+(imagem|foto|referencia)\s+(serve|da pra ver|d[aá] pra ver)\b/.test(s)
    || /\b(da pra ver|d[aá] pra ver|consegue ver)\b.*\b(tattoo|desenho|imagem|foto|referencia)\b/.test(s);
  if (perguntaImagem) return intentDecision('pergunta_imagem', {
    confidence: 0.82,
    risk: 'medium',
    reason: 'image_interpretation_question_without_media_context',
  });

  const historiaVida =
    (/\b(homenagem|faleceu|falecido|superacao|supera[cç]ao|primeira tattoo|primeira tatuagem|medo|receio)\b/.test(s)
      || /\bsignificado\b.{0,40}\bimportante\b/.test(s))
    && !isNegotiation(s);
  if (historiaVida) return intentDecision('historia_vida', {
    confidence: 0.84,
    risk: 'medium',
    reason: 'emotional_context_or_life_story_detected',
  });

  const processo =
    /\b(como funciona|qual o processo|quais os passos|como faco para marcar|como faço para marcar|como marca|como agendar|primeiro eu mando|preciso pagar antes)\b/.test(s)
    || /\bcomo e para fazer uma tattoo\b/.test(s)
    || /\bcomo e pra fazer uma tattoo\b/.test(s);
  if (processo) return intentDecision('processo_tatuagem', {
    confidence: 0.9,
    risk: 'medium',
    reason: 'tattoo_process_or_booking_flow_question',
  });

  const tempo =
    /\b((quanto|quantop|qnto) tempo|quantas horas|demora muito|demora quanto|faz em uma sessao|faz em 1 sessao|uma sessao|precisa de mais de uma sessao|mesmo dia|quantas sessoes|em quantas sessoes|seria em quantas sessoes)\b/.test(s)
    && /\b(demora|tempo|horas|sessao|sessoes|dia)\b/.test(s);
  if (tempo) return intentDecision('tempo_sessao', {
    confidence: 0.88,
    risk: 'medium',
    reason: 'session_duration_or_number_of_sessions_question',
  });

  const preco =
    !isNegotiation(s)
    && !isNonPriceValueContext(s)
    && (
      /\b(quanto fica|qual valor|me passa preco|me passa o preco|preco|valor|quanto custa|fica caro|tem uma media)\b/.test(s)
      || /\bquanto e\b/.test(s)
      || /\bquanto (que|q) e\b/.test(s)
    );
  if (preco) return intentDecision('preco_generico', {
    confidence: 0.86,
    risk: 'high',
    reason: 'generic_price_question_without_negotiation',
  });

  return null;
}

function responseForIntent(intent, estado, conversa, context = {}) {
  const resume = resumeQuestionForState(estado, conversa);
  const nextField = estado === 'tattoo' ? nextTattooField(conversa) : null;
  return composeRouterResponse({ intent, estado, resume, nextField, context });
}

function shouldHandleCadastroPendingAnswer(pendingResolution) {
  if (!pendingResolution?.answered) return false;
  const extracted = pendingResolution.extracted || {};
  if (pendingResolution.field === 'nome_completo') return hasValue(extracted.nome);
  if (pendingResolution.field === 'data_nascimento') return hasValue(extracted.data_nascimento);
  if (pendingResolution.field === 'cadastro_nome_data') {
    return hasValue(extracted.nome) && !hasValue(extracted.data_nascimento);
  }
  return false;
}

function cadastroPendingAnswerOutput({ pendingResolution, estado_atual, conversa, historico }) {
  const extracted = { ...(pendingResolution.extracted || {}) };
  const conversaParaRetomada = {
    ...conversa,
    dados_cadastro: {
      ...(conversa?.dados_cadastro || {}),
      ...extracted,
    },
  };
  return {
    ok: true,
    handled_by: 'conversation_router',
    intent: 'cadastro_pending_answer',
    confidence: pendingResolution.confidence || 0.8,
    risk: 'low',
    reason: `pending_${pendingResolution.field}_answered`,
    can_mutate_state: true,
    resposta_cliente: resumeQuestionForState(estado_atual, conversaParaRetomada),
    estado_novo: estado_atual,
    dados_persistidos: extracted,
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    agent_usado: 'cadastro',
    side_effects: [],
    urls_portfolio: [],
    analise_imagens: null,
    cobertura_suspeita: null,
    pending_resolution: {
      field: pendingResolution.field,
      reason: pendingResolution.reason,
      history_turns_n: historico?.length || 0,
    },
  };
}

function escalationOutput({ detected, estado_atual, intent }) {
  if (!['cobertura', 'human_requested', 'client_upset', 'tenant_handoff_trigger'].includes(intent)) return null;
  if (intent === 'human_requested') {
    return {
      ok: true,
      handled_by: 'conversation_router',
      intent,
      confidence: detected.confidence,
      risk: detected.risk,
      reason: detected.reason,
      can_mutate_state: detected.can_mutate_state,
      resposta_cliente: 'Claro. Vou acionar o tatuador para assumir por aqui e te orientar direto.',
      estado_novo: 'aguardando_tatuador',
      dados_persistidos: {},
      dados_completos: false,
      campos_faltando: ['human_requested_trigger'],
      campos_conflitantes: [],
      proxima_acao: 'erro',
      agent_usado: estado_atual === 'cadastro' ? 'cadastro' : 'conversation_router',
      side_effects: [],
      urls_portfolio: [],
      analise_imagens: null,
      cobertura_suspeita: null,
      escalation: {
        required: true,
        reason_code: 'human_requested',
        reason_label: 'cliente pediu humano',
        severity: 'medium',
        source: 'conversation_router',
        requires_orcid: false,
      },
    };
  }

  if (intent === 'client_upset') {
    return {
      ok: true,
      handled_by: 'conversation_router',
      intent,
      confidence: detected.confidence,
      risk: detected.risk,
      reason: detected.reason,
      can_mutate_state: detected.can_mutate_state,
      resposta_cliente: 'Entendi, desculpa pela frustração. Vou acionar uma pessoa do estúdio para assumir por aqui e te ajudar direto.',
      estado_novo: 'aguardando_tatuador',
      dados_persistidos: {},
      dados_completos: false,
      campos_faltando: ['client_upset_trigger'],
      campos_conflitantes: [],
      proxima_acao: 'erro',
      agent_usado: estado_atual === 'cadastro' ? 'cadastro' : 'conversation_router',
      side_effects: [],
      urls_portfolio: [],
      analise_imagens: null,
      cobertura_suspeita: null,
      escalation: {
        required: true,
        reason_code: 'client_upset',
        reason_label: 'cliente irritado',
        severity: 'high',
        source: 'conversation_router',
        requires_orcid: false,
      },
    };
  }

  if (intent === 'tenant_handoff_trigger') {
    return {
      ok: true,
      handled_by: 'conversation_router',
      intent,
      confidence: detected.confidence,
      risk: detected.risk,
      reason: detected.reason,
      can_mutate_state: detected.can_mutate_state,
      matched_trigger: detected.matched_trigger || null,
      resposta_cliente: 'Pra essa região ou caso, o tatuador precisa avaliar direto com segurança. Vou acionar uma pessoa do estúdio para assumir por aqui.',
      estado_novo: 'aguardando_tatuador',
      dados_persistidos: {},
      dados_completos: false,
      campos_faltando: ['tenant_handoff_trigger'],
      campos_conflitantes: [],
      proxima_acao: 'erro',
      agent_usado: estado_atual === 'cadastro' ? 'cadastro' : 'conversation_router',
      side_effects: [],
      urls_portfolio: [],
      analise_imagens: null,
      cobertura_suspeita: null,
      escalation: {
        required: true,
        reason_code: 'tenant_handoff_trigger',
        reason_label: 'gatilho de handoff do estúdio',
        severity: 'high',
        source: 'tenant_rules',
        requires_orcid: false,
        matched_tenant_trigger: detected.matched_trigger || null,
      },
    };
  }

  return {
    ok: true,
    handled_by: 'conversation_router',
    intent,
    confidence: detected.confidence,
    risk: detected.risk,
    reason: detected.reason,
    can_mutate_state: detected.can_mutate_state,
    resposta_cliente: 'Pra cobertura, o tatuador precisa avaliar direto com segurança antes de seguir. Vou acionar ele para olhar teu caso e te orientar pelos próximos passos.',
    estado_novo: 'aguardando_tatuador',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: ['cover_up_trigger'],
    campos_conflitantes: [],
    proxima_acao: 'erro',
    agent_usado: estado_atual === 'cadastro' ? 'cadastro' : 'conversation_router',
    side_effects: [],
    urls_portfolio: [],
    analise_imagens: null,
    cobertura_suspeita: true,
    escalation: {
      required: true,
      reason_code: 'cover_up',
      reason_label: 'cobertura / cover-up',
      severity: 'high',
      source: 'conversation_router',
      requires_orcid: false,
    },
  };
}

export function routeConversationTurn({ estado_atual, mensagem, conversa, tenant, clientContext, historico, disabled = false }) {
  if (disabled) return null;
  if (!HANDLED_STATES.has(estado_atual)) return null;

  const baseDetected = detectIntent(mensagem);
  const tenantDetected = estado_atual === 'tattoo'
    ? detectTenantHandoffTrigger(mensagem, { tenant, clientContext })
    : null;
  const baseHasExplicitEscalation = ['human_requested', 'client_upset', 'cobertura'].includes(baseDetected?.intent);
  const detected = tenantDetected && !baseHasExplicitEscalation ? tenantDetected : baseDetected;

  if (detected) {
    const escalation = escalationOutput({ detected, estado_atual, intent: detected.intent });
    if (escalation) return escalation;
  }

  const pendingResolution = resolvePendingFormQuestion({ historico, mensagem });
  if (!detected && estado_atual === 'cadastro' && shouldHandleCadastroPendingAnswer(pendingResolution)) {
    return cadastroPendingAnswerOutput({ pendingResolution, estado_atual, conversa, historico });
  }
  if (!detected) return null;

  const extracted = estado_atual === 'tattoo'
    ? {
        ...extractTattooHints(mensagem, conversa?.dados_coletados || {}),
        ...pendingResolution.extracted,
      }
    : { ...pendingResolution.extracted };
  const conversaParaRetomada = estado_atual === 'tattoo'
    ? {
        ...conversa,
        dados_coletados: {
          ...(conversa?.dados_coletados || {}),
          ...extracted,
        },
      }
    : {
        ...conversa,
        dados_cadastro: {
          ...(conversa?.dados_cadastro || {}),
          ...extracted,
        },
      };

  const resposta = responseForIntent(detected.intent, estado_atual, conversaParaRetomada, { tenant, clientContext, historico, pendingResolution });
  if (!resposta) return null;

  return {
    ok: true,
    handled_by: 'conversation_router',
    intent: detected.intent,
    confidence: detected.confidence,
    risk: detected.risk,
    reason: detected.reason,
    can_mutate_state: detected.can_mutate_state,
    resposta_cliente: resposta,
    estado_novo: estado_atual,
    dados_persistidos: extracted,
    dados_completos: false,
    campos_faltando: estado_atual === 'tattoo'
      ? missingTattooFields(conversaParaRetomada?.dados_coletados || {})
      : [],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    agent_usado: estado_atual === 'cadastro' ? 'cadastro' : 'conversation_router',
    side_effects: [],
    urls_portfolio: [],
    analise_imagens: null,
    cobertura_suspeita: null,
  };
}

export const _test = {
  detectIntent,
  detectTenantHandoffTrigger,
  normalize,
  resumeQuestionForState,
  nextTattooField,
  extractTattooHints,
};
