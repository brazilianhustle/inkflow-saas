// Contrato do prompt Exato. No PR 1 é idêntico ao Faixa (prompts idênticos).
// PR 2 vai diferenciar.

export const contratoExato = {
  modo: 'exato',
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
    '{{',
    '}}',
    'TODO',
    'FIXME',
  ],
  max_tokens: 8000,
};
