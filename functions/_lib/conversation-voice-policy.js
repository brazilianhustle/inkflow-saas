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

export function cadastroHandoffReply({ nome } = {}) {
  const primeiroNome = firstName(nome);
  const prefix = primeiroNome ? `Boa, ${primeiroNome}. ` : 'Boa. ';
  return `${prefix}Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`;
}

export function cadastroResumeQuestion(conversa = {}) {
  const dados = conversa.dados_cadastro || {};
  if (!hasValue(dados.nome) && !hasValue(dados.data_nascimento)) {
    return 'Pra liberar teu orçamento, me passa nome completo e data de nascimento?';
  }
  if (!hasValue(dados.nome)) return 'Me passa teu nome completo?';
  if (!hasValue(dados.data_nascimento)) return 'Me passa tua data de nascimento completa?';
  if (!hasValue(dados.email) && dados.email_recusado !== true) return 'E o e-mail? Se preferir seguir sem, me avisa';
  return cadastroHandoffReply({ nome: dados.nome });
}

export function fotoLocalRecebidaCadastroQuestion() {
  return 'Recebi a foto do local. Pra liberar teu orçamento, preciso do teu nome completo.';
}

export function referenciaRecebidaCadastroQuestion() {
  return 'Recebi essa referência também. Pra liberar teu orçamento, preciso do teu nome completo.';
}

export function fotoAmbiguaComoLocalCadastroQuestion() {
  return 'Perfeito, então vou usar essa imagem como foto do local. Pra liberar teu orçamento personalizado, me passa nome completo e data de nascimento?';
}

export function fotoAmbiguaComoReferenciaQuestion() {
  return 'Perfeito, deixei essa imagem como referência do desenho. Agora preciso da foto do local do corpo onde tu quer tatuar.';
}

export const _test = {
  hasValue,
};
