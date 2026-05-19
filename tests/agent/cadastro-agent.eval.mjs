// Eval suite CadastroAgent — 9 cenarios contra gpt-4o-mini real.
// NAO roda em CI (filename *.eval.mjs fora do glob *.test.mjs).
//
// Run: OPENAI_API_KEY=sk-... node --test tests/agent/cadastro-agent.eval.mjs
// Custo estimado: ~$0.025 por suite completa.
//
// Pure structured-output agent (sem tools) — eval LLM call e REAL contra OpenAI.
// maxTurns 10 (vs 20 do Tattoo — sem tools, mini termina em 1-2 turns).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Agent, run } from '@openai/agents';
import { LegacyCadastroOutputSchema as CadastroOutputSchema } from '../../functions/api/agent/agents/cadastro.js';
import { generatePromptColetaCadastro } from '../../functions/_lib/prompts/coleta/cadastro/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-cadastro.json');
const { scenarios } = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));

if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY ausente — eval suite nao pode rodar');
  process.exit(1);
}

const FAKE_TENANT = {
  id: 'tenant-eval-cadastro',
  nome_estudio: 'Estudio Eval',
  nome_agente: 'Atendente',
  config_agente: {},
  faqs: [],
  fewshots_por_modo: {},
};

function buildAgentForEval({ tenant, conversa, clientContext }) {
  const instructions = generatePromptColetaCadastro(tenant, conversa, clientContext || {});
  return new Agent({
    name: 'cadastro-agent-eval',
    model: 'gpt-4o-mini',
    instructions,
    tools: [],
    outputType: CadastroOutputSchema,
  });
}

// Normaliza historico no shape que @openai/agents espera (paridade route.js).
// Assistant items requerem content como array tipado + status.
function normalizeHistoryItem(h) {
  const role = h?.role || 'user';
  const content = h?.content ?? '';
  if (role === 'assistant') {
    return {
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: String(content) }],
    };
  }
  return { role: 'user', content: String(content) };
}

for (const scenario of scenarios) {
  test(`${scenario.id} — ${scenario.descricao}`, async () => {
    const conversa = {
      id: `conv-${scenario.id}`,
      telefone: scenario.input.telefone,
      estado_agente: 'cadastro',
      dados_coletados: scenario.input.dados_acumulados || {},
      dados_cadastro: scenario.input.dados_cadastro || {},
    };
    const agent = buildAgentForEval({
      tenant: FAKE_TENANT,
      conversa,
      clientContext: {},
    });

    const messages = [
      ...(scenario.input.historico || []).map(normalizeHistoryItem),
      ...scenario.input.mensagens,
    ];

    const result = await run(agent, messages, { maxTurns: 10 });
    const out = result.finalOutput;

    const parsed = CadastroOutputSchema.safeParse(out);
    assert.equal(parsed.success, true, `${scenario.id}: schema invalido — ${parsed.error?.issues?.[0]?.message || ''}`);

    if (scenario.expected.proxima_acao !== undefined) {
      assert.equal(out.proxima_acao, scenario.expected.proxima_acao,
        `${scenario.id}: proxima_acao esperado=${scenario.expected.proxima_acao} got=${out.proxima_acao}`);
    }

    if (scenario.expected.dados_completos !== undefined) {
      assert.equal(out.dados_completos, scenario.expected.dados_completos,
        `${scenario.id}: dados_completos esperado=${scenario.expected.dados_completos} got=${out.dados_completos}`);
    }

    if (scenario.expected.email_recusado !== undefined) {
      assert.equal(out.email_recusado, scenario.expected.email_recusado,
        `${scenario.id}: email_recusado esperado=${scenario.expected.email_recusado} got=${out.email_recusado}`);
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
        const v = (out.dados_persistidos || {})[c];
        // mini emite string "null"/"undefined" as vezes em vez de JSON null —
        // tratar essas como ausentes (semantica esperada).
        const absent = v == null || v === '' || v === 'null' || v === 'undefined';
        assert.ok(absent,
          `${scenario.id}: esperava dados_persistidos NAO inclui '${c}' (com valor) — got=${JSON.stringify(out.dados_persistidos)}`);
      }
    }

    if (Array.isArray(scenario.expected.dados_persistidos_inclui)) {
      for (const c of scenario.expected.dados_persistidos_inclui) {
        const v = (out.dados_persistidos || {})[c];
        const filled = v !== null && v !== undefined && v !== ''
          && (Array.isArray(v) ? v.length > 0 : true);
        assert.ok(filled,
          `${scenario.id}: esperava dados_persistidos.${c} preenchido — got=${JSON.stringify(v)}`);
      }
    }

    if (scenario.expected.data_nascimento_iso_match === true) {
      const dn = out.dados_persistidos?.data_nascimento;
      assert.match(String(dn || ''), /^\d{4}-\d{2}-\d{2}$/,
        `${scenario.id}: esperava data_nascimento ISO YYYY-MM-DD — got=${dn}`);
    }
  });
}
