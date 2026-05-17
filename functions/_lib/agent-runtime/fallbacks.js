// functions/_lib/agent-runtime/fallbacks.js
// Fallback last-resort quando todos os retries falham (network down, 401, etc).
// Cliente recebe mensagem amigavel; route.js loga erro detalhado em telemetria.
//
// Spec Caminho C Fase 1 secao 5.

export const FALLBACK_MESSAGE = 'Recebi tua mensagem — me da um segundinho que ja respondo direito.';

export function buildFallbackOutput(_agentName) {
  // Shape minimo compativel com qualquer branch 'pergunta' dos agents.
  // route.js trata como turno normal: cliente ve mensagem, estado nao muda.
  return {
    proxima_acao: 'pergunta',
    resposta_cliente: FALLBACK_MESSAGE,
    dados_persistidos: {},
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    payload_portfolio: null,
  };
}
