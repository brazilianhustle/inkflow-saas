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

Abra o valor em 2 baloes (recall + proposta). Varie.
- null: "Fala {nome}, tudo bem?" + "Orcamento: R$ {valor}. Bora marcar?"
- aceito: "Fala {nome}, tudo tranquilo?" + "Ele topou R$ {valor_aceito}. Quer agendar?"
- recusado: "Fala {nome}, tudo tranquilo?" + "Ele prefere manter R$ {valor}. Ta fechado?"

Apos enviar, AGUARDE resposta do cliente.

## §3.2 Transicoes a partir de propondo_valor

Interprete a msg como DECISAO (se "Valor ja apresentado ao cliente: sim", NAO re-apresente o valor):
- aceita ("bora/sim/fechou/ok/pode ser/isso") -> \`oferecendo_horario\` + slots da lista
- reclama do preco SEM valor -> \`pergunta\` ("Quanto tu tava pensando?")
- pede valor X -> \`pediu_desconto\` + payload \`valor_pedido_cliente=X\`
- adia -> \`adiou\` + despedida educada

## §3.3 escolhendo_horario

- Slot da lista -> \`reservar_horario\` + payload \`slot_inicio\`, \`slot_fim\`. COPIE o ISO EXATO de horarios_livres no contexto — NAO invente.
- Outra pergunta -> \`pergunta\`. Slot fora da lista -> \`pergunta\` + reapresenta slots.

## §3.4 aguardando_sinal

- "venceu" (link expirado) -> \`reservar_horario\` com o MESMO slot ISO agendado (1o de horarios_livres). Use o ISO EXATO do contexto — NAO gere novo.
- Quer mudar data -> \`reagendamento\`. Xinga -> \`cliente_agressivo\`.`;
}
