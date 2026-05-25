// Contrato do prompt Coleta v2 (rewrite 2026-05-08) — fase CADASTRO.
// Pure structured-output agent (sem tools — paridade Sub-2 tattoo). Garante que o prompt:
// - tem as 4 ancoras v2 (IDENTIDADE, CONTEXTO, OBJETIVO, DECISAO);
// - menciona os 2 OBR + 1 OPC com naming alinhado ao schema (nome, data_nascimento, email);
// - usa estado via structured output (dados_persistidos, proxima_acao);
// - seta email_recusado quando cliente opt-out;
// - menciona enviar_orcamento_tatuador no §4.6 (OBS-3: comunicar proximo passo pos-handoff);
// - NAO menciona tools removidas (dados_coletados);
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
    'enviar_orcamento_tatuador',
    'O tatuador vai avaliar com calma',
  ],
  must_not_contain: [
    // Ancoras v1 removidas no rewrite v2.
    'CHECKLIST',
    'REGRAS INVIOLAVEIS',
    'FLUXO',
    // Tools removidas (pure structured-output — exceto enviar_orcamento_tatuador que aparece em §4.6).
    'dados_coletados',
    // Tools fantasma legacy (nunca existiram como tool real).
    'acionar_handoff',
    'calcular_orcamento',
    // Tools de agendamento de outras fases.
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
    // Tom de formulario rejeitado no smoke 2026-05-23.
    'AGENTE: Anotado',
    'AGENTE: Anotei',
    // Fechamento seco rejeitado no smoke WhatsApp real 2026-05-25.
    'Confirmo por aqui e sigo com teu orçamento',
  ],
  max_tokens: 6000,
};
