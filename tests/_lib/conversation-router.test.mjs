import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeConversationTurn, _test } from '../../functions/_lib/conversation-router.js';

const CONVERSA_TATTOO = {
  estado_agente: 'tattoo',
  dados_coletados: { descricao_curta: 'rosa' },
  dados_cadastro: {},
};

test('ConversationRouter: classifica preço genérico sem tratar negociação', () => {
  assert.equal(_test.detectIntent('quanto fica uma rosa no braço?')?.intent, 'preco_generico');
  assert.equal(_test.detectIntent('qual valor dessa tattoo?')?.intent, 'preco_generico');
  assert.equal(_test.detectIntent('quanto que é?')?.intent, 'preco_generico');
  assert.equal(_test.detectIntent('consegue por 500?'), null);
  assert.equal(_test.detectIntent('faz por R$ 700?'), null);
  assert.equal(_test.detectIntent('essa frase tem um valor sentimental pra mim'), null);
});

test('ConversationRouter: classifica tempo de sessão', () => {
  assert.equal(_test.detectIntent('quanto tempo demora?')?.intent, 'tempo_sessao');
  assert.equal(_test.detectIntent('quantop tempo demora?')?.intent, 'tempo_sessao');
  assert.equal(_test.detectIntent('qnto tempo demora?')?.intent, 'tempo_sessao');
  assert.equal(_test.detectIntent('faz em uma sessão?')?.intent, 'tempo_sessao');
  assert.equal(_test.detectIntent('quantas horas leva essa tattoo?')?.intent, 'tempo_sessao');
});

test('ConversationRouter: classifica processo de tatuagem', () => {
  assert.equal(_test.detectIntent('como funciona pra fazer uma tattoo?')?.intent, 'processo_tatuagem');
  assert.equal(_test.detectIntent('qual o processo para marcar?')?.intent, 'processo_tatuagem');
  assert.equal(_test.detectIntent('primeiro eu mando a ideia?')?.intent, 'processo_tatuagem');
});

test('ConversationRouter: classifica história de vida', () => {
  assert.equal(_test.detectIntent('quero fazer uma homenagem pro meu pai que faleceu')?.intent, 'historia_vida');
  assert.equal(_test.detectIntent('essa frase tem um significado muito importante pra mim')?.intent, 'historia_vida');
  assert.equal(_test.detectIntent('é minha primeira tattoo e tô com medo')?.intent, 'historia_vida');
});

test('ConversationRouter: preço genérico responde e preserva estado', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quanto fica?',
    conversa: CONVERSA_TATTOO,
  });
  assert.equal(out.ok, true);
  assert.equal(out.intent, 'preco_generico');
  assert.equal(out.estado_novo, 'tattoo');
  assert.equal(out.agent_usado, 'conversation_router');
  assert.deepEqual(out.dados_persistidos, {});
  assert.match(out.resposta_cliente, /O valor depende/);
  assert.match(out.resposta_cliente, /Pra montar tua proposta certinho/);
  assert.match(out.resposta_cliente, /parte do corpo\?/);
});

test('ConversationRouter: preço com dados explícitos persiste e retoma pelo próximo campo', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quero fazer uma tauagem de um leao no braço\nquanto fica?',
    conversa: { dados_coletados: {}, dados_cadastro: {} },
  });
  assert.equal(out.intent, 'preco_generico');
  assert.deepEqual(out.dados_persistidos, {
    descricao_curta: 'leao',
    local_corpo: 'braço',
  });
  assert.deepEqual(out.campos_faltando, ['altura_cm', 'estilo']);
  assert.match(out.resposta_cliente, /Qual tua altura\?/);
  assert.doesNotMatch(out.resposta_cliente, /Me conta o que tu pensa em tatuar\?/);
});

test('ConversationRouter: reconhece glúteo quando cliente fala bunda', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quero fazer uma borboleta na bunda\nquanto é',
    conversa: { dados_coletados: {}, dados_cadastro: {} },
  });
  assert.equal(out.intent, 'preco_generico');
  assert.deepEqual(out.dados_persistidos, {
    descricao_curta: 'borboleta',
    local_corpo: 'glúteo',
  });
  assert.match(out.resposta_cliente, /Qual tua altura\?/);
  assert.doesNotMatch(out.resposta_cliente, /parte do corpo\?/);
});

test('ConversationRouter: reconhece virilha como local no texto inicial', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quero fazer um foguinho na virilha\nquanto fica',
    conversa: { dados_coletados: {}, dados_cadastro: {} },
  });
  assert.equal(out.intent, 'preco_generico');
  assert.deepEqual(out.dados_persistidos, {
    descricao_curta: 'foguinho',
    local_corpo: 'virilha',
  });
  assert.match(out.resposta_cliente, /Qual tua altura\?|como posso te chamar/i);
  assert.doesNotMatch(out.resposta_cliente, /parte do corpo\?/);
});

test('ConversationRouter: preserva descrição composta antes do local', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'eu quero fazer uma rosa com bussula no braço\nquanto fica',
    conversa: { dados_coletados: {}, dados_cadastro: {} },
  });
  assert.equal(out.intent, 'preco_generico');
  assert.deepEqual(out.dados_persistidos, {
    descricao_curta: 'rosa com bussula',
    local_corpo: 'braço',
  });
  assert.match(out.resposta_cliente, /Pra montar tua proposta certinho/);
  assert.match(out.resposta_cliente, /Qual tua altura\?/);
});

test('ConversationRouter: primeiro contato misto responde dúvida antes de pedir nome', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'opa\neu quero fazer um urso na coxa\nquanto fica?',
    conversa: { dados_coletados: {}, dados_cadastro: {} },
    tenant: { nome_agente: 'Assistente' },
    clientContext: { is_first_contact: true },
  });
  assert.equal(out.intent, 'preco_generico');
  assert.deepEqual(out.dados_persistidos, {
    descricao_curta: 'urso',
    local_corpo: 'coxa',
  });
  assert.match(out.resposta_cliente, /^Oii, tudo bem\? Me chamo Assistente/);
  assert.match(out.resposta_cliente, /O valor depende/);
  assert.match(out.resposta_cliente, /como posso te chamar\?$/i);
  assert.doesNotMatch(out.resposta_cliente, /Qual tua altura\?/);
});

test('ConversationRouter: primeiro contato misto com "quanto que é" mantém introdução e pede nome', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'opa\nquero fazer um foguinho na virilha\nquanto que é',
    conversa: { dados_coletados: {}, dados_cadastro: {} },
    tenant: { nome_agente: 'Assistente' },
    clientContext: { is_first_contact: true },
  });
  assert.equal(out.intent, 'preco_generico');
  assert.deepEqual(out.dados_persistidos, {
    descricao_curta: 'foguinho',
    local_corpo: 'virilha',
  });
  assert.match(out.resposta_cliente, /^Oii, tudo bem\? Me chamo Assistente/);
  assert.match(out.resposta_cliente, /O valor depende/);
  assert.match(out.resposta_cliente, /como posso te chamar\?$/i);
  assert.doesNotMatch(out.resposta_cliente, /Qual tua altura\?/);
});

test('ConversationRouter: história de vida em primeiro contato não ignora briefing para pedir nome', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quero fazer uma homenagem pro meu pai que faleceu, pensei em passaros e uma frase',
    conversa: { dados_coletados: {}, dados_cadastro: {} },
    tenant: { nome_agente: 'Assistente' },
    clientContext: { is_first_contact: true },
  });
  assert.equal(out.intent, 'historia_vida');
  assert.equal(out.estado_novo, 'tattoo');
  assert.equal(out.agent_usado, 'conversation_router');
  assert.deepEqual(out.dados_persistidos, {
    descricao_curta: 'homenagem ao pai com passaros e frase',
  });
  assert.match(out.resposta_cliente, /^Oii, tudo bem\? Me chamo Assistente/);
  assert.match(out.resposta_cliente, /Dá pra pensar em algo simbólico/);
  assert.match(out.resposta_cliente, /parte do corpo\?/);
  assert.doesNotMatch(out.resposta_cliente, /como posso te chamar/i);
});

test('ConversationRouter: se pergunta de formulário está pendente, responde objeção sem continuar formulário', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quero fazer uma baleia na barriga\nquanto fica',
    conversa: { dados_coletados: {}, dados_cadastro: {} },
    historico: [
      { role: 'user', content: 'opa' },
      { role: 'assistant', content: 'Oii, tudo bem?\n\nMe chamo Assistente, muito prazer! Como posso te chamar?' },
    ],
  });
  assert.equal(out.intent, 'preco_generico');
  assert.deepEqual(out.dados_persistidos, {
    descricao_curta: 'baleia',
    local_corpo: 'barriga',
  });
  assert.equal(out.resposta_cliente, 'O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.');
  assert.doesNotMatch(out.resposta_cliente, /Qual tua altura\?/);
  assert.doesNotMatch(out.resposta_cliente, /Pra montar tua proposta/);
  assert.doesNotMatch(out.resposta_cliente, /como posso te chamar/i);
});

test('ConversationRouter: pergunta pendente de altura bloqueia nova pergunta de coleta', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quanto tempo demora?',
    conversa: { dados_coletados: { descricao_curta: 'baleia', local_corpo: 'barriga' }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Pra montar tua proposta certinho, preciso só de algumas infos. Qual tua altura?' },
    ],
  });
  assert.equal(out.intent, 'tempo_sessao');
  assert.match(out.resposta_cliente, /O tempo de sessão depende/);
  assert.doesNotMatch(out.resposta_cliente, /estilo/i);
  assert.doesNotMatch(out.resposta_cliente, /Pra montar tua proposta/);
});

test('ConversationRouter: se nome pendente foi respondido, responde lateral e retoma coleta', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'sou Leandro\ncomo funciona o orçamento',
    conversa: { dados_coletados: { descricao_curta: 'aguia', local_corpo: 'costas' }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Pra montar tua proposta certinho, como posso te chamar?' },
    ],
  });
  assert.equal(out.intent, 'processo_tatuagem');
  assert.match(out.resposta_cliente, /Funciona assim/);
  assert.match(out.resposta_cliente, /Boa, Leandro\. Me diz tua altura\?/);
  assert.doesNotMatch(out.resposta_cliente, /Boa, Leandro\. Pra montar tua proposta certinho/);
});

test('ConversationRouter: nome puro responde pendência e retoma após lateral', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'Joao\ncomo funciona o orçamento?',
    conversa: { dados_coletados: { descricao_curta: 'batman', local_corpo: 'braço' }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Pra montar tua proposta certinho, como posso te chamar?' },
    ],
  });
  assert.equal(out.intent, 'processo_tatuagem');
  assert.match(out.resposta_cliente, /Funciona assim/);
  assert.match(out.resposta_cliente, /Boa, Joao\. Me diz tua altura\?/);
});

test('ConversationRouter: "me chama de" responde nome pendente e retoma após lateral', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'me chama de Paola\ncomo funciona o orçamento',
    conversa: { dados_coletados: { descricao_curta: 'foguinho', local_corpo: 'virilha' }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Pra montar tua proposta certinho, como posso te chamar?' },
    ],
  });
  assert.equal(out.intent, 'processo_tatuagem');
  assert.match(out.resposta_cliente, /Funciona assim/);
  assert.match(out.resposta_cliente, /Boa, Paola\. Me diz tua altura\?/);
});

test('ConversationRouter: side quest pura não vira nome quando nome está pendente', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'como funciona o orçamento?',
    conversa: { dados_coletados: { descricao_curta: 'batman', local_corpo: 'braço' }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Pra montar tua proposta certinho, como posso te chamar?' },
    ],
  });
  assert.equal(out.intent, 'processo_tatuagem');
  assert.match(out.resposta_cliente, /^Funciona assim/);
  assert.doesNotMatch(out.resposta_cliente, /Me diz tua altura\?/);
  assert.doesNotMatch(out.resposta_cliente, /Boa, Como/i);
});

test('ConversationRouter: pergunta pendente de local aceita resposta curta e avança', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'bunda\nquantas sessoes seria?',
    conversa: { dados_coletados: { descricao_curta: 'borboleta' }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Tu imagina fazer em qual parte do corpo?' },
    ],
  });
  assert.equal(out.intent, 'tempo_sessao');
  assert.deepEqual(out.dados_persistidos, { local_corpo: 'glúteo' });
  assert.match(out.resposta_cliente, /Me diz tua altura\?/);
  assert.doesNotMatch(out.resposta_cliente, /parte do corpo\?/);
});

test('ConversationRouter: se altura pendente foi respondida, persiste altura e retoma próximo campo', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'tenho 1.70\nquanto tempo demora?',
    conversa: { dados_coletados: { descricao_curta: 'baleia', local_corpo: 'barriga' }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Pra montar tua proposta certinho, preciso só de algumas infos. Qual tua altura?' },
    ],
  });
  assert.equal(out.intent, 'tempo_sessao');
  assert.deepEqual(out.dados_persistidos, { altura_cm: 170 });
  assert.match(out.resposta_cliente, /O tempo de sessão depende/);
  assert.match(out.resposta_cliente, /Tu prefere qual estilo/);
});

test('ConversationRouter: altura pendente em retomada compacta persiste e avança', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'tenho 160\nquantas sessoes seria?',
    conversa: { dados_coletados: { descricao_curta: 'rosa', local_corpo: 'braço' }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.\n\nBoa, Joane. Me diz tua altura?' },
    ],
  });
  assert.equal(out.intent, 'tempo_sessao');
  assert.deepEqual(out.dados_persistidos, { altura_cm: 160 });
  assert.match(out.resposta_cliente, /O tempo de sessão depende/);
  assert.match(out.resposta_cliente, /Tu prefere qual estilo/);
  assert.doesNotMatch(out.resposta_cliente, /Me diz tua altura\?/);
});

test('ConversationRouter: se estilo pendente foi respondido, persiste estilo e retoma foto após lateral', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'realismo\nem quantas sessoes seria',
    conversa: { dados_coletados: { descricao_curta: 'hiena', local_corpo: 'panturrilha', altura_cm: 170 }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Me diz o estilo que tu prefere?' },
    ],
  });
  assert.equal(out.intent, 'tempo_sessao');
  assert.deepEqual(out.dados_persistidos, { estilo: 'realismo' });
  assert.match(out.resposta_cliente, /O tempo de sessão depende/);
  assert.match(out.resposta_cliente, /foto do local/);
});

test('ConversationRouter: estilo old school após nome não vira displayName old', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'old school\nquanto fica',
    conversa: { dados_coletados: { descricao_curta: 'rosa', local_corpo: 'braço' }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Oii, tudo bem?\n\nMe chamo Assistente, muito prazer! Como posso te chamar?' },
      { role: 'user', content: 'quero fazer uma rosa no braço' },
      { role: 'user', content: 'Mario' },
      { role: 'assistant', content: 'Massa, Mario! E de estilo, tu curte mais fineline, realismo, blackwork ou tradicional?' },
    ],
  });
  assert.equal(out.intent, 'preco_generico');
  assert.deepEqual(out.dados_persistidos, { estilo: 'old school' });
  assert.match(out.resposta_cliente, /O valor depende/);
  assert.match(out.resposta_cliente, /Me diz tua altura\?/);
  assert.doesNotMatch(out.resposta_cliente, /Boa, old/i);
});

test('ConversationRouter: preço repetido usa resposta curta sem repetir texto inteiro', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quanto é?',
    conversa: { dados_coletados: { descricao_curta: 'hiena', local_corpo: 'perna', altura_cm: 180 }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.' },
    ],
  });
  assert.equal(out.intent, 'preco_generico');
  assert.match(out.resposta_cliente, /^Isso, o valor fecha depois da avaliação do tatuador\./);
  assert.doesNotMatch(out.resposta_cliente, /O valor depende do tamanho/);
});

test('ConversationRouter: se foto pendente foi adiada, responde lateral e orienta mandar depois', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'agora nao consigo\nquanto fica?',
    conversa: {
      dados_coletados: {
        descricao_curta: 'rosa',
        local_corpo: 'braço',
        altura_cm: 170,
        estilo: 'fineline',
      },
      dados_cadastro: {},
    },
    historico: [
      { role: 'assistant', content: 'Fechou! Consegue mandar também uma foto do local? É importante pro tatuador ter noção do espaço e passar o valor certinho.' },
    ],
  });
  assert.equal(out.intent, 'preco_generico');
  assert.deepEqual(out.dados_persistidos, {});
  assert.match(out.resposta_cliente, /O valor depende/);
  assert.match(out.resposta_cliente, /Sem problema, pode mandar a foto depois/);
  assert.match(out.resposta_cliente, /Quando conseguir, me manda a foto do local/i);
});

test('ConversationRouter: retomada longa não repete quando já apareceu no histórico', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'realismo\nquanto é?',
    conversa: { dados_coletados: { descricao_curta: 'hiena', local_corpo: 'perna', altura_cm: 180 }, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Pra montar tua proposta certinho, preciso só de algumas infos. Me diz o estilo que tu prefere?' },
    ],
  });
  assert.equal(out.intent, 'preco_generico');
  assert.deepEqual(out.dados_persistidos, { estilo: 'realismo' });
  assert.doesNotMatch(out.resposta_cliente, /Pra montar tua proposta certinho, preciso só de algumas infos/);
  assert.match(out.resposta_cliente, /Com isso já ajuda bastante\. Consegue mandar uma foto do local\?/);
});

test('ConversationRouter: saudação genérica anterior não bloqueia retomada da coleta', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quero fazer uma baleia na barriga\nquanto fica',
    conversa: { dados_coletados: {}, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Oii, tudo bem?' },
    ],
  });
  assert.equal(out.intent, 'preco_generico');
  assert.match(out.resposta_cliente, /Qual tua altura\?/);
});

test('ConversationRouter: cadastro retoma cadastro, não coleta tattoo', () => {
  const out = routeConversationTurn({
    estado_atual: 'cadastro',
    mensagem: 'quanto tempo demora?',
    conversa: { dados_coletados: {}, dados_cadastro: { nome: 'Joao' } },
  });
  assert.equal(out.intent, 'tempo_sessao');
  assert.equal(out.estado_novo, 'cadastro');
  assert.match(out.resposta_cliente, /data de nascimento/);
});

test('ConversationRouter: cadastro persiste nome e data pendentes antes de responder lateral', () => {
  const out = routeConversationTurn({
    estado_atual: 'cadastro',
    mensagem: 'Joao Silva\n12/03/1995\ncomo funciona o orçamento?',
    conversa: { dados_coletados: {}, dados_cadastro: {} },
    historico: [
      { role: 'assistant', content: 'Pra liberar teu orçamento, me passa nome completo e data de nascimento?' },
    ],
  });
  assert.equal(out.intent, 'processo_tatuagem');
  assert.equal(out.estado_novo, 'cadastro');
  assert.equal(out.agent_usado, 'cadastro');
  assert.deepEqual(out.dados_persistidos, {
    nome: 'Joao Silva',
    data_nascimento: '1995-03-12',
  });
  assert.match(out.resposta_cliente, /Funciona assim/);
  assert.match(out.resposta_cliente, /e-mail/i);
  assert.doesNotMatch(out.resposta_cliente, /nome completo e data de nascimento/);
});

test('ConversationRouter: cadastro persiste recusa de email e não insiste no email', () => {
  const out = routeConversationTurn({
    estado_atual: 'cadastro',
    mensagem: 'pode seguir sem email\nquanto tempo demora?',
    conversa: { dados_coletados: {}, dados_cadastro: { nome: 'Maria Silva', data_nascimento: '1990-05-20' } },
    historico: [
      { role: 'assistant', content: 'E o e-mail? Se preferir seguir sem, me avisa' },
    ],
  });
  assert.equal(out.intent, 'tempo_sessao');
  assert.equal(out.agent_usado, 'cadastro');
  assert.deepEqual(out.dados_persistidos, { email: null, email_recusado: true });
  assert.match(out.resposta_cliente, /tempo de sessão/);
  assert.match(out.resposta_cliente, /Fechado, Maria!/);
  assert.match(out.resposta_cliente, /O tatuador vai avaliar com calma/);
  assert.match(out.resposta_cliente, /te retorno em breve com o valor certinho/);
  assert.doesNotMatch(out.resposta_cliente, /e-mail/i);
  assert.doesNotMatch(out.resposta_cliente, /sigo com teu orçamento/i);
});

test('ConversationRouter: tempo de sessão responde sobre duração, não preço', () => {
  const out = routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quanto tempo demora?',
    conversa: CONVERSA_TATTOO,
  });
  assert.equal(out.intent, 'tempo_sessao');
  assert.match(out.resposta_cliente, /tempo de sessão/);
  assert.match(out.resposta_cliente, /uma sessão ou mais/);
  assert.doesNotMatch(out.resposta_cliente, /O valor depende/);
});

test('ConversationRouter: ignora estados fora do Slice 1 e kill switch', () => {
  assert.equal(routeConversationTurn({
    estado_atual: 'propondo_valor',
    mensagem: 'quanto fica?',
    conversa: CONVERSA_TATTOO,
  }), null);
  assert.equal(routeConversationTurn({
    estado_atual: 'tattoo',
    mensagem: 'quanto fica?',
    conversa: CONVERSA_TATTOO,
    disabled: true,
  }), null);
});
