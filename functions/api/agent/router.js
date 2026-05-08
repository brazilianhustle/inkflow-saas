// Router — dispatch por estado_atual pra escolha de Agent builder.
// Sub-1: so 'tattoo' resolvido. Outros retornam null (route.js converte em HTTP 501).
import { buildTattooAgent } from './agents/tattoo.js';

const BUILDERS = {
  tattoo: buildTattooAgent,
  // Sub-2: cadastro, proposta, portfolio
};

export function selectAgentBuilder(estado_atual) {
  return BUILDERS[estado_atual] || null;
}

export function isStateImplemented(estado_atual) {
  return Boolean(BUILDERS[estado_atual]);
}
