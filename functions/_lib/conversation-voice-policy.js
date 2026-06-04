// Politica central de voz para respostas deterministicas.
//
// Esta camada evita que naturalidade vire uma colecao de frases soltas
// espalhadas por router, pipeline e agents. Novas familias de copy devem entrar
// aqui antes de serem usadas pelos resolvedores deterministas.

function hasValue(v) {
  return v !== null && v !== undefined && v !== '';
}

function sentenceStart(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function triggerLabel(trigger) {
  const normalized = String(trigger || '').trim().toLowerCase();
  const labels = {
    mao: 'Mão',
    maos: 'Mãos',
    pescoco: 'Pescoço',
    rosto: 'Rosto',
    face: 'Rosto',
    facial: 'Rosto',
    retoque: 'Retoque',
  };
  return labels[normalized] || sentenceStart(trigger);
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

export function firstContactSoftIntro() {
  return 'Oii, tudo bem.';
}

export function firstContactNameQuestion() {
  return `${firstContactSoftIntro()}\n\nComo posso te chamar?`;
}

export function firstContactSoftPrefix() {
  return `${firstContactSoftIntro()}\n\n`;
}

export function cadastroHandoffReply({ nome } = {}) {
  const primeiroNome = firstName(nome);
  const prefix = primeiroNome ? `Boa, ${primeiroNome}. ` : 'Boa. ';
  return `${prefix}Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`;
}

export function cadastroResumeQuestion(conversa = {}) {
  const dados = conversa.dados_cadastro || {};
  if (!hasValue(dados.nome) && !hasValue(dados.data_nascimento)) {
    return 'Pra montar teu cadastro, me passa teu nome completo e data de nascimento?';
  }
  if (!hasValue(dados.nome)) return 'Me passa teu nome completo?';
  if (!hasValue(dados.data_nascimento)) return 'Me passa tua data de nascimento completa?';
  if (!hasValue(dados.email) && dados.email_recusado !== true) return 'Se quiser, me passa teu e-mail. Se preferir seguir só por aqui, tudo certo.';
  return cadastroHandoffReply({ nome: dados.nome });
}

export function fotoLocalRecebidaCadastroQuestion() {
  return 'Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro.';
}

export function referenciaRecebidaCadastroQuestion() {
  return 'Recebi essa referência também. Agora me passa teu nome completo pra eu montar o cadastro.';
}

export function fotoAmbiguaComoLocalCadastroQuestion() {
  return 'Perfeito, vou usar essa imagem como foto do local. Me passa nome completo e data de nascimento pra eu montar o cadastro?';
}

export function fotoAmbiguaComoReferenciaQuestion() {
  return 'Perfeito, deixei essa imagem como referência do desenho. Agora me manda a foto do local onde tu quer tatuar.';
}

export function minorAgeHandoffReply() {
  return 'Como a pessoa que vai tatuar tem menos de 18 anos, vou chamar o tatuador para seguir com segurança sobre responsável legal e próximos passos.';
}

export function handoffVoiceReply({ kind, style, trigger } = {}) {
  if (kind === 'style_artist_review') {
    const cleanStyle = sentenceStart(style);
    if (cleanStyle) {
      return `${cleanStyle} eu não consigo confirmar sozinho por aqui. Vou chamar o tatuador pra olhar contigo e te dizer se rola seguir nessa linha.`;
    }
    return 'Esse estilo eu não consigo confirmar sozinho por aqui. Vou chamar o tatuador pra olhar contigo e te dizer se rola seguir nessa linha.';
  }

  if (kind === 'human_requested') {
    return 'Claro. Vou chamar o tatuador pra assumir contigo por aqui.';
  }

  if (kind === 'client_upset') {
    return 'Entendi, desculpa pela frustração. Vou chamar alguém do estúdio pra assumir contigo por aqui.';
  }

  if (kind === 'tenant_handoff_trigger') {
    const label = triggerLabel(trigger);
    if (label) {
      return `${label} eu não consigo tocar sozinho por aqui. Vou chamar o tatuador pra olhar contigo e seguir com segurança.`;
    }
    return 'Esse caso eu não consigo tocar sozinho por aqui. Vou chamar o tatuador pra olhar contigo e seguir com segurança.';
  }

  if (kind === 'cover_up_review') {
    return 'Cobertura eu não consigo tocar sozinho por aqui. Vou chamar o tatuador pra olhar teu caso e combinar os próximos passos contigo.';
  }

  return 'Vou chamar o tatuador pra assumir contigo por aqui.';
}

export function styleArtistReviewReply({ style } = {}) {
  return handoffVoiceReply({ kind: 'style_artist_review', style });
}

export function tenantUnsupportedStyleReply() {
  return 'Esse estilo não está no foco do estúdio por aqui. Se quiser adaptar pra outro estilo, eu sigo contigo.';
}

export function tenantCoverUpNotAcceptedReply() {
  return 'Esse estúdio não faz cobertura por aqui. Se for uma tattoo nova em outro local, eu sigo contigo.';
}

export const _test = {
  hasValue,
  sentenceStart,
  triggerLabel,
};
