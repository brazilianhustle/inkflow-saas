// §2 CONTEXTO — slim, local ao TattooAgent. Tem APENAS o que a fase Tattoo
// precisa: gatilhos handoff, aceita_cobertura, cliente (1o contato vs
// recorrente), e dados ja coletados em chave-valor que mapeia 1:1 com OBR
// da tabela §4. Substitui _shared/contexto.js (que tem 7 estados legacy).
export function contextoTattoo(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const dados = conversa?.dados_coletados || {};
  const aceitaCobertura = tenant.config_agente?.aceita_cobertura !== false;
  const gatilhos = Array.isArray(tenant.gatilhos_handoff) && tenant.gatilhos_handoff.length
    ? tenant.gatilhos_handoff
    : ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'];

  const linhas = ['# §2 CONTEXTO'];

  // Estudio
  linhas.push('## Estudio');
  linhas.push(`- Gatilhos handoff: ${gatilhos.map(g => `"${g}"`).join(', ')}`);
  linhas.push(`- ${aceitaCobertura ? 'ACEITA' : 'NAO ACEITA'} cobertura (cover-up)`);
  linhas.push(`- portfolio: ${ctx.portfolio_disponivel ? 'disponivel' : 'nao cadastrado'}`);
  linhas.push('');

  // Cliente
  linhas.push('## Cliente');
  if (ctx.is_first_contact) {
    linhas.push('- PRIMEIRO CONTATO do cliente com o estudio (faca saudacao 2 baloes)');
  } else if (ctx.eh_recorrente) {
    linhas.push(`- Cliente RECORRENTE (${ctx.total_sessoes || 1} sessao(oes) anterior(es))`);
    if (ctx.nome_cliente && ctx.nome_cliente.trim().length >= 2) {
      linhas.push(`- Nome: ${ctx.nome_cliente.split(' ')[0]}`);
    }
  } else {
    linhas.push('- Cliente ja conversou antes — NAO se apresente novamente');
  }
  linhas.push('');

  // Dados ja coletados — refator manifesto 2026-05-13 — 4 OBR + status foto
  const dadosLinhas = [];
  if (dados.descricao_curta) dadosLinhas.push(`- descricao_curta: ${dados.descricao_curta}`);
  if (dados.local_corpo)    dadosLinhas.push(`- local_corpo: ${dados.local_corpo}`);
  if (dados.altura_cm != null) dadosLinhas.push(`- altura_cm (cliente): ${dados.altura_cm}cm`);
  if (dados.estilo)         dadosLinhas.push(`- estilo: ${dados.estilo}`);
  if (dados.tamanho_cm)     dadosLinhas.push(`- tamanho_cm (opcional): ${dados.tamanho_cm}cm`);
  if (dados.foto_local)     dadosLinhas.push(`- foto_local: presente`);

  // Status foto pedida ate 2x (refator manifesto P3)
  const tentativasFoto = conversa?.estado_extra?.tentativas_foto_local || 0;
  if (tentativasFoto > 0 && !dados.foto_local) {
    dadosLinhas.push(`- foto_local: pedida ${tentativasFoto}x sem resposta`);
  }

  if (Array.isArray(dados.refs_imagens) && dados.refs_imagens.length) {
    dadosLinhas.push(`- refs_imagens: ${dados.refs_imagens.length} foto(s) recebida(s)`);
  }
  if (dadosLinhas.length) {
    linhas.push('## Dados ja coletados (NAO pergunte de novo)');
    linhas.push(...dadosLinhas);
  } else {
    linhas.push('## Dados ja coletados');
    linhas.push('- (nenhum — comece a coleta)');
  }

  return linhas.join('\n');
}
