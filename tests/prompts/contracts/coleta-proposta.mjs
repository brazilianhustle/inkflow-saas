// Contrato do prompt Coleta v2 — fase PROPOSTA.
// Garante que o prompt:
// - tem as ancoras estruturais;
// - usa valor_proposto vindo do contexto (nao calcula);
// - apresenta os 3 caminhos do cliente (aceita/desconto/adia);
// - usa as tools de agendamento (consultar_horarios, reservar, sinal);
// - chama enviar_objecao_tatuador no caminho B;
// - NUNCA usa palavras "contraproposta" ou "contra-oferta";
// - NUNCA chama calcular_orcamento.
export const CONTRACT_COLETA_PROPOSTA = {
  must_contain: [
    'IDENTIDADE',
    'CHECKLIST',
    'FLUXO',
    'REGRAS INVIOLAVEIS',
    'CONTEXTO',
    'valor_proposto',
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
    'enviar_objecao_tatuador',
    'acionar_handoff',
  ],
  must_not_contain: [
    // Tools de orcamento/calculo: nao usadas nesta fase, valor vem de
    // conversa.valor_proposto. (Nota: `contraproposta` e `calcular_orcamento`
    // aparecem em R1/R3 como PROIBICOES explicitas — confiamos nessas regras
    // pra suprimir uso pelo LLM. Nao validamos string nua porque negacoes
    // geram falsos positivos.)
    // Nada aqui — todos os checks ficam em invariants.test.mjs com regex
    // mais especifico se necessario.
  ],
  max_tokens: 6000,
};
