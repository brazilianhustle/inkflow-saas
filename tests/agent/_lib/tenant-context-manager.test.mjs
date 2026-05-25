import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTenantContext, deriveTenantRules, isPropostaSubstate, summarizeTenantContext } from '../../../functions/api/agent/_lib/tenant-context-manager.js';

test('TenantContextManager: identifica substates de proposta', () => {
  assert.equal(isPropostaSubstate('propondo_valor'), true);
  assert.equal(isPropostaSubstate('escolhendo_horario'), true);
  assert.equal(isPropostaSubstate('aguardando_sinal'), true);
  assert.equal(isPropostaSubstate('tattoo'), false);
  assert.equal(isPropostaSubstate('cadastro'), false);
});

test('TenantContextManager: injeta portfolio sem mutar clientContext original', async () => {
  const clientContext = { is_first_contact: true };

  const ctx = await buildTenantContext({
    env: {},
    tenant: { portfolio_urls: ['https://example.com/a.jpg'] },
    estado_atual: 'tattoo',
    clientContext,
  });

  assert.deepEqual(clientContext, { is_first_contact: true });
  assert.deepEqual(ctx, {
    is_first_contact: true,
    tenant_rules: {
      aceita_cobertura: true,
      gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
      has_custom_handoff_triggers: false,
      estilos_aceitos: [],
      estilos_recusados: [],
      uses_legacy_style_catalog: false,
    },
    portfolio_disponivel: true,
  });
});

test('TenantContextManager: contexto derivado sobrescreve flags transversais antigas', async () => {
  const ctx = await buildTenantContext({
    env: {},
    tenant: { portfolio_urls: [] },
    estado_atual: 'cadastro',
    clientContext: { portfolio_disponivel: true, eh_recorrente: true },
  });

  assert.deepEqual(ctx, {
    tenant_rules: {
      aceita_cobertura: true,
      gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
      has_custom_handoff_triggers: false,
      estilos_aceitos: [],
      estilos_recusados: [],
      uses_legacy_style_catalog: false,
    },
    portfolio_disponivel: false,
    eh_recorrente: true,
  });
});

test('TenantContextManager: injeta contexto de proposta somente em substate de proposta', async () => {
  const calls = [];
  const deps = {
    prefetchPortfolio: async () => ({ portfolio_disponivel: true }),
    prefetchPropostaContext: async (args) => {
      calls.push(args);
      return { horarios_livres: [{ inicio: '2026-05-25T15:00:00Z' }] };
    },
  };

  const ctx = await buildTenantContext({
    env: { CRON_SECRET: 'x' },
    tenant: { id: 'tenant-1' },
    conversa: { id: 'conv-1' },
    telefone: '5521999999999',
    estado_atual: 'propondo_valor',
    clientContext: { nome_cliente: 'Joao' },
    deps,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].estado_atual, 'propondo_valor');
  assert.deepEqual(ctx, {
    nome_cliente: 'Joao',
    tenant_rules: {
      aceita_cobertura: true,
      gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
      has_custom_handoff_triggers: false,
      estilos_aceitos: [],
      estilos_recusados: [],
      uses_legacy_style_catalog: false,
    },
    portfolio_disponivel: true,
    horarios_livres: [{ inicio: '2026-05-25T15:00:00Z' }],
  });

  await buildTenantContext({
    env: {},
    tenant: { id: 'tenant-1' },
    estado_atual: 'tattoo',
    deps,
  });
  assert.equal(calls.length, 1);
});

test('TenantContextManager: resume contexto para telemetria sem vazar dados sensiveis', () => {
  const summary = summarizeTenantContext({
    portfolio_disponivel: true,
    is_first_contact: true,
    eh_recorrente: false,
    tenant_rules: {
      aceita_cobertura: false,
      gatilhos_handoff: ['retoque', 'mao'],
      has_custom_handoff_triggers: true,
      estilos_aceitos: ['fineline'],
      estilos_recusados: ['tribal'],
      uses_legacy_style_catalog: false,
    },
    horarios_livres: [{ inicio: '2026-05-25T15:00:00Z' }],
    nome_cliente: 'Joao Silva',
  }, 'propondo_valor');

  assert.deepEqual(summary, {
    tenant_context_layer: 'tenant_context_manager',
    tenant_context_state: 'propondo_valor',
    tenant_context_portfolio_disponivel: true,
    tenant_context_is_first_contact: true,
    tenant_context_eh_recorrente: false,
    tenant_context_has_proposta_context: true,
    tenant_context_aceita_cobertura: false,
    tenant_context_gatilhos_handoff_count: 2,
    tenant_context_has_custom_handoff_triggers: true,
    tenant_context_estilos_aceitos_count: 1,
    tenant_context_estilos_recusados_count: 1,
    tenant_context_uses_legacy_style_catalog: false,
  });
  assert.equal(Object.hasOwn(summary, 'nome_cliente'), false);
});

test('TenantContextManager: deriva regras operacionais do tenant com fallback seguro', () => {
  assert.deepEqual(deriveTenantRules({ config_agente: { aceita_cobertura: false }, gatilhos_handoff: ['rosto'] }), {
    aceita_cobertura: false,
    gatilhos_handoff: ['rosto'],
    has_custom_handoff_triggers: true,
    estilos_aceitos: [],
    estilos_recusados: [],
    uses_legacy_style_catalog: false,
  });

  assert.deepEqual(deriveTenantRules({ config_agente: {} }), {
    aceita_cobertura: true,
    gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
    has_custom_handoff_triggers: false,
    estilos_aceitos: [],
    estilos_recusados: [],
    uses_legacy_style_catalog: false,
  });
});

test('TenantContextManager: normaliza catalogo de estilos explicito e legado', () => {
  assert.deepEqual(deriveTenantRules({
    config_agente: {
      estilos_aceitos: ['fineline', ' ', 'blackwork'],
      estilo: ['realismo'],
      estilos_recusados: ['tribal'],
    },
  }), {
    aceita_cobertura: true,
    gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
    has_custom_handoff_triggers: false,
    estilos_aceitos: ['fineline', 'blackwork'],
    estilos_recusados: ['tribal'],
    uses_legacy_style_catalog: false,
  });

  assert.deepEqual(deriveTenantRules({
    config_agente: {
      estilo: ['fineline', 'blackwork'],
    },
  }), {
    aceita_cobertura: true,
    gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
    has_custom_handoff_triggers: false,
    estilos_aceitos: ['fineline', 'blackwork'],
    estilos_recusados: [],
    uses_legacy_style_catalog: true,
  });
});
