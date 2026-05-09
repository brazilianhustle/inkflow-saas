// functions/api/agent/router.js
// Router — dispatch por estado_atual pra escolha de Agent builder
// e calculo do proximo estado.
//
// Sub-3.2: cross-agent pattern. Builder retorna { agent, validator }.
// VALIDATORS/selectAgentValidator REMOVIDOS — validator vem do builder.
import { buildTattooAgent } from './agents/tattoo.js';
import { buildCadastroAgent } from './agents/cadastro.js';
import { buildPropostaAgent } from './agents/proposta.js';

const PROPOSTA_SUBSTATES = ['propondo_valor', 'escolhendo_horario', 'aguardando_sinal'];

const BUILDERS = {
  tattoo: buildTattooAgent,
  cadastro: buildCadastroAgent,
  ...Object.fromEntries(PROPOSTA_SUBSTATES.map(s => [s, buildPropostaAgent])),
};

const NEXT_STATE = {
  tattoo:   { handoff: 'cadastro',            erro: 'tattoo',              enviar_portfolio: 'tattoo' },
  cadastro: { handoff: 'aguardando_tatuador', erro: 'aguardando_tatuador', enviar_portfolio: 'cadastro' },
  propondo_valor: {
    pergunta:           'propondo_valor',
    oferecendo_horario: 'escolhendo_horario',
    pediu_desconto:     'aguardando_decisao_desconto',
    adiou:              'lead_frio',
    reagendamento:      'aguardando_tatuador',
    cliente_agressivo:  'aguardando_tatuador',
    enviar_portfolio:   'propondo_valor',
  },
  escolhendo_horario: {
    pergunta:          'escolhendo_horario',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
    enviar_portfolio:  'escolhendo_horario',
  },
  aguardando_sinal: {
    pergunta:          'aguardando_sinal',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
    enviar_portfolio:  'aguardando_sinal',
  },
};

export function selectAgentBuilder(estado_atual) {
  return BUILDERS[estado_atual] || null;
}

export function isStateImplemented(estado_atual) {
  return Boolean(BUILDERS[estado_atual]);
}

export function getNextState(estado_atual, out) {
  const map = NEXT_STATE[estado_atual] || {};
  return map[out?.proxima_acao] || estado_atual;
}
