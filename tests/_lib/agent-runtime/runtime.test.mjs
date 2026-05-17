import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { runtime } from '../../../functions/_lib/agent-runtime/runtime.js';

const SimpleSchema = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string(),
});

// Mock simula a Responses API: retorna output_parsed com envelope { output: ... }
// porque o runtime.run() wrappa internamente em z.object({ output: schema }).
function makeFakeClient({ parsed, status = 'completed', throwTimes = 0 } = {}) {
  let calls = 0;
  let lastParams;
  return {
    _calls: () => calls,
    _lastParams: () => lastParams,
    responses: {
      parse: async (params) => {
        calls++;
        lastParams = params;
        if (calls <= throwTimes) {
          const e = new Error('503');
          e.status = 503;
          throw e;
        }
        return {
          status,
          output_parsed: parsed != null ? { output: parsed } : parsed,
          id: 'resp_test',
        };
      },
    },
  };
}

test('runtime.run: retorna output unwrapped (envelope.output)', async () => {
  const fake = makeFakeClient({ parsed: { proxima_acao: 'pergunta', resposta_cliente: 'oi' } });
  const out = await runtime.run({
    openaiClient: fake,
    model: 'gpt-4o-mini',
    instructions: 'instrucoes',
    input: [{ role: 'user', content: 'hi' }],
    outputSchema: SimpleSchema,
    schemaName: 'simple',
    retryConfig: { maxRetries: 0, baseMs: 1 },
  });
  assert.deepEqual(out, { proxima_acao: 'pergunta', resposta_cliente: 'oi' });
});

test('runtime.run: passa instructions, model, input corretos + format strict', async () => {
  const fake = makeFakeClient({ parsed: { proxima_acao: 'pergunta', resposta_cliente: 'x' } });
  await runtime.run({
    openaiClient: fake,
    model: 'gpt-4o-mini',
    instructions: 'sou um agente',
    input: [{ role: 'user', content: 'oi' }],
    outputSchema: SimpleSchema,
    schemaName: 'simple',
    retryConfig: { maxRetries: 0, baseMs: 1 },
  });
  const params = fake._lastParams();
  assert.equal(params.model, 'gpt-4o-mini');
  assert.equal(params.instructions, 'sou um agente');
  assert.deepEqual(params.input, [{ role: 'user', content: 'oi' }]);
  assert.equal(params.text.format.type, 'json_schema');
  assert.equal(params.text.format.strict, true);
  assert.equal(params.text.format.name, 'simple');
  // Wrap interno: root schema type=object com property 'output'
  assert.equal(params.text.format.schema.type, 'object');
  assert.ok(params.text.format.schema.properties.output);
});

test('runtime.run: retry em 503 transitorio e retorna output', async () => {
  const fake = makeFakeClient({
    parsed: { proxima_acao: 'pergunta', resposta_cliente: 'ok' },
    throwTimes: 2,
  });
  const out = await runtime.run({
    openaiClient: fake,
    model: 'gpt-4o-mini',
    instructions: 'x',
    input: [],
    outputSchema: SimpleSchema,
    schemaName: 's',
    retryConfig: { maxRetries: 3, baseMs: 1 },
  });
  assert.equal(out.resposta_cliente, 'ok');
  assert.equal(fake._calls(), 3);
});

test('runtime.run: status != completed lanca erro', async () => {
  const fake = makeFakeClient({
    parsed: { proxima_acao: 'pergunta', resposta_cliente: 'x' },
    status: 'incomplete',
  });
  await assert.rejects(
    runtime.run({
      openaiClient: fake, model: 'gpt-4o-mini', instructions: 'x', input: [],
      outputSchema: SimpleSchema, schemaName: 's',
      retryConfig: { maxRetries: 0, baseMs: 1 },
    }),
    /incomplete|status/i,
  );
});

test('runtime.run: output_parsed null lanca erro', async () => {
  const fake = makeFakeClient({ parsed: null, status: 'completed' });
  await assert.rejects(
    runtime.run({
      openaiClient: fake, model: 'gpt-4o-mini', instructions: 'x', input: [],
      outputSchema: SimpleSchema, schemaName: 's',
      retryConfig: { maxRetries: 0, baseMs: 1 },
    }),
    /output_parsed|parsed/i,
  );
});
