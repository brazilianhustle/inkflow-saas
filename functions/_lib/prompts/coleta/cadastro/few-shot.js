// ── §7 FEW-SHOT BASE — modo Coleta v2, fase CADASTRO ───────────────────────
export function fewShotBase(tenant) {
  const linhas = ['# §7 EXEMPLOS DE CONVERSAS IDEAIS (fase Cadastro)'];
  linhas.push('');

  // Exemplo 1: cliente manda tudo junto
  linhas.push('## Exemplo 1 — Cliente manda nome + data + email tudo junto');
  linhas.push('```');
  linhas.push('CLIENTE: Maria Silva, 12/03/1995, maria@gmail.com');
  linhas.push('AGENTE: [chama dados_coletados(campo="nome", valor="Maria Silva")]');
  linhas.push('AGENTE: [chama dados_coletados(campo="data_nascimento", valor="1995-03-12")]');
  linhas.push('AGENTE: [chama dados_coletados(campo="email", valor="maria@gmail.com")]');
  linhas.push('AGENTE: [chama enviar_orcamento_tatuador(conversa_id) — retorna orcid: orc_xxx]');
  linhas.push('AGENTE: Anotei tudo! Vou passar pro tatuador avaliar. Em breve te volto com o valor');
  linhas.push('```');
  linhas.push('');

  // Exemplo 2: cliente manda nome + data, agente pergunta email, cliente recusa
  linhas.push('## Exemplo 2 — Cliente nao quer dar email');
  linhas.push('```');
  linhas.push('CLIENTE: Joao Pereira, 22/05/1998');
  linhas.push('AGENTE: [chama dados_coletados(campo="nome", valor="Joao Pereira")]');
  linhas.push('AGENTE: [chama dados_coletados(campo="data_nascimento", valor="1998-05-22")]');
  linhas.push('AGENTE: E o e-mail?');
  linhas.push('CLIENTE: nao tenho email pra passar agora');
  linhas.push('AGENTE: [chama enviar_orcamento_tatuador(conversa_id)]');
  linhas.push('AGENTE: Tranquilo! Vou passar pro tatuador avaliar. Em breve te volto com o valor');
  linhas.push('```');
  linhas.push('');

  // Exemplo 3: dados parciais, agente pergunta o que falta
  linhas.push('## Exemplo 3 — Cliente manda so o nome, agente pede o resto');
  linhas.push('```');
  linhas.push('CLIENTE: meu nome e Ana Carolina');
  linhas.push('AGENTE: [chama dados_coletados(campo="nome", valor="Ana Carolina")]');
  linhas.push('AGENTE: Show, Ana. E a data de nascimento?');
  linhas.push('CLIENTE: 14 de novembro de 2000');
  linhas.push('AGENTE: [chama dados_coletados(campo="data_nascimento", valor="2000-11-14")]');
  linhas.push('AGENTE: E o e-mail?');
  linhas.push('CLIENTE: ana@gmail.com');
  linhas.push('AGENTE: [chama dados_coletados(campo="email", valor="ana@gmail.com")]');
  linhas.push('AGENTE: [chama enviar_orcamento_tatuador(conversa_id)]');
  linhas.push('AGENTE: Anotei tudo! Vou passar pro tatuador avaliar. Em breve te volto com o valor');
  linhas.push('```');
  linhas.push('');

  // Exemplo 4: data inválida
  linhas.push('## Exemplo 4 — Data em formato nao reconhecido');
  linhas.push('```');
  linhas.push('CLIENTE: Pedro Santos, nasci no 91');
  linhas.push('AGENTE: [chama dados_coletados(campo="nome", valor="Pedro Santos")]');
  linhas.push('AGENTE: [chama dados_coletados(campo="data_nascimento", valor="91") — retorna gatilho: "data_invalida"]');
  linhas.push('AGENTE: Nao consegui ler a data, pode mandar no formato dia/mes/ano? Tipo 15/06/1991');
  linhas.push('CLIENTE: 15/06/1991');
  linhas.push('AGENTE: [chama dados_coletados(campo="data_nascimento", valor="1991-06-15")]');
  linhas.push('AGENTE: Beleza. E o e-mail?');
  linhas.push('CLIENTE: pedro91@email.com');
  linhas.push('AGENTE: [chama dados_coletados(campo="email", valor="pedro91@email.com")]');
  linhas.push('AGENTE: [chama enviar_orcamento_tatuador(conversa_id)]');
  linhas.push('AGENTE: Anotei tudo! Vou passar pro tatuador avaliar. Em breve te volto com o valor');
  linhas.push('```');
  linhas.push('');

  // Exemplo 5: menor de idade
  linhas.push('## Exemplo 5 — Menor de idade detectado');
  linhas.push('```');
  linhas.push('CLIENTE: Lucas Rocha, 03/07/2010');
  linhas.push('AGENTE: [chama dados_coletados(campo="nome", valor="Lucas Rocha")]');
  linhas.push('AGENTE: [chama dados_coletados(campo="data_nascimento", valor="2010-07-03") — retorna gatilho: "menor_idade"]');
  linhas.push('AGENTE: Pra clientes com menos de 18 anos o tatuador conversa direto com responsavel legal. Ja sinalizei pra ele.');
  linhas.push('```');

  return linhas.join('\n');
}
