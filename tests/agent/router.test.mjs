// Unit tests pro router.js (Sub-3.2 cross-agent pattern: builder retorna {agent, validator}).
// selectAgentValidator removido — validator vem do builder via closure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectAgentBuilder,
  isStateImplemented,
  getNextState,
} from '../../functions/api/agent/router.js';

test('selectAgentBuilder — cadastro + proposta substates resolvidos, tattoo null (path novo), outros null', () => {
  // Caminho C Fase 1: tattoo migrou pro path novo (runTattooAgent direto).
  // route.js bifurca antes de chamar selectAgentBuilder pra estado='tattoo'.
  assert.equal(selectAgentBuilder('tattoo'), null);
  assert.equal(typeof selectAgentBuilder('cadastro'), 'function');
  assert.equal(typeof selectAgentBuilder('propondo_valor'), 'function');
  assert.equal(typeof selectAgentBuilder('escolhendo_horario'), 'function');
  assert.equal(typeof selectAgentBuilder('aguardando_sinal'), 'function');
  assert.equal(selectAgentBuilder('proposta'), null);
  assert.equal(selectAgentBuilder('portfolio'), null);
});

test('selectAgentBuilder — cadastro builder retorna {agent, validator} (closure pattern)', () => {
  const mockEnv = { OPENAI_API_KEY: 'sk-test' };
  const mockTenant = { id: 't1', nome_estudio: 'Test', config_agente: {}, config_precificacao: {}, gatilhos_handoff: [], faqs: [], fewshots: [] };
  const mockConversa = { id: 'c1', telefone: '+5511999999999', estado_agente: 'cadastro', dados_coletados: {}, dados_cadastro: {} };
  const builder = selectAgentBuilder('cadastro');
  const result = builder({ env: mockEnv, tenant: mockTenant, conversa: mockConversa, clientContext: {} });
  assert.ok(result && typeof result === 'object', 'builder deve retornar objeto');
  assert.ok('agent' in result, 'resultado deve ter agent');
  assert.ok('validator' in result, 'resultado deve ter validator');
  assert.equal(typeof result.validator, 'function');
});

test('isStateImplemented — tattoo + cadastro + proposta substates=true, outros=false', () => {
  assert.equal(isStateImplemented('tattoo'), true);
  assert.equal(isStateImplemented('cadastro'), true);
  assert.equal(isStateImplemented('propondo_valor'), true);
  assert.equal(isStateImplemented('escolhendo_horario'), true);
  assert.equal(isStateImplemented('aguardando_sinal'), true);
  assert.equal(isStateImplemented('proposta'), false);
  assert.equal(isStateImplemented('portfolio'), false);
});

test('getNextState — tattoo+handoff -> cadastro', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'handoff' }), 'cadastro');
});

test('getNextState — tattoo+pergunta -> tattoo (stay)', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'pergunta' }), 'tattoo');
});

test('getNextState — tattoo+erro -> tattoo (stay)', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'erro' }), 'tattoo');
});

test('getNextState — cadastro+handoff -> aguardando_tatuador', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'handoff' }), 'aguardando_tatuador');
});

test('getNextState — cadastro+erro -> aguardando_tatuador (trigger sai)', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'erro' }), 'aguardando_tatuador');
});

test('getNextState — cadastro+pergunta -> cadastro (stay)', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'pergunta' }), 'cadastro');
});

test('getNextState — out null/undefined -> stay', () => {
  assert.equal(getNextState('tattoo', null), 'tattoo');
  assert.equal(getNextState('cadastro', undefined), 'cadastro');
});

// — Sub-3.3: enviar_portfolio nao muda estado —————————————————————————
test('getNextState: tattoo + enviar_portfolio -> tattoo', () => {
  assert.equal(getNextState('tattoo', { proxima_acao: 'enviar_portfolio' }), 'tattoo');
});

test('getNextState: cadastro + enviar_portfolio -> cadastro', () => {
  assert.equal(getNextState('cadastro', { proxima_acao: 'enviar_portfolio' }), 'cadastro');
});

test('getNextState: propondo_valor + enviar_portfolio -> propondo_valor', () => {
  assert.equal(getNextState('propondo_valor', { proxima_acao: 'enviar_portfolio' }), 'propondo_valor');
});

test('getNextState: escolhendo_horario + enviar_portfolio -> escolhendo_horario', () => {
  assert.equal(getNextState('escolhendo_horario', { proxima_acao: 'enviar_portfolio' }), 'escolhendo_horario');
});

test('getNextState: aguardando_sinal + enviar_portfolio -> aguardando_sinal', () => {
  assert.equal(getNextState('aguardando_sinal', { proxima_acao: 'enviar_portfolio' }), 'aguardando_sinal');
});
