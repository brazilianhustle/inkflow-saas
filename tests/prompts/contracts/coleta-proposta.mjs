// tests/prompts/contracts/coleta-proposta.mjs
// Contrato do prompt Coleta v2 (rewrite Sub-3.2 2026-05-08) — fase PROPOSTA.
// Pure structured-output (sem tools no agent — orchestrator em route.js
// chama tools internas via fetch). Garante que o prompt:
// - tem as 4 ancoras v2 (IDENTIDADE, CONTEXTO, OBJETIVO, DECISAO);
// - injeta valor_proposto, decisao_desconto, horarios_livres no contexto;
// - menciona payloads opcionais do schema (slot_inicio, slot_fim, valor_pedido_cliente);
// - lista 7 valores de proxima_acao explicitamente;
// - NAO menciona tools v1 (consultar_horarios_livres, gerar_link_sinal, etc);
// - NAO contem markdown link (URL deve ser crua — WhatsApp nao renderiza);
// - NAO contem ancoras v1 (CHECKLIST, REGRAS INVIOLAVEIS, §4b TOOLS).
export const CONTRACT_COLETA_PROPOSTA = {
  must_contain: [
    // Ancoras v2 (paridade cadastro/tattoo)
    'IDENTIDADE',
    'CONTEXTO',
    'OBJETIVO',
    'DECISAO',
    // Variaveis dinamicas injetadas no contexto
    'valor_proposto',
    'decisao_desconto',
    'horarios_livres',
    // Schema fields que orchestrator consome
    'proxima_acao',
    'slot_inicio',
    'slot_fim',
    'valor_pedido_cliente',
    // Valores do enum proxima_acao (devem aparecer no prompt — tabela §4 + exemplos)
    'oferecendo_horario',
    'reservar_horario',
    'pediu_desconto',
    'adiou',
    'reagendamento',
    'cliente_agressivo',
  ],
  must_not_contain: [
    // Ancoras v1 removidas
    'CHECKLIST',
    'REGRAS INVIOLAVEIS',
    '§4b TOOLS',
    // Tools v1 removidas do prompt (orchestrator usa, agent nao chama)
    'consultar_horarios_livres',
    'consultar-horarios-livres',
    'enviar_objecao_tatuador',
    'gerar_link_sinal',
    'acionar_handoff(',
    'consultar_proposta_tatuador',
    'reservar_horario(',  // chamada de funcao com paren — diferente de menus em prosa
    // Sintaxe pseudo-codigo legacy
    '[chama tool',
    // Markdown link (WhatsApp nao renderiza — link MP fica URL crua)
    '](http',
    // Tom mecanico/rebaixado no caminho de pechincha.
    'AGENTE: Anotado',
    'AGENTE: Anotei',
    'AGENTE: Anota',
    'Anota ai',
    'Poxa, esse e o valor que o tatuador costuma cobrar',
    'Quanto tu tava pensando?',
  ],
  max_tokens: 2500,
};
