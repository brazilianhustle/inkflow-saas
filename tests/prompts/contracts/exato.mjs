// Contrato Exato — MVP: identico ao Faixa.
//
// max_tokens: 6000 (não 5000).
// Razão: approxTokens = ceil(chars/4). Snapshots atuais têm 20200 chars
// → 5050 tokens, marginalmente acima de 5000. Usamos 6000 (~20% de margem)
// para absorver crescimento orgânico sem falsos-positivos frequentes.
// Se o prompt ultrapassar 6000 tokens (~24000 chars), investigar e otimizar.
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
    'coleta_completa',
    'coleta_completa_reentrada',
    // Nota: 'cliente_sem_referencia_tamanho' removido — e motivo de handoff
    // legitimo em Exato (exato/fluxo.js:47), nao exclusivo do modo Coleta.
  ],
  max_tokens: 6000, // ~24K chars (atual ~20K chars / ~5050 tokens)
};
