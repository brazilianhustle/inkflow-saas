// Unit tests pro router.js — coverage de isStateImplemented + getNextState.
// Caminho C Fase 2B: selectAgentBuilder removido (path antigo @openai/agents).
// Cobertura de validateAction esta em router-validate-transition.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isStateImplemented,
  getNextState,
} from '../../functions/api/agent/router.js';

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
