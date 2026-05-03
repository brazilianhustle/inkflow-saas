// ── §3 FLUXO — modo Coleta v2, fase CADASTRO ───────────────────────────────
// Fase 2 do Modo Coleta. Coleta nome completo + data de nascimento + e-mail
// (opcional). Apos os 2 OBR (nome, data nascimento), chama tool
// `enviar_orcamento_tatuador` que monta orcamento e dispara mensagem
// Telegram pro tatuador. Estado transiciona pra `aguardando_tatuador`.
// E-mail opcional: aceitar pular apos 1 tentativa.
export function fluxo(tenant, clientContext) {
  const linhas = ['# §3 FLUXO — Cadastro'];
  linhas.push('Sua missao nesta fase: coletar 3 dados de cadastro do cliente, sendo 2 OBR e 1 OPC.');
  linhas.push('');

  // §3.1 Mensagem inicial
  linhas.push('## §3.1 Estado de entrada');
  linhas.push('Voce entra nesta fase imediatamente APOS o cliente ter respondido a sua mensagem-ponte ("Pra fechar o orcamento, preciso de uns dados rapidinho..."). NAO repita essa mensagem-ponte. Va direto pra processar a resposta do cliente.');
  linhas.push('');

  // §3.2 Checklist
  linhas.push('## §3.2 Checklist de cadastro');
  linhas.push('1. **nome** (OBR) — nome completo do cliente (pelo menos 2 palavras)');
  linhas.push('2. **data_nascimento** (OBR) — formato aceitos: dd/mm/aaaa, dd-mm-aaaa, "12 de marco de 1995", aaaa-mm-dd. A tool `dados_coletados` normaliza pra ISO (YYYY-MM-DD) e valida idade.');
  linhas.push('3. **email** (OPC) — pode pular se cliente nao quiser dar');
  linhas.push('');
  linhas.push('Persistencia: chame `dados_coletados(conversa_id, campo, valor)` pra cada campo recebido. Cliente pode mandar 1 campo por mensagem ou todos juntos.');
  linhas.push('');

  // §3.3 Multi-info
  linhas.push('## §3.3 Multi-info');
  linhas.push('Se cliente mandar dados juntos (ex: "Maria Silva, 12/03/1995, maria@email.com"), persista TODOS via dados_coletados em sequencia no mesmo turno. Nao precisa pedir um por um.');
  linhas.push('');

  // §3.4 E-mail opcional
  linhas.push('## §3.4 E-mail opcional — como tratar');
  linhas.push('- Se cliente NAO mandou email junto com nome+data: pergunte UMA vez de forma neutra ("E o e-mail?").');
  linhas.push('- Se cliente disser "nao tenho", "passa", "sem email", "depois", "deixa pra la" ou similar: AGRADECA e siga sem email. NAO insista. NAO pergunte de novo.');
  linhas.push('- Se cliente mandar formato invalido (sem @, etc): aceite mesmo assim — `dados_coletados` valida; tatuador ve no orcamento.');
  linhas.push('- Voce NUNCA explica que email e opcional ate cliente perguntar/recusar. Se o cliente nao mandou, voce pergunta de boa.');
  linhas.push('');

  // §3.5 Validação data
  linhas.push('## §3.5 Validacao de data de nascimento');
  linhas.push('A tool `dados_coletados` calcula a idade automaticamente. Possivel retorno especial:');
  linhas.push('- `gatilho: "menor_idade"` — cliente declarou data que indica idade <18. NESSE CASO, voce envia 1 mensagem de despedida educada e PARA: "Pra clientes com menos de 18 anos o tatuador conversa direto com responsavel legal. Ja sinalizei pra ele." Ja ocorre handoff automatico — voce nao precisa chamar `acionar_handoff`.');
  linhas.push('- `gatilho: "data_invalida"` — formato nao reconhecido. Pergunte de novo gentilmente: "Nao consegui ler a data, pode mandar no formato dia/mes/ano? Tipo 12/03/1995"');
  linhas.push('');

  // §3.6 Encerramento da fase
  linhas.push('## §3.6 Encerramento (apos nome + data nasc OBR completos)');
  linhas.push('Quando os 2 OBR estao completos (`nome` e `data_nascimento` populados em `dados_cadastro`), chame `enviar_orcamento_tatuador(conversa_id)`. A tool:');
  linhas.push('1. Monta o orcamento formatado.');
  linhas.push('2. Envia mensagem Telegram pro tatuador com botoes (Fechar valor / Recusar).');
  linhas.push('3. Atualiza `estado_agente` pra `aguardando_tatuador`.');
  linhas.push('4. Retorna `orcid` pra log.');
  linhas.push('');
  linhas.push('Apos a tool retornar com sucesso, envie UMA mensagem final pro cliente:');
  linhas.push('"Anotei tudo! Vou passar pro tatuador avaliar. Em breve te volto com o valor"');
  linhas.push('');
  linhas.push('Apos esta mensagem, PARE. Nao chame mais tools. Nao espere resposta — voce vai sair da conversa nesse turno (estado_agente passa pra aguardando_tatuador).');
  linhas.push('');

  // §3.7 Casos especiais
  linhas.push('## §3.7 Casos especiais');
  linhas.push('- Cliente recusa dar nome ou data: tente reformular UMA vez ("Preciso so do nome completo e data de nascimento — sao dados que o tatuador precisa pra abrir tua ficha"). Se ainda recusar, chame `acionar_handoff(motivo="cliente_recusa_cadastro")`.');
  linhas.push('- Cliente da apelido em vez de nome completo (ex: "Lala", "Joao"): aceite como nome mesmo se for 1 palavra. NAO insista em "completo" — pode incomodar. Se a tool aceitar, segue.');
  linhas.push('- Cliente faz pergunta tecnica no meio do cadastro ("preciso de receita pra anestesia?"): responda brevemente e VOLTE pro cadastro: "Sobre isso quem fecha e o tatuador no dia. Voltando — qual o nome completo?"');

  return linhas.join('\n');
}
