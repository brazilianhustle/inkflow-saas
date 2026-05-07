// Unit tests pro TattooAgent — valida config (tools, schema, prompt) sem chamar OpenAI.
// Eval suite REAL (chamando gpt-4o-mini) esta em tests/agent/tattoo-agent.eval.mjs
// e nao roda em CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTattooAgent, TattooOutputSchema } from '../../functions/api/agent/agents/tattoo.js';

const FAKE_TENANT = {
  id: 'tenant-x',
  nome_estudio: 'Estudio Teste',
  config_agente: { aceita_cobertura: true },
  gatilhos_handoff: [],
  faqs: [],
  fewshots: [],
};

const FAKE_CONVERSA = {
  id: 'conversa-x',
  telefone: '+5511999999999',
  estado_agente: 'coletando_tattoo',
  dados_coletados: {},
  dados_cadastro: {},
};

test('buildTattooAgent retorna Agent com 2 tools whitelist', () => {
  const agent = buildTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test', INKFLOW_TOOL_SECRET: 'tool-sec' },
    tenant: FAKE_TENANT,
    conversa: FAKE_CONVERSA,
    clientContext: {},
  });
  const toolNames = agent.tools.map(t => t.name).sort();
  assert.deepEqual(toolNames, ['dados_coletados', 'handoff_to_cadastro']);
});

test('buildTattooAgent usa modelo gpt-4o-mini', () => {
  const agent = buildTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test', INKFLOW_TOOL_SECRET: 'tool-sec' },
    tenant: FAKE_TENANT,
    conversa: FAKE_CONVERSA,
    clientContext: {},
  });
  assert.equal(agent.model, 'gpt-4o-mini');
});

test('buildTattooAgent prompt inclui reforco handoff invariante', () => {
  const agent = buildTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test', INKFLOW_TOOL_SECRET: 'tool-sec' },
    tenant: FAKE_TENANT,
    conversa: FAKE_CONVERSA,
    clientContext: {},
  });
  assert.match(agent.instructions, /handoff_to_cadastro/);
  assert.match(agent.instructions, /dados_completos/);
});

test('TattooOutputSchema aceita output valido (handoff)', () => {
  const valid = {
    resposta_cliente: 'beleza, ja anotei tudo',
    dados_persistidos: { estilo: 'fineline', tamanho_cm: 8, local_corpo: 'antebraco' },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'handoff',
  };
  const parsed = TattooOutputSchema.safeParse(valid);
  assert.equal(parsed.success, true);
});

test('TattooOutputSchema rejeita handoff com dados_completos=false (invariante)', () => {
  const invalid = {
    resposta_cliente: 'opa',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: ['tamanho_cm'],
    campos_conflitantes: [],
    proxima_acao: 'handoff',
  };
  const parsed = TattooOutputSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
});

test('TattooOutputSchema rejeita handoff com campos_conflitantes nao-vazio', () => {
  const invalid = {
    resposta_cliente: 'opa',
    dados_persistidos: { estilo: 'fineline', tamanho_cm: 8, local_corpo: 'antebraco' },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: ['tamanho_cm'],
    proxima_acao: 'handoff',
  };
  const parsed = TattooOutputSchema.safeParse(invalid);
  assert.equal(parsed.success, false);
});

test('TattooOutputSchema aceita pergunta com campos_faltando', () => {
  const valid = {
    resposta_cliente: 'qual o tamanho?',
    dados_persistidos: { estilo: 'fineline' },
    dados_completos: false,
    campos_faltando: ['tamanho_cm', 'local_corpo'],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
  };
  const parsed = TattooOutputSchema.safeParse(valid);
  assert.equal(parsed.success, true);
});

test('TattooOutputSchema rejeita tamanho_cm <=0 ou >200 (paridade com server)', () => {
  const negativo = {
    resposta_cliente: 'oi',
    dados_persistidos: { tamanho_cm: -5 },
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
  };
  const muito_grande = { ...negativo, dados_persistidos: { tamanho_cm: 250 } };
  assert.equal(TattooOutputSchema.safeParse(negativo).success, false);
  assert.equal(TattooOutputSchema.safeParse(muito_grande).success, false);
});
