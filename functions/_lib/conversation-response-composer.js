// Composicao deterministica das respostas do ConversationRouter.
//
// Mantem o router focado em detectar intent/persistir dados, enquanto esta
// camada cuida de variacao leve para evitar repeticao mecanica no atendimento.

function stripAccents(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function historyHasAssistant(historico = [], pattern) {
  return (historico || []).some(turn => {
    if (turn?.role !== 'assistant') return false;
    return pattern.test(stripAccents(turn.content || ''));
  });
}

function firstContactIntro(tenant) {
  const nomeAgente = tenant?.nome_agente || 'atendente';
  return `Oii, tudo bem. Me chamo ${nomeAgente}, muito prazer.`;
}

function firstContactResumeQuestion() {
  return 'Pra montar tua proposta certinho, como posso te chamar?';
}

function answerForIntent(intent, context = {}) {
  const { historico = [] } = context;
  if (intent === 'preco_generico') {
    if (historyHasAssistant(historico, /\bo valor depende do tamanho\b/)) {
      return 'Isso, o valor fecha depois da avaliação do tatuador.';
    }
    return 'O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.';
  }

  if (intent === 'tempo_sessao') {
    if (historyHasAssistant(historico, /\bo tempo de sessao depende\b/)) {
      return 'Isso, pode ser uma sessão ou mais; o tatuador confirma certinho depois de avaliar.';
    }
    return 'O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.';
  }

  if (intent === 'processo_tatuagem') {
    if (historyHasAssistant(historico, /\bfunciona assim\b/)) {
      return 'Isso, eu junto as infos principais e passo pro tatuador avaliar valor e horário.';
    }
    return 'Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário.';
  }

  if (intent === 'historia_vida') {
    return 'Entendi. Dá pra pensar em algo simbólico e delicado com essa ideia.';
  }

  if (intent === 'pergunta_imagem') {
    return 'Consigo te ajudar, mas não estou vendo uma imagem clara aqui.\n\nPode mandar a foto de novo?';
  }

  return null;
}

function compactResumeQuestion(nextField, fallback) {
  if (nextField === 'descricao_curta') return 'Me conta o que tu pensa em tatuar?';
  if (nextField === 'local_corpo') return 'Tu imagina fazer em qual parte do corpo?';
  if (nextField === 'altura_cm') return 'Me diz tua altura?';
  if (nextField === 'estilo') return 'Perfeito. Tu prefere qual estilo pra essa tattoo?';
  if (nextField === 'foto_local') return 'Com isso já ajuda bastante. Consegue mandar uma foto do local?';
  return fallback;
}

function resumeForState({ estado, resume, nextField, context = {} }) {
  const { clientContext, historico = [], pendingResolution = {}, intent } = context;
  const isFirstContact = clientContext?.is_first_contact === true;
  const awaitingFormAnswer = estado === 'tattoo' && pendingResolution.pending && !pendingResolution.answered;
  const displayPrefix = pendingResolution.displayName ? `Boa, ${pendingResolution.displayName}. ` : '';

  if (intent === 'pergunta_imagem') return null;
  if (isFirstContact && estado === 'tattoo' && intent !== 'historia_vida') return firstContactResumeQuestion();
  if (estado === 'tattoo' && pendingResolution.field === 'foto_local' && pendingResolution.deferred) {
    return 'Sem problema, pode mandar a foto depois. Quando conseguir, me manda a foto do local pra eu seguir.';
  }
  if (awaitingFormAnswer) return null;
  if (estado !== 'tattoo') return resume;

  const alreadyUsedLongResume = historyHasAssistant(historico, /\bpra montar tua proposta certinho\b/);
  const shouldUseCompactResume = alreadyUsedLongResume || pendingResolution.answered;
  if (shouldUseCompactResume) {
    return `${displayPrefix}${compactResumeQuestion(nextField, resume)}`;
  }

  return `${displayPrefix}Pra montar tua proposta certinho, preciso só de algumas infos. ${resume}`;
}

export function composeRouterResponse({ intent, estado, resume, nextField, context = {} }) {
  const isFirstContact = context.clientContext?.is_first_contact === true;
  const intro = isFirstContact && estado === 'tattoo'
    ? `${firstContactIntro(context.tenant)}\n\n`
    : '';
  const answer = answerForIntent(intent, context);
  if (!answer) return null;

  const resumed = resumeForState({ estado, resume, nextField, context: { ...context, intent } });
  const answerWithIntro = `${intro}${answer}`;
  return resumed ? `${answerWithIntro}\n\n${resumed}` : answerWithIntro;
}

export const _test = {
  answerForIntent,
  compactResumeQuestion,
};
