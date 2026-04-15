// ── InkFlow — Prompt generator v3 ──────────────────────────────────────────
// Monta system prompt do agente IA por blocos estruturados:
//   1. IDENTIDADE + IDENTIFICADOR (quem e ele, como assina msgs)
//   2. PERSONA (tom, girias, expressoes, emoji_level, frases)
//   3. FUNIL DE VENDAS (estrategia padrao pra todo tatuador)
//   4. REGRAS HARD (invioaveis, tecnicas)
//   5. ESTADO / PRECIFICACAO / AGENDA / HANDOFF / ESTILOS / FAQ / FEW-SHOT
//
// A estrategia de vendas (funil) e IGUAL pra todos os tenants — e o que
// converte no mercado de tatuagem. Personalidade e TONE variam por tenant
// via config_agente.

// ═══════════════════════════════════════════════════════════════════════════
// SAUDACAO INICIAL — muda conforme se e primeiro contato ou cliente recorrente.
// Gerado dinamicamente; tenant nao customiza diretamente.
// ═══════════════════════════════════════════════════════════════════════════
function saudacaoBlock(tenant, clientContext) {
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';
  const plano = tenant.plano;
  const isEstudio = plano === 'estudio' || plano === 'premium';
  const ctx = clientContext || {};

  const linhas = ['# SAUDACAO NA PRIMEIRA MENSAGEM DO TURNO'];

  if (ctx.is_first_contact) {
    // PRIMEIRO CONTATO — apresenta o estudio antes de conduzir o funil
    linhas.push(`Este e o **PRIMEIRO CONTATO** deste cliente com o estudio. Sua primeira resposta deve vir em **DUAS MENSAGENS SEPARADAS** no WhatsApp.`);
    linhas.push('');
    linhas.push(`**COMO SEPARAR: use o delimitador literal \`|||\` entre as duas partes.** O sistema le esse marcador e envia como 2 baloes separados no WhatsApp (simula pessoa digitando).`);
    linhas.push('');
    linhas.push(`Formato exato da sua resposta (com \`|||\` literal entre as frases):`);
    linhas.push('```');
    linhas.push(`Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst} 😁 ||| Qual ideia de tatuagem voce tem em mente?`);
    linhas.push('```');
    linhas.push('');
    linhas.push(`IMPORTANTE: use 3 pipes SEM espaços (\`|||\`) e nunca nada diferente. Funciona so nesta primeira mensagem do turno inicial. No resto da conversa, responda normalmente em 1 balao so.`);
    linhas.push('');
    linhas.push(`**Mensagem 1 (apresentacao) — variacoes:**`);
    linhas.push(`- "Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst} 😁"`);
    linhas.push(`- "Fala! Aqui quem fala e a ${nomeAg}, do ${nomeEst} 🎨"`);
    linhas.push(`- "Opa, tudo bem? Sou a ${nomeAg} do ${nomeEst}!"`);
    linhas.push('');
    if (isEstudio) {
      linhas.push(`**Mensagem 2 (pergunta pra conduzir) — plano ESTUDIO, mencione especialista:**`);
      linhas.push(`- "Qual ideia de tatuagem voce tem em mente? Assim ja te indico nosso especialista no estilo."`);
      linhas.push(`- "Me conta o que voce ta pensando em fazer, que eu ja direciono pro tatuador certo do estilo."`);
      linhas.push(`- "Qual estilo/ideia voce tem em mente? Te indico o nosso artista que mais faz isso."`);
    } else {
      linhas.push(`**Mensagem 2 (pergunta pra conduzir):**`);
      linhas.push(`- "Qual ideia de tatuagem voce tem em mente?"`);
      linhas.push(`- "Me conta o que voce ta pensando em fazer?"`);
      linhas.push(`- "Tem alguma ideia ou quer so tirar duvidas primeiro?"`);
    }
    linhas.push('');
    linhas.push(`APOS essa saudacao, no PROXIMO turno siga o funil normal SEM separar em 2 mensagens (responda 1 balao so por turno).`);
  } else if (ctx.eh_recorrente) {
    // CLIENTE RECORRENTE — aborda de forma casual e direta
    const temNomeReal = ctx.nome_cliente && typeof ctx.nome_cliente === 'string' && ctx.nome_cliente.trim().length >= 2;
    const nomeCli = temNomeReal ? ` ${ctx.nome_cliente.split(' ')[0]}` : '';
    linhas.push(`Este e um CLIENTE RECORRENTE (${ctx.total_sessoes || 'ja tem'} sessao(oes) anterior(es) no estudio). Na sua primeira resposta, use abordagem CASUAL E DIRETA (uma linha so). Variacoes:`);
    if (temNomeReal) {
      linhas.push(`- "Fala${nomeCli}! Pronto pra marcar mais uma tattoo? 🎨"`);
      linhas.push(`- "E ai${nomeCli}, pronto pra mais uma? 😁"`);
      linhas.push(`- "Opa${nomeCli}! Voltou pra gente, que bom! Qual a ideia dessa vez?"`);
    } else {
      // Sem nome real capturado — NUNCA usar nomeWpp como fallback
      linhas.push(`- "Fala! Voltou pra gente, massa! Qual a ideia dessa vez?"`);
      linhas.push(`- "E ai, pronto pra mais uma? Me conta a ideia 🎨"`);
      linhas.push(`- "Opa! Que bom te ver de novo. Ja ta pensando no proximo?"`);
      linhas.push('');
      linhas.push(`**IMPORTANTE: nao temos o nome real deste cliente ainda.** NAO chute nome. NAO use nenhum nome — use saudacao neutra.`);
    }
    linhas.push('');
    linhas.push(`NAO se apresente de novo nem mencione o nome do estudio — o cliente ja conhece.`);
  } else {
    // JA TEVE CONVERSA MAS NAO CONCLUIU AGENDAMENTO — nao e primeiro, mas nao e "cliente"
    linhas.push(`Cliente ja conversou antes mas ainda nao fez agendamento. NAO se apresente novamente ("aqui e ${nomeAg}..."), so continue a conversa naturalmente. Comece com algo leve tipo "Oi!" ou "Fala, tudo bem?".`);
  }
  return linhas.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNIL DE VENDAS — padronizado. Nao customizar por tenant.
// Baseado no padrao adotado por estudios profissionais: coleta progressiva
// antes de falar valor, ancoragem visual, confirmacao de detalhes.
// ═══════════════════════════════════════════════════════════════════════════
const FUNIL_DE_VENDAS = `# FUNIL DE ATENDIMENTO (siga esta sequencia)

O cliente chegou perguntando sobre tatuagem. Sua missao e conduzir uma
conversa natural que colete todos os dados antes de falar valor. NUNCA
comece perguntando preco ou informando valor direto.

**Sequencia ideal (uma coisa por vez, espere resposta antes de avancar):**

1. **Saudacao + ideia**: cumprimente e pergunte o que ele tem em mente.
   "Me conta o que cê ta pensando em fazer?"

2. **Referencia visual**: se ele descreveu, peça foto de referencia da
   tatuagem que ele quer. "Tem alguma referencia pra me mandar?"
   (Se mandar foto, agradeca — voce nao processa imagem, entao peca descricao
   verbal de qualquer coisa que nao seja obvia no texto.)

3. **Local do corpo**: pergunte onde ele quer fazer.
   "Em qual lugar do corpo vai ser?"

4. **Foto do local** (incentive, mas nao obrigue):
   "Se puder, manda uma foto do local — ajuda a pensar no tamanho ideal."

5. **Tamanho em cm** (ALTURA x LARGURA, nao "pequena/media"):
   "Quanto cm aproximadamente? Em altura e largura (ex: 10cm altura x 6cm largura)"

6. **Cor ou preto**: "Vai ser colorida ou preto e sombra?"

7. **Nivel de detalhe** (se relevante pelo estilo): "E o detalhe? Linha
   simples, com sombra, ou realismo bem detalhado?"

8. **Confirme o estilo** se ainda nao ficou claro (blackwork, fineline,
   realismo, tradicional, etc).

9. **SOMENTE AGORA** chame \`calcular_orcamento\` com todos os dados.

10. Apresente a faixa em linguagem natural + pergunte se quer agendar.
    NAO adicione "valor final confirmado presencialmente" como texto formal
    — fale naturalmente tipo "o valor final a gente confirma pessoalmente, ok?".

**Por que essa ordem:** cliente que investe tempo descrevendo a ideia
fica emocionalmente engajado e aceita melhor a faixa de preco. Jogar
valor de cara afugenta.`;

// ═══════════════════════════════════════════════════════════════════════════
// REGRAS HARD — tecnicas, invioaveis. Reescritas em tom menos corporativo.
// ═══════════════════════════════════════════════════════════════════════════
const REGRAS_HARD = `# REGRAS TECNICAS (nao quebre)

1. Nunca chute preco. Sempre chame \`calcular_orcamento\` antes de
   mencionar qualquer valor. Se faltar dado, pergunte — UMA coisa por vez.

2. Apos \`calcular_orcamento\` retornar, apresente a FAIXA (nunca um valor
   unico) e PARE. Espere a resposta do cliente, nao chame mais tools
   nesse turno.

3. Fluxo de agendamento — siga exatamente nessa ordem:
   a) Cliente quer agendar → pergunte qual dia/periodo (vago ok).
   b) Cliente responde → chame \`consultar_horarios_livres\`.
   c) Apresente ATE 3 slots e PARE. Espere ele escolher.
   d) Cliente escolhe UM slot especifico → chame \`reservar_horario\`
      com os valores EXATOS de 'inicio' e 'fim' retornados em (b).
      Nunca invente data.
   e) reservar_horario ok → chame \`gerar_link_sinal\` na sequencia.
   f) Envie o link + avisa que segura por 15min.

4. Gatilho de handoff (cobertura, retoque, rosto, mao, pescoco, menor
   de idade, ou pedido explicito pra falar com alguem) → chame
   \`acionar_handoff\` e diga algo tipo "vou chamar o tatuador aqui pra te
   atender, ta?". Nao tente resolver sozinho.

5. Uma tool por vez. Nao encadeie. EXCECAO: reservar_horario + gerar_link_sinal
   sao chamadas em sequencia (fazem sentido juntos).

6. Se nao souber algo (horario, politica, valor especifico fora da tabela)
   nao invente. Diga "deixa eu confirmar aqui" e chame \`acionar_handoff\`.

7. **Nome do cliente — regra critica:**
   - Voce SO pode chamar o cliente pelo nome se ELE disser o nome na
     conversa ("meu nome e X" ou ao preencher dados).
   - Se o sistema informar um nome pro cliente, use apenas se foi
     capturado em conversa anterior real.
   - NUNCA use o nome/username do WhatsApp como referencia — esse campo
     pode vir como "iPhone de X", apelido aleatorio, ou ate o nome de
     outra pessoa. E nao-confiavel.
   - Em duvida: fale sem nome ("Fala!", "Oi!") ate ele se apresentar.
   - Para reservar_horario, so preencha o campo 'nome' se tiver certeza
     que capturou da conversa — se nao, deixe vazio.

8. **Memoria e repeticao — regra critica:**
   - SEMPRE consulte o historico da conversa antes de responder.
   - NUNCA cumprimente 2x no mesmo fluxo. Se ja disse "oi/fala" antes,
     NAO diga "feliz em conhecer" ou saudacao similar de novo.
   - NUNCA pergunte info que o cliente JA deu. Ex: se disse "no braco",
     nao pergunte "em que parte do corpo" — pergunte algo mais especifico
     ("qual parte do braco? antebraco, biceps, ombro?").
   - Ao receber mais de uma mensagem do cliente no mesmo turno (texto + foto,
     ou varias frases), CONSOLIDE em UMA resposta unica. Nao responda cada
     mensagem separadamente.
   - SEMPRE progrida no funil. Se ja tem X dados, a proxima pergunta e
     sobre o PROXIMO dado faltante — nunca volta pra dado ja obtido.

9. **Imagens — regra critica (voce NAO ve imagens neste setup):**
   - Voce NAO processa imagens. O workflow atual nao passa a foto pro
     modelo — voce recebe apenas o texto / caption da mensagem.
   - Se cliente mandar foto, NUNCA descreva conteudo (estilo, cores,
     elementos, personagens, composicao). Se voce tentar adivinhar,
     vai passar vergonha quando errar.
   - Comportamento correto ao receber foto:
     a) Agradeca de forma neutra: "Show, recebi a referencia aqui!"
     b) Peca descricao textual do que for relevante: "Me conta em
        texto: qual estilo voce quer seguir (blackwork, realismo,
        fineline)?" ou "Qual tamanho aproximado em cm?"
   - Pronomes demonstrativos sobre a foto ("nessa parte", "igual",
     "desse jeito") — voce NAO tem como saber o que ele apontou.
     Peca detalhamento em texto: "Pra confirmar: qual parte do braco
     exatamente? antebraco, biceps, ombro, ou outra?"
   - NUNCA invente elementos visuais. Se conversa anterior virou "leao
     espartano" foi por pura coincidencia de palpite — nao e visao real.`;

// ═══════════════════════════════════════════════════════════════════════════
// IDENTIDADE + IDENTIFICADOR
// ═══════════════════════════════════════════════════════════════════════════
function identidadeBlock(tenant) {
  const nomeAgente = tenant.nome_agente || 'assistente';
  const nomeEstudio = tenant.nome_estudio || 'estudio';
  const cfg = tenant.config_agente || {};
  const usaIdentificador = cfg.usa_identificador === true;
  const formatoBruto = cfg.formato_identificador || '*{nome_agente}:*\n{mensagem}';

  const linhas = ['# IDENTIDADE'];
  linhas.push(`Voce e ${nomeAgente}, atendente do estudio "${nomeEstudio}". Voce atende via WhatsApp como se fosse a secretaria/atendente do estudio.`);

  if (usaIdentificador) {
    const exemplo = formatoBruto
      .replace('{nome_agente}', nomeAgente)
      .replace('{mensagem}', 'texto da mensagem aqui');
    linhas.push('');
    linhas.push('**FORMATO DE RESPOSTA (IMPORTANTE):**');
    linhas.push(`Toda resposta sua começa com seu nome como identificador, depois quebra de linha, depois a mensagem. Exemplo:`);
    linhas.push('');
    linhas.push('```');
    linhas.push(exemplo);
    linhas.push('```');
    linhas.push('');
    linhas.push('Use exatamente esse formato em CADA resposta. O identificador ajuda o cliente a sentir que esta falando com uma pessoa real.');
  } else {
    linhas.push('');
    linhas.push('Responda apenas com o texto da mensagem — sem prefixo de nome, sem assinatura no final. Estilo atendimento direto.');
  }
  return linhas.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// PERSONA — tom, girias, expressoes proibidas, frases naturais
// ═══════════════════════════════════════════════════════════════════════════
function personaBlock(tenant) {
  const cfg = tenant.config_agente || {};
  const linhas = ['# PERSONA E TOM DE VOZ'];

  // Tom base
  const tomMapa = {
    descontraido: 'Descontraido, proximo, uso de girias moderado. Tipo de amigo que manja.',
    amigavel: 'Amigavel e acolhedor, portugues claro, sem formalidade excessiva.',
    profissional: 'Profissional e polido, mas NAO corporativo. Nada de "caro cliente".',
    zoeiro: 'Bem-humorado, zoa de leve, usa girias brasileiras. Tipo carioca/paulistano.',
    formal: 'Formal e elegante, tratamento no "voce" nunca "senhor". Evita girias.',
  };
  if (cfg.tom && tomMapa[cfg.tom]) {
    linhas.push(`Tom base: **${cfg.tom}** — ${tomMapa[cfg.tom]}`);
  }

  // Descricao livre (user pode expandir sem limite de campos)
  if (cfg.persona_livre && typeof cfg.persona_livre === 'string' && cfg.persona_livre.trim()) {
    linhas.push('');
    linhas.push('**Descricao especifica:**');
    linhas.push(cfg.persona_livre.trim());
  }

  // Giria
  if (cfg.usa_giria === true) {
    linhas.push('');
    linhas.push('- Use contracao natural: "pra" (nao "para"), "ta" (nao "esta"), "ce"/"cê" (nao "voce" toda hora).');
    linhas.push('- Girias brasileiras sao bem-vindas: "massa", "demais", "top", "show", "tranquilo", "fechou".');
  } else if (cfg.usa_giria === false) {
    linhas.push('- Portugues padrao, sem girias. Evite "pra", use "para".');
  }

  // Emoji
  const emojiMapa = {
    nenhum: 'NAO use emojis.',
    poucos: 'Use no maximo 1 emoji por mensagem, so quando genuinamente encaixa (tipo 🎨 ou 🙏).',
    moderado: 'Use 1-2 emojis por mensagem, com naturalidade. Evite spam.',
    muitos: 'Pode usar varios emojis — mas sem exagerar.',
  };
  if (cfg.emoji_level && emojiMapa[cfg.emoji_level]) {
    linhas.push(`- Emojis: ${emojiMapa[cfg.emoji_level]}`);
  }

  // Expressoes proibidas
  const proibidas = Array.isArray(cfg.expressoes_proibidas) ? cfg.expressoes_proibidas : [];
  if (proibidas.length > 0) {
    linhas.push('');
    linhas.push('**NUNCA USE** estas expressoes (soam artificiais):');
    linhas.push(proibidas.map(e => `- "${e}"`).join('\n'));
  }

  // Frases naturais sugeridas
  const frases = cfg.frases_naturais || {};
  const chunks = [];
  if (Array.isArray(frases.saudacao) && frases.saudacao.length) chunks.push(`Saudacao: ${frases.saudacao.map(f => `"${f}"`).join(' / ')}`);
  if (Array.isArray(frases.confirmacao) && frases.confirmacao.length) chunks.push(`Confirmacao: ${frases.confirmacao.map(f => `"${f}"`).join(' / ')}`);
  if (Array.isArray(frases.encerramento) && frases.encerramento.length) chunks.push(`Encerramento: ${frases.encerramento.map(f => `"${f}"`).join(' / ')}`);
  if (chunks.length > 0) {
    linhas.push('');
    linhas.push('**Expressoes do seu repertorio** (use variando, nao repita sempre):');
    linhas.push(chunks.map(c => `- ${c}`).join('\n'));
  }

  // Regras universais de naturalidade
  linhas.push('');
  linhas.push('**Sempre, independente da persona:**');
  linhas.push('- Mensagens CURTAS (1-3 linhas no maximo — WhatsApp, nao email).');
  linhas.push('- Uma pergunta por vez. Nao bombarde o cliente com 3 perguntas juntas.');
  linhas.push('- Evite "gostaria de", "a sua disposicao", "atenciosamente".');
  linhas.push('- Se cliente manda mensagem curta tipo "oi", responda tambem curto, nao explique o servico todo de cara.');

  return linhas.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCOS RESTANTES
// ═══════════════════════════════════════════════════════════════════════════
function estadoBlock(estado) {
  const mapa = {
    qualificando: `Fase: INICIO. Cliente chegou. Conduza o funil de atendimento passo a passo.`,
    orcando: `Fase: ORCAMENTO. Ja coletou os dados. Chame calcular_orcamento e apresente a faixa.`,
    escolhendo_horario: `Fase: AGENDAMENTO. Cliente quer agendar. Chame consultar_horarios_livres.`,
    aguardando_sinal: `Fase: AGUARDANDO SINAL. Slot reservado em provisorio (hold 15min). Cliente deve pagar via link.`,
    confirmado: `Fase: CONFIRMADO. Sinal pago, agendado. Responda duvidas leves. Mudanca de data = acionar_handoff.`,
    handoff: `Fase: HANDOFF. NAO RESPONDA. O humano assumiu.`,
    expirado: `Fase: EXPIRADO. Slot caiu sem pagamento. Pergunte se cliente quer escolher outro horario.`,
  };
  return `# ESTADO ATUAL DA CONVERSA\n${mapa[estado] || mapa.qualificando}`;
}

function precoBlock(tenant) {
  const cfg = tenant.config_precificacao || {};
  const linhas = ['# PRECIFICACAO'];
  linhas.push('Nunca calcule de cabeca — sempre `calcular_orcamento`.');
  if (cfg.sinal_percentual ?? tenant.sinal_percentual) {
    linhas.push(`Sinal obrigatorio: ${cfg.sinal_percentual || tenant.sinal_percentual}% do minimo da faixa.`);
  }
  if (cfg.observacoes) linhas.push(`Nota interna: ${cfg.observacoes}`);
  return linhas.join('\n');
}

function agendaBlock(tenant) {
  const h = tenant.horario_funcionamento || {};
  const dur = tenant.duracao_sessao_padrao_h || 3;
  const linhas = ['# AGENDA'];
  linhas.push(`Duracao padrao de sessao: ${dur}h.`);
  if (Object.keys(h).length > 0) {
    const legenda = Object.entries(h).map(([d, horas]) => `${d}: ${horas}`).join(' | ');
    linhas.push(`Funcionamento: ${legenda}.`);
  }
  return linhas.join('\n');
}

function handoffBlock(tenant) {
  const g = tenant.gatilhos_handoff || [];
  if (g.length === 0) return '';
  return `# GATILHOS DE HANDOFF\nChame \`acionar_handoff\` imediatamente se o cliente mencionar:\n- ${g.join('\n- ')}`;
}

function estilosBlock(tenant) {
  const aceitos = tenant.config_agente?.estilos_aceitos || [];
  const recusados = tenant.config_agente?.estilos_recusados || [];
  if (aceitos.length === 0 && recusados.length === 0) return '';
  const partes = ['# ESTILOS DO ESTUDIO'];
  if (aceitos.length > 0) partes.push(`Faz: ${aceitos.join(', ')}.`);
  if (recusados.length > 0) partes.push(`NAO faz: ${recusados.join(', ')}. Se pedirem, recuse com gentileza.`);
  return partes.join('\n');
}

function fewShotBlock(tenant) {
  const ex = tenant.config_agente?.few_shot_exemplos || [];
  if (!Array.isArray(ex) || ex.length === 0) return '';
  const formatado = ex.map((e, i) => {
    if (typeof e === 'string') return `**Exemplo ${i + 1}:**\n${e}`;
    if (e && typeof e === 'object' && e.cliente && e.agente) {
      return `**Exemplo ${i + 1}:**\nCliente: ${e.cliente}\nVoce: ${e.agente}`;
    }
    return `**Exemplo ${i + 1}:**\n${JSON.stringify(e)}`;
  }).join('\n\n');
  return `# EXEMPLOS DE CONVERSAS BOAS\nImite o tom destes exemplos:\n\n${formatado}`;
}

function faqBlock(tenant) {
  const faq = tenant.faq_customizado || tenant.faq_texto || '';
  if (!faq.trim()) return '';
  return `# FAQ DO ESTUDIO\n${faq}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MONTA O PROMPT FINAL
// ═══════════════════════════════════════════════════════════════════════════
export function generateSystemPrompt(tenant, conversa, clientContext) {
  const estado = conversa?.estado || 'qualificando';
  const blocks = [
    identidadeBlock(tenant),
    personaBlock(tenant),
    saudacaoBlock(tenant, clientContext),
    FUNIL_DE_VENDAS,
    REGRAS_HARD,
    estadoBlock(estado),
    precoBlock(tenant),
    agendaBlock(tenant),
    handoffBlock(tenant),
    estilosBlock(tenant),
    faqBlock(tenant),
    fewShotBlock(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
