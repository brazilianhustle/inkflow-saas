// Spike Fase 2A pre-PR: valida z.string().regex() traduz pra "pattern" JSON
// Schema strict sem erro 400.
//
// Run: node --env-file=evals/.env tests/agent/_spike-fase2a-regex-strict.mjs
// Custo: ~$0.05 (1 chamada gpt-4o-mini).
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const HandoffComISO = z.object({
  proxima_acao: z.literal('handoff'),
  nome: z.string().min(1),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const PerguntaCadastro = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
});
const Schema = z.object({
  output: z.discriminatedUnion('proxima_acao', [HandoffComISO, PerguntaCadastro]),
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const r = await client.responses.parse({
  model: 'gpt-4o-mini',
  instructions: 'Cliente disse: nome=Joao, nascimento=12/03/1995. Emita handoff com data_nascimento em formato ISO YYYY-MM-DD.',
  input: [{ role: 'user', content: 'meu nome e Joao e nasci em 12/03/1995' }],
  text: { format: zodTextFormat(Schema, 'cadastro_spike') },
});

console.log('status:', r.status);
console.log('output_parsed:', JSON.stringify(r.output_parsed, null, 2));

if (r.status !== 'completed' || r.output_parsed?.output?.proxima_acao !== 'handoff') {
  console.error('FAIL'); process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(r.output_parsed.output.data_nascimento)) {
  console.error('FAIL: data_nascimento nao bate regex:', r.output_parsed.output.data_nascimento);
  process.exit(1);
}
console.log('✅ SPIKE OK — regex ISO traduz pra pattern strict.');
