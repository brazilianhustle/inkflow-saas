// ── §7 FEW-SHOT BASE — modo Coleta v2, fase PROPOSTA ───────────────────────
export function fewShotBase(tenant) {
  const linhas = ['# §7 EXEMPLOS DE CONVERSAS IDEAIS (fase Proposta)'];
  linhas.push('');

  // Exemplo 1: cliente aceita direto
  linhas.push('## Exemplo 1 — Caminho A (cliente aceita o valor)');
  linhas.push('```');
  linhas.push('AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?');
  linhas.push('CLIENTE: fechou, vamos marcar');
  linhas.push('AGENTE: [chama consultar_horarios_livres(tenant_id, data_preferida=null)]');
  linhas.push('AGENTE: Tenho disponivel: ter 14h, qui 10h, sex 16h. Qual prefere?');
  linhas.push('CLIENTE: qui');
  linhas.push('AGENTE: [chama reservar_horario(...inicio/fim do slot qui 10h...)]');
  linhas.push('AGENTE: [chama gerar_link_sinal(agendamento_id, valor_sinal=225)]');
  linhas.push('AGENTE: Pra agendar a gente trabalha com sinal de 30% do valor, fica em R$ 225.');
  linhas.push('');
  linhas.push('https://link-pagamento-aqui');
  linhas.push('');
  linhas.push('AGENTE: O link tem validade de 24 horas. Se expirar, so me chamar que envio outro.');
  linhas.push('```');
  linhas.push('');

  // Exemplo 2: cliente pede desconto sem dizer valor
  linhas.push('## Exemplo 2 — Caminho B (cliente pede desconto sem dizer quanto)');
  linhas.push('```');
  linhas.push('AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?');
  linhas.push('CLIENTE: ta um pouco caro');
  linhas.push('AGENTE: Quanto tu tava pensando?');
  linhas.push('CLIENTE: uns 600');
  linhas.push('AGENTE: [chama enviar_objecao_tatuador(conversa_id, valor_pedido_cliente=600)]');
  linhas.push('AGENTE: Vou levar pra ele analisar essa proposta — quem fecha o valor e o tatuador. Em breve te dou um retorno.');
  linhas.push('```');
  linhas.push('');

  // Exemplo 3: cliente pede desconto direto com valor
  linhas.push('## Exemplo 3 — Caminho B (cliente ja diz o valor que quer)');
  linhas.push('```');
  linhas.push('AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?');
  linhas.push('CLIENTE: consegue por 600?');
  linhas.push('AGENTE: [chama enviar_objecao_tatuador(conversa_id, valor_pedido_cliente=600)]');
  linhas.push('AGENTE: Anotado! Primeiro preciso passar pro tatuador avaliar e te retorno com a resposta.');
  linhas.push('```');
  linhas.push('');

  // Exemplo 4: tatuador aceitou desconto, bot reentra
  linhas.push('## Exemplo 4 — Reentrada apos tatuador aceitar desconto');
  linhas.push('```');
  linhas.push('// (contexto: decisao_desconto="aceito", valor_proposto agora = 600)');
  linhas.push('AGENTE: Show! Ele topou em R$ 600. Bora marcar?');
  linhas.push('CLIENTE: vamos');
  linhas.push('AGENTE: [chama consultar_horarios_livres(...)]');
  linhas.push('AGENTE: Tenho ter 14h, qui 10h, sex 16h. Qual prefere?');
  linhas.push('// (segue agendamento normal)');
  linhas.push('```');
  linhas.push('');

  // Exemplo 5: tatuador manteve valor, cliente recua
  linhas.push('## Exemplo 5 — Reentrada apos tatuador manter valor');
  linhas.push('```');
  linhas.push('// (contexto: decisao_desconto="recusado", valor_proposto = 750 [original])');
  linhas.push('AGENTE: Ele preferiu manter R$ 750. Ta fechado pra ti? Bora marcar?');
  linhas.push('CLIENTE: humm, vou pensar');
  linhas.push('AGENTE: Tranquilo! Qualquer coisa e so me chamar.');
  linhas.push('// (estado vira lead_frio)');
  linhas.push('```');
  linhas.push('');

  // Exemplo 6: cliente adia (caminho C)
  linhas.push('## Exemplo 6 — Caminho C (cliente adia)');
  linhas.push('```');
  linhas.push('AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?');
  linhas.push('CLIENTE: deixa eu pensar e te volto');
  linhas.push('AGENTE: Tranquilo! Qualquer coisa e so me chamar.');
  linhas.push('// (estado vira lead_frio, bot nao responde mais)');
  linhas.push('```');

  return linhas.join('\n');
}
