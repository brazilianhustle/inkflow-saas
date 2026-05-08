// Contrato do prompt Coleta v2 (rewrite 2026-05-08) — fase CADASTRO.
// Pure structured-output agent (sem tools — paridade Sub-2 tattoo). Garante que o prompt:
// - tem as 4 ancoras v2 (IDENTIDADE, CONTEXTO, OBJETIVO, DECISAO);
// - menciona os 2 OBR + 1 OPC com naming alinhado ao schema (nome, data_nascimento, email);
// - usa estado via structured output (dados_persistidos, proxima_acao);
// - seta email_recusado quando cliente opt-out;
// - NAO menciona tools removidas (dados_coletados, enviar_orcamento_tatuador);
// - NAO menciona tools fantasma legacy (acionar_handoff, calcular_orcamento, etc);
// - NAO menciona tools de agendamento de outras fases.
export const CONTRACT_COLETA_CADASTRO = {
  must_contain: [
    'IDENTIDADE',
    'CONTEXTO',
    'OBJETIVO',
    'DECISAO',
    'nome',
    'data_nascimento',
    'email',
    'dados_persistidos',
    'proxima_acao',
    'email_recusado',
  ],
  must_not_contain: [
    // Ancoras v1 removidas no rewrite v2.
    'CHECKLIST',
    'REGRAS INVIOLAVEIS',
    'FLUXO',
    // Tools removidas (pure structured-output).
    'dados_coletados',
    'enviar_orcamento_tatuador',
    // Tools fantasma legacy (nunca existiram como tool real).
    'acionar_handoff',
    'calcular_orcamento',
    // Tools de agendamento de outras fases.
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
  ],
  max_tokens: 6000,
};
