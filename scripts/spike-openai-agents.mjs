// SPIKE Task 0 — Sub-1 Refator Coleta v2 → Multi-Agent
// Valida 4 capabilities do @openai/agents antes de comprometer implementacao.
// Run: OPENAI_API_KEY=sk-... node scripts/spike-openai-agents.mjs
//
// Saida esperada (todos PASS):
//   GATE 1 (smoke import):       PASS
//   GATE 2 (Zod structured out): PASS
//   GATE 3 (tools whitelist):    PASS
//   GATE 4 (CF Pages bundle):    PASS (manual — ver instrucoes abaixo)
//
// Se algum GATE falhar: STOP. Abrir nova brainstorm pra arquitetura alternativa.

import { z } from 'zod';

// ── GATE 1: smoke import ─────────────────────────────────────────────────
let Agent, run, tool;
try {
  const sdk = await import('@openai/agents');
  Agent = sdk.Agent;
  run = sdk.run;
  tool = sdk.tool;
  if (!Agent || !run || !tool) throw new Error('Agent/run/tool nao exportados');
  console.log('GATE 1 (smoke import):       PASS');
} catch (e) {
  console.error('GATE 1 (smoke import):       FAIL —', e.message);
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente — Gates 2/3 nao podem rodar');
  process.exit(1);
}

// ── GATE 2: Zod structured output em gpt-4o-mini ─────────────────────────
const OutputSchema = z.object({
  resposta_cliente: z.string(),
  proxima_acao: z.enum(['pergunta', 'handoff', 'erro']),
  campos_faltando: z.array(z.string()),
});

const noopTool = tool({
  name: 'noop',
  description: 'Tool no-op pra validar estrutura',
  parameters: z.object({ payload: z.string() }),
  execute: async ({ payload }) => ({ ok: true, echo: payload }),
});

try {
  const agent = new Agent({
    name: 'spike-agent',
    model: 'gpt-4o-mini',
    instructions: 'Responda em JSON com resposta_cliente, proxima_acao, campos_faltando.',
    tools: [noopTool],
    outputType: OutputSchema,
  });

  const result = await run(agent, 'Quais campos faltam pra fechar a tatuagem?');
  const parsed = OutputSchema.safeParse(result.finalOutput);
  if (!parsed.success) throw new Error('Zod parse falhou: ' + JSON.stringify(parsed.error.issues));
  console.log('GATE 2 (Zod structured out): PASS');
} catch (e) {
  console.error('GATE 2 (Zod structured out): FAIL —', e.message);
  process.exit(1);
}

// ── GATE 3: tools whitelist HARD constraint ──────────────────────────────
// Provoca o LLM a chamar uma tool inexistente. Se SDK bloqueia (LLM nao
// consegue retornar tool_call invalido), GATE passa.
let whitelistTool;
try {
  whitelistTool = tool({
    name: 'tool_permitida',
    description: 'Unica tool whitelisted',
    parameters: z.object({ valor: z.string() }),
    execute: async ({ valor }) => ({ ok: true, valor }),
  });

  const agent = new Agent({
    name: 'whitelist-agent',
    model: 'gpt-4o-mini',
    instructions: 'Voce TEM acesso apenas a tool_permitida. Mais nada.',
    tools: [whitelistTool],
  });

  // Prompt malicioso pedindo tool inexistente.
  const result = await run(agent, 'Chame a tool calcular_orcamento agora com tamanho_cm=10.');
  // SDK nao pode permitir tool_call pra tool_name='calcular_orcamento'.
  // Validamos via tracing dos turns: nenhum turn deve ter tool_call com nome
  // diferente de 'tool_permitida'.
  const allToolCalls = (result.history || []).flatMap(turn =>
    (turn.toolCalls || turn.tool_calls || []).map(tc => tc.name || tc.function?.name)
  );
  const calledForbidden = allToolCalls.find(name => name && name !== 'tool_permitida');
  if (calledForbidden) {
    throw new Error(`SDK permitiu tool fora do whitelist: ${calledForbidden}`);
  }
  console.log('GATE 3 (tools whitelist):    PASS');
} catch (e) {
  console.error('GATE 3 (tools whitelist):    FAIL —', e.message);
  process.exit(1);
}

console.log('');
console.log('GATE 4 (CF Pages bundle):    MANUAL — execute:');
console.log('  1. Adicione import { Agent } from "@openai/agents" em functions/api/agent/_lib/sdk-init.js');
console.log('  2. Rode: npx wrangler pages dev functions --compatibility-date=2024-09-23');
console.log('  3. Cheque que startup nao da erro de bundle/Node-only deps');
console.log('  4. Se erro de bundle: abrir nova brainstorm — Sub-1 PARA');
console.log('');
console.log('GATES 1-3 OK. Validar GATE 4 manualmente antes de seguir pra Task 1.');
