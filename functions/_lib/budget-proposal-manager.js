export function fmtBRLValue(valor) {
  if (valor === null || valor === undefined) return '?';
  const n = Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace('.', ',');
}

export function localComPreposicaoBudget(local) {
  const s = String(local || '').trim();
  if (!s) return '';
  const primeira = s.toLowerCase().split(/\s+/)[0];
  if (['perna', 'coxa', 'panturrilha', 'costela', 'mao', 'mão', 'nuca', 'barriga'].includes(primeira)) return `na ${s}`;
  if (['costas', 'costelas'].includes(primeira)) return `nas ${s}`;
  if (['bracos', 'braços', 'dedos', 'pes', 'pés'].includes(primeira)) return `nos ${s}`;
  return `no ${s}`;
}

export function activeBudgetItems(dados = {}) {
  const items = Array.isArray(dados.budget_items) ? dados.budget_items : [];
  return items.filter(item => item && item.status !== 'replaced' && item.status !== 'cancelled');
}

export function hasMultiBudgetItems(dados = {}) {
  return activeBudgetItems(dados).length > 1;
}

export function describeBudgetItem(item = {}) {
  const descricao = String(item.descricao_tattoo || item.descricao_curta || 'tattoo').trim();
  const local = localComPreposicaoBudget(item.local_corpo);
  return local ? `${descricao} ${local}` : descricao;
}

function escapeTelegramMarkdown(s) {
  return String(s ?? '').replace(/[_*`[]/g, m => `\\${m}`);
}

function parseMoney(raw) {
  const cleaned = String(raw || '').replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseBudgetItemValues(text, items = []) {
  const active = Array.isArray(items) ? items : [];
  const valuesByIndex = new Map();
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const m = line.match(/^(\d+)\s*[\).:\-]?\s*(?:r\$\s*)?([\d.,]+)\b/i);
    if (!m) continue;
    const index = Number(m[1]);
    const valor = parseMoney(m[2]);
    if (!Number.isInteger(index) || index < 1 || index > active.length || valor === null) continue;
    valuesByIndex.set(index - 1, valor);
  }

  const priced_items = active.map((item, index) => ({
    item_id: item.item_id || `item_${index + 1}`,
    index: index + 1,
    valor: valuesByIndex.get(index) ?? null,
    valor_text: valuesByIndex.has(index) ? `R$ ${fmtBRLValue(valuesByIndex.get(index))}` : null,
  }));
  const missing = priced_items.filter(item => item.valor == null).map(item => item.index);
  const total = priced_items.reduce((sum, item) => sum + (item.valor || 0), 0);

  return {
    ok: missing.length === 0 && active.length > 1,
    priced_items,
    missing,
    total,
    total_text: `R$ ${fmtBRLValue(total)}`,
  };
}

export function applyBudgetItemValues(dados = {}, parsed = {}) {
  const active = activeBudgetItems(dados);
  const byId = new Map((parsed.priced_items || []).map(item => [item.item_id, item]));
  const budget_items = (Array.isArray(dados.budget_items) ? dados.budget_items : []).map((item, index) => {
    const itemId = item?.item_id || `item_${index + 1}`;
    const priced = byId.get(itemId);
    if (!priced) return item;
    return {
      ...item,
      proposal: {
        status: 'priced',
        valor: priced.valor,
        valor_text: priced.valor_text,
        priced_at: new Date().toISOString(),
      },
    };
  });
  return {
    ...dados,
    budget_items,
    proposal_summary: {
      type: active.length > 1 ? 'multi_budget' : 'single_budget',
      status: 'ready_to_send',
      total: parsed.total,
      total_text: parsed.total_text,
      sent_to_client_at: null,
    },
  };
}

export function buildMultiBudgetValuePrompt(dados = {}, orcid) {
  const lines = ['Manda os valores por item:', ''];
  activeBudgetItems(dados).forEach((item, index) => {
    lines.push(`${index + 1}. ${escapeTelegramMarkdown(describeBudgetItem(item))}`);
  });
  lines.push('', 'Exemplo:', '1 200', '2 400', '', `ref: \`${orcid}\``);
  return lines.join('\n');
}

export function composeMultiBudgetProposal(conv = {}) {
  const dados = conv.dados_coletados || {};
  const items = activeBudgetItems(dados);
  const pricedItems = items.filter(item => item?.proposal?.status === 'priced' && item.proposal.valor != null);
  if (items.length < 2 || pricedItems.length !== items.length) return null;

  const nome = String(conv.dados_cadastro?.nome || '').trim().split(/\s+/)[0] || null;
  const abertura = nome ? `Fala ${nome}, tudo bem?` : 'Fala, tudo bem?';
  const intro = `${abertura} O tatuador acabou de me passar o orçamento das ${items.length} tattoos que voce pediu.`;
  const linhasValores = items.map((item, index) => {
    const desc = describeBudgetItem(item);
    const valor = item.proposal.valor_text || `R$ ${fmtBRLValue(item.proposal.valor)}`;
    const prefix = index === 0 ? 'A' : 'Ja a';
    return `${prefix} ${desc} ficaria por ${valor}.`;
  });
  return [intro, ...linhasValores, 'Quer que eu veja um horario pra gente agendar?'].join('\n');
}
