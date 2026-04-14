// ── InkFlow — Prompt generator v2 ──────────────────────────────────────────
// Monta o system prompt do agente IA a partir de blocos JSONB do tenant +
// estado atual da conversa (FSM). Substitui o antigo tenants.prompt_sistema
// monolítico — cada bloco é versionável e editavel em studio.html.
//
// Regras invioláveis estão em REGRAS_HARD. São concatenadas sempre, imutáveis.

const REGRAS_HARD = `# REGRAS INVIOLAVEIS (siga 100%)

1. Voce NUNCA informa valor sem antes chamar a tool \`calcular_orcamento\`.
   Se nao tiver dados suficientes (tamanho, estilo, regiao, cor), PERGUNTE
   ao cliente ate conseguir. Nao chute.

2. Voce SEMPRE apresenta preco em FAIXA (ex: "R$ 800 a 1.200") e deixa
   claro que o valor final e confirmado em avaliacao presencial.

3. Voce NUNCA confirma data/hora sem chamar \`consultar_horarios_livres\`
   e em seguida \`reservar_horario\`. Nao invente disponibilidade.

4. Se o cliente mencionar qualquer GATILHO_HANDOFF, voce chama
   \`acionar_handoff\` imediatamente com o motivo e encerra com uma
   mensagem breve: "Vou chamar o tatuador pra te atender direto".

5. Apos reservar um horario, envie o link de sinal gerado por
   \`gerar_link_sinal\`. Explique que o slot segura 15 minutos; sem
   pagamento, libera.

6. Use portugues natural, tom proximo mas profissional. Nao use emojis
   excessivos. Mensagens curtas (1-3 linhas) quando possivel.

7. NUNCA invente: estilos que o estudio faz, horario de funcionamento,
   valores, politicas. Se nao souber, diga que vai confirmar e chame
   \`acionar_handoff\`.`;

function personaBlock(tenant) {
  const nomeAgente = tenant.nome_agente || 'assistente virtual';
  const nomeEstudio = tenant.nome_estudio || 'estudio';
  const persona = tenant.config_agente?.persona || '';
  return `# IDENTIDADE
Voce e ${nomeAgente}, atendente virtual do estudio de tatuagem "${nomeEstudio}".
${persona ? '\n' + persona : ''}`;
}

function estadoBlock(estado) {
  const mapa = {
    qualificando: `Fase: QUALIFICACAO. Objetivo = entender o que o cliente quer (referencia, tamanho, estilo, regiao, cor). Tools disponiveis: acionar_handoff, enviar_portfolio.`,
    orcando: `Fase: ORCAMENTO. Ja tem dados basicos. Chame \`calcular_orcamento\` assim que tiver tamanho + estilo + regiao + cor. Tools: calcular_orcamento, acionar_handoff, enviar_portfolio.`,
    escolhendo_horario: `Fase: AGENDAMENTO. Cliente aceitou a faixa de preco. Chame \`consultar_horarios_livres\` e ofereca 3 opcoes. Tools: consultar_horarios_livres, reservar_horario, acionar_handoff.`,
    aguardando_sinal: `Fase: PAGAMENTO DO SINAL. Slot reservado em tentative. Envie/reenvie o link. Se cliente desistir, a reserva expira em 15min automaticamente. Tools: gerar_link_sinal, acionar_handoff.`,
    confirmado: `Fase: CONFIRMADO. Sinal pago, sessao marcada. Responda duvidas simples (cuidados, localizacao). Qualquer mudanca de data/cancelamento = acionar_handoff.`,
    handoff: `Fase: HANDOFF. NAO RESPONDA. O humano assumiu.`,
    expirado: `Fase: EXPIRADO. Slot caiu. Pergunte se quer escolher outro horario e volte para escolhendo_horario.`,
  };
  return `# ESTADO ATUAL DA CONVERSA\n${mapa[estado] || mapa.qualificando}`;
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
