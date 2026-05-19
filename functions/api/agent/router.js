// functions/api/agent/router.js
// Router — dispatch por estado_atual pra escolha de Agent builder
// e calculo do proximo estado.
//
// Sub-3.2: cross-agent pattern. Builder retorna { agent, validator }.
// VALIDATORS/selectAgentValidator REMOVIDOS — validator vem do builder.
//
// Caminho C Fase 1 (2026-05-17): estado='tattoo' migrou pro novo path
// (runTattooAgent + runtime + schema strict). selectAgentBuilder retorna
// null pra 'tattoo' — route.js bifurca antes pelo branch novo. Cadastro
// e Proposta continuam no path antigo via builders abaixo ate Fase 2.
import { buildCadastroAgent } from './agents/cadastro.js';
import { buildPropostaAgent } from './agents/proposta.js';
import { extractHandoffPayload as extractTattooHandoff } from '../../_lib/agent-runtime/contracts/tattoo-handoff.js';
import { extractCadastroHandoff } from '../../_lib/agent-runtime/contracts/cadastro-handoff.js';

const PROPOSTA_SUBSTATES = ['propondo_valor', 'escolhendo_horario', 'aguardando_sinal'];

// Builders do path antigo (@openai/agents). Tattoo NAO esta aqui — route.js
// branch separado chama runTattooAgent direto.
const BUILDERS = {
  cadastro: buildCadastroAgent,
  ...Object.fromEntries(PROPOSTA_SUBSTATES.map(s => [s, buildPropostaAgent])),
};

// Estados implementados (cobre path novo + path antigo). Usado por
// isStateImplemented pra route.js retornar 501 em estados nao suportados.
const IMPLEMENTED_STATES = new Set(['tattoo', 'cadastro', ...PROPOSTA_SUBSTATES]);

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
  return IMPLEMENTED_STATES.has(estado_atual);
}

export function getNextState(estado_atual, out) {
  const map = NEXT_STATE[estado_atual] || {};
  return map[out?.proxima_acao] || estado_atual;
}

// ─── Caminho C Fase 1: contratos cross-agent + validateTransition ──────
// HANDOFF_CONTRACTS mapeia estado origem → { extract(out) } onde extract
// valida o payload contra o contrato tipado e retorna o objeto extraido
// (ou throw se invalido).
//
// Fase 2A: tattoo (Fase 1) + cadastro. Proposta segue na Fase 2B.
const HANDOFF_CONTRACTS = {
  tattoo: { extract: extractTattooHandoff },
  cadastro: { extract: extractCadastroHandoff },
  // proposta: { extract: extractPropostaHandoff }, // Fase 2B (3 substates)
};

export function validateTransition(estado_atual, out) {
  if (!out || out.proxima_acao !== 'handoff') return null;
  const contract = HANDOFF_CONTRACTS[estado_atual];
  if (!contract) return null;
  return contract.extract(out);
}
