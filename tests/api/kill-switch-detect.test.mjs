import { test } from 'node:test';
import assert from 'node:assert/strict';

test('kill-switch — fromMe=false sempre noop (mensagem do cliente nunca dispara)', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: '/eu assumo',
    from_me: false,
    estado_atual: 'ativo',
    config: {}
  });
  assert.equal(r.action, 'noop');
});

test('kill-switch — fromMe=true + frase_assumir match (case-insensitive) → pause', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: ' /EU ASSUMO ',
    from_me: true,
    estado_atual: 'ativo',
    config: {}
  });
  assert.equal(r.action, 'pause');
  assert.equal(r.new_state, 'pausada_tatuador');
});

test('kill-switch — fromMe=true + frase customizada do tenant → pause', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: 'tô fora',
    from_me: true,
    estado_atual: 'ativo',
    config: { frase_assumir: 'tô fora' }
  });
  assert.equal(r.action, 'pause');
});

test('kill-switch — fromMe=true + frase_devolver match em estado pausado → resume', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: '/bot volta',
    from_me: true,
    estado_atual: 'pausada_tatuador',
    config: {}
  });
  assert.equal(r.action, 'resume');
});

test('kill-switch — fromMe=true sem match em frase nenhuma → noop (msg manual normal)', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: 'oi cliente, tudo bem?',
    from_me: true,
    estado_atual: 'ativo',
    config: {}
  });
  assert.equal(r.action, 'noop');
});

test('kill-switch — frase_assumir em estado já pausado → noop (idempotente)', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: '/eu assumo',
    from_me: true,
    estado_atual: 'pausada_tatuador',
    config: {}
  });
  assert.equal(r.action, 'noop');
});

test('kill-switch — frase_devolver em estado ativo → noop', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: '/bot volta',
    from_me: true,
    estado_atual: 'ativo',
    config: {}
  });
  assert.equal(r.action, 'noop');
});

// ── Edge cases (post-review hardening) ──

test('kill-switch — mensagem=null com from_me=true → noop (não crashes)', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: null,
    from_me: true,
    estado_atual: 'ativo',
    config: {}
  });
  assert.equal(r.action, 'noop');
});

test('kill-switch — from_me=string("true") → noop (truthy mas não literal true)', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: '/eu assumo',
    from_me: 'true',
    estado_atual: 'ativo',
    config: {}
  });
  assert.equal(r.action, 'noop');
});

test('kill-switch — estado=aguardando_tatuador (não-pausado) + frase_assumir → pause (binário isPaused generaliza)', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: '/eu assumo',
    from_me: true,
    estado_atual: 'aguardando_tatuador',
    config: {}
  });
  assert.equal(r.action, 'pause');
  assert.equal(r.new_state, 'pausada_tatuador');
});
