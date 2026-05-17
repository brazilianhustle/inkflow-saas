// Spike Fase 1 pre-PR: valida que openai SDK puro + Responses API + strict mode
// aceita discriminated union no schema. Falsifica em isolamento o risco do
// spike Sub 1.D (que era no @openai/agents SDK, cai em fallback rejeitado).
//
// Run: node --env-file=evals/.env tests/agent/_spike-fase1-openai-strict.mjs
// Custo: ~$0.05 (1 chamada gpt-4o-mini).
//
// Aprendizados cravados (vs plano original):
// 1. Helper correto pro Responses API: `zodTextFormat` (NAO `zodResponseFormat`,
//    que e do Chat Completions e retorna shape { type, json_schema: {...} }).
//    zodTextFormat ja retorna achatado { type, name, strict, schema }.
// 2. Endpoint correto: `client.responses.parse()` (NAO `.create()`) — o parse
//    auto-popula `response.output_parsed` com a estrutura Zod.
// 3. Wrap obrigatorio: OpenAI strict mode exige root JSON Schema com
//    `type: 'object'`. Discriminated union vira `anyOf` que NAO e aceita no
//    root. Wrap em z.object({ output: discriminatedUnion(...) }) destrava.
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const Pergunta = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
  campos_faltando: z.array(z.string()).min(1),
});
const Handoff = z.object({
  proxima_acao: z.literal('handoff'),
  resposta_cliente: z.string().min(1),
  dados: z.object({
    descricao_curta: z.string().min(1),
    local_corpo: z.string().min(1),
    altura_cm: z.number().positive().max(250),
    estilo: z.string().min(1),
  }),
});
const InnerUnion = z.discriminatedUnion('proxima_acao', [Pergunta, Handoff]);
// Wrap: root deve ser type=object pro strict mode. O union vive em `.output`.
const SpikeSchema = z.object({ output: InnerUnion });

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const format = zodTextFormat(SpikeSchema, 'tattoo_output');
console.log('format shape:', JSON.stringify({
  type: format.type, name: format.name, strict: format.strict, rootType: format.schema?.type,
}));

const response = await client.responses.parse({
  model: 'gpt-4o-mini',
  instructions: 'Você é um agente de tatuagem. Se o cliente disse tudo (descricao, local, altura, estilo), retorne handoff. Senão pergunta.',
  input: [{ role: 'user', content: 'Quero uma rosa pequena no braço direito, sou 1.70m, traço fino' }],
  text: { format },
});

console.log('status:', response.status);
console.log('output_parsed:', JSON.stringify(response.output_parsed, null, 2));

if (response.status !== 'completed') {
  console.error('FAIL: response.status !== completed');
  process.exit(1);
}
const parsed = response.output_parsed?.output;
if (!parsed || !['pergunta', 'handoff'].includes(parsed.proxima_acao)) {
  console.error('FAIL: discriminated union não respeitado (esperava parsed.output.proxima_acao)');
  process.exit(1);
}
console.log('PASS: discriminated union strict mode funciona com openai SDK puro (wrap obrigatorio)');
