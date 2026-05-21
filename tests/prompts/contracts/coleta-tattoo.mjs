// Contrato do prompt Coleta v2 (rewrite 2026-05-08) — fase TATTOO.
// Pure structured-output agent (sem tools — audit Fase 9). Garante que o prompt:
// - tem as 4 ancoras v2 (IDENTIDADE, CONTEXTO, OBJETIVO, DECISAO);
// - menciona os 3 OBR com naming alinhado ao schema (descricao_curta, tamanho_cm, local_corpo);
// - usa estado via structured output (dados_persistidos, proxima_acao);
// - NAO menciona tools removidas (dados_coletados, handoff_to_cadastro);
// - NAO menciona tools fantasma legacy (acionar_handoff, calcular_orcamento, etc);
// - NAO pede dados de cadastro nesta fase.
export const CONTRACT_COLETA_TATTOO = {
  must_contain: [
    'IDENTIDADE',
    'CONTEXTO',
    'OBJETIVO',
    'DECISAO',
    'descricao_curta',
    'tamanho_cm',
    'local_corpo',
    'dados_persistidos',
    'proxima_acao',
    'recebe as imagens',
  ],
  must_not_contain: [
    // Tools removidas (audit Fase 9 — pure structured-output).
    'dados_coletados',
    'handoff_to_cadastro',
    // Lie removida do R4 — modelo agora VE a foto diretamente.
    'injeta descricao textual',
    // Tools fantasma legacy (nunca existiram como tool real).
    'acionar_handoff',
    'enviar_orcamento_tatuador',
    'calcular_orcamento',
    // Tools de agendamento de outras fases.
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
    'enviar_objecao_tatuador',
    // Naming antigo — schema usa descricao_curta.
    'descricao_tattoo',
  ],
  max_tokens: 6000,
};
