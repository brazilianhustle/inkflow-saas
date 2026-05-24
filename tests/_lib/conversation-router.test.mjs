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
  assert.equal(_test.detectIntent('consegue por 500?'), null);
  assert.equal(_test.detectIntent('faz por R$ 700?'), null);
  assert.equal(_test.detectIntent('essa frase tem um valor sentimental pra mim'), null);
});

test('ConversationRouter: classifica tempo de sessão', () => {
  assert.equal(_test.detectIntent('quanto tempo demora?')?.intent, 'tempo_sessao');
  assert.equal(_test.detectIntent('faz em uma sessão?')?.intent, 'tempo_sessao');
  assert.equal(_test.detectIntent('quantas horas leva essa tattoo?')?.intent, 'tempo_sessao');
});

test('ConversationRouter: classifica processo de tatuagem', () => {
  assert.equal(_test.detectIntent('como funciona pra fazer uma tattoo?')?.intent, 'processo_tatuagem');
  assert.equal(_test.detectIntent('qual o processo para marcar?')?.intent, 'processo_tatuagem');
  assert.equal(_test.detectIntent('primeiro eu mando a ideia?')?.intent, 'processo_tatuagem');
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
  assert.match(out.resposta_cliente, /parte do corpo\?/);
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
