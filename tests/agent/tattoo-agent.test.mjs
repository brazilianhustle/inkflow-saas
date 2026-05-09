// Unit tests pro TattooAgent — valida config (tools, schema, prompt) sem chamar OpenAI.
// Eval suite REAL (chamando gpt-4o-mini) esta em tests/agent/tattoo-agent.eval.mjs
// e nao roda em CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTattooAgent, TattooOutputSchema, validateTattooOutputInvariant } from '../../functions/api/agent/agents/tattoo.js';

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

test('buildTattooAgent retorna { agent, validator } (closure pattern Sub-3.2)', () => {
  const result = buildTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test', INKFLOW_TOOL_SECRET: 'tool-sec' },
    tenant: FAKE_TENANT,
    conversa: FAKE_CONVERSA,
    clientContext: {},
  });
  assert.ok(result && typeof result === 'object', 'deve retornar objeto');
  assert.ok('agent' in result, 'deve ter agent');
  assert.ok('validator' in result, 'deve ter validator');
  assert.equal(typeof result.validator, 'function');
  // v2: tools removidas (audit Fase 9). Estado/dados via structured output.
  assert.deepEqual(result.agent.tools, []);
});

test('buildTattooAgent usa modelo gpt-4o-mini', () => {
  const { agent } = buildTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test', INKFLOW_TOOL_SECRET: 'tool-sec' },
    tenant: FAKE_TENANT,
    conversa: FAKE_CONVERSA,
    clientContext: {},
  });
  assert.equal(agent.model, 'gpt-4o-mini');
});

test('buildTattooAgent prompt inclui invariante handoff (R7)', () => {
  const { agent } = buildTattooAgent({
    env: { OPENAI_API_KEY: 'sk-test', INKFLOW_TOOL_SECRET: 'tool-sec' },
    tenant: FAKE_TENANT,
    conversa: FAKE_CONVERSA,
    clientContext: {},
  });
  // v2: handoff sai via proxima_acao no output (sem tool). R7 declara invariante.
  assert.match(agent.instructions, /proxima_acao='handoff'/);
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

// Invariante handoff agora vive em validateTattooOutputInvariant (pos-parse)
// porque .refine() vira ZodEffects e SDK @openai/agents nao aceita como outputType.
// Schema cru aceita o shape; route.js valida invariante depois.
test('validateTattooOutputInvariant rejeita handoff com dados_completos=false', () => {
  const invalid = {
    resposta_cliente: 'opa',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: ['tamanho_cm'],
    campos_conflitantes: [],
    proxima_acao: 'handoff',
  };
  // Schema cru aceita (sem refine):
  assert.equal(TattooOutputSchema.safeParse(invalid).success, true);
  // Mas validator pos-parse rejeita:
  const r = validateTattooOutputInvariant(invalid);
  assert.equal(r.valid, false);
  assert.match(r.reason, /dados_completos=false/);
});

test('validateTattooOutputInvariant rejeita handoff com campos_conflitantes nao-vazio', () => {
  const invalid = {
    resposta_cliente: 'opa',
    dados_persistidos: { estilo: 'fineline', tamanho_cm: 8, local_corpo: 'antebraco' },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: ['tamanho_cm'],
    proxima_acao: 'handoff',
  };
  assert.equal(TattooOutputSchema.safeParse(invalid).success, true);
  const r = validateTattooOutputInvariant(invalid);
  assert.equal(r.valid, false);
  assert.match(r.reason, /campos_conflitantes/);
});

test('validateTattooOutputInvariant aceita handoff valido + pergunta', () => {
  const validHandoff = {
    resposta_cliente: 'fechado',
    dados_persistidos: { estilo: 'fineline' },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'handoff',
  };
  const validPergunta = {
    resposta_cliente: 'qual tamanho?',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: ['tamanho_cm'],
    campos_conflitantes: ['estilo'],  // pergunta com conflitos OK (so handoff exige zerados)
    proxima_acao: 'pergunta',
  };
  assert.equal(validateTattooOutputInvariant(validHandoff).valid, true);
  assert.equal(validateTattooOutputInvariant(validPergunta).valid, true);
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

// — Sub-3.3: invariant enviar_portfolio —————————————————————————————
test('Tattoo invariant: enviar_portfolio com portfolio_disponivel=true -> valid', () => {
  const out = {
    resposta_cliente: 'show, te mando',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: 'fineline', max: null, motivo: null },
  };
  const r = validateTattooOutputInvariant(out, { portfolio_disponivel: true });
  assert.equal(r.valid, true);
});

test('Tattoo invariant: enviar_portfolio com portfolio_disponivel=false -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: { estilo: null, max: null, motivo: null },
  };
  const r = validateTattooOutputInvariant(out, { portfolio_disponivel: false });
  assert.equal(r.valid, false);
  assert.match(r.reason, /portfolio_disponivel=false/);
});

test('Tattoo invariant: enviar_portfolio sem payload_portfolio -> invalid', () => {
  const out = {
    resposta_cliente: 'te mando',
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    proxima_acao: 'enviar_portfolio',
    payload_portfolio: null,
  };
  const r = validateTattooOutputInvariant(out, { portfolio_disponivel: true });
  assert.equal(r.valid, false);
  assert.match(r.reason, /payload_portfolio/);
});

test('Tattoo invariant: pergunta com payload_portfolio null -> valid (passthrough)', () => {
  const out = {
    resposta_cliente: 'qual tamanho?',
    dados_persistidos: { descricao_curta: 'rosa' },
    dados_completos: false,
    campos_faltando: ['tamanho_cm', 'local_corpo'],
    campos_conflitantes: [],
    proxima_acao: 'pergunta',
    payload_portfolio: null,
  };
  const r = validateTattooOutputInvariant(out, { portfolio_disponivel: false });
  assert.equal(r.valid, true);
});
