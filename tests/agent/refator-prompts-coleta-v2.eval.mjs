// Eval suite REFATOR PROMPTS COLETA v2 — Manifesto P1-P6 + OBS-3/OBS-7.
// NAO roda em CI (filename *.eval.mjs fora do glob *.test.mjs).
//
// Run: OPENAI_API_KEY=sk-... node --test tests/agent/refator-prompts-coleta-v2.eval.mjs
//
// Custo estimado: ~$0.15-0.25 por suite completa (17 cenarios).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Agent, run } from '@openai/agents';
import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo.js';
import { LegacyCadastroOutputSchema as CadastroOutputSchema } from '../../functions/api/agent/agents/cadastro.js';
import { generatePromptColetaTattoo } from '../../functions/_lib/prompts/coleta/tattoo/generate.js';
import { generatePromptColetaCadastro } from '../../functions/_lib/prompts/coleta/cadastro/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '_fixtures', 'scenarios-refator-v2.json');
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

function buildAgent(scenario) {
  const agentType = scenario.agent || 'tattoo';
  const tenant = { ...FAKE_TENANT, ...(scenario.tenant_extra || {}) };
  const conversa = {
    id: 'conversa-eval',
    telefone: '+5511999999999',
    estado_agente: agentType === 'cadastro' ? 'coletando_cadastro' : 'coletando_tattoo',
    dados_coletados: scenario.context_dados || {},
    dados_cadastro: agentType === 'cadastro' ? (scenario.context_dados || {}) : {},
  };
  if (agentType === 'cadastro') {
    return new Agent({
      name: 'cadastro-eval',
      model: 'gpt-4o-mini',
      instructions: generatePromptColetaCadastro(tenant, conversa, {}),
      tools: [],
      outputType: CadastroOutputSchema,
    });
  }
  return new Agent({
    name: 'tattoo-eval',
    model: 'gpt-4o-mini',
    instructions: generatePromptColetaTattoo(tenant, conversa, {}),
    tools: [],
    outputType: TattooOutputSchema,
  });
}

function lastUserMessageOrEmpty(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return messages[i].content;
  }
  return '';
}

function checkExpect(scenario, output) {
  const expect = scenario.expect || {};
  const errors = [];
  if (expect.proxima_acao && output.proxima_acao !== expect.proxima_acao) {
    errors.push(`proxima_acao=${output.proxima_acao}, esperado ${expect.proxima_acao}`);
  }
  if (expect.proxima_acao_in && !expect.proxima_acao_in.includes(output.proxima_acao)) {
    errors.push(`proxima_acao=${output.proxima_acao}, esperado um de [${expect.proxima_acao_in.join(',')}]`);
  }
  if (expect.resposta_must_match) {
    for (const pattern of expect.resposta_must_match) {
      if (!new RegExp(pattern, 'i').test(output.resposta_cliente || '')) {
        errors.push(`resposta NAO contem padrao "${pattern}". Resposta: ${output.resposta_cliente}`);
      }
    }
  }
  if (expect.resposta_must_not_match) {
    for (const pattern of expect.resposta_must_not_match) {
      if (new RegExp(pattern, 'i').test(output.resposta_cliente || '')) {
        errors.push(`resposta CONTEM padrao proibido "${pattern}". Resposta: ${output.resposta_cliente}`);
      }
    }
  }
  if (expect.campos_faltando_inclui) {
    const cf = output.campos_faltando || [];
    for (const expected of expect.campos_faltando_inclui) {
      if (!cf.includes(expected)) {
        errors.push(`campos_faltando NAO contem "${expected}". Atual: [${cf.join(',')}]`);
      }
    }
  }
  if (expect.campos_conflitantes_inclui) {
    const cc = output.campos_conflitantes || [];
    for (const expected of expect.campos_conflitantes_inclui) {
      if (!cc.includes(expected)) {
        errors.push(`campos_conflitantes NAO contem "${expected}". Atual: [${cc.join(',')}]`);
      }
    }
  }
  if (expect['dados_persistidos.altura_cm_in']) {
    const altura = output.dados_persistidos?.altura_cm;
    const expectedVals = expect['dados_persistidos.altura_cm_in'];
    if (!expectedVals.includes(altura)) {
      errors.push(`altura_cm=${altura}, esperado um de [${expectedVals.join(',')}]`);
    }
  }
  if (expect['dados_persistidos.foto_local_in']) {
    const foto = output.dados_persistidos?.foto_local;
    const expectedVals = expect['dados_persistidos.foto_local_in'];
    if (!expectedVals.includes(foto)) {
      errors.push(`foto_local=${foto}, esperado null ou ""`);
    }
  }
  if (expect['dados_persistidos.data_nascimento']) {
    const data = output.dados_persistidos?.data_nascimento;
    if (data !== expect['dados_persistidos.data_nascimento']) {
      errors.push(`data_nascimento=${data}, esperado ${expect['dados_persistidos.data_nascimento']}`);
    }
  }
  if (expect.campos_faltando_inclui_subset_of) {
    const cf = output.campos_faltando || [];
    const allowed = expect.campos_faltando_inclui_subset_of;
    for (const campo of cf) {
      if (!allowed.includes(campo)) {
        errors.push(`campos_faltando tem "${campo}" fora do subset permitido [${allowed.join(',')}]`);
      }
    }
  }
  if (expect.resposta_contains_double_newline && !(output.resposta_cliente || '').includes('\n\n')) {
    errors.push('resposta_cliente NAO contem \\n\\n (esperado multi-balao)');
  }
  return errors;
}

for (const scenario of scenarios) {
  test(`${scenario.id} [${scenario.principio}]`, async () => {
    const agent = buildAgent(scenario);
    const userMsg = lastUserMessageOrEmpty(scenario.messages);
    const result = await run(agent, userMsg);
    const output = result.finalOutput;
    const errors = checkExpect(scenario, output);
    if (errors.length > 0) {
      assert.fail(`Falhas no cenario ${scenario.id}:\n  - ${errors.join('\n  - ')}\n\nOutput completo: ${JSON.stringify(output, null, 2)}`);
    }
  });
}
