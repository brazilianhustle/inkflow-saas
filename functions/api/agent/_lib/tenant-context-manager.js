// functions/api/agent/_lib/tenant-context-manager.js
// Camada pequena de contexto por tenant antes dos agents operacionais.
//
// Responsabilidade: montar o clientContext efetivo do turno com regras do
// estudio e contexto transversal, sem espalhar prefetches dentro do route.js.

import { prefetchPortfolio } from './prefetch-portfolio.js';
import { prefetchPropostaContext } from './prefetch-proposta.js';

const PROPOSTA_SUBSTATES = new Set(['propondo_valor', 'escolhendo_horario', 'aguardando_sinal']);
const DEFAULT_HANDOFF_TRIGGERS = ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'];

function normalizeList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(value => String(value || '').trim())
    .filter(Boolean);
}

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

export function isPropostaSubstate(estado) {
  return PROPOSTA_SUBSTATES.has(estado);
}

export function summarizeTenantContext(context = {}, estado_atual = '') {
  const hasHorariosLivres = Array.isArray(context.horarios_livres);
  const hasSlotsReservados = Array.isArray(context.slots_reservados);
  const tenantRules = context.tenant_rules || {};
  const tenantProfile = context.tenant_profile || {};
  const tenantAssets = context.tenant_assets || {};
  const tenantProduct = context.tenant_product || {};
  const servicePolicy = tenantProduct.service_policy || {};
  const stylePolicy = tenantProduct.style_policy || {};
  const pricingPolicy = tenantProduct.pricing_policy || {};
  const handoffPolicy = tenantProduct.handoff_policy || {};
  const gatilhosHandoff = Array.isArray(tenantRules.gatilhos_handoff) ? tenantRules.gatilhos_handoff : [];
  const estilosAceitos = Array.isArray(tenantRules.estilos_aceitos) ? tenantRules.estilos_aceitos : [];
  const estilosRecusados = Array.isArray(tenantRules.estilos_recusados) ? tenantRules.estilos_recusados : [];
  const productFocusStyles = Array.isArray(stylePolicy.focus_styles) ? stylePolicy.focus_styles : [];
  const productAcceptedStyles = Array.isArray(stylePolicy.accepted_styles) ? stylePolicy.accepted_styles : [];
  const productRejectedStyles = Array.isArray(stylePolicy.rejected_styles) ? stylePolicy.rejected_styles : [];
  const productHandoffTriggers = Array.isArray(handoffPolicy.triggers) ? handoffPolicy.triggers : [];
  const hasStyleCatalog = estilosAceitos.length > 0 || estilosRecusados.length > 0;
  return {
    tenant_context_layer: 'tenant_context_manager',
    tenant_context_rules_snapshot_version: 'v1',
    tenant_context_state: estado_atual || null,
    tenant_context_portfolio_disponivel: context.portfolio_disponivel === true,
    tenant_context_is_first_contact: context.is_first_contact === true,
    tenant_context_eh_recorrente: context.eh_recorrente === true,
    tenant_context_has_proposta_context: hasHorariosLivres || hasSlotsReservados || Boolean(context.proposta_status),
    tenant_context_aceita_cobertura: tenantRules.aceita_cobertura === true,
    tenant_context_handoff_triggers_source: tenantRules.has_custom_handoff_triggers === true ? 'custom' : 'default',
    tenant_context_gatilhos_handoff_count: gatilhosHandoff.length,
    tenant_context_has_handoff_triggers: gatilhosHandoff.length > 0,
    tenant_context_has_custom_handoff_triggers: tenantRules.has_custom_handoff_triggers === true,
    tenant_context_has_style_catalog: hasStyleCatalog,
    tenant_context_has_accepted_styles: estilosAceitos.length > 0,
    tenant_context_has_rejected_styles: estilosRecusados.length > 0,
    tenant_context_estilos_aceitos_count: estilosAceitos.length,
    tenant_context_estilos_recusados_count: estilosRecusados.length,
    tenant_context_uses_legacy_style_catalog: tenantRules.uses_legacy_style_catalog === true,
    tenant_context_modo_atendimento: tenantRules.modo_atendimento || null,
    tenant_context_has_agent_name: tenantProfile.has_agent_name === true,
    tenant_context_has_studio_name: tenantProfile.has_studio_name === true,
    tenant_context_has_persona: tenantProfile.has_persona === true,
    tenant_context_portfolio_urls_count: Number.isFinite(tenantAssets.portfolio_urls_count)
      ? tenantAssets.portfolio_urls_count
      : 0,
    tenant_context_product_schema_version: tenantProduct.schema_version || null,
    tenant_context_product_cover_up_policy: servicePolicy.cover_up_policy || null,
    tenant_context_product_out_of_catalog_behavior: stylePolicy.out_of_catalog_behavior || null,
    tenant_context_product_pricing_mode: pricingPolicy.pricing_mode || null,
    tenant_context_product_handoff_triggers_count: productHandoffTriggers.length,
    tenant_context_product_focus_styles_count: productFocusStyles.length,
    tenant_context_product_accepted_styles_count: productAcceptedStyles.length,
    tenant_context_product_rejected_styles_count: productRejectedStyles.length,
  };
}

export function deriveTenantRules(tenant = {}) {
  const customTriggers = Array.isArray(tenant.gatilhos_handoff) && tenant.gatilhos_handoff.length > 0;
  const explicitAcceptedStyles = normalizeList(tenant.config_agente?.estilos_aceitos);
  const legacyAcceptedStyles = explicitAcceptedStyles.length ? [] : normalizeList(tenant.config_agente?.estilo);
  return {
    aceita_cobertura: tenant.config_agente?.aceita_cobertura !== false,
    gatilhos_handoff: customTriggers ? tenant.gatilhos_handoff : DEFAULT_HANDOFF_TRIGGERS,
    has_custom_handoff_triggers: customTriggers,
    estilos_aceitos: explicitAcceptedStyles.length ? explicitAcceptedStyles : legacyAcceptedStyles,
    estilos_recusados: normalizeList(tenant.config_agente?.estilos_recusados),
    uses_legacy_style_catalog: explicitAcceptedStyles.length === 0 && legacyAcceptedStyles.length > 0,
    ...(tenant.config_agente?.bloqueia_estilos_fora_catalogo === true
      ? { bloqueia_estilos_fora_catalogo: true }
      : {}),
    modo_atendimento: normalizeText(tenant.config_agente?.modo_atendimento),
  };
}

export function deriveTenantProfile(tenant = {}) {
  return {
    has_agent_name: Boolean(normalizeText(tenant.nome_agente)),
    has_studio_name: Boolean(normalizeText(tenant.nome_estudio)),
    has_persona: Boolean(normalizeText(tenant.config_agente?.persona_livre)),
  };
}

export function deriveTenantAssets(tenant = {}) {
  return {
    portfolio_urls_count: Array.isArray(tenant.portfolio_urls) ? tenant.portfolio_urls.length : 0,
  };
}

export function deriveTenantProduct(tenant = {}) {
  const cfg = tenant.config_agente || {};
  const pricing = tenant.config_precificacao || {};
  const explicitAcceptedStyles = normalizeList(cfg.estilos_aceitos);
  const legacyAcceptedStyles = explicitAcceptedStyles.length ? [] : normalizeList(cfg.estilo);
  const focusStyles = explicitAcceptedStyles.length ? explicitAcceptedStyles : legacyAcceptedStyles;
  const rejectedStyles = normalizeList(cfg.estilos_recusados);
  const hardCatalog = cfg.bloqueia_estilos_fora_catalogo === true;
  const coverUpPolicy = cfg.aceita_cobertura === false ? 'rejected' : 'artist_review';
  const pricingMode = normalizeText(pricing.pricing_mode)
    || (normalizeText(pricing.modo) === 'exato' ? 'auto_estimate' : 'artist_quote_only');
  const customTriggers = Array.isArray(tenant.gatilhos_handoff) && tenant.gatilhos_handoff.length > 0;

  return {
    schema_version: 'tenant_config_v1',
    service_policy: {
      accepted_services: ['tattoo'],
      rejected_services: cfg.aceita_cobertura === false ? ['cover_up'] : [],
      cover_up_policy: coverUpPolicy,
      minor_policy: 'artist_review',
    },
    style_policy: {
      accepted_styles: hardCatalog ? focusStyles : [],
      rejected_styles: rejectedStyles,
      focus_styles: focusStyles,
      out_of_catalog_behavior: hardCatalog ? 'reject' : 'allow',
      style_question_policy: 'ask_when_missing',
    },
    pricing_policy: {
      pricing_mode: pricingMode,
      currency: 'BRL',
      session_pricing_policy: 'artist_decides',
    },
    handoff_policy: {
      triggers: customTriggers ? normalizeList(tenant.gatilhos_handoff) : DEFAULT_HANDOFF_TRIGGERS,
      triggers_source: customTriggers ? 'custom' : 'default',
    },
  };
}

export async function buildTenantContext({
  env,
  tenant,
  conversa,
  telefone,
  estado_atual,
  clientContext,
  deps = {},
}) {
  const prefetchPortfolioFn = deps.prefetchPortfolio || prefetchPortfolio;
  const prefetchPropostaContextFn = deps.prefetchPropostaContext || prefetchPropostaContext;

  let context = { ...(clientContext || {}) };
  context.tenant_rules = deriveTenantRules(tenant);
  context.tenant_profile = deriveTenantProfile(tenant);
  context.tenant_assets = deriveTenantAssets(tenant);
  context.tenant_product = deriveTenantProduct(tenant);

  const portfolioCtx = await prefetchPortfolioFn(env, tenant);
  context = { ...context, ...portfolioCtx };

  if (isPropostaSubstate(estado_atual)) {
    const propostaCtx = await prefetchPropostaContextFn({
      env,
      tenant,
      conversa,
      telefone,
      estado_atual,
    });
    context = { ...context, ...propostaCtx };
  }

  return context;
}
