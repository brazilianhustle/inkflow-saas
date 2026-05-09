// functions/api/agent/router.js
// Router — dispatch por estado_atual pra escolha de Agent builder/validator
// e calculo do proximo estado.
//
// Sub-1: tattoo. Sub-3.1: + cadastro. Sub-3.2/3.3: proposta + portfolio.
//
// NEXT_STATE encapsula transicao (estado_atual, proxima_acao) -> estado_novo:
// - tattoo+handoff   -> cadastro             (continua coleta)
// - tattoo+erro      -> tattoo (stay)        (cliente em estado bloqueado; Sub-4 cutover decide)
// - cadastro+handoff -> aguardando_tatuador  (handoff legitimo)
// - cadastro+erro    -> aguardando_tatuador  (3 triggers: recusa_persistente, data_invalida, menor_idade — todos saem)
// - * + pergunta     -> stay
import { buildTattooAgent, validateTattooOutputInvariant } from './agents/tattoo.js';
import { buildCadastroAgent, validateCadastroOutputInvariant } from './agents/cadastro.js';

const BUILDERS = {
  tattoo: buildTattooAgent,
  cadastro: buildCadastroAgent,
  // Sub-3.2: proposta
  // Sub-3.3: portfolio
};

const VALIDATORS = {
  tattoo: validateTattooOutputInvariant,
  cadastro: validateCadastroOutputInvariant,
};

const NEXT_STATE = {
  tattoo:   { handoff: 'cadastro',            erro: 'tattoo' },
  cadastro: { handoff: 'aguardando_tatuador', erro: 'aguardando_tatuador' },
};

export function selectAgentBuilder(estado_atual) {
  return BUILDERS[estado_atual] || null;
}

export function selectAgentValidator(estado_atual) {
  return VALIDATORS[estado_atual] || null;
}

export function isStateImplemented(estado_atual) {
  return Boolean(BUILDERS[estado_atual]);
}

export function getNextState(estado_atual, out) {
  const map = NEXT_STATE[estado_atual] || {};
  return map[out?.proxima_acao] || estado_atual;
}
