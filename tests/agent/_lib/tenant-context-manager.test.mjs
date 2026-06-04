import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTenantContext,
  deriveTenantAssets,
  deriveTenantProduct,
  deriveTenantProfile,
  deriveTenantRules,
  isPropostaSubstate,
  summarizeTenantContext,
} from '../../../functions/api/agent/_lib/tenant-context-manager.js';

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
      modo_atendimento: null,
    },
    tenant_profile: {
      has_agent_name: false,
      has_studio_name: false,
      has_persona: false,
    },
    tenant_assets: {
      portfolio_urls_count: 1,
    },
    tenant_product: {
      schema_version: 'tenant_config_v1',
      service_policy: {
        accepted_services: ['tattoo'],
        rejected_services: [],
        cover_up_policy: 'artist_review',
        minor_policy: 'artist_review',
      },
      style_policy: {
        accepted_styles: [],
        rejected_styles: [],
        focus_styles: [],
        out_of_catalog_behavior: 'allow',
        style_question_policy: 'ask_when_missing',
      },
      pricing_policy: {
        pricing_mode: 'artist_quote_only',
        currency: 'BRL',
        session_pricing_policy: 'artist_decides',
      },
      handoff_policy: {
        triggers: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
        triggers_source: 'default',
      },
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
      modo_atendimento: null,
    },
    tenant_profile: {
      has_agent_name: false,
      has_studio_name: false,
      has_persona: false,
    },
    tenant_assets: {
      portfolio_urls_count: 0,
    },
    tenant_product: {
      schema_version: 'tenant_config_v1',
      service_policy: {
        accepted_services: ['tattoo'],
        rejected_services: [],
        cover_up_policy: 'artist_review',
        minor_policy: 'artist_review',
      },
      style_policy: {
        accepted_styles: [],
        rejected_styles: [],
        focus_styles: [],
        out_of_catalog_behavior: 'allow',
        style_question_policy: 'ask_when_missing',
      },
      pricing_policy: {
        pricing_mode: 'artist_quote_only',
        currency: 'BRL',
        session_pricing_policy: 'artist_decides',
      },
      handoff_policy: {
        triggers: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
        triggers_source: 'default',
      },
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
      modo_atendimento: null,
    },
    tenant_profile: {
      has_agent_name: false,
      has_studio_name: false,
      has_persona: false,
    },
    tenant_assets: {
      portfolio_urls_count: 0,
    },
    tenant_product: {
      schema_version: 'tenant_config_v1',
      service_policy: {
        accepted_services: ['tattoo'],
        rejected_services: [],
        cover_up_policy: 'artist_review',
        minor_policy: 'artist_review',
      },
      style_policy: {
        accepted_styles: [],
        rejected_styles: [],
        focus_styles: [],
        out_of_catalog_behavior: 'allow',
        style_question_policy: 'ask_when_missing',
      },
      pricing_policy: {
        pricing_mode: 'artist_quote_only',
        currency: 'BRL',
        session_pricing_policy: 'artist_decides',
      },
      handoff_policy: {
        triggers: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
        triggers_source: 'default',
      },
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
      modo_atendimento: 'individual',
    },
    tenant_profile: {
      has_agent_name: true,
      has_studio_name: true,
      has_persona: true,
    },
    tenant_assets: {
      portfolio_urls_count: 3,
    },
    tenant_product: {
      schema_version: 'tenant_config_v1',
      service_policy: {
        cover_up_policy: 'rejected',
      },
      style_policy: {
        accepted_styles: [],
        rejected_styles: ['tribal'],
        focus_styles: ['fineline'],
        out_of_catalog_behavior: 'allow',
      },
      pricing_policy: {
        pricing_mode: 'artist_quote_only',
      },
      handoff_policy: {
        triggers: ['retoque', 'mao'],
      },
    },
    horarios_livres: [{ inicio: '2026-05-25T15:00:00Z' }],
    nome_cliente: 'Joao Silva',
  }, 'propondo_valor');

  assert.deepEqual(summary, {
    tenant_context_layer: 'tenant_context_manager',
    tenant_context_rules_snapshot_version: 'v1',
    tenant_context_state: 'propondo_valor',
    tenant_context_portfolio_disponivel: true,
    tenant_context_is_first_contact: true,
    tenant_context_eh_recorrente: false,
    tenant_context_has_proposta_context: true,
    tenant_context_aceita_cobertura: false,
    tenant_context_handoff_triggers_source: 'custom',
    tenant_context_gatilhos_handoff_count: 2,
    tenant_context_has_handoff_triggers: true,
    tenant_context_has_custom_handoff_triggers: true,
    tenant_context_has_style_catalog: true,
    tenant_context_has_accepted_styles: true,
    tenant_context_has_rejected_styles: true,
    tenant_context_estilos_aceitos_count: 1,
    tenant_context_estilos_recusados_count: 1,
    tenant_context_uses_legacy_style_catalog: false,
    tenant_context_modo_atendimento: 'individual',
    tenant_context_has_agent_name: true,
    tenant_context_has_studio_name: true,
    tenant_context_has_persona: true,
    tenant_context_portfolio_urls_count: 3,
    tenant_context_product_schema_version: 'tenant_config_v1',
    tenant_context_product_cover_up_policy: 'rejected',
    tenant_context_product_out_of_catalog_behavior: 'allow',
    tenant_context_product_pricing_mode: 'artist_quote_only',
    tenant_context_product_handoff_triggers_count: 2,
    tenant_context_product_focus_styles_count: 1,
    tenant_context_product_accepted_styles_count: 0,
    tenant_context_product_rejected_styles_count: 1,
  });
  assert.equal(Object.hasOwn(summary, 'nome_cliente'), false);
  assert.equal(Object.hasOwn(summary, 'nome_agente'), false);
  assert.equal(Object.hasOwn(summary, 'nome_estudio'), false);
});

test('TenantContextManager: deriva regras operacionais do tenant com fallback seguro', () => {
  assert.deepEqual(deriveTenantRules({ config_agente: { aceita_cobertura: false }, gatilhos_handoff: ['rosto'] }), {
    aceita_cobertura: false,
    gatilhos_handoff: ['rosto'],
    has_custom_handoff_triggers: true,
    estilos_aceitos: [],
    estilos_recusados: [],
    uses_legacy_style_catalog: false,
    modo_atendimento: null,
  });

  assert.deepEqual(deriveTenantRules({ config_agente: {} }), {
    aceita_cobertura: true,
    gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
    has_custom_handoff_triggers: false,
    estilos_aceitos: [],
    estilos_recusados: [],
    uses_legacy_style_catalog: false,
    modo_atendimento: null,
  });
});

test('TenantContextManager: normaliza catalogo de estilos explicito e legado', () => {
  assert.deepEqual(deriveTenantRules({
    config_agente: {
      estilos_aceitos: ['fineline', ' ', 'blackwork'],
      estilo: ['realismo'],
      estilos_recusados: ['tribal'],
      modo_atendimento: ' individual ',
    },
  }), {
    aceita_cobertura: true,
    gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
    has_custom_handoff_triggers: false,
    estilos_aceitos: ['fineline', 'blackwork'],
    estilos_recusados: ['tribal'],
    uses_legacy_style_catalog: false,
    modo_atendimento: 'individual',
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
    modo_atendimento: null,
  });
});

test('TenantContextManager: resume identidade do tenant sem vazar nomes', () => {
  assert.deepEqual(deriveTenantProfile({
    nome_agente: ' Assistente ',
    nome_estudio: ' InkFlow Studio ',
    config_agente: { persona_livre: 'fala direta' },
  }), {
    has_agent_name: true,
    has_studio_name: true,
    has_persona: true,
  });

  assert.deepEqual(deriveTenantProfile({
    nome_agente: ' ',
    nome_estudio: null,
    config_agente: {},
  }), {
    has_agent_name: false,
    has_studio_name: false,
    has_persona: false,
  });
});

test('TenantContextManager: resume ativos do tenant sem expor URLs', () => {
  assert.deepEqual(deriveTenantAssets({
    portfolio_urls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
  }), {
    portfolio_urls_count: 2,
  });

  assert.deepEqual(deriveTenantAssets({ portfolio_urls: null }), {
    portfolio_urls_count: 0,
  });
});

test('TenantContextManager: deriva TenantConfig canonico a partir dos campos atuais', () => {
  assert.deepEqual(deriveTenantProduct({
    gatilhos_handoff: ['rosto'],
    config_agente: {
      aceita_cobertura: false,
      estilos_aceitos: ['fineline', 'blackwork'],
      estilos_recusados: ['tribal'],
      bloqueia_estilos_fora_catalogo: true,
    },
    config_precificacao: {
      modo: 'exato',
    },
  }), {
    schema_version: 'tenant_config_v1',
    service_policy: {
      accepted_services: ['tattoo'],
      rejected_services: ['cover_up'],
      cover_up_policy: 'rejected',
      minor_policy: 'artist_review',
    },
    style_policy: {
      accepted_styles: ['fineline', 'blackwork'],
      rejected_styles: ['tribal'],
      focus_styles: ['fineline', 'blackwork'],
      out_of_catalog_behavior: 'reject',
      style_question_policy: 'ask_when_missing',
    },
    pricing_policy: {
      pricing_mode: 'auto_estimate',
      currency: 'BRL',
      session_pricing_policy: 'artist_decides',
    },
    handoff_policy: {
      triggers: ['rosto'],
      triggers_source: 'custom',
    },
  });

  assert.deepEqual(deriveTenantProduct({
    config_agente: {
      estilos_aceitos: ['realismo'],
    },
    config_precificacao: {
      pricing_mode: 'hybrid',
    },
  }).style_policy, {
    accepted_styles: [],
    rejected_styles: [],
    focus_styles: ['realismo'],
    out_of_catalog_behavior: 'allow',
    style_question_policy: 'ask_when_missing',
  });
});
