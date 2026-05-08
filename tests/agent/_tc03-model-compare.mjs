// Fase 1 — TC-03 model comparison.
// Roda APENAS TC-03 ("quero uma rosa pequena") com 2 modelos OpenAI.
// Mesmo prompt, mesmo input. Mede PASS/FAIL + latencia + tool calls + output.
//
// Run: OPENAI_API_KEY=... node tests/agent/_tc03-model-compare.mjs
//
// NAO commitar — artefato de audit, descartavel.
// Custo estimado: ~$0.05 (mini ~$0.002 + 4o ~$0.05).

import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo.js';
import { generatePromptColetaTattoo } from '../../functions/_lib/prompts/coleta/tattoo/generate.js';

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente');
  process.exit(1);
}

const FAKE_TENANT = {
  id: 'tenant-eval',
  nome_estudio: 'Estudio Eval',
  config_agente: { aceita_cobertura: true },
  gatilhos_handoff: [],
  faqs: [],
  fewshots: [],
};

const TC03 = {
  id: 'TC-03',
  descricao: "Cliente vago: 'quero uma rosa pequena' — agent NAO infere tamanho_cm",
  input: {
    telefone: '+5511900000003',
    mensagens: [{ role: 'user', content: 'quero uma rosa pequena' }],
    historico: [],
  },
  expected: {
    proxima_acao: 'pergunta',
    dados_completos: false,
    campos_faltando_inclui: ['tamanho_cm'],
    dados_persistidos_NAO_inclui: ['tamanho_cm'],
    tools_NUNCA_chamadas: ['handoff_to_cadastro'],
  },
};

// Tool unica: handoff_to_cadastro. Persistencia via dados_persistidos no
// structured output (mirror prod — agents/tattoo.js).
function buildAgentForModel({ tenant, conversa, model, toolCallLog }) {
  const instructions = generatePromptColetaTattoo(tenant, conversa, {});

  const handoffNoOp = tool({
    name: 'handoff_to_cadastro',
    description: 'Sinaliza fim da fase tattoo.',
    parameters: z.object({
      dados_completos: z.boolean(),
      campos_conflitantes: z.array(z.string()),
    }),
    execute: async ({ dados_completos, campos_conflitantes }) => {
      toolCallLog.push({ name: 'handoff_to_cadastro', args: { dados_completos, campos_conflitantes } });
      return { ok: true, handoff: true, proximo_estado: 'cadastro' };
    },
  });

  return new Agent({
    name: `tattoo-agent-tc03-${model}`,
    model,
    instructions,
    tools: [handoffNoOp],
    outputType: TattooOutputSchema,
  });
}

async function runOne(model) {
  const toolCallLog = [];
  const conversa = {
    id: `conv-tc03-${model}`,
    telefone: TC03.input.telefone,
    estado_agente: 'coletando_tattoo',
    dados_coletados: {},
    dados_cadastro: {},
  };
  const agent = buildAgentForModel({ tenant: FAKE_TENANT, conversa, model, toolCallLog });
  const messages = [...TC03.input.historico, ...TC03.input.mensagens];

  const t0 = Date.now();
  let result, error, finalOutput;
  try {
    result = await run(agent, messages, { maxTurns: 20 });
    finalOutput = result.finalOutput;
  } catch (e) {
    error = e?.message || String(e);
  }
  const latencyMs = Date.now() - t0;

  const failures = [];
  if (error) {
    failures.push(`run-error: ${error}`);
  } else {
    const out = finalOutput;
    const exp = TC03.expected;
    if (out.proxima_acao !== exp.proxima_acao) {
      failures.push(`proxima_acao esperado=${exp.proxima_acao} got=${out.proxima_acao}`);
    }
    if (out.dados_completos !== exp.dados_completos) {
      failures.push(`dados_completos esperado=${exp.dados_completos} got=${out.dados_completos}`);
    }
    for (const c of exp.campos_faltando_inclui) {
      if (!out.campos_faltando.includes(c)) {
        failures.push(`campos_faltando NAO inclui ${c} (got ${JSON.stringify(out.campos_faltando)})`);
      }
    }
    for (const c of exp.dados_persistidos_NAO_inclui) {
      // F2 fix: schema (.nullable().optional()) sempre emite a chave com null —
      // checar valor != null em vez de presenca da chave.
      if ((out.dados_persistidos || {})[c] != null) {
        failures.push(`dados_persistidos inclui ${c} com valor (proibido) — got ${JSON.stringify(out.dados_persistidos)}`);
      }
    }
    const calledNames = toolCallLog.map((t) => t.name);
    for (const forbidden of exp.tools_NUNCA_chamadas) {
      if (calledNames.includes(forbidden)) {
        failures.push(`tool proibida ${forbidden} foi chamada — calls=${JSON.stringify(calledNames)}`);
      }
    }
  }

  return {
    model,
    latencyMs,
    pass: failures.length === 0 && !error,
    failures,
    error,
    toolCallLog,
    finalOutput,
  };
}

(async () => {
  const models = ['gpt-4o-mini', 'gpt-4o'];
  const results = [];
  for (const m of models) {
    process.stdout.write(`\n=== ${m} ===\n`);
    const r = await runOne(m);
    results.push(r);
    console.log(JSON.stringify({
      model: r.model,
      pass: r.pass,
      latencyMs: r.latencyMs,
      failures: r.failures,
      error: r.error,
      toolCallCount: r.toolCallLog.length,
      tools: r.toolCallLog.map((t) => ({ name: t.name, args: t.args })),
      output: r.finalOutput,
    }, null, 2));
  }

  console.log('\n=== SUMARIO ===');
  for (const r of results) {
    console.log(`${r.model}: ${r.pass ? 'PASS' : 'FAIL'} (${r.latencyMs}ms, ${r.toolCallLog.length} tool calls${r.error ? `, error=${r.error}` : ''})`);
  }
})();
