// functions/api/agent/router.js
// Router — dispatch por estado_atual pra calculo do proximo estado e
// validacao de invariantes context-dependent via contracts cross-agent.
//
// Caminho C Fase 1: tattoo migrou pro path novo (runTattooAgent).
// Caminho C Fase 2A: cadastro migrou.
// Caminho C Fase 2B: proposta (3 substates) migrou. BUILDERS/selectAgentBuilder
// removidos — nao ha mais nenhum agent no path antigo (@openai/agents).
//
// validateAction(estado_atual, out, ctx) generaliza validateTransition (Fase 1):
//   - tattoo handoff   -> extractTattooHandoff(out)
//   - cadastro handoff -> extractCadastroHandoff(out)
//   - propondo_valor / escolhendo_horario / aguardando_sinal -> extractPropostaAction(out, ctx)
//   - outras           -> null (sem invariante context-dependent)
import { extractHandoffPayload as extractTattooHandoff } from '../../_lib/agent-runtime/contracts/tattoo-handoff.js';
import { extractCadastroHandoff } from '../../_lib/agent-runtime/contracts/cadastro-handoff.js';
import { extractPropostaAction } from '../../_lib/agent-runtime/contracts/proposta-actions.js';

const PROPOSTA_SUBSTATES = ['propondo_valor', 'escolhendo_horario', 'aguardando_sinal'];

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
    erro:               'propondo_valor',
  },
  escolhendo_horario: {
    pergunta:          'escolhendo_horario',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
    enviar_portfolio:  'escolhendo_horario',
    erro:              'escolhendo_horario',
  },
  aguardando_sinal: {
    pergunta:          'aguardando_sinal',
    reservar_horario:  'aguardando_sinal',
    reagendamento:     'aguardando_tatuador',
    cliente_agressivo: 'aguardando_tatuador',
    enviar_portfolio:  'aguardando_sinal',
    erro:              'aguardando_sinal',
  },
};

export function isStateImplemented(estado_atual) {
  return IMPLEMENTED_STATES.has(estado_atual);
}

export function getNextState(estado_atual, out) {
  const map = NEXT_STATE[estado_atual] || {};
  return map[out?.proxima_acao] || estado_atual;
}

// ─── Contracts cross-agent ─────────────────────────────────────────────
const ACTION_CONTRACTS = {
  tattoo:             (out, _ctx) => (out?.proxima_acao === 'handoff' ? extractTattooHandoff(out) : null),
  cadastro:           (out, _ctx) => (out?.proxima_acao === 'handoff' ? extractCadastroHandoff(out) : null),
  propondo_valor:     (out, ctx)  => extractPropostaAction(out, ctx),
  escolhendo_horario: (out, ctx)  => extractPropostaAction(out, ctx),
  aguardando_sinal:   (out, ctx)  => extractPropostaAction(out, ctx),
};

export function validateAction(estado_atual, out, ctx) {
  if (!out) return null;
  const extract = ACTION_CONTRACTS[estado_atual];
  if (!extract) return null;
  return extract(out, ctx || {});
}
