// functions/_lib/agent-runtime/runtime.js
// runtime.run({ apiKey, model, instructions, input, outputSchema, schemaName,
//               retryConfig, openaiClient })
//
// Wrappa openai.responses.parse() com:
// - Schema strict via toResponseFormat (constrained decoding token-level)
// - Retry exponential backoff via runWithRetry (network + 5xx + 429)
// - Verifica status === 'completed' e output_parsed != null
//
// Wrap/unwrap (decisao pos-spike):
//   OpenAI strict mode exige root JSON Schema com type=object. Discriminated
//   unions geram anyOf top-level que e rejeitado. Solucao: wrappamos o
//   outputSchema recebido em z.object({ output: outputSchema }) antes de
//   converter, e unwrap antes de retornar. Caller recebe o objeto interno
//   identico ao que esperaria com schema direto.
//
// Padrao spec Caminho C Fase 1 secao 4.A Principio 3: agent como funcao pura.
import OpenAI from 'openai';
import { z } from 'zod';
import { toResponseFormat } from './schema-to-json.js';
import { runWithRetry } from './retry.js';

export const runtime = {
  async run({
    apiKey,
    openaiClient,
    model,
    instructions,
    input,
    outputSchema,
    schemaName,
    retryConfig = { maxRetries: 3, baseMs: 1000 },
  }) {
    const client = openaiClient ?? new OpenAI({ apiKey });
    const wrapped = z.object({ output: outputSchema });
    const format = toResponseFormat(wrapped, schemaName);

    const response = await runWithRetry(
      () => client.responses.parse({
        model,
        instructions,
        input,
        text: { format },
      }),
      retryConfig,
    );

    if (response.status !== 'completed') {
      const err = new Error(`runtime.run: response.status='${response.status}' (esperado 'completed')`);
      err.responseStatus = response.status;
      err.responseId = response.id;
      throw err;
    }
    if (response.output_parsed == null) {
      throw new Error('runtime.run: output_parsed null/undefined (schema strict deveria garantir parsed)');
    }
    if (response.output_parsed.output == null) {
      throw new Error('runtime.run: output_parsed.output null/undefined (wrap envelope quebrado)');
    }
    return response.output_parsed.output;
  },
};
