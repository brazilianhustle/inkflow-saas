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
  const gatilhosHandoff = Array.isArray(tenantRules.gatilhos_handoff) ? tenantRules.gatilhos_handoff : [];
  const estilosAceitos = Array.isArray(tenantRules.estilos_aceitos) ? tenantRules.estilos_aceitos : [];
  const estilosRecusados = Array.isArray(tenantRules.estilos_recusados) ? tenantRules.estilos_recusados : [];
  return {
    tenant_context_layer: 'tenant_context_manager',
    tenant_context_state: estado_atual || null,
    tenant_context_portfolio_disponivel: context.portfolio_disponivel === true,
    tenant_context_is_first_contact: context.is_first_contact === true,
    tenant_context_eh_recorrente: context.eh_recorrente === true,
    tenant_context_has_proposta_context: hasHorariosLivres || hasSlotsReservados || Boolean(context.proposta_status),
    tenant_context_aceita_cobertura: tenantRules.aceita_cobertura === true,
    tenant_context_gatilhos_handoff_count: gatilhosHandoff.length,
    tenant_context_has_custom_handoff_triggers: tenantRules.has_custom_handoff_triggers === true,
    tenant_context_estilos_aceitos_count: estilosAceitos.length,
    tenant_context_estilos_recusados_count: estilosRecusados.length,
    tenant_context_uses_legacy_style_catalog: tenantRules.uses_legacy_style_catalog === true,
    tenant_context_modo_atendimento: tenantRules.modo_atendimento || null,
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
    modo_atendimento: normalizeText(tenant.config_agente?.modo_atendimento),
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
