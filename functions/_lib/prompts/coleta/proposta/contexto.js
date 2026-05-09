// functions/_lib/prompts/coleta/proposta/contexto.js
// Injeta variaveis dinamicas no prompt: cliente_nome, valor_proposto,
// decisao_desconto, sinal_percentual, e horarios_livres OR proposta_status.
export function contextoProposta(tenant, conversa, ctx) {
  const cliente_nome = conversa?.dados_cadastro?.nome || conversa?.nome || 'sem nome';
  const estado_atual = conversa?.estado_agente || 'propondo_valor';
  const valor_proposto = ctx?.valor_proposto ?? conversa?.valor_proposto ?? '?';
  const decisao_desconto = ctx?.decisao_desconto ?? 'nenhuma';
  // Fallback chain dupla — config_precificacao.sinal_percentual (jsonb)
  // OR tenant.sinal_percentual (legacy column) OR 30 default.
  // Alinha com _shared/contexto.js:4 pattern.
  const sinal_pct = tenant?.config_precificacao?.sinal_percentual ?? tenant?.sinal_percentual ?? 30;
  const portfolio_status = ctx?.portfolio_disponivel ? 'disponivel' : 'nao cadastrado';

  let blocoEstado = '';
  if (estado_atual === 'propondo_valor' || estado_atual === 'escolhendo_horario') {
    const slots = Array.isArray(ctx?.horarios_livres) ? ctx.horarios_livres : [];
    if (slots.length === 0) {
      blocoEstado = 'Horarios livres disponiveis: nenhum no momento.';
    } else {
      const linhas = slots.map(s => `- ${s.legenda} — slot_inicio=${s.inicio}, slot_fim=${s.fim}`).join('\n');
      blocoEstado = `Horarios livres disponiveis (use SOMENTE estes, formato ISO):\n${linhas}`;
    }
  } else if (estado_atual === 'aguardando_sinal') {
    const status = ctx?.proposta_status ?? 'desconhecido';
    blocoEstado = `Status da proposta atual: ${status}`;
  }

  return `# §1 CONTEXTO

Cliente: ${cliente_nome}
Estado atual: ${estado_atual}
Valor proposto: R$ ${valor_proposto}
Decisao desconto previa: ${decisao_desconto}
Sinal percentual configurado: ${sinal_pct}%
Portfolio: ${portfolio_status}

${blocoEstado}`;
}
