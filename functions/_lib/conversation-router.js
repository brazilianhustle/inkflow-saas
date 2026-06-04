// functions/_lib/conversation-router.js
// Router leve de atendimento antes dos agents operacionais.
//
// Slice 1: intents texto-only de atendimento lateral em estados de coleta:
// - preco_generico
// - tempo_sessao
// - processo_tatuagem
// - pergunta_imagem
// - portfolio_requested
//
// O contrato retorna um output compatível com runAgent para o pipeline poder
// persistir/enviar sem criar um segundo caminho de side effects.

import { extractLocalAnswer, extractStyleAnswer, resolveExplicitAge, resolveHeightCm, resolvePendingFormQuestion, resolveTattooSizeCm } from './conversation-policy.js';
import { composeRouterResponse } from './conversation-response-composer.js';
import { cadastroResumeQuestion, firstContactSoftIntro, minorAgeHandoffReply } from './conversation-voice-policy.js';

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
    .replace(/\b(uma?|uns|umas|de|do|da|fazer|fzr|tatuagem|tattoo|tauagem)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWeakDescricao(value) {
  const desc = normalize(value);
  return !desc
    || desc.length < 3
    || /^(fazer|fzr|tatuagem|tattoo|tauagem|desenho|ideia)$/.test(desc);
}

export function extractTattooHints(message, dados = {}) {
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

  if (!hasValue(dados.altura_cm)) {
    const altura = resolveHeightCm(s);
    if (altura.answered && altura.value) extracted.altura_cm = altura.value;
  }

  if (!hasValue(dados.tamanho_cm)) {
    const tamanho = resolveTattooSizeCm(s);
    if (tamanho.answered && tamanho.value) extracted.tamanho_cm = tamanho.value;
  }

  if (!hasValue(dados.descricao_curta) || isWeakDescricao(dados.descricao_curta)) {
    const patterns = [
      /\b(?:no|na|em)\s+(?:braco|antebraco|perna|costas|peito|ombro|pulso|mao|pescoco|panturrilha|coxa|canela|barriga|costela|virilha|bunda|gluteo|gluteos|nadega|nadegas)\s+(?:um|uma|uns|umas)\s+([a-z0-9 ]+?)(?=\b(?:com|realismo|realista|fineline|fine line|blackwork|old school|minimalista|colorida|colorido|preto|quanto|quantop|qnto|qual|me passa|$))/,
      /\b(?:tatuagem|tattoo|tauagem)\s+de\s+(?:um|uma|uns|umas)?\s*([a-z0-9 ]+?)(?=\b(?:no|na|em|com|realismo|realista|fineline|fine line|blackwork|old school|minimalista|colorida|colorido|preto|quanto|quantop|qnto|qual|me passa|$))/,
      /\b(?:quero|queria|penso em|pretendo)\s+(?:(?:fazer|fzr)\s+)?(?:uma?\s+)?(?:tatuagem|tattoo|tauagem)?\s*(?:de\s+)?(?:um|uma)?\s*([a-z0-9 ]+?)(?=\b(?:no|na|em|realismo|realista|fineline|fine line|blackwork|old school|minimalista|colorida|colorido|preto|quanto|quantop|qnto|qual|me passa|$))/,
      /\b(?:um|uma)\s+([a-z0-9 ]+?)(?=\s+\b(?:no|na|em)\b)/,
    ];
    for (const re of patterns) {
      const m = s.match(re);
      const desc = cleanDescricao(m?.[1]);
      if (desc && desc.length >= 3 && !isWeakDescricao(desc)) {
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

function tattooBriefAck(dados = {}) {
  const desc = String(dados.descricao_curta || '').trim();
  const local = String(dados.local_corpo || '').trim();
  if (desc && local) return `Boa, peguei a ideia do ${desc} na ${local}`;
  if (desc) return `Boa, peguei a ideia do ${desc}`;
  if (local) return `Boa, peguei o local: ${local}`;
  return '';
}

function shouldHandleTattooMultiInfo(extracted = {}) {
  const keys = ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo', 'tamanho_cm']
    .filter(key => hasValue(extracted[key]));
  return keys.length >= 2;
}

function answeredTattooCoreFields(extracted = {}) {
  return ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo']
    .filter(key => hasValue(extracted[key]));
}

function shouldHandleTattooPendingAnswer(extracted = {}, conversa = {}) {
  const next = nextTattooField(conversa);
  return next !== 'foto_local' && hasValue(extracted[next]);
}

function tattooResumeQuestion(conversa = {}) {
  const next = nextTattooField(conversa);
  if (next === 'descricao_curta') return 'Me conta o que tu pensa em tatuar?';
  if (next === 'local_corpo') return 'Tu imagina fazer em qual parte do corpo?';
  if (next === 'altura_cm') return 'Qual tua altura?';
  if (next === 'estilo') return 'Tu prefere qual estilo pra essa tattoo?';
  return 'Consegue mandar uma foto do local onde tu quer tatuar?';
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
  const fromProduct = clientContext?.tenant_product?.handoff_policy?.triggers;
  const fromContext = clientContext?.tenant_rules?.gatilhos_handoff;
  const fromTenant = tenant?.gatilhos_handoff;
  const source = Array.isArray(fromProduct) && fromProduct.length
    ? fromProduct
    : Array.isArray(fromContext) && fromContext.length
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

  const portfolio =
    /\b(portfolio|portifolio|portf[oó]lio|trabalhos?|exemplos?|refer[eê]ncias?|fotos?|instagram|insta)\b/.test(s)
    && /\b(tem|manda|mandar|mostra|mostrar|ver|vejo|quero|queria|pode|consegue|existe|algum|alguns|algumas)\b/.test(s);
  if (portfolio) return intentDecision('portfolio_requested', {
    confidence: 0.9,
    risk: 'medium',
    reason: 'portfolio_or_work_examples_requested',
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

function normalizedList(values = []) {
  return Array.isArray(values)
    ? values.map(value => normalize(value)).filter(Boolean)
    : [];
}

function detectTenantUnsupportedStyle(text, clientContext = {}) {
  const style = extractStyleAnswer(text);
  if (!style) return null;
  const styleNorm = normalize(style);
  const tenantRules = clientContext?.tenant_rules || {};
  const stylePolicy = clientContext?.tenant_product?.style_policy || {};
  const accepted = normalizedList(
    Array.isArray(stylePolicy.accepted_styles) && stylePolicy.accepted_styles.length
      ? stylePolicy.accepted_styles
      : tenantRules.estilos_aceitos
  );
  const rejected = normalizedList(
    Array.isArray(stylePolicy.rejected_styles) && stylePolicy.rejected_styles.length
      ? stylePolicy.rejected_styles
      : tenantRules.estilos_recusados
  );
  const hardCatalog = stylePolicy.out_of_catalog_behavior
    ? stylePolicy.out_of_catalog_behavior === 'reject'
    : tenantRules.bloqueia_estilos_fora_catalogo === true;
  if (rejected.includes(styleNorm)) {
    return {
      style,
      reason: 'tenant_style_rejected',
    };
  }
  if (hardCatalog && accepted.length > 0 && !accepted.includes(styleNorm)) {
    return {
      style,
      reason: 'tenant_style_not_accepted',
    };
  }
  return null;
}

function shouldHandleCadastroPendingAnswer(pendingResolution) {
  if (!pendingResolution?.answered) return false;
  const extracted = pendingResolution.extracted || {};
  if (pendingResolution.field === 'nome_completo') return hasValue(extracted.nome);
  if (pendingResolution.field === 'data_nascimento') return hasValue(extracted.data_nascimento);
  if (pendingResolution.field === 'email') return hasValue(extracted.email) || extracted.email_recusado === true;
  if (pendingResolution.field === 'cadastro_nome_data') {
    return hasValue(extracted.nome) && !hasValue(extracted.data_nascimento);
  }
  return false;
}

function shouldHandleTattooShortNamePendingAnswer(pendingResolution) {
  if (!pendingResolution?.answered) return false;
  return pendingResolution.field === 'nome_curto' && hasValue(pendingResolution.extracted?.nome_preferido);
}

function ageFromBirthDate(isoDate, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return null;
  const [year, month, day] = isoDate.split('-').map(Number);
  const today = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(today.getTime())) return null;
  let age = today.getUTCFullYear() - year;
  const currentMonth = today.getUTCMonth() + 1;
  const currentDay = today.getUTCDate();
  if (currentMonth < month || (currentMonth === month && currentDay < day)) age -= 1;
  return Number.isFinite(age) ? age : null;
}

function minorAgeBirthDateOutput({ data_nascimento }) {
  return {
    ok: true,
    handled_by: 'conversation_router',
    intent: 'minor_age_birthdate',
    confidence: 0.92,
    risk: 'high',
    reason: 'pending_birthdate_under_18',
    can_mutate_state: true,
    resposta_cliente: minorAgeHandoffReply(),
    estado_novo: 'aguardando_tatuador',
    dados_persistidos: { data_nascimento },
    dados_completos: false,
    campos_faltando: ['menor_idade_trigger'],
    campos_conflitantes: [],
    proxima_acao: 'erro',
    agent_usado: 'cadastro',
    side_effects: [],
    urls_portfolio: [],
    analise_imagens: null,
    cobertura_suspeita: null,
    escalation: {
      required: true,
      reason_code: 'minor_age',
      reason_label: 'menoridade / responsavel legal',
      severity: 'high',
      source: 'conversation_router',
      requires_orcid: false,
    },
    minor_age_resolution: {
      age: ageFromBirthDate(data_nascimento),
      data_nascimento_persistida: true,
    },
  };
}

function cadastroPendingAnswerOutput({ pendingResolution, estado_atual, conversa, historico }) {
  const extracted = { ...(pendingResolution.extracted || {}) };
  if (pendingResolution.field === 'data_nascimento') {
    const age = ageFromBirthDate(extracted.data_nascimento);
    if (Number.isFinite(age) && age < 18) {
      return minorAgeBirthDateOutput({ data_nascimento: extracted.data_nascimento });
    }
  }
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
    reason: pendingResolution.field === 'email' && extracted.email_recusado === true
      ? 'pending_email_refused'
      : `pending_${pendingResolution.field}_answered`,
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

function tattooMultiInfoOutput({ extracted, estado_atual, conversa, tenant, clientContext, historico }) {
  const dadosAtualizados = {
    ...(conversa?.dados_coletados || {}),
    ...extracted,
  };
  const conversaParaRetomada = {
    ...conversa,
    dados_coletados: dadosAtualizados,
  };
  const missing = missingTattooFields(dadosAtualizados);
  const nextField = missing[0] || 'foto_local';
  const intro = clientContext?.is_first_contact === true
    ? `${firstContactSoftIntro()}\n\n`
    : '';
  const ack = tattooBriefAck(dadosAtualizados);
  const resposta = nextField === 'foto_local'
    ? `${intro}${ack || 'Boa, ja peguei a ideia principal'}. Consegue mandar uma foto do local onde tu quer tatuar?`
    : `${intro}${ack ? `${ack}. ` : ''}${tattooResumeQuestion(conversaParaRetomada)}`;
  const dadosPersistidos = nextField === 'foto_local'
    ? {
        ...extracted,
        tentativas_foto_local: Math.max(Number(dadosAtualizados.tentativas_foto_local || 0), 1),
      }
    : extracted;

  return {
    ok: true,
    handled_by: 'conversation_router',
    intent: 'multi_info',
    confidence: 0.84,
    risk: 'medium',
    reason: 'multiple_tattoo_fields_detected',
    can_mutate_state: true,
    resposta_cliente: resposta,
    estado_novo: estado_atual,
    dados_persistidos: dadosPersistidos,
    dados_completos: false,
    campos_faltando: missing,
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    agent_usado: 'conversation_router',
    side_effects: [],
    urls_portfolio: [],
    analise_imagens: null,
    cobertura_suspeita: null,
    multi_info_resolution: {
      extracted_fields: Object.keys(extracted).filter(key => hasValue(extracted[key])),
      next_field: nextField,
      history_turns_n: historico?.length || 0,
    },
  };
}

function tattooPendingAnswerOutput({ extracted, estado_atual, conversa, clientContext }) {
  const nextAnswered = nextTattooField(conversa);
  const dadosAtualizados = {
    ...(conversa?.dados_coletados || {}),
    ...extracted,
  };
  const conversaParaRetomada = {
    ...conversa,
    dados_coletados: dadosAtualizados,
  };
  const missing = missingTattooFields(dadosAtualizados);
  const nextField = missing[0] || 'foto_local';
  const dadosPersistidos = nextField === 'foto_local'
    ? {
        ...extracted,
        tentativas_foto_local: Math.max(Number(dadosAtualizados.tentativas_foto_local || 0), 1),
      }
    : extracted;
  const intro = clientContext?.is_first_contact === true
    ? `${firstContactSoftIntro()}\n\n`
    : '';
  const ack = tattooBriefAck(dadosAtualizados);
  const resposta = `${intro}${ack ? `${ack}. ` : ''}${tattooResumeQuestion(conversaParaRetomada)}`;

  return {
    ok: true,
    handled_by: 'conversation_router',
    intent: 'tattoo_pending_answer',
    confidence: 0.84,
    risk: 'medium',
    reason: `pending_${nextAnswered}_answered`,
    can_mutate_state: true,
    resposta_cliente: resposta,
    estado_novo: estado_atual,
    dados_persistidos: dadosPersistidos,
    dados_completos: false,
    campos_faltando: missing,
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    agent_usado: 'conversation_router',
    side_effects: [],
    urls_portfolio: [],
    analise_imagens: null,
    cobertura_suspeita: null,
    pending_answer_resolution: {
      answered_field: nextAnswered,
      next_field: nextField,
    },
  };
}

function tattooShortNamePendingAnswerOutput({ pendingResolution, estado_atual, conversa, historico }) {
  const extracted = { ...(pendingResolution.extracted || {}) };
  const conversaParaRetomada = {
    ...conversa,
    dados_coletados: {
      ...(conversa?.dados_coletados || {}),
      ...extracted,
    },
  };
  const missing = missingTattooFields(conversaParaRetomada.dados_coletados || {});
  return {
    ok: true,
    handled_by: 'conversation_router',
    intent: 'tattoo_name_pending_answer',
    confidence: pendingResolution.confidence || 0.8,
    risk: 'low',
    reason: 'pending_nome_curto_answered',
    can_mutate_state: true,
    resposta_cliente: `Boa, ${pendingResolution.displayName}. ${tattooResumeQuestion(conversaParaRetomada)}`,
    estado_novo: estado_atual,
    dados_persistidos: extracted,
    dados_completos: false,
    campos_faltando: missing,
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    agent_usado: 'conversation_router',
    side_effects: [],
    urls_portfolio: [],
    analise_imagens: null,
    cobertura_suspeita: null,
    pending_answer_resolution: {
      answered_field: pendingResolution.field,
      next_field: missing[0] || 'foto_local',
      history_turns_n: historico?.length || 0,
    },
  };
}

function portfolioOutput({ detected, estado_atual, mensagem, conversa, clientContext }) {
  const extracted = extractTattooHints(mensagem, conversa?.dados_coletados || {});
  const estilo = extracted.estilo || conversa?.dados_coletados?.estilo || null;
  const camposFaltando = estado_atual === 'tattoo' ? missingTattooFields(conversa?.dados_coletados || {}) : [];
  if (!clientContext?.portfolio_disponivel) {
    return {
      ok: true,
      handled_by: 'conversation_router',
      intent: 'portfolio_requested',
      confidence: detected.confidence,
      risk: detected.risk,
      reason: 'portfolio_unavailable_for_tenant',
      can_mutate_state: false,
      resposta_cliente: `Ainda nao tenho portfolio cadastrado aqui no chat. Mas posso seguir com teu atendimento: ${resumeQuestionForState(estado_atual, conversa)}`,
      estado_novo: estado_atual,
      dados_persistidos: {},
      dados_completos: false,
      campos_faltando: camposFaltando,
      campos_conflitantes: [],
      proxima_acao: 'pergunta',
      agent_usado: estado_atual === 'cadastro' ? 'cadastro' : 'conversation_router',
      side_effects: [],
      urls_portfolio: [],
      payload_portfolio: null,
      analise_imagens: null,
      cobertura_suspeita: null,
    };
  }
  return {
    ok: true,
    handled_by: 'conversation_router',
    intent: 'portfolio_requested',
    confidence: detected.confidence,
    risk: detected.risk,
    reason: detected.reason,
    can_mutate_state: false,
    resposta_cliente: estilo
      ? `Claro, te mando alguns exemplos de ${estilo}.`
      : 'Claro, te mando alguns exemplos do portfolio.',
    estado_novo: estado_atual,
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: camposFaltando,
    campos_conflitantes: [],
    proxima_acao: 'enviar_portfolio',
    agent_usado: estado_atual === 'cadastro' ? 'cadastro' : 'conversation_router',
    side_effects: [],
    urls_portfolio: [],
    payload_portfolio: {
      estilo,
      max: null,
      motivo: 'pedido deterministico de portfolio',
    },
    analise_imagens: null,
    cobertura_suspeita: null,
  };
}

function unsupportedStyleOutput({ unsupportedStyle, estado_atual, conversa }) {
  return {
    ok: true,
    handled_by: 'conversation_router',
    intent: 'tenant_unsupported_style',
    confidence: 0.86,
    risk: 'medium',
    reason: unsupportedStyle.reason,
    can_mutate_state: false,
    resposta_cliente: `Esse estilo nao esta no foco do estudio por aqui. Posso seguir se voce quiser adaptar pra outro estilo, ou acionar o estudio pra avaliar direto.`,
    estado_novo: estado_atual,
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: estado_atual === 'tattoo' ? missingTattooFields(conversa?.dados_coletados || {}) : [],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    agent_usado: estado_atual === 'cadastro' ? 'cadastro' : 'conversation_router',
    side_effects: [],
    urls_portfolio: [],
    payload_portfolio: null,
    analise_imagens: null,
    cobertura_suspeita: null,
    tenant_style_resolution: {
      style: unsupportedStyle.style,
      reason: unsupportedStyle.reason,
    },
  };
}

function coverUpNotAcceptedOutput({ detected, estado_atual, conversa }) {
  return {
    ok: true,
    handled_by: 'conversation_router',
    intent: 'tenant_cover_up_not_accepted',
    confidence: detected.confidence,
    risk: 'medium',
    reason: 'tenant_cover_up_not_accepted',
    can_mutate_state: false,
    resposta_cliente: 'Esse estudio nao faz cobertura por aqui. Se voce pensar em uma tattoo nova em outro local, posso seguir te ajudando.',
    estado_novo: estado_atual,
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: estado_atual === 'tattoo' ? missingTattooFields(conversa?.dados_coletados || {}) : [],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    agent_usado: estado_atual === 'cadastro' ? 'cadastro' : 'conversation_router',
    side_effects: [],
    urls_portfolio: [],
    payload_portfolio: null,
    analise_imagens: null,
    cobertura_suspeita: null,
    tenant_cover_up_resolution: {
      aceita_cobertura: false,
      source: 'tenant_rules',
    },
  };
}

function escalationOutput({ detected, estado_atual, intent, conversa, clientContext }) {
  if (!['cobertura', 'human_requested', 'client_upset', 'tenant_handoff_trigger', 'minor_age_explicit'].includes(intent)) return null;
  if (intent === 'minor_age_explicit') {
    return {
      ok: true,
      handled_by: 'conversation_router',
      intent,
      confidence: detected.confidence,
      risk: detected.risk,
      reason: detected.reason,
      can_mutate_state: true,
      resposta_cliente: minorAgeHandoffReply(),
      estado_novo: 'aguardando_tatuador',
      dados_persistidos: {},
      dados_completos: false,
      campos_faltando: ['menor_idade_trigger'],
      campos_conflitantes: [],
      proxima_acao: 'erro',
      agent_usado: 'cadastro',
      side_effects: [],
      urls_portfolio: [],
      analise_imagens: null,
      cobertura_suspeita: null,
      escalation: {
        required: true,
        reason_code: 'minor_age',
        reason_label: 'menoridade / responsavel legal',
        severity: 'high',
        source: 'conversation_router',
        requires_orcid: false,
      },
      minor_age_resolution: {
        age: detected.age || null,
        data_nascimento_persistida: false,
      },
    };
  }
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

  const coverUpPolicy = clientContext?.tenant_product?.service_policy?.cover_up_policy;
  const coverUpRejected = coverUpPolicy
    ? coverUpPolicy === 'rejected'
    : clientContext?.tenant_rules?.aceita_cobertura === false;
  if (intent === 'cobertura' && coverUpRejected) {
    return coverUpNotAcceptedOutput({ detected, estado_atual, conversa });
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

  if (estado_atual === 'cadastro') {
    const minorAge = resolveExplicitAge(mensagem);
    if (minorAge.answered) {
      return escalationOutput({
        estado_atual,
        intent: 'minor_age_explicit',
        detected: {
          confidence: minorAge.confidence,
          risk: 'high',
          reason: minorAge.reason,
          age: minorAge.value,
        },
      });
    }
  }

  const baseDetected = detectIntent(mensagem);
  const tenantDetected = estado_atual === 'tattoo'
    ? detectTenantHandoffTrigger(mensagem, { tenant, clientContext })
    : null;
  const baseHasExplicitEscalation = ['human_requested', 'client_upset', 'cobertura'].includes(baseDetected?.intent);
  const detected = tenantDetected && !baseHasExplicitEscalation ? tenantDetected : baseDetected;

  if (detected) {
    const escalation = escalationOutput({ detected, estado_atual, intent: detected.intent, conversa, clientContext });
    if (escalation) return escalation;
    if (detected.intent === 'portfolio_requested') {
      const portfolio = portfolioOutput({ detected, estado_atual, mensagem, conversa, clientContext });
      if (portfolio) return portfolio;
    }
  }

  if (estado_atual === 'tattoo' && !baseHasExplicitEscalation) {
    const unsupportedStyle = detectTenantUnsupportedStyle(mensagem, clientContext);
    if (unsupportedStyle) {
      return unsupportedStyleOutput({ unsupportedStyle, estado_atual, conversa });
    }
  }

  const pendingResolution = resolvePendingFormQuestion({ historico, mensagem });
  if (!detected && estado_atual === 'cadastro' && shouldHandleCadastroPendingAnswer(pendingResolution)) {
    return cadastroPendingAnswerOutput({ pendingResolution, estado_atual, conversa, historico });
  }
  if (!detected && estado_atual === 'tattoo' && shouldHandleTattooShortNamePendingAnswer(pendingResolution)) {
    return tattooShortNamePendingAnswerOutput({ pendingResolution, estado_atual, conversa, historico });
  }
  if (!detected && estado_atual === 'tattoo') {
    const extracted = extractTattooHints(mensagem, conversa?.dados_coletados || {});
    if (shouldHandleTattooMultiInfo(extracted)) {
      return tattooMultiInfoOutput({ extracted, estado_atual, conversa, tenant, clientContext, historico });
    }
    const coreFields = answeredTattooCoreFields(extracted);
    if (coreFields.length === 1 && shouldHandleTattooPendingAnswer(extracted, conversa)) {
      return tattooPendingAnswerOutput({ extracted, estado_atual, conversa, clientContext });
    }
    const freshExtracted = extractTattooHints(mensagem, {});
    const hasExistingTattooContext = Object.keys(conversa?.dados_coletados || {}).some(key => hasValue(conversa.dados_coletados?.[key]));
    if (hasExistingTattooContext && shouldHandleTattooMultiInfo(freshExtracted)) {
      return tattooMultiInfoOutput({
        extracted: freshExtracted,
        estado_atual,
        conversa,
        tenant,
        clientContext: { ...(clientContext || {}), is_first_contact: false },
        historico,
      });
    }
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
  detectTenantUnsupportedStyle,
};
