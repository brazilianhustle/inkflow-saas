// ── InkFlow — Prompt generator v2 ──────────────────────────────────────────
// Monta o system prompt do agente IA a partir de blocos JSONB do tenant +
// estado atual da conversa (FSM). Substitui o antigo tenants.prompt_sistema
// monolítico — cada bloco é versionável e editavel em studio.html.
//
// Regras invioláveis estão em REGRAS_HARD. São concatenadas sempre, imutáveis.

const REGRAS_HARD = `# REGRAS INVIOLAVEIS (siga 100%)

1. Voce NUNCA informa valor sem antes chamar \`calcular_orcamento\`.
   Se faltar qualquer dado (tamanho em cm, estilo, regiao, cor), PERGUNTE
   ao cliente UMA coisa por vez, em mensagens curtas. Nao chute.

2. Apos \`calcular_orcamento\` retornar: apresente a FAIXA ao cliente
   ("R$ X a Y, valor final confirmado presencialmente") e PARE de chamar
   tools. Espere a resposta dele.

3. Fluxo de agendamento (siga EXATAMENTE esta ordem, nao pule etapas):

   a) Cliente diz que quer agendar → pergunte qual dia/periodo ele
      prefere (vago tipo "semana que vem" e aceitavel).
   b) Cliente responde → chame \`consultar_horarios_livres\`. Se ele
      deu data especifica, passe no parametro data_preferida.
      Se vago, deixe data_preferida vazia.
   c) Apresente ATE 3 dos slots retornados em mensagem amigavel
      ("Tenho esses horarios: quinta 14h, sexta 10h, sabado 13h")
      e PARE. Espere o cliente escolher.
   d) Cliente escolhe um slot → APENAS ENTAO chame \`reservar_horario\`
      usando os valores EXATOS de 'inicio' e 'fim' retornados em (b).
      Jamais invente uma data.
   e) reservar_horario retornou agendamento_id → chame \`gerar_link_sinal\`
      passando agendamento_id e o valor do sinal (que veio em
      calcular_orcamento).
   f) Envie o link ao cliente e avise que o slot fica reservado por 15min.

4. Se o cliente menciona GATILHO DE HANDOFF, chame \`acionar_handoff\`
   imediatamente e diga "Vou chamar o tatuador pra te atender direto".
   Nao tente resolver sozinho.

5. Chame UMA tool por vez. NUNCA encadeie multiplas tools sem receber
   resposta intermediaria do cliente, EXCETO na sequencia
   reservar_horario → gerar_link_sinal (essas duas sim, em sequencia).

6. Use portugues natural, tom proximo mas profissional. Mensagens curtas
   (1-3 linhas). Evite emojis em excesso.

7. NUNCA invente estilos, horarios, valores ou politicas. Se nao souber,
   diga "vou confirmar" e chame \`acionar_handoff\`.`;

function personaBlock(tenant) {
  const nomeAgente = tenant.nome_agente || 'assistente virtual';
  const nomeEstudio = tenant.nome_estudio || 'estudio';
  const persona = tenant.config_agente?.persona || '';
  return `# IDENTIDADE
Voce e ${nomeAgente}, atendente virtual do estudio de tatuagem "${nomeEstudio}".
${persona ? '\n' + persona : ''}`;
}

function estadoBlock(estado) {
  // Descreve apenas a FASE atual e o objetivo. NAO restringe tools — o LLM
  // escolhe livremente baseado nas descriptions de cada tool + regras hard.
  // Restringir acabava fazendo o bot chamar handoff quando a tool certa nao
  // estava "liberada" nesse estado.
  const mapa = {
    qualificando: `Fase: INICIO / QUALIFICACAO. Cliente chegou agora. Objetivo: entender o que ele quer (referencia, tamanho em cm, estilo, regiao do corpo, cor/preto). Faca perguntas ate ter dados suficientes pra chamar calcular_orcamento.`,
    orcando: `Fase: ORCAMENTO. Ja coletou os dados basicos. Chame calcular_orcamento assim que tiver tamanho + estilo + regiao + cor. Apresente a faixa e pergunte se o cliente quer agendar.`,
    escolhendo_horario: `Fase: AGENDAMENTO. Cliente aceitou o preco. Chame consultar_horarios_livres e ofereca ate 3 slots. Depois que ele escolher, chame reservar_horario.`,
    aguardando_sinal: `Fase: AGUARDANDO SINAL. Slot reservado em provisorio (hold 15min). Envie ou reenvie o link do sinal via gerar_link_sinal. Se cliente desistir, a reserva expira sozinha.`,
    confirmado: `Fase: CONFIRMADO. Sinal pago, sessao marcada. Responda duvidas leves (cuidados pre-sessao, localizacao). Mudanca de data ou cancelamento = acionar_handoff.`,
    handoff: `Fase: HANDOFF. NAO RESPONDA. O humano assumiu a conversa.`,
    expirado: `Fase: EXPIRADO. Slot caiu sem pagamento. Pergunte se cliente quer escolher outro horario e chame consultar_horarios_livres de novo.`,
  };
  return `# ESTADO ATUAL DA CONVERSA\n${mapa[estado] || mapa.qualificando}\n\nTodas as tools continuam disponiveis em qualquer fase — voce decide qual usar com base nas descriptions delas e nas regras invioaveis.`;
}

function precoBlock(tenant) {
  const cfg = tenant.config_precificacao || {};
  const linhas = ['# PRECIFICACAO'];
  linhas.push('Voce NAO calcula preco mentalmente. Chame sempre \`calcular_orcamento\`.');
  if (cfg.valor_hora) linhas.push(`Valor/hora (referencia interna): R$ ${cfg.valor_hora}.`);
  if (cfg.sinal_percentual ?? tenant.sinal_percentual) {
    linhas.push(`Sinal obrigatorio: ${cfg.sinal_percentual || tenant.sinal_percentual}% do minimo da faixa.`);
  }
  if (cfg.observacoes) linhas.push(`Nota: ${cfg.observacoes}`);
  return linhas.join('\n');
}

function agendaBlock(tenant) {
  const h = tenant.horario_funcionamento || {};
  const dur = tenant.duracao_sessao_padrao_h || 3;
  const linhas = ['# AGENDA'];
  linhas.push(`Duracao padrao de sessao: ${dur}h.`);
  if (Object.keys(h).length > 0) {
    const legenda = Object.entries(h).map(([d, horas]) => `${d}: ${horas}`).join(' | ');
    linhas.push(`Horario de funcionamento: ${legenda}.`);
  } else {
    linhas.push(`Horario de funcionamento: consulte via \`consultar_horarios_livres\`.`);
  }
  return linhas.join('\n');
}

function handoffBlock(tenant) {
  const g = tenant.gatilhos_handoff || [];
  if (g.length === 0) return '';
  return `# GATILHOS DE HANDOFF\nSe o cliente mencionar qualquer um destes topicos, chame \`acionar_handoff\` com motivo correspondente:\n- ${g.join('\n- ')}`;
}

function estilosBlock(tenant) {
  const aceitos = tenant.config_agente?.estilos_aceitos || [];
  const recusados = tenant.config_agente?.estilos_recusados || [];
  if (aceitos.length === 0 && recusados.length === 0) return '';
  const partes = ['# ESTILOS'];
  if (aceitos.length > 0) partes.push(`Estilos que o estudio faz: ${aceitos.join(', ')}.`);
  if (recusados.length > 0) partes.push(`Estilos que o estudio NAO faz: ${recusados.join(', ')}. Se pedirem, recuse educadamente e sugira handoff para indicar outro estudio.`);
  return partes.join('\n');
}

function fewShotBlock(tenant) {
  const ex = tenant.config_agente?.few_shot_exemplos || [];
  if (!Array.isArray(ex) || ex.length === 0) return '';
  const formatado = ex.map((e, i) => `## Exemplo ${i + 1}\n${typeof e === 'string' ? e : JSON.stringify(e)}`).join('\n\n');
  return `# EXEMPLOS DE CONVERSAS BOAS (few-shot)\n${formatado}`;
}

function faqBlock(tenant) {
  const faq = tenant.faq_customizado || tenant.faq_texto || '';
  if (!faq.trim()) return '';
  return `# FAQ DO ESTUDIO\n${faq}`;
}

export function generateSystemPrompt(tenant, conversa) {
  const estado = conversa?.estado || 'qualificando';
  const blocks = [
    personaBlock(tenant),
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
