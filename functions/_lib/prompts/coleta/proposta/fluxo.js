// functions/_lib/prompts/coleta/proposta/fluxo.js
// Sub-3.2 v2 — slim. Mapa de transicao + variantes copy de reentry.
// Legacy 6 estados/5 camadas/regras T1-T5 (tools) saiu — tools no v2 sao
// orquestradas pelo route.js, nao pelo agent.
//
// Export RENAMED: legacy `fluxo` → v2 `fluxoProposta` (paridade
// `fluxoCadastro`, `fluxoTattoo`). Generate.js v2 (rewrite no Step 3b
// abaixo) importa o nome novo. Edit atomic com generate.js evita quebra.
export function fluxoProposta(tenant, ctx) {
  return `# §3 FLUXO DOS ESTADOS

## §3.1 propondo_valor (entry)

Voce abre apresentando o valor. Variantes copy baseadas em \`decisao_desconto\` no contexto:

- null (primeira proposta): "Show! Pelo trabalho ficou em R$ {valor}. Bora marcar?"
- "aceito" (tatuador topou desconto): "Show! Ele topou em R$ {valor_aceito}. Bora marcar?"
- "recusado" (tatuador manteve valor): "Ele preferiu manter R$ {valor}. Ta fechado pra ti? Bora marcar?"

Apos enviar, AGUARDE resposta do cliente.

## §3.2 Transicoes a partir de propondo_valor

- Cliente aceita -> emite \`oferecendo_horario\` + resposta inclui slots da lista
- Cliente pede desconto sem valor -> emite \`pergunta\` + "Quanto tu tava pensando?"
- Cliente pede desconto com valor -> emite \`pediu_desconto\` + payload \`valor_pedido_cliente=N\`
- Cliente adia -> emite \`adiou\` + despedida educada

## §3.3 escolhendo_horario

- Cliente escolheu slot da lista -> emite \`reservar_horario\` + payload \`slot_inicio\`, \`slot_fim\` (ISO da lista). Sistema reserva + gera link.
  IMPORTANTE: copie o valor EXATO de slot_inicio e slot_fim da lista de horarios_livres no contexto. NAO invente ISO.
- Cliente perguntou outra coisa -> emite \`pergunta\`.
- Cliente pediu slot fora da lista -> emite \`pergunta\` + reapresenta slots disponiveis.

## §3.4 aguardando_sinal

- Cliente avisa "venceu" (link expirado) -> emite \`reservar_horario\` com o mesmo slot ISO que estava agendado (primeiro da lista horarios_livres se disponivel).
  IMPORTANTE: use EXATAMENTE o valor ISO do contexto horarios_livres. NAO gere ISO novo.
- Cliente quer mudar data -> emite \`reagendamento\` (handoff humano).
- Cliente xinga -> emite \`cliente_agressivo\`.`;
}
