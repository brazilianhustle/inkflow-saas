// functions/api/agent/_lib/tenant-context-manager.js
// Camada pequena de contexto por tenant antes dos agents operacionais.
//
// Responsabilidade: montar o clientContext efetivo do turno com regras do
// estudio e contexto transversal, sem espalhar prefetches dentro do route.js.

import { prefetchPortfolio } from './prefetch-portfolio.js';
import { prefetchPropostaContext } from './prefetch-proposta.js';

const PROPOSTA_SUBSTATES = new Set(['propondo_valor', 'escolhendo_horario', 'aguardando_sinal']);

export function isPropostaSubstate(estado) {
  return PROPOSTA_SUBSTATES.has(estado);
}

export function summarizeTenantContext(context = {}, estado_atual = '') {
  const hasHorariosLivres = Array.isArray(context.horarios_livres);
  const hasSlotsReservados = Array.isArray(context.slots_reservados);
  return {
    tenant_context_layer: 'tenant_context_manager',
    tenant_context_state: estado_atual || null,
    tenant_context_portfolio_disponivel: context.portfolio_disponivel === true,
    tenant_context_is_first_contact: context.is_first_contact === true,
    tenant_context_eh_recorrente: context.eh_recorrente === true,
    tenant_context_has_proposta_context: hasHorariosLivres || hasSlotsReservados || Boolean(context.proposta_status),
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
