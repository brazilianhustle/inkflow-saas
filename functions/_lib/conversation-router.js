// functions/_lib/conversation-router.js
// Router leve de atendimento antes dos agents operacionais.
//
// Slice 1: intents texto-only de atendimento lateral em estados de coleta:
// - preco_generico
// - tempo_sessao
// - processo_tatuagem
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
  return 'Confirmo por aqui e sigo com teu orçamento';
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

function detectIntent(text) {
  const s = normalize(text);
  if (!s) return null;

  const processo =
    /\b(como funciona|qual o processo|quais os passos|como faco para marcar|como faço para marcar|como marca|como agendar|primeiro eu mando|preciso pagar antes)\b/.test(s)
    || /\bcomo e para fazer uma tattoo\b/.test(s)
    || /\bcomo e pra fazer uma tattoo\b/.test(s);
  if (processo) return { intent: 'processo_tatuagem', confidence: 0.9, risk: 'medium' };

  const tempo =
    /\b((quanto|quantop|qnto) tempo|quantas horas|demora muito|demora quanto|faz em uma sessao|faz em 1 sessao|uma sessao|precisa de mais de uma sessao|mesmo dia|quantas sessoes|em quantas sessoes|seria em quantas sessoes)\b/.test(s)
    && /\b(demora|tempo|horas|sessao|sessoes|dia)\b/.test(s);
  if (tempo) return { intent: 'tempo_sessao', confidence: 0.88, risk: 'medium' };

  const preco =
    !isNegotiation(s)
    && !isNonPriceValueContext(s)
    && (
      /\b(quanto fica|qual valor|me passa preco|me passa o preco|preco|valor|quanto custa|fica caro|tem uma media)\b/.test(s)
      || /\bquanto e\b/.test(s)
      || /\bquanto (que|q) e\b/.test(s)
    );
  if (preco) return { intent: 'preco_generico', confidence: 0.86, risk: 'high' };

  return null;
}

function responseForIntent(intent, estado, conversa, context = {}) {
  const resume = resumeQuestionForState(estado, conversa);
  const nextField = estado === 'tattoo' ? nextTattooField(conversa) : null;
  return composeRouterResponse({ intent, estado, resume, nextField, context });
}

export function routeConversationTurn({ estado_atual, mensagem, conversa, tenant, clientContext, historico, disabled = false }) {
  if (disabled) return null;
  if (!HANDLED_STATES.has(estado_atual)) return null;

  const detected = detectIntent(mensagem);
  if (!detected) return null;

  const pendingResolution = resolvePendingFormQuestion({ historico, mensagem });
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
  normalize,
  resumeQuestionForState,
  nextTattooField,
  extractTattooHints,
};
