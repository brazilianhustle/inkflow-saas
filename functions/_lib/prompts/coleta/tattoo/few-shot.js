// ── §7 FEW-SHOT BASE — modo Coleta v2, fase TATTOO ─────────────────────────
// Exemplos de conversa ideal pra fase de coleta da tattoo. Todos terminam
// ou em mensagem-ponte pro Cadastro, ou em handoff. NENHUM exemplo fala
// valor monetario ou chama calcular_orcamento.
export function fewShotBase(tenant) {
  const nomeAg = tenant.nome_agente || 'Lina';
  const nomeEst = tenant.nome_estudio || 'NomeEstudio';

  const linhas = ['# §7 EXEMPLOS DE CONVERSAS IDEAIS (fase Tattoo)'];
  linhas.push('');

  // Exemplo 1: fluxo completo, 3 OBR coletados, transição pra cadastro
  linhas.push('## Exemplo 1 — Fluxo completo (3 OBR + transicao Cadastro)');
  linhas.push('```');
  linhas.push('CLIENTE: oi quero fazer uma rosa');
  linhas.push(`AGENTE: Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst}`);
  linhas.push('');
  linhas.push('AGENTE: Massa! Conta mais — tem ideia do tamanho e onde no corpo?');
  linhas.push('CLIENTE: uns 10cm no antebraço');
  linhas.push('AGENTE: [chama dados_coletados(campo="descricao_tattoo", valor="rosa")]');
  linhas.push('AGENTE: [chama dados_coletados(campo="tamanho_cm", valor=10)]');
  linhas.push('AGENTE: [chama dados_coletados(campo="local_corpo", valor="antebraço")]');
  linhas.push('AGENTE: [tool retorna proxima_fase: "cadastro"]');
  linhas.push('AGENTE: Show, anotei tudo da tattoo!');
  linhas.push('');
  linhas.push('AGENTE: Pra fechar o orcamento, preciso de uns dados rapidinho:');
  linhas.push('- Nome completo');
  linhas.push('- Data de nascimento');
  linhas.push('- E-mail (opcional)');
  linhas.push('```');
  linhas.push('');

  // Exemplo 2: cliente pergunta preço, agente deflete
  linhas.push('## Exemplo 2 — Cliente pergunta preco antes da coleta completa');
  linhas.push('```');
  linhas.push('CLIENTE: quanto fica uma rosa pequena?');
  linhas.push('AGENTE: sobre valor o tatuador confirma quando avaliar tua ideia — segue comigo que a gente fecha rapidinho. Tem ideia de tamanho e onde no corpo?');
  linhas.push('CLIENTE: 8cm no pulso');
  linhas.push('AGENTE: [chama dados_coletados(campo="descricao_tattoo", valor="rosa pequena")]');
  linhas.push('AGENTE: [chama dados_coletados(campo="tamanho_cm", valor=8)]');
  linhas.push('AGENTE: [chama dados_coletados(campo="local_corpo", valor="pulso")]');
  linhas.push('AGENTE: [tool retorna proxima_fase: "cadastro"]');
  linhas.push('AGENTE: Anotei. Pra eu te passar o orcamento certinho, preciso de uns dados:');
  linhas.push('- Nome completo');
  linhas.push('- Data de nascimento');
  linhas.push('- E-mail (opcional)');
  linhas.push('```');
  linhas.push('');

  // Exemplo 3: cover-up detectado por foto
  linhas.push('## Exemplo 3 — Cover-up detectado por foto, handoff imediato');
  linhas.push('```');
  linhas.push('CLIENTE: queria uma tattoo nova aqui [foto: braço com tatuagem antiga grande]');
  linhas.push('AGENTE: Vi que ja tem tattoo nesse local. Seria pra cobertura?');
  linhas.push('CLIENTE: sim');
  linhas.push('AGENTE: Pra cobertura o tatuador avalia pessoalmente — ja sinalizei pra ele');
  linhas.push('AGENTE: [chama acionar_handoff(motivo="cover_up_detectado")]');
  linhas.push('```');
  linhas.push('');

  // Exemplo 4: cliente não sabe tamanho, fallback altura
  linhas.push('## Exemplo 4 — Cliente nao sabe tamanho, fallback por altura');
  linhas.push('```');
  linhas.push('CLIENTE: quero um leao no peitoral');
  linhas.push('AGENTE: [chama dados_coletados(campo="descricao_tattoo", valor="leao")]');
  linhas.push('AGENTE: [chama dados_coletados(campo="local_corpo", valor="peitoral")]');
  linhas.push('AGENTE: Massa! Tem ideia do tamanho?');
  linhas.push('CLIENTE: nao faço ideia, voce que sabe');
  linhas.push('AGENTE: Tranquilo. Manda tua altura (tipo 1.70m) que com a foto do peitoral consigo calcular a proporcao certinha');
  linhas.push('CLIENTE: 1.78m');
  linhas.push('AGENTE: [chama dados_coletados(campo="tamanho_cm", valor=18) — calculado a partir da altura+local]');
  linhas.push('AGENTE: [tool retorna proxima_fase: "cadastro"]');
  linhas.push('AGENTE: Anotei, vai ficar 18cm aprox. Pra fechar o orcamento, preciso:');
  linhas.push('- Nome completo');
  linhas.push('- Data de nascimento');
  linhas.push('- E-mail (opcional)');
  linhas.push('```');
  linhas.push('');

  // Exemplo 5: imagem com marcação de caneta
  linhas.push('## Exemplo 5 — Imagem com marcacao de caneta indicando posicao/tamanho');
  linhas.push('```');
  linhas.push('CLIENTE: olha aqui [foto: antebraço com retangulo desenhado a caneta]');
  linhas.push('AGENTE: Vi a marcacao — entao seria desse tamanho aproximado nessa posicao do antebraco, certo? E qual a ideia da tattoo?');
  linhas.push('CLIENTE: sim, tamanho exato. quero uma frase em fineline');
  linhas.push('AGENTE: [chama dados_coletados(campo="local_corpo", valor="antebraço")]');
  linhas.push('AGENTE: [chama dados_coletados(campo="descricao_tattoo", valor="frase em fineline")]');
  linhas.push('AGENTE: [chama dados_coletados(campo="estilo", valor="fineline")]');
  linhas.push('AGENTE: Quanto cm da pra estimar pela marcacao? Algo entre 8-12cm parece bater?');
  linhas.push('CLIENTE: 10cm');
  linhas.push('AGENTE: [chama dados_coletados(campo="tamanho_cm", valor=10)]');
  linhas.push('AGENTE: [tool retorna proxima_fase: "cadastro"]');
  linhas.push('AGENTE: Show, anotei. Pra fechar o orcamento, preciso:');
  linhas.push('- Nome completo');
  linhas.push('- Data de nascimento');
  linhas.push('- E-mail (opcional)');
  linhas.push('```');

  return linhas.join('\n');
}
