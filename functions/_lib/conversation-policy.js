// functions/_lib/conversation-policy.js
// Politicas conversacionais transversais ao router/agents.

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

export const BODY_LOCATION_ALIASES = [
  { key: 'braco', label: 'braço', re: /\bbraco\b|\bbiceps\b/ },
  { key: 'antebraco', label: 'antebraço', re: /\bantebraco\b/ },
  { key: 'perna', label: 'perna', re: /\bperna\b/ },
  { key: 'costas', label: 'costas', re: /\bcostas\b|\bnuca\b/ },
  { key: 'peito', label: 'peito', re: /\bpeito\b|\btorax\b/ },
  { key: 'ombro', label: 'ombro', re: /\bombro\b/ },
  { key: 'pulso', label: 'pulso', re: /\bpulso\b/ },
  { key: 'mao', label: 'mão', re: /\bmao\b/ },
  { key: 'pescoco', label: 'pescoço', re: /\bpescoco\b/ },
  { key: 'panturrilha', label: 'panturrilha', re: /\bpanturrilha\b/ },
  { key: 'coxa', label: 'coxa', re: /\bcoxa\b/ },
  { key: 'canela', label: 'canela', re: /\bcanela\b/ },
  { key: 'barriga', label: 'barriga', re: /\bbarriga\b/ },
  { key: 'costela', label: 'costela', re: /\bcostela\b|\blateral\b/ },
  { key: 'virilha', label: 'virilha', re: /\bvirilha\b/ },
  { key: 'gluteo', label: 'glúteo', re: /\bbunda\b|\bgluteo\b|\bgluteos\b|\bnadega\b|\bnadegas\b/ },
];

export function detectBodyLocation(text) {
  const s = normalize(text);
  return BODY_LOCATION_ALIASES.find(alias => alias.re.test(s)) || null;
}

export function detectPendingFormQuestion(text) {
  const s = stripAccents(text || '');
  if (/como posso te chamar\?*\s*$/i.test(s)) return 'nome_curto';
  if (/(qual (a )?tua altura|me diz tua altura|me fala tua altura|qual (a )?sua altura)\?*\s*$/i.test(s)) return 'altura_cm';
  if (/qual (o )?seu estilo\?*\s*$/i.test(s) || /qual estilo/i.test(s) || /estilo que (tu|voce|voces?) prefere/i.test(s)) return 'estilo';
  if (/em qual parte do corpo\?*\s*$/i.test(s) || /qual parte do corpo\?*\s*$/i.test(s)) return 'local_corpo';
  if (/foto do local/i.test(s) || /foto.*onde.*quer tatuar/i.test(s)) return 'foto_local';
  if (/nome completo/i.test(s)) return 'nome_completo';
  if (/data de nascimento/i.test(s)) return 'data_nascimento';
  if (/e-?mail/i.test(s)) return 'email';
  return null;
}

export function getPendingFormQuestion(historico = []) {
  const lastAssistantWithFormQuestion = [...(historico || [])]
    .reverse()
    .find(turn => turn?.role === 'assistant' && detectPendingFormQuestion(turn?.content || ''));
  const field = detectPendingFormQuestion(lastAssistantWithFormQuestion?.content || '');
  return field ? { field, text: lastAssistantWithFormQuestion.content } : null;
}

export function extractShortNameAnswer(message) {
  return resolveShortName(message).value;
}

export function resolveShortName(message) {
  const raw = String(message || '').split(/\n+/).map(s => s.trim()).find(Boolean) || '';
  const m = raw.match(/^(?:sou|me chamo|meu nome (?:e|é)|pode me chamar de|me chama de|me chame de)\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40})/i);
  if (m) {
    const name = m[1].trim().split(/\s+/)[0];
    return name.length >= 2
      ? { answered: true, value: name, confidence: 0.96, reason: 'explicit_name_prefix' }
      : { answered: false, value: null, confidence: 0, reason: 'too_short_after_prefix' };
  }

  const suffix = raw.match(/^([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,30})\s+(?:aqui|mesmo)$/i);
  if (suffix) {
    const name = suffix[1].trim().split(/\s+/)[0];
    return { answered: true, value: name, confidence: 0.86, reason: 'short_name_suffix' };
  }

  const candidate = raw.replace(/[.,!?;:]+$/g, '').trim();
  const normalized = normalize(candidate);
  const blocked = /^(oi|ola|opa|bom dia|boa tarde|boa noite|quanto|qual|como|funciona|orcamento|orçamento|preco|preço|valor|tenho|quero|queria|fazer|tatuar|tattoo|tatuagem)\b/;
  if (
    candidate.length < 2
    || candidate.length > 30
    || !/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(candidate)
    || candidate.split(/\s+/).length > 2
    || blocked.test(normalized)
  ) {
    return { answered: false, value: null, confidence: 0, reason: 'not_a_short_name' };
  }

  const name = candidate.split(/\s+/)[0];
  return name.length >= 2
    ? { answered: true, value: name, confidence: 0.8, reason: 'bare_short_name' }
    : { answered: false, value: null, confidence: 0, reason: 'too_short' };
}

export function extractHeightAnswer(message) {
  return resolveHeightCm(message).value;
}

export function resolveHeightCm(message) {
  const s = normalize(message);
  const meters = s.match(/\b(1[,.]\d{2}|2[,.][0-4]\d)\s*m?\b/);
  if (meters) {
    return {
      answered: true,
      value: Math.round(Number(meters[1].replace(',', '.')) * 100),
      confidence: 0.95,
      reason: 'meters_format',
    };
  }
  const cm = s.match(/\b(1[4-9]\d|2[0-4]\d)\s*(?:cm)?\b/);
  return cm
    ? { answered: true, value: Number(cm[1]), confidence: 0.9, reason: 'centimeters_format' }
    : { answered: false, value: null, confidence: 0, reason: 'no_height' };
}

export function extractStyleAnswer(message) {
  return resolveTattooStyle(message).value;
}

export function resolveTattooStyle(message) {
  const s = normalize(message);
  const patterns = [
    ['realismo', /\brealismo\b|\brealista\b/],
    ['fineline', /\bfineline\b|\bfine line\b|\btraco fino\b/],
    ['blackwork', /\bblackwork\b/],
    ['old school', /\bold school\b/],
    ['minimalista', /\bminimalista\b/],
    ['colorida', /\bcolorida\b|\bcolorido\b/],
    ['preto e cinza', /\bpreto e cinza\b|\bpreto e branco\b/],
  ];
  const hit = patterns.find(([, re]) => re.test(s));
  return hit
    ? { answered: true, value: hit[0], confidence: 0.9, reason: 'style_alias' }
    : { answered: false, value: null, confidence: 0, reason: 'no_style' };
}

export function extractLocalAnswer(message) {
  return resolveBodyLocation(message).value;
}

export function resolveBodyLocation(message) {
  const hit = detectBodyLocation(message);
  return hit
    ? { answered: true, value: hit.label, confidence: 0.88, reason: 'body_location_alias', match: hit }
    : { answered: false, value: null, confidence: 0, reason: 'no_body_location', match: null };
}

const FIELD_RESOLVERS = {
  nome_curto: resolveShortName,
  altura_cm: resolveHeightCm,
  estilo: resolveTattooStyle,
  local_corpo: resolveBodyLocation,
};

function resultForResolvedField(field, resolved) {
  const value = resolved.value;
  const extracted = {};
  if (field === 'altura_cm' && value) extracted.altura_cm = value;
  if (field === 'estilo' && value) extracted.estilo = value;
  if (field === 'local_corpo' && value) extracted.local_corpo = value;
  return {
    pending: true,
    answered: Boolean(resolved.answered),
    extracted,
    displayName: field === 'nome_curto' ? value : null,
    field,
    confidence: resolved.confidence,
    reason: resolved.reason,
  };
}

export function resolvePendingFormQuestion({ historico, mensagem }) {
  const pending = getPendingFormQuestion(historico);
  if (!pending) return { pending: false, answered: false, extracted: {}, displayName: null, field: null };

  const resolver = FIELD_RESOLVERS[pending.field];
  if (resolver) {
    return resultForResolvedField(pending.field, resolver(mensagem));
  }

  return { pending: true, answered: false, extracted: {}, displayName: null, field: pending.field };
}
