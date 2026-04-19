// ── InkFlow — Guardrails compartilhados ──────────────────────────────────────
// Lógica de segurança/invariantes usada por:
//   - /api/tools/simular-conversa (testador + evals)
//   - /api/tools/guardrails/pre   (chamado pelo n8n antes do agente)
//   - /api/tools/guardrails/post  (chamado pelo n8n depois do agente)
//
// Padrão: prompt cuida do TOM, código cuida dos INVARIANTES.

// ═══════════════════════════════════════════════════════════════════════════
// 1. HANDOFF DETECTION — bypass total do LLM em turnos pós-handoff
// ═══════════════════════════════════════════════════════════════════════════

// Markers PRECISOS — evitar substrings que batem com a intro do bot
// ("já te direciono pro tatuador certo do estilo"). Só pega frases que
// APENAS aparecem em handoff real.
export const HANDOFF_MARKERS = [
  'tatuador avalia pessoalmente',
  'avalia pessoalmente',
  'pra esse caso o tatuador',
  'pra essa regiao o tatuador',
  'pra essa região o tatuador',
  'já te direciono pra ele',
  'ja te direciono pra ele',
  'sinalizei pro tatuador',
  'tatuador já vai te chamar',
  'tatuador ja vai te chamar',
  'tatuador já vai chamar',
  'tatuador ja vai chamar',
  'passar pro tatuador conversar',
  'tatuador conversar direto',
];

export const HANDOFF_FIXED_REPLIES = [
  'Já sinalizei pro tatuador, em breve ele te chama aqui.',
  'Um momento, ele já fala contigo.',
  'Tô passando pro tatuador, ele te responde em instantes.',
];

export function detectHandoffInHistory(messages) {
  const botMsgs = (messages || [])
    .filter(m => m.role === 'assistant')
    .map(m => String(m.content || '').toLowerCase());
  return botMsgs.some(m => HANDOFF_MARKERS.some(mk => m.includes(mk)));
}

export function pickHandoffReply(messages) {
  const idx = (messages?.length || 0) % HANDOFF_FIXED_REPLIES.length;
  return HANDOFF_FIXED_REPLIES[idx];
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. REPEATED QUESTION DETECTION — nudge quando bot pergunta 3x a mesma coisa
// ═══════════════════════════════════════════════════════════════════════════

export function questionFingerprint(text) {
  const t = String(text || '').toLowerCase();
  const keys = [];
  if (/\b(parte do (braco|braço|corpo)|antebraco|antebraço|biceps|ombro)\b/.test(t)) keys.push('local_braco');
  if (/\b(parte da perna|panturrilha|coxa|tornozelo)\b/.test(t)) keys.push('local_perna');
  if (/\b(tamanho|cm de altura|quantos cm|10cm|15cm|20cm)\b/.test(t)) keys.push('tamanho');
  if (/\b(estilo|realismo|fineline|blackwork|old school|aquarela)\b/.test(t) && /\?/.test(t)) keys.push('estilo');
  if (/\b(cor|colorido|preto e branco)\b/.test(t) && /\?/.test(t)) keys.push('cor');
  if (/\b(detalhe|detalhado|simples|nivel de detalhe)\b/.test(t) && /\?/.test(t)) keys.push('detalhe');
  if (/\bfoto do local\b|\bmanda uma foto\b/.test(t)) keys.push('foto_local');
  if (/\bfoto de referencia\b|\breferencia visual\b/.test(t)) keys.push('foto_ref');
  return keys.join('|');
}

export function detectRepeatedQuestion(messages) {
  const botMsgs = (messages || []).filter(m => m.role === 'assistant');
  const fingerprints = botMsgs.map(m => questionFingerprint(m.content)).filter(Boolean);
  if (fingerprints.length < 3) return null;
  const recent = fingerprints.slice(-5);
  const counts = {};
  for (const fp of recent) counts[fp] = (counts[fp] || 0) + 1;
  for (const [fp, count] of Object.entries(counts)) {
    if (count >= 3) return fp;
  }
  return null;
}

export function buildRepeatedQuestionNudge(fingerprint) {
  return `ALERTA GUARDRAIL: voce ja fez a MESMA pergunta ("${fingerprint}") 3+ vezes. O cliente claramente nao vai responder. PARE de perguntar isso. Responda agora com: "Beleza, sem problema! Vou passar pro tatuador conversar direto contigo — ele te chama ja." Nao pergunte mais nada.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PROMPT INJECTION DETECTION — bypass total com resposta fixa por tipo
// ═══════════════════════════════════════════════════════════════════════════

export const INJECTION_PATTERNS = [
  // Override do sistema
  { rx: /ignor(e|a|ar)\s+.{0,30}?(instru[cç][oõ]es?|regras?|tudo|prompt|sistema)/i, tipo: 'override' },
  { rx: /esque[cç]a?\s+.{0,30}?(instru|regras?|tudo|o prompt|o sistema)/i, tipo: 'override' },
  { rx: /\b(disregard|ignore all|forget)\s+(previous|above|all|your)/i, tipo: 'override' },

  // Revelar prompt / system
  { rx: /(mostr(e|a)|revela|me d[aá]|qual [eé])\s+.{0,15}?prompt/i, tipo: 'prompt_leak' },
  { rx: /suas?\s+instru[cç][oõ]es?\s+(do\s+sistema|completas?|originais?)/i, tipo: 'prompt_leak' },
  { rx: /\b(reveal|show|print|expose)\s+(your|the)\s+(system\s+)?(prompt|instructions)/i, tipo: 'prompt_leak' },

  // Role-play / personagem
  { rx: /(voc[eê]|tu)\s+.{0,20}?(um|uma)\s+(pirata|hacker|outro bot|chatgpt|gpt|claude|bot)/i, tipo: 'roleplay' },
  { rx: /finja\s+(que\s+)?(voc[eê]|tu|ser)/i, tipo: 'roleplay' },
  { rx: /\b(act as|pretend (to be|you are)|you are now)\b/i, tipo: 'roleplay' },

  // Manipulação de preço absurda
  { rx: /\bdesconto\s+(de\s+)?(9[0-9]|[5-9][0-9])\s*%/i, tipo: 'desconto_absurdo' },
  { rx: /(faz|cobra|d[aá])\s+(de\s+)?(gr[aá]tis|free|zero|r\$\s*0|1\s*real)/i, tipo: 'preco_zero' },
  { rx: /\b(pague|paga|pago)\s+(metade|10%|20%|30%)\b/i, tipo: 'desconto_absurdo' },
  { rx: /\bminimo\s+minimo\b|\bm[ií]nimo\s+dos\s+m[ií]nimos\b/i, tipo: 'desconto_absurdo' },

  // Claim de autoridade falsa
  { rx: /\bsou\s+(o\s+)?(dono|admin|suporte|gerente)\s+(do\s+estudio|do\s+sistema|aqui)/i, tipo: 'autoridade' },
  { rx: /\b(admin|suporte|sistema)\s+(me\s+)?autoriz(ou|a)\b/i, tipo: 'autoridade' },

  // Injection via código/markup
  { rx: /<\/?(system|prompt|instruction|tool)[\s>]/i, tipo: 'markup' },
  { rx: /\[\[\s*(system|override|admin)\s*\]\]/i, tipo: 'markup' },
];

export function detectPromptInjection(userMsg) {
  const text = String(userMsg || '');
  for (const { rx, tipo } of INJECTION_PATTERNS) {
    if (rx.test(text)) return tipo;
  }
  return null;
}

export function buildInjectionReply(tipo) {
  switch (tipo) {
    case 'desconto_absurdo':
    case 'preco_zero':
      return 'Os valores sao fechados com o tatuador e seguem uma tabela — nao consigo mexer. Me conta o que voce ta pensando em fazer que te passo a faixa certinha?';
    case 'prompt_leak':
      return 'Eu so ajudo aqui com orcamentos e agendamentos de tatuagem. Me conta o que voce ta pensando em fazer?';
    case 'roleplay':
    case 'override':
      return 'Opa, aqui eu so falo sobre tatuagem mesmo! Me conta o que voce ta pensando em fazer?';
    case 'autoridade':
      return 'Pra qualquer coisa alem de orcamento/agendamento, vou te passar pro tatuador mesmo — ja chamo ele pra voce.';
    case 'markup':
      return 'Nao entendi direito, me conta em poucas palavras o que voce ta pensando em fazer?';
    default:
      return 'Me conta o que voce ta pensando em fazer de tatuagem?';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. FACT-CHECKER DE PREÇO — valida R$ na reply contra tool result + histórico
// ═══════════════════════════════════════════════════════════════════════════

export function extractPrices(text) {
  const matches = String(text || '').match(/r\$\s*(\d{1,6}(?:[.,]\d{1,3})?)/gi) || [];
  return matches.map(m => {
    const num = m.match(/\d{1,6}(?:[.,]\d{1,3})?/)[0].replace(/\./g, '').replace(',', '.');
    return parseFloat(num);
  }).filter(n => !isNaN(n) && n > 0);
}

export function validatePricesInReply(reply, toolResult, priorMessages = []) {
  const prices = extractPrices(reply);
  if (prices.length === 0) return { ok: true };

  const priorBotPrices = new Set();
  for (const m of priorMessages || []) {
    if (m.role !== 'assistant') continue;
    for (const p of extractPrices(m.content)) priorBotPrices.add(Math.round(p));
  }

  const allowed = new Set(priorBotPrices);
  if (toolResult && toolResult.ok && toolResult.pode_fazer !== false) {
    if (toolResult.valor) allowed.add(Math.round(toolResult.valor));
    if (toolResult.sinal) allowed.add(Math.round(toolResult.sinal));
    if (toolResult.min) allowed.add(Math.round(toolResult.min));
    if (toolResult.max) allowed.add(Math.round(toolResult.max));
  }

  if (allowed.size === 0) {
    return { ok: false, reason: 'preco_sem_calc', prices };
  }

  const bad = prices.filter(p => {
    const rounded = Math.round(p);
    if (allowed.has(rounded)) return false;
    if (toolResult?.min && toolResult?.max && rounded >= toolResult.min && rounded <= toolResult.max) return false;
    return true;
  });

  if (bad.length > 0) return { ok: false, reason: 'preco_divergente', bad, allowed: [...allowed] };
  return { ok: true };
}

export function buildSafePriceReply(toolResult) {
  if (!toolResult || !toolResult.ok) {
    return 'Um momento, deixa eu conferir o valor com o tatuador e ja volto.';
  }
  if (toolResult.pode_fazer === false) {
    return toolResult.motivo_recusa_texto || 'Pra esse caso o tatuador avalia pessoalmente, ja te direciono pra ele.';
  }
  if (toolResult.valor_tipo === 'exato') {
    return `Fica em R$ ${toolResult.valor}. Bora agendar?`;
  }
  return `Fica entre R$ ${toolResult.min} e R$ ${toolResult.max}. O valor exato o tatuador fecha pessoalmente no dia. Bora agendar?`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. ORQUESTRADORES — uma função única por fase, pronta pro endpoint HTTP
// ═══════════════════════════════════════════════════════════════════════════

// Pré-LLM: chama ANTES de montar o prompt + enviar pro agente.
// Retorna { bypass, reply?, guardrail?, nudge? }
//   bypass=true → n8n deve pular o agente e mandar `reply` direto pro cliente
//   bypass=false → n8n segue normal; se `nudge` vier preenchido, adicionar no
//                  systemMessage do agente (ex: ALERTA GUARDRAIL: ...)
export function runPreGuardrails({ messages, userMsg }) {
  const lastUserMsg = userMsg ?? [...(messages || [])].reverse().find(m => m.role === 'user')?.content;

  // 1. Prompt injection — prioridade máxima, bypass imediato
  const injTipo = detectPromptInjection(lastUserMsg);
  if (injTipo) {
    return {
      bypass: true,
      reply: buildInjectionReply(injTipo),
      guardrail: `injection_${injTipo}`,
    };
  }

  // 2. Handoff já detectado em turno anterior — bypass com resposta curta
  if (detectHandoffInHistory(messages)) {
    return {
      bypass: true,
      reply: pickHandoffReply(messages),
      guardrail: 'handoff_active',
    };
  }

  // 3. Bot repetiu pergunta 3+ vezes — não bypassa, mas injeta nudge
  const repeatedFp = detectRepeatedQuestion(messages);
  if (repeatedFp) {
    return {
      bypass: false,
      nudge: buildRepeatedQuestionNudge(repeatedFp),
      guardrail: `repeated_${repeatedFp}`,
    };
  }

  return { bypass: false };
}

// Pós-LLM: chama DEPOIS que o agente gerou a reply.
// Retorna { reply, guardrail? }
//   reply = resposta final (possivelmente substituída se preço divergente)
export function runPostGuardrails({ reply, toolResult, messages }) {
  const priceCheck = validatePricesInReply(reply, toolResult, messages);
  if (!priceCheck.ok) {
    return {
      reply: toolResult ? buildSafePriceReply(toolResult) : 'Pra te passar um valor certinho, preciso antes do tamanho, estilo e local. Me conta?',
      guardrail: `price_${priceCheck.reason}`,
    };
  }
  return { reply };
}
