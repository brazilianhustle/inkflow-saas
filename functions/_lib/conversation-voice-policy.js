// Politica central de voz para respostas deterministicas.
//
// Esta camada evita que naturalidade vire uma colecao de frases soltas
// espalhadas por router, pipeline e agents. Novas familias de copy devem entrar
// aqui antes de serem usadas pelos resolvedores deterministas.

function hasValue(v) {
  return v !== null && v !== undefined && v !== '';
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

export const _test = {
  hasValue,
};
