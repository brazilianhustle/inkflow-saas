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
    // NOTA: removido check 'data de nascimento' — era over-strict.
    // §3.4 do fluxo.js EXPLICITAMENTE instrui o bot a pedir nome+data_nasc+email
    // como mensagem-ponte apos 3 OBR completos (transicao pra fase Cadastro).
    // Few-shot Exemplo 1 e Exemplo 2 (refator 2026-05-06) demonstram esse pedido
    // em texto corrido. Check substring "data de nascimento" disparava falso-
    // positivo ao detectar o pedido legitimo do bridge §3.4.
    // Verificacao real ("tattoo nao invoca tool de cadastro ANTES dos 3 OBR")
    // fica em invariants.test.mjs e regras inline R4/R5/R6 do tattoo/regras.js.
  ],
  // Limite ajustado de 6000 → 7500 em 2026-05-06 (refator R9 + OBR_RECOMENDADO):
  // o prompt expandiu intencionalmente com R9 (princípio devolver contradições),
  // T7 (tracking), altura_cm como campo próprio, OBR_RECOMENDADO 3 single shots,
  // soft re-ask explícito + estimativa visual, e few-shots passou de 5→10
  // cenários cobrindo R9 contradições. Tudo cravado pelo Leandro pós-smoke
  // E2E pós-PR #29. Contagem real ~6851 tokens (chars/4); limite 7500 dá
  // ~650 tokens de margem pra futuras adições antes de virar problema.
  max_tokens: 7500,
};
