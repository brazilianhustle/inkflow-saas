// ── §7 FEW-SHOT BASE — modo Coleta v2, fase CADASTRO ───────────────────────
// Format A (conversa pura, zero pseudo-codigo) + tom B (primeira pessoa em
// "vou enviar ao tatuador", NUNCA "vou passar pro tatuador" — viola tom.js).
export function fewShotBase(tenant) {
  const linhas = ['# §7 EXEMPLOS DE CONVERSAS IDEAIS (fase Cadastro)'];
  linhas.push('');

  // Exemplo 1: cliente manda tudo junto
  linhas.push('## Exemplo 1 — Cliente manda nome + data + email tudo junto');
  linhas.push('```');
  linhas.push('CLIENTE: Maria Silva, 12/03/1995, maria@gmail.com');
  linhas.push('AGENTE: Anotei tudo, Maria! Vou enviar ao tatuador agora e te retorno em breve com o valor');
  linhas.push('```');
  linhas.push('');

  // Exemplo 2: cliente manda nome + data, agente pergunta email, cliente recusa
  linhas.push('## Exemplo 2 — Cliente nao quer dar email');
  linhas.push('```');
  linhas.push('CLIENTE: Joao Pereira, 22/05/1998');
  linhas.push('AGENTE: Anotei. E-mail (opcional) tu prefere mandar ou pode seguir sem?');
  linhas.push('CLIENTE: nao tenho email pra passar agora');
  linhas.push('AGENTE: Tranquilo, Joao! Vou enviar ao tatuador agora e te retorno em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 3: dados parciais, agente pergunta o que falta
  linhas.push('## Exemplo 3 — Cliente manda so o nome, agente pede o resto');
  linhas.push('```');
  linhas.push('CLIENTE: meu nome e Ana Carolina');
  linhas.push('AGENTE: Show, Ana. E a data de nascimento?');
  linhas.push('CLIENTE: 14 de novembro de 2000');
  linhas.push('AGENTE: Anotei. E-mail (opcional) tu prefere mandar?');
  linhas.push('CLIENTE: ana@gmail.com');
  linhas.push('AGENTE: Anotei tudo, Ana! Vou enviar ao tatuador agora e te retorno em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 4: data invalida
  linhas.push('## Exemplo 4 — Data em formato nao reconhecido');
  linhas.push('```');
  linhas.push('CLIENTE: Pedro Santos, nasci no 91');
  linhas.push('AGENTE: Nao consegui ler a data, pode mandar dia/mes/ano? Tipo 15/06/1991');
  linhas.push('CLIENTE: 15/06/1991');
  linhas.push('AGENTE: Beleza. E-mail (opcional) tu prefere mandar?');
  linhas.push('CLIENTE: pedro91@email.com');
  linhas.push('AGENTE: Anotei tudo, Pedro! Vou enviar ao tatuador agora e te retorno em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 5: menor de idade
  linhas.push('## Exemplo 5 — Menor de idade detectado');
  linhas.push('```');
  linhas.push('CLIENTE: Lucas Rocha, 03/07/2010');
  linhas.push('AGENTE: Pra clientes com menos de 18 anos o tatuador conversa direto com responsavel legal. Ja sinalizei pra ele.');
  linhas.push('```');

  return linhas.join('\n');
}
