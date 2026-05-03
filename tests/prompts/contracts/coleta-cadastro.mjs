// Contrato do prompt Coleta v2 — fase CADASTRO.
// Garante que o prompt:
// - tem as ancoras estruturais;
// - menciona os 3 campos de cadastro (nome, data_nascimento, email);
// - explicita que email é OPCIONAL;
// - chama enviar_orcamento_tatuador no encerramento;
// - NUNCA menciona tools de orcamento/agendamento;
// - NUNCA fala valor monetario.
export const CONTRACT_COLETA_CADASTRO = {
  must_contain: [
    'IDENTIDADE',
    'CHECKLIST',
    'FLUXO',
    'REGRAS INVIOLAVEIS',
    'CONTEXTO',
    'nome',
    'data_nascimento',
    'email',
    'opcional',
    'dados_coletados',
    'enviar_orcamento_tatuador',
  ],
  must_not_contain: [
    // Tools de agendamento — Coleta-Cadastro nao agenda; isso vem na fase
    // Proposta apos tatuador devolver valor pelo Telegram.
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
  ],
  max_tokens: 6000,
};
