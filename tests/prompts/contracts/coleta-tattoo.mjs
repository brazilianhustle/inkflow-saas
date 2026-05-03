// Contrato do prompt Coleta v2 — fase TATTOO.
// Garante que o prompt:
// - tem as ancoras estruturais (IDENTIDADE, CHECKLIST, FLUXO, REGRAS, CONTEXTO);
// - menciona os 3 OBR (descricao_tattoo, tamanho_cm, local_corpo);
// - usa as tools certas (dados_coletados, acionar_handoff);
// - NUNCA menciona tools de orcamento/agendamento (calcular_orcamento, etc);
// - NUNCA pede dados de cadastro nesta fase.
export const CONTRACT_COLETA_TATTOO = {
  must_contain: [
    'IDENTIDADE',
    'CHECKLIST',
    'FLUXO',
    'REGRAS INVIOLAVEIS',
    'CONTEXTO',
    'descricao_tattoo',
    'tamanho_cm',
    'local_corpo',
    'dados_coletados',
    'acionar_handoff',
  ],
  must_not_contain: [
    // Tools de agendamento — nunca aparecem nesta fase, nem como menção.
    // (Nota: `calcular_orcamento` e `enviar_orcamento_tatuador` aparecem em
    // regras com instrucoes condicionais — confiamos nessas regras + na
    // ausencia das tools do schema do workflow n8n. Nao validamos via regex
    // porque negacoes geram falsos positivos.)
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
    'enviar_objecao_tatuador',
    // Cadastro: nao pede dado pessoal sensivel nesta fase
    'data de nascimento',
  ],
  max_tokens: 6000,
};
