// Eval suite TattooAgent — 10 cenarios contra gpt-4o-mini real.
// Migrado Fase 2B: path novo (runtime.run + schema strict), sem @openai/agents.
//
// Run: OPENAI_API_KEY=$(grep ^OPENAI_API_KEY .dev.vars | cut -d= -f2) \
//      node --test tests/agent/tattoo-agent.eval.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runTattooAgent } from '../../functions/api/agent/agents/tattoo.js';
import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo-schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios.json');
const { scenarios } = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente — eval suite nao pode rodar');
  process.exit(1);
}

const FAKE_TENANT = {
  id: 'tenant-eval', nome_estudio: 'Estudio Eval',
  config_agente: { aceita_cobertura: true },
  gatilhos_handoff: [], faqs: [], fewshots: [],
};

for (const scenario of scenarios) {
  test(`${scenario.id} — ${scenario.descricao}`, async () => {
    const conversa = {
      id: `conv-${scenario.id}`,
      telefone: scenario.input.telefone,
      estado_agente: 'coletando_tattoo',
      dados_coletados: scenario.input.dados_acumulados || {},
      dados_cadastro: {},
    };
    // Normaliza historico: scenarios.json usa shape { role, content } direto.
    const historico = scenario.input.historico || [];
    // mensagens array antigo (multi-turn) — concatenar pra single user message
    // ou rodar cada mensagem como turn separado. Manter shape antigo (1 msg final).
    const mensagensArr = scenario.input.mensagens || [];
    const mensagem = mensagensArr[mensagensArr.length - 1]?.content || '';

    const out = await runTattooAgent({
      env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY },
      tenant: FAKE_TENANT,
      conversa,
      clientContext: {},
      mensagem,
      historico: [...historico, ...mensagensArr.slice(0, -1)],
    });

    const parsed = TattooOutputSchema.safeParse(out);
    assert.equal(parsed.success, true, `${scenario.id}: schema invalido — ${parsed.error?.issues?.[0]?.message || ''}`);

    if (scenario.expected.proxima_acao !== undefined) {
      assert.equal(out.proxima_acao, scenario.expected.proxima_acao,
        `${scenario.id}: proxima_acao esperado=${scenario.expected.proxima_acao} got=${out.proxima_acao}`);
    }
    if (scenario.expected.dados_completos !== undefined) {
      assert.equal(out.dados_completos, scenario.expected.dados_completos,
        `${scenario.id}: dados_completos esperado=${scenario.expected.dados_completos} got=${out.dados_completos}`);
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
          `${scenario.id}: esperava campos_conflitantes inclui '${c}'`);
      }
    }
    if (Array.isArray(scenario.expected.dados_persistidos_NAO_inclui)) {
      for (const c of scenario.expected.dados_persistidos_NAO_inclui) {
        assert.ok((out.dados_persistidos || {})[c] == null,
          `${scenario.id}: esperava dados_persistidos NAO inclui '${c}'`);
      }
    }
    if (Array.isArray(scenario.expected.dados_persistidos_inclui)) {
      for (const c of scenario.expected.dados_persistidos_inclui) {
        const v = (out.dados_persistidos || {})[c];
        const filled = v !== null && v !== undefined && v !== '';
        assert.ok(filled, `${scenario.id}: esperava ${c} preenchido — got=${JSON.stringify(v)}`);
      }
    }
    if (scenario.expected.dados_persistidos_valores) {
      for (const [k, v] of Object.entries(scenario.expected.dados_persistidos_valores)) {
        assert.equal((out.dados_persistidos || {})[k], v,
          `${scenario.id}: ${k} esperado=${v} got=${JSON.stringify((out.dados_persistidos || {})[k])}`);
      }
    }
  });
}
