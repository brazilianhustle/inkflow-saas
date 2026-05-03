// Contrato Exato — beta secundario (v2). Comportamento linear como antes:
// agente coleta, calcula via calcular_orcamento, agenda. Faixa foi removida
// (a unica diferenca v1 era valor_tipo na resposta da tool).
export const CONTRACT_EXATO = {
  must_contain: [
    'calcular_orcamento',
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
    'acionar_handoff',
    'IDENTIDADE',
    'CHECKLIST',
    'REGRAS INVIOLAVEIS',
    'FLUXO',
    'CONTEXTO',
  ],
  must_not_contain: [
    // Coleta v2 markers (Exato nao deve conter)
    'enviar_orcamento_tatuador',
    'enviar_objecao_tatuador',
    'valor_proposto',
    'contraproposta',
    'contra-oferta',
  ],
  max_tokens: 6000,
};
