// ── §5 CONTEXTO — extraido de generate-prompt.js linhas 327-409 ─────────────
export function contexto(tenant, conversa, clientContext) {
  const cfg = tenant.config_precificacao || {};
  const sinalPct = cfg.sinal_percentual ?? tenant.sinal_percentual ?? 30;
  const h = tenant.horario_funcionamento || {};
  const aceitaCobertura = tenant.config_agente?.aceita_cobertura !== false;
  const aceitos = tenant.config_agente?.estilos_aceitos || [];
  const recusados = tenant.config_agente?.estilos_recusados || [];
  const estado = conversa?.estado || 'qualificando';
  const dados = conversa?.dados_coletados || {};
  const ctx = clientContext || {};

  const linhas = ['# §5 CONTEXTO'];

  linhas.push('## Estudio');
  linhas.push(`- Sinal: ${sinalPct}% do minimo da faixa do orcamento.`);
  if (Object.keys(h).length) {
    const hstr = Object.entries(h).map(([d, hs]) => `${d} ${hs}`).join(' | ');
    linhas.push(`- Horario: ${hstr}.`);
  }
  if (aceitos.length) linhas.push(`- Estilos em que o estudio e especializado: ${aceitos.join(', ')}. (Outros estilos podem ser consultados.)`);
  if (recusados.length) linhas.push(`- Estilos que NAO faz: ${recusados.join(', ')}.`);
  linhas.push(`- ${aceitaCobertura ? 'ACEITA' : 'NAO ACEITA'} cobertura (cover up).`);

  if (cfg.tamanho_maximo_sessao_cm) {
    linhas.push(`- Tamanho maximo por sessao: ${cfg.tamanho_maximo_sessao_cm}cm (acima disso = handoff automatico).`);
  }

  const observacoes = (cfg.observacoes_tatuador || '').trim();
  if (observacoes) {
    linhas.push('');
    linhas.push('## Observacoes especificas do tatuador (siga estas regras):');
    linhas.push(observacoes);
  }
  linhas.push('');

  linhas.push('## Cliente');
  if (ctx.is_first_contact) {
    linhas.push('- PRIMEIRO CONTATO do cliente com o estudio.');
  } else if (ctx.eh_recorrente) {
    linhas.push(`- Cliente RECORRENTE (${ctx.total_sessoes || 1} sessao(oes) anterior(es)).`);
    if (ctx.nome_cliente && ctx.nome_cliente.trim().length >= 2) {
      linhas.push(`- Nome (capturado anteriormente): ${ctx.nome_cliente.split(' ')[0]}.`);
    }
  } else {
    linhas.push('- Cliente ja conversou antes, nao se apresente novamente.');
  }
  linhas.push('');

  linhas.push(`## Estado da conversa: ${estado}`);
  const estadoHint = {
    qualificando: 'Colete os dados pra poder orcar.',
    orcando: 'Ja tem dados. Pode chamar calcular_orcamento.',
    escolhendo_horario: 'Cliente quer agendar. Use consultar_horarios_livres.',
    aguardando_sinal: 'Slot reservado. Se cliente avisar que link venceu, consultar_horarios_livres + gerar_link_sinal com mesmo agendamento_id.',
    confirmado: 'Sinal pago. So duvidas leves. Mudanca de data = handoff.',
    handoff: 'NAO RESPONDA. Humano assumiu.',
    expirado: 'Slot caiu. Se quer retomar, consultar_horarios_livres + se livre, gerar_link_sinal mesmo agendamento_id.',
  };
  linhas.push(estadoHint[estado] || estadoHint.qualificando);
  linhas.push('');

  const dadosLinhas = [];
  if (dados.tema) dadosLinhas.push(`- Tema: ${dados.tema}`);
  if (dados.local) dadosLinhas.push(`- Local: ${dados.local}`);
  if (dados.tamanho_cm) dadosLinhas.push(`- Tamanho: ${dados.tamanho_cm}cm`);
  if (dados.estilo) dadosLinhas.push(`- Estilo: ${dados.estilo}`);
  if (dados.cor_bool !== undefined) dadosLinhas.push(`- Cor: ${dados.cor_bool ? 'colorida' : 'preto e sombra'}`);
  if (dados.nivel_detalhe) dadosLinhas.push(`- Nivel de detalhe: ${dados.nivel_detalhe}`);
  if (dados.nome) dadosLinhas.push(`- Nome do cliente (capturado): ${dados.nome}`);
  if (conversa?.orcamento_min && conversa?.orcamento_max) dadosLinhas.push(`- Orcamento ja calculado: R$ ${conversa.orcamento_min} a R$ ${conversa.orcamento_max}`);
  if (dadosLinhas.length) {
    linhas.push('## Dados ja coletados nesta conversa (NAO pergunte de novo)');
    linhas.push(...dadosLinhas);
  }

  return linhas.join('\n');
}
