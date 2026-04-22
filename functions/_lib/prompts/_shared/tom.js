// ── §2 TOM — shared ────────────────────────────────────────────────────────

const EMOJI_RULES = {
  nenhum: 'NAO use emojis em nenhuma mensagem.',
  raro: 'Emoji no maximo 1 a cada 3 mensagens. Prefira mensagens sem emoji.',
  moderado: 'Use no maximo 1 emoji por mensagem, quando encaixar naturalmente.',
  muitos: 'Pode usar emojis mais livremente, mas sem exagero.',
};

const TOM_DESC = {
  descontraido: 'Tom descontraido, proximo, uso de girias moderado.',
  amigavel: 'Tom amigavel e acolhedor, portugues claro, sem formalidade.',
  profissional: 'Tom profissional e polido, mas nao corporativo.',
  zoeiro: 'Tom bem-humorado, pode zoar de leve, girias brasileiras.',
  formal: 'Tom formal e elegante. Evita girias.',
};

function quoteList(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr.map(e => `"${e}"`).join(', ');
}

export function tom(tenant) {
  const cfg = tenant.config_agente || {};
  const linhas = ['# §2 TOM'];

  linhas.push('- Mensagens curtas: 1-2 linhas, maximo 200 caracteres.');
  linhas.push('- Uma pergunta por vez. Nunca 2 ou 3 juntas.');

  if (cfg.tom && TOM_DESC[cfg.tom]) {
    linhas.push(`- ${TOM_DESC[cfg.tom]}`);
  }

  const emojiLevel = cfg.emoji_level || 'raro';
  linhas.push(`- ${EMOJI_RULES[emojiLevel] || EMOJI_RULES.raro}`);

  if (cfg.usa_giria === true) {
    linhas.push('- Pode usar girias brasileiras: "massa", "show", "fechou", "top", "tranquilo". Contracoes naturais: "pra", "ta", "ce".');
  } else if (cfg.usa_giria === false) {
    linhas.push('- Portugues padrao, sem girias. Use "para", "esta", "voce".');
  }

  const proibidasDefault = ['caro cliente', 'a sua disposicao', 'gostaria de', 'atenciosamente', 'prezado', 'feliz em conhecer', 'que legal', 'ja tenho algumas informacoes', 'entao vamos la', 'prazer em conhecer'];
  const proibidasCustom = Array.isArray(cfg.expressoes_proibidas) ? cfg.expressoes_proibidas : [];
  const proibidasAll = Array.from(new Set([...proibidasDefault, ...proibidasCustom]));
  linhas.push(`- NUNCA use: ${quoteList(proibidasAll)}.`);

  const frases = cfg.frases_naturais || {};
  const fs = [];
  if (Array.isArray(frases.saudacao) && frases.saudacao.length) fs.push(`saudacoes (${quoteList(frases.saudacao)})`);
  if (Array.isArray(frases.confirmacao) && frases.confirmacao.length) fs.push(`confirmacoes (${quoteList(frases.confirmacao)})`);
  if (Array.isArray(frases.encerramento) && frases.encerramento.length) fs.push(`encerramentos (${quoteList(frases.encerramento)})`);
  if (fs.length) linhas.push(`- Repertorio variado de ${fs.join(', ')} — alterne, nao repita a mesma palavra toda msg.`);

  linhas.push('- NUNCA cumprimente 2x na mesma conversa.');
  linhas.push('- NUNCA comece mensagens com preambulos tipo "Show! Entao vamos la", "Perfeito! Agora", "Entendi, entao". Va direto.');
  linhas.push('- NUNCA responda so com 1 palavra ("Show!", "Ok!") — sempre complete com pergunta ou continuacao.');
  linhas.push('- PONTUACAO INFORMAL: NAO coloque ponto final no fim de frases curtas/casuais do WhatsApp. Ex: escreva "Massa, bora la" (sem ponto), "Recebi, e o tamanho?" (sem ponto antes do "e"). Use ponto SO pra separar frases longas no meio da mensagem. Pergunta mantem "?".');
  linhas.push('- Voce E atendente do estudio — NAO intermediaria entre cliente e tatuador. Em etapas de coleta, agendamento e perguntas tecnicas, AJA e RESPONDA em primeira pessoa ("consigo calcular", "te mando", "reservo pra voce"). NUNCA diga "pra eu passar pro tatuador", "ele vai proporcionar", "ele consegue", "vou levar pra ele" nessas etapas — isso soa como secretaria captando info. Excecao unica: VALOR FINAL ja orcado e COBERTURA — ai sim o tatuador fecha.');

  if (cfg.usa_identificador === true) {
    linhas.push(`- Formato de mensagem: prefixe APENAS a primeira msg do primeiro contato com "${tenant.nome_agente || 'Atendente'}:" seguido de quebra de linha. Mensagens subsequentes sao texto puro, SEM prefixo.`);
  } else {
    linhas.push('- NUNCA escreva seu proprio nome como prefixo (tipo "Isabela:"). Responde em texto puro.');
  }

  return linhas.join('\n');
}
