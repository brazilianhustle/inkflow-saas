// Eval suite TattooAgent — 9 cenarios contra gpt-4o-mini real.
// NAO roda em CI (filename *.eval.mjs fora do glob *.test.mjs).
//
// Run: OPENAI_API_KEY=sk-... node --test tests/agent/tattoo-agent.eval.mjs
//
// Custo estimado: ~$0.020 por suite completa.
//
// Tools whitelist sao SUBSTITUIDAS por wrappers no-op que registram args
// (sem tocar Supabase). LLM call e REAL contra OpenAI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo.js';
import { generatePromptColetaTattoo } from '../../functions/_lib/prompts/coleta/tattoo/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios.json');
const { scenarios } = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente — eval suite nao pode rodar');
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

const REFORCO_HANDOFF = `

# §HANDOFF — INVARIANTE CRITICO
JAMAIS chame \`handoff_to_cadastro\` quando \`dados_completos=false\` ou quando houver \`campos_conflitantes\` nao-vazio. O schema validara e rejeitara — voce voltara a perguntar. Resolva conflitos primeiro (R9: devolva contradicao ao cliente, NUNCA decida por ele).`;

// Builder pro eval — usa tools NO-OP em vez dos HTTP proxies.
function buildAgentForEval({ tenant, conversa, clientContext, toolCallLog }) {
  const promptBase = generatePromptColetaTattoo(tenant, conversa, clientContext || {});
  const instructions = promptBase + REFORCO_HANDOFF;

  const dadosColetadosNoOp = tool({
    name: 'dados_coletados',
    description: 'Persiste 1 campo coletado da tattoo.',
    parameters: z.object({
      campo: z.enum(['descricao_tattoo', 'tamanho_cm', 'local_corpo', 'estilo', 'foto_local', 'refs_imagens']),
      valor: z.union([z.string(), z.number(), z.array(z.string())]),
    }),
    execute: async ({ campo, valor }) => {
      toolCallLog.push({ name: 'dados_coletados', args: { campo, valor } });
      return { ok: true, campo, valor };
    },
  });

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
    name: 'tattoo-agent-eval',
    model: 'gpt-4o-mini',
    instructions,
    tools: [dadosColetadosNoOp, handoffNoOp],
    outputType: TattooOutputSchema,
  });
}

for (const scenario of scenarios) {
  test(`${scenario.id} — ${scenario.descricao}`, async () => {
    const toolCallLog = [];
    const conversa = {
      id: `conv-${scenario.id}`,
      telefone: scenario.input.telefone,
      estado_agente: 'coletando_tattoo',
      dados_coletados: scenario.input.dados_acumulados || {},
      dados_cadastro: {},
    };
    const agent = buildAgentForEval({
      tenant: FAKE_TENANT,
      conversa,
      clientContext: {},
      toolCallLog,
    });

    const messages = [
      ...(scenario.input.historico || []),
      ...scenario.input.mensagens,
    ];

    // maxTurns 20 (default 10 aperta TC-02 com 3 turns + multi-tool calls).
    const result = await run(agent, messages, { maxTurns: 20 });
    const out = result.finalOutput;

    // Validacao schema (TC-07 e implicito em todos)
    const parsed = TattooOutputSchema.safeParse(out);
    assert.equal(parsed.success, true, `${scenario.id}: schema invalido — ${parsed.error?.issues?.[0]?.message || ''}`);

    if (scenario.expected.schema_valido !== undefined) {
      // ja validado acima
    }

    if (scenario.expected.proxima_acao !== undefined) {
      assert.equal(out.proxima_acao, scenario.expected.proxima_acao,
        `${scenario.id}: proxima_acao esperado=${scenario.expected.proxima_acao} got=${out.proxima_acao}`);
    }

    if (scenario.expected.dados_completos !== undefined) {
      assert.equal(out.dados_completos, scenario.expected.dados_completos,
        `${scenario.id}: dados_completos esperado=${scenario.expected.dados_completos} got=${out.dados_completos}`);
    }

    const calledNames = toolCallLog.map(tc => tc.name);

    if (Array.isArray(scenario.expected.tools_chamadas)) {
      for (const expected of scenario.expected.tools_chamadas) {
        assert.ok(calledNames.includes(expected),
          `${scenario.id}: esperava tool '${expected}' chamada — calls=${JSON.stringify(calledNames)}`);
      }
    }

    if (Array.isArray(scenario.expected.tools_NUNCA_chamadas)) {
      for (const forbidden of scenario.expected.tools_NUNCA_chamadas) {
        assert.ok(!calledNames.includes(forbidden),
          `${scenario.id}: tool proibida '${forbidden}' foi chamada — calls=${JSON.stringify(calledNames)}`);
      }
    }

    if (Array.isArray(scenario.expected.campos_faltando_inclui)) {
      for (const c of scenario.expected.campos_faltando_inclui) {
        assert.ok(out.campos_faltando.includes(c),
          `${scenario.id}: esperava campos_faltando inclui '${c}' — got=${JSON.stringify(out.campos_faltando)}`);
      }
    }

    if (Array.isArray(scenario.expected.campos_conflitantes_inclui)) {
      for (const c of scenario.expected.campos_conflitantes_inclui) {
        assert.ok(out.campos_conflitantes.includes(c),
          `${scenario.id}: esperava campos_conflitantes inclui '${c}' — got=${JSON.stringify(out.campos_conflitantes)}`);
      }
    }

    if (Array.isArray(scenario.expected.dados_persistidos_NAO_inclui)) {
      for (const c of scenario.expected.dados_persistidos_NAO_inclui) {
        assert.ok(!(c in out.dados_persistidos),
          `${scenario.id}: esperava dados_persistidos NAO inclui '${c}' — got=${JSON.stringify(out.dados_persistidos)}`);
      }
    }
  });
}
