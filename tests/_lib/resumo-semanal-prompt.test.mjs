import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, callLlm } from '../../functions/_lib/resumo-semanal-prompt.js';

test('buildPrompt — inclui contagens da semana atual e anterior', () => {
  const stats = {
    semana_atual: { conversas: 5, orcamentos: 3, fechados: 1, sinal_recebido: 250 },
    semana_anterior: { conversas: 2, orcamentos: 1, fechados: 0, sinal_recebido: 0 },
    nome_estudio: 'Hustle Ink',
  };
  const prompt = buildPrompt(stats);
  assert.match(prompt, /Hustle Ink/);
  assert.match(prompt, /5 conversas/);
  assert.match(prompt, /3 orçamentos/);
  assert.match(prompt, /R\$ 250/);
  assert.match(prompt, /comparado.*semana anterior/i);
});

test('buildPrompt — semana ruim (zero) gera tom positivo', () => {
  const stats = {
    semana_atual: { conversas: 0, orcamentos: 0, fechados: 0, sinal_recebido: 0 },
    semana_anterior: { conversas: 3, orcamentos: 2, fechados: 1, sinal_recebido: 100 },
    nome_estudio: 'Tatto X',
  };
  const prompt = buildPrompt(stats);
  assert.match(prompt, /tom positivo/i);
  assert.match(prompt, /sem sugest[aã]o/i);
  assert.match(prompt, /600 chars/i);
});

test('callLlm — chama OpenAI com modelo gpt-4o-mini e retorna texto', async () => {
  const mockFetch = mock.fn(async (url) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Foi uma semana movimentada com 5 conversas...' } }],
      }),
    };
  });
  const result = await callLlm({
    prompt: 'gera resumo',
    apiKey: 'sk-test',
    fetchFn: mockFetch,
  });
  assert.equal(result, 'Foi uma semana movimentada com 5 conversas...');
  assert.equal(mockFetch.mock.callCount(), 1);
  const body = JSON.parse(mockFetch.mock.calls[0].arguments[1].body);
  assert.equal(body.model, 'gpt-4o-mini');
  assert.equal(body.max_tokens, 500);
});

test('callLlm — OpenAI 500 lança Error com detail', async () => {
  const mockFetch = mock.fn(async () => ({
    ok: false,
    status: 500,
    text: async () => 'rate limit',
  }));
  await assert.rejects(
    callLlm({ prompt: 'x', apiKey: 'sk-test', fetchFn: mockFetch }),
    /openai-error.*500/
  );
});

test('callLlm — texto >600 chars trunca', async () => {
  const longText = 'a'.repeat(700);
  const mockFetch = mock.fn(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: longText } }] }),
  }));
  const result = await callLlm({ prompt: 'x', apiKey: 'sk-test', fetchFn: mockFetch });
  assert.equal(result.length, 600);
  assert.match(result, /\.\.\.$/);
});
