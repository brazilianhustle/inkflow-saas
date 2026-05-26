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
  if (
    /qual (o )?seu estilo\?*\s*$/i.test(s)
    || /qual estilo/i.test(s)
    || /estilo que (tu|voce|voces?) prefere/i.test(s)
    || /\bde estilo\b/i.test(s)
    || /\btu curte mais\b.*\b(fineline|realismo|blackwork|tradicional|old school)\b/i.test(s)
  ) return 'estilo';
  if (/em qual parte do corpo\?*\s*$/i.test(s) || /qual parte do corpo\?*\s*$/i.test(s)) return 'local_corpo';
  if (/nome completo.*data de nascimento|data de nascimento.*nome completo/i.test(s)) return 'cadastro_nome_data';
  if (/nome completo/i.test(s)) return 'nome_completo';
  if (/data de nascimento/i.test(s)) return 'data_nascimento';
  if (/e-?mail/i.test(s)) return 'email';
  if (/foto do local/i.test(s) || /foto.*onde.*quer tatuar/i.test(s)) return 'foto_local';
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
  const blocked = /^(oi|ola|opa|bom dia|boa tarde|boa noite|quanto|qual|como|funciona|orcamento|orçamento|preco|preço|valor|tenho|quero|queria|fazer|tatuar|tattoo|tatuagem|old|old school|fineline|fine line|realismo|realista|blackwork|tradicional|minimalista|colorida|colorido|preto e cinza|preto e branco)\b/;
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

export function resolveTattooSizeCm(message) {
  const s = normalize(message);
  const patterns = [
    /\b(?:tamanho|tam|medindo|aprox(?:imadamente)?|uns?|umas?|de)\s*(?:de\s*)?([1-4]?\d|50)\s*cm\b/,
    /\b([1-4]?\d|50)\s*cm\b/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    const value = Number(m?.[1]);
    if (Number.isFinite(value) && value > 0 && value <= 50) {
      return { answered: true, value, confidence: 0.9, reason: 'tattoo_size_cm' };
    }
  }
  return { answered: false, value: null, confidence: 0, reason: 'no_tattoo_size' };
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

export function resolvePhotoLocalAnswer(message) {
  const s = normalize(message);
  if (/\b(agora nao consigo|nao consigo agora|nao consigo|nao posso agora|sem foto agora|mando depois|envio depois|depois eu mando|mais tarde)\b/.test(s)) {
    return {
      answered: false,
      value: null,
      confidence: 0.88,
      reason: 'photo_deferred',
      deferred: true,
    };
  }
  return { answered: false, value: null, confidence: 0, reason: 'no_photo_local', deferred: false };
}

function cleanCadastroLine(message) {
  return String(message || '')
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean)
    .find(line => !/[?]/.test(line)) || '';
}

export function resolveFullName(message) {
  const raw = cleanCadastroLine(message)
    .replace(/\b(?:sou|me chamo|meu nome (?:e|é)|nome completo(?: e| é|:)?|pode colocar|coloca)\b/ig, ' ')
    .replace(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig, ' ')
    .replace(/[.,;:]+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = normalize(raw);
  const blocked = /^(oi|ola|opa|bom dia|boa tarde|boa noite|quanto|qual|como|funciona|orcamento|orçamento|preco|preço|valor|nao|não|pula|depois|sem email)\b/;
  if (
    raw.length < 2
    || raw.length > 80
    || !/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(raw)
    || raw.split(/\s+/).length > 6
    || blocked.test(normalized)
  ) {
    return { answered: false, value: null, confidence: 0, reason: 'not_a_full_name' };
  }
  return { answered: true, value: raw, confidence: raw.split(/\s+/).length >= 2 ? 0.92 : 0.78, reason: 'full_name_text' };
}

export function resolveBirthDate(message) {
  const s = stripAccents(message || '');
  const iso = s.match(/\b(19\d{2}|20[0-2]\d)-([01]\d)-([0-3]\d)\b/);
  if (iso) {
    return { answered: true, value: `${iso[1]}-${iso[2]}-${iso[3]}`, confidence: 0.96, reason: 'birthdate_iso' };
  }

  const numeric = s.match(/\b([0-3]?\d)[\/.-]([01]?\d)[\/.-]((?:19|20)?\d{2})\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const yearRaw = Number(numeric[3]);
    const year = yearRaw < 100 ? (yearRaw >= 30 ? 1900 + yearRaw : 2000 + yearRaw) : yearRaw;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2029) {
      return {
        answered: true,
        value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        confidence: 0.9,
        reason: 'birthdate_br_numeric',
      };
    }
  }

  return { answered: false, value: null, confidence: 0, reason: 'no_birthdate' };
}

export function resolveExplicitAge(message) {
  const s = stripAccents(message || '');
  const hit = s.match(/\b(?:tenho|tem|idade(?:\s+(?:e|é))?|com)?\s*(1[0-7]|[1-9])\s+anos?\b/);
  const value = Number(hit?.[1]);
  if (Number.isFinite(value) && value > 0 && value < 18) {
    return { answered: true, value, confidence: 0.88, reason: 'explicit_minor_age' };
  }
  return { answered: false, value: null, confidence: 0, reason: 'no_minor_age' };
}

export function resolveEmail(message) {
  const raw = String(message || '');
  if (/\b(nao tenho|não tenho|sem e-?mail|pode seguir sem|prefiro sem|prefiro falar por aqui|melhor falar por aqui|vamos falar por aqui|por aqui mesmo|pula|depois|nao quero passar|não quero passar|nao vou passar|não vou passar)\b/i.test(raw)) {
    return {
      answered: true,
      value: null,
      extracted: { email: null, email_recusado: true },
      confidence: 0.9,
      reason: 'email_refused',
    };
  }

  const hit = raw.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return hit
    ? { answered: true, value: hit[0].toLowerCase(), confidence: 0.95, reason: 'email_address' }
    : { answered: false, value: null, confidence: 0, reason: 'no_email' };
}

export function resolveCadastroNameAndBirthDate(message) {
  const nome = resolveFullName(message);
  const data = resolveBirthDate(message);
  const extracted = {};
  if (nome.answered) extracted.nome = nome.value;
  if (data.answered) extracted.data_nascimento = data.value;
  return {
    answered: Object.keys(extracted).length > 0,
    value: extracted,
    extracted,
    confidence: Math.min(
      nome.answered ? nome.confidence : 1,
      data.answered ? data.confidence : 1,
    ),
    reason: [nome.answered ? nome.reason : null, data.answered ? data.reason : null].filter(Boolean).join('+') || 'no_cadastro_data',
  };
}

const FIELD_RESOLVERS = {
  nome_curto: resolveShortName,
  altura_cm: resolveHeightCm,
  estilo: resolveTattooStyle,
  local_corpo: resolveBodyLocation,
  foto_local: resolvePhotoLocalAnswer,
  nome_completo: resolveFullName,
  data_nascimento: resolveBirthDate,
  email: resolveEmail,
  cadastro_nome_data: resolveCadastroNameAndBirthDate,
};

function resultForResolvedField(field, resolved) {
  const value = resolved.value;
  const extracted = { ...(resolved.extracted || {}) };
  if (field === 'altura_cm' && value) extracted.altura_cm = value;
  if (field === 'estilo' && value) extracted.estilo = value;
  if (field === 'local_corpo' && value) extracted.local_corpo = value;
  if (field === 'nome_completo' && value) extracted.nome = value;
  if (field === 'data_nascimento' && value) extracted.data_nascimento = value;
  if (field === 'email' && value) extracted.email = value;
  return {
    pending: true,
    answered: Boolean(resolved.answered),
    extracted,
    displayName: field === 'nome_curto' ? value : null,
    field,
    confidence: resolved.confidence,
    reason: resolved.reason,
    deferred: Boolean(resolved.deferred),
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
