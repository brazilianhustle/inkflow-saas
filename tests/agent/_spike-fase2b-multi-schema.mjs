// Spike Fase 2B pre-PR: valida (a) 3 schemas distintos no mesmo runtime
// (sequenciais, sem state-leak), (b) z.string().regex(ISO) em slot_inicio
// funciona em strict mode. Espelha _spike-fase2a-regex-strict.mjs mas
// pra Proposta.
//
// Run: OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
//      node tests/agent/_spike-fase2b-multi-schema.mjs
// Custo: ~$0.05 (3 chamadas gpt-4o-mini).
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const PerguntaPV = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
});
const PediuDesconto = z.object({
  proxima_acao: z.literal('pediu_desconto'),
  resposta_cliente: z.string().min(1),
  valor_pedido_cliente: z.number().positive(),
});
const PropondoValorSchema = z.object({
  output: z.discriminatedUnion('proxima_acao', [PerguntaPV, PediuDesconto]),
});

const PerguntaEH = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
});
const ReservarHorario = z.object({
  proxima_acao: z.literal('reservar_horario'),
  resposta_cliente: z.string().min(1),
  slot_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
  slot_fim: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
});
const EscolhendoHorarioSchema = z.object({
  output: z.discriminatedUnion('proxima_acao', [PerguntaEH, ReservarHorario]),
});

const PerguntaAS = z.object({
  proxima_acao: z.literal('pergunta'),
  resposta_cliente: z.string().min(1),
});
const AguardandoSinalSchema = z.object({
  output: z.discriminatedUnion('proxima_acao', [PerguntaAS]),
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function call(schema, name, instructions, mensagem) {
  const r = await client.responses.parse({
    model: 'gpt-4o-mini',
    instructions,
    input: [{ role: 'user', content: mensagem }],
    text: { format: zodTextFormat(schema, name) },
  });
  if (r.status !== 'completed') throw new Error(`${name}: status=${r.status}`);
  return r.output_parsed.output;
}

// Round 1: propondo_valor — pede desconto numerico
const o1 = await call(PropondoValorSchema, 'propondo_valor',
  'Estado: propondo_valor. Cliente pode aceitar valor, pedir desconto numerico, ou outro. Valor proposto: R$750.',
  'consegue por 600?');
console.log('R1 propondo_valor:', JSON.stringify(o1));
if (o1.proxima_acao !== 'pediu_desconto' || o1.valor_pedido_cliente !== 600) {
  console.error('FAIL R1'); process.exit(1);
}

// Round 2: escolhendo_horario — pede slot ISO
const o2 = await call(EscolhendoHorarioSchema, 'escolhendo_horario',
  'Estado: escolhendo_horario. Cliente escolheu ter 12/05 14h-17h (2026-05-12T17:00:00Z ate 2026-05-12T20:00:00Z UTC). Emita reservar_horario com slot ISO completo.',
  'pode ser terca 14h');
console.log('R2 escolhendo_horario:', JSON.stringify(o2));
if (o2.proxima_acao !== 'reservar_horario') { console.error('FAIL R2 acao'); process.exit(1); }
if (!/^\d{4}-\d{2}-\d{2}T/.test(o2.slot_inicio)) { console.error('FAIL R2 ISO'); process.exit(1); }

// Round 3: aguardando_sinal — pergunta sobre pagamento
const o3 = await call(AguardandoSinalSchema, 'aguardando_sinal',
  'Estado: aguardando_sinal. Cliente esta esperando confirmar pagamento.',
  'consegui pagar?');
console.log('R3 aguardando_sinal:', JSON.stringify(o3));
if (o3.proxima_acao !== 'pergunta') { console.error('FAIL R3'); process.exit(1); }

console.log('\nOK SPIKE — 3 schemas distintos + slot ISO regex funcionam strict mode.');
