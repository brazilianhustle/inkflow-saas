// Contrato do prompt Faixa. Consumido por contracts.test.mjs.

export const contratoFaixa = {
  modo: 'faixa',
  must_contain: [
    '§0 CHECKLIST',
    '§1 IDENTIDADE',
    '§2 TOM',
    '§3 FLUXO',
    '§4 REGRAS',
    '§5 CONTEXTO',
    '§7 EXEMPLOS',
    'calcular_orcamento',
    'acionar_handoff',
    'consultar_horarios_livres',
    'gerar_link_sinal',
    'reservar_horario',
  ],
  must_not_contain: [
    // Metainstruções que não devem vazar pro LLM
    '{{',
    '}}',
    'TODO',
    'FIXME',
    // No PR 1 ainda não há tokens Coleta-specific a banir; esse array
    // cresce no PR 2 quando faixa realmente se diferencia de coleta.
  ],
  max_tokens: 8000,  // aproximação: 1 token ≈ 4 chars em pt-br. 8000 tokens ≈ 32k chars.
};
