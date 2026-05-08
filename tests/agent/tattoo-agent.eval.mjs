// Eval suite TattooAgent — 10 cenarios contra gpt-4o-mini real.
// NAO roda em CI (filename *.eval.mjs fora do glob *.test.mjs).
//
// Run: OPENAI_API_KEY=sk-... node --test tests/agent/tattoo-agent.eval.mjs
//
// Custo estimado: ~$0.020 por suite completa.
//
// Pure structured-output agent (sem tools) — eval LLM call e REAL contra OpenAI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Agent, run } from '@openai/agents';
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

// Builder pro eval — pure structured-output (sem tools), mirror prod.
function buildAgentForEval({ tenant, conversa, clientContext }) {
  const instructions = generatePromptColetaTattoo(tenant, conversa, clientContext || {});

  return new Agent({
    name: 'tattoo-agent-eval',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: TattooOutputSchema,
  });
}

for (const scenario of scenarios) {
  test(`${scenario.id} — ${scenario.descricao}`, async () => {
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

    // tools_chamadas / tools_NUNCA_chamadas: agent e pure structured-output
    // (sem tools), entao essas assertions ja viraram dead code. Mantemos pra
    // backward-compat caso scenarios futuros voltem a usar tools.

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
        // F2 fix: schema (.nullable().optional()) sempre emite a chave com null.
        // Checar valor != null em vez de presenca da chave.
        assert.ok((out.dados_persistidos || {})[c] == null,
          `${scenario.id}: esperava dados_persistidos NAO inclui '${c}' (com valor) — got=${JSON.stringify(out.dados_persistidos)}`);
      }
    }

    if (Array.isArray(scenario.expected.dados_persistidos_inclui)) {
      // Apos remocao da tool dados_coletados, persistencia e via structured
      // output. Esse assertion substituiu a antiga tools_chamadas:["dados_coletados"].
      for (const c of scenario.expected.dados_persistidos_inclui) {
        const v = (out.dados_persistidos || {})[c];
        const filled = v !== null && v !== undefined && v !== ''
          && (Array.isArray(v) ? v.length > 0 : true);
        assert.ok(filled,
          `${scenario.id}: esperava dados_persistidos.${c} preenchido — got=${JSON.stringify(v)}`);
      }
    }
  });
}
