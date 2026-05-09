// functions/_lib/prompts/coleta/cadastro/contexto.js
// §2 CONTEXTO — slim, local ao CadastroAgent. Espelha tattoo/contexto.js.
// Tem APENAS o que a fase Cadastro precisa: cliente recorrente vs novo,
// resumo da Tattoo (referencia da resposta-ponte), dados ja coletados em
// chave-valor que mapeia 1:1 com o schema CadastroOutputSchema.
export function contextoCadastro(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const dadosCadastro = conversa?.dados_cadastro || {};
  const dadosColetados = conversa?.dados_coletados || {};

  const linhas = ['# §2 CONTEXTO'];

  // Cliente
  linhas.push('## Cliente');
  if (ctx.eh_recorrente) {
    linhas.push('- Cliente RECORRENTE — ja conversou antes');
    if (ctx.nome_cliente && ctx.nome_cliente.trim().length >= 2) {
      linhas.push(`- Nome anterior: ${ctx.nome_cliente}`);
    }
  } else {
    linhas.push('- Cliente acabou de receber mensagem-ponte do Tattoo. NAO se reapresente.');
  }
  linhas.push(`- portfolio: ${ctx.portfolio_disponivel ? 'disponivel' : 'nao cadastrado'}`);
  linhas.push('');

  // Resumo da fase Tattoo (referencia da resposta-ponte)
  if (dadosColetados && Object.keys(dadosColetados).length) {
    linhas.push('## Tattoo escolhida (fase anterior — referencia)');
    if (dadosColetados.descricao_curta) linhas.push(`- ${dadosColetados.descricao_curta}`);
    if (dadosColetados.tamanho_cm) linhas.push(`- ${dadosColetados.tamanho_cm}cm`);
    if (dadosColetados.local_corpo) linhas.push(`- ${dadosColetados.local_corpo}`);
    linhas.push('');
  }

  // Dados ja coletados nesta fase
  const dadosLinhas = [];
  if (dadosCadastro.nome) dadosLinhas.push(`- nome: ${dadosCadastro.nome}`);
  if (dadosCadastro.data_nascimento) dadosLinhas.push(`- data_nascimento: ${dadosCadastro.data_nascimento}`);
  if (dadosCadastro.email) dadosLinhas.push(`- email: ${dadosCadastro.email}`);
  if (dadosCadastro.email_recusado === true) dadosLinhas.push('- email_recusado: true');

  if (dadosLinhas.length) {
    linhas.push('## Dados ja coletados (NAO pergunte de novo)');
    linhas.push(...dadosLinhas);
  } else {
    linhas.push('## Dados ja coletados');
    linhas.push('- (nenhum — comece a coleta)');
  }

  return linhas.join('\n');
}
