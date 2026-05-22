import { test } from 'node:test';
import assert from 'node:assert/strict';

import { splitBaloes, evoSendTextBaloes } from '../../functions/_lib/evolution-send.js';

test('splitBaloes quebra por linha em branco e remove vazios', () => {
  assert.deepEqual(splitBaloes('Oi\n\nTudo bem?\n\n\nBora'), ['Oi', 'Tudo bem?', 'Bora']);
});

test('evoSendTextBaloes envia um sendText por balao', async () => {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    const r = await evoSendTextBaloes(
      { EVO_BASE_URL: 'https://evo.test' },
      { evo_apikey: 'k', evo_instance: 'inst' },
      { to: '5511', text: 'Primeiro\n\nSegundo' },
    );
    assert.equal(r.ok, true);
    assert.equal(r.baloes, 2);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.text, 'Primeiro');
    assert.equal(calls[1].body.text, 'Segundo');
  } finally {
    globalThis.fetch = orig;
  }
});

test('evoSendTextBaloes respeita evo_base_url do tenant', async () => {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    await evoSendTextBaloes(
      { EVO_BASE_URL: 'https://evo.env' },
      { evo_base_url: 'https://evo.tenant', evo_apikey: 'k', evo_instance: 'inst' },
      { to: '5511', text: 'Oi' },
    );
    assert.equal(calls[0].startsWith('https://evo.tenant/'), true);
  } finally {
    globalThis.fetch = orig;
  }
});
