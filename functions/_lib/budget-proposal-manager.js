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

function buildFixedProposal(valor) {
  return {
    status: 'priced',
    pricing_mode: 'fixed_total',
    valor,
    valor_text: `R$ ${fmtBRLValue(valor)}`,
    total_amount: valor,
    total_text: `R$ ${fmtBRLValue(valor)}`,
  };
}

function buildSessionProposal(sessions_count, amount_per_session) {
  const total = sessions_count * amount_per_session;
  return {
    status: 'priced',
    pricing_mode: 'per_session',
    valor: total,
    valor_text: `R$ ${fmtBRLValue(total)}`,
    sessions_count,
    amount_per_session,
    amount_per_session_text: `R$ ${fmtBRLValue(amount_per_session)}`,
    total_amount: total,
    total_text: `R$ ${fmtBRLValue(total)}`,
  };
}

export function parseBudgetProposalValue(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const sessionPatterns = [
    /(\d+)\s*(?:x|sessoes|sessao|sess|parcelas?)\D{0,30}(?:r\$\s*)?([\d.,]+)/i,
    /(?:sessoes|sessao|sess)\D{0,20}(\d+)\D{0,30}(?:valor|cada|por|de)?\D{0,20}(?:r\$\s*)?([\d.,]+)/i,
    /(?:r\$\s*)?([\d.,]+)\D{0,20}(?:por|cada)\D{0,20}(\d+)\s*(?:sessoes|sessao|sess)/i,
  ];

  for (const pattern of sessionPatterns) {
    const m = normalized.match(pattern);
    if (!m) continue;
    let sessions = Number(m[1]);
    let amount = parseMoney(m[2]);
    if (pattern === sessionPatterns[2]) {
      sessions = Number(m[2]);
      amount = parseMoney(m[1]);
    }
    if (Number.isInteger(sessions) && sessions > 0 && amount != null) {
      return buildSessionProposal(sessions, amount);
    }
  }

  const fixedMatch = normalized.match(/(?:total|fechado|valor)?\D*(?:r\$\s*)?([\d.,]+)/i);
  const valor = fixedMatch ? parseMoney(fixedMatch[1]) : null;
  return valor != null ? buildFixedProposal(valor) : null;
}

function extractIndexedSegments(text, totalItems) {
  const raw = String(text || '');
  if (/\r?\n/.test(raw)) {
    const lineSegments = raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const m = line.match(/^(\d+)\s*[\).:\-]?\s*(.+)$/);
        if (!m) return null;
        const index = Number(m[1]);
        if (!Number.isInteger(index) || index < 1 || index > totalItems) return null;
        return { index, text: m[2].trim() };
      })
      .filter(Boolean);

    if (lineSegments.length > 0) return lineSegments;
  }

  const matches = [...raw.matchAll(/(?:^|\s|\n)(\d+)\s*[\).:\-]?\s*/g)]
    .filter(m => {
      const index = Number(m[1]);
      return Number.isInteger(index) && index >= 1 && index <= totalItems;
    });

  if (matches.length === 0) return [];

  return matches.map((m, pos) => {
    const index = Number(m[1]);
    const start = m.index + m[0].length;
    const end = pos + 1 < matches.length ? matches[pos + 1].index : raw.length;
    return { index, text: raw.slice(start, end).trim() };
  }).filter(seg => seg.text);
}

export function parseBudgetItemValues(text, items = []) {
  const active = Array.isArray(items) ? items : [];
  const valuesByIndex = new Map();

  for (const segment of extractIndexedSegments(text, active.length)) {
    const proposal = parseBudgetProposalValue(segment.text);
    if (!proposal) continue;
    valuesByIndex.set(segment.index - 1, proposal);
  }

  const priced_items = active.map((item, index) => ({
    item_id: item.item_id || `item_${index + 1}`,
    index: index + 1,
    ...(valuesByIndex.get(index) || {
      pricing_mode: null,
      valor: null,
      valor_text: null,
      total_amount: null,
      total_text: null,
    }),
  }));
  const missing = priced_items.filter(item => item.valor == null).map(item => item.index);
  const total = priced_items.reduce((sum, item) => sum + (item.total_amount || item.valor || 0), 0);

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
        ...priced,
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

export function applySingleBudgetValue(dados = {}, parsed = {}) {
  return {
    ...dados,
    proposal_summary: {
      type: 'single_budget',
      status: 'ready_to_send',
      pricing_mode: parsed.pricing_mode || 'fixed_total',
      valor: parsed.valor,
      valor_text: parsed.valor_text,
      total: parsed.total_amount || parsed.valor,
      total_text: parsed.total_text || parsed.valor_text,
      sessions_count: parsed.sessions_count || null,
      amount_per_session: parsed.amount_per_session || null,
      amount_per_session_text: parsed.amount_per_session_text || null,
      sent_to_client_at: null,
    },
  };
}

export function buildMultiBudgetValuePrompt(dados = {}, orcid) {
  const lines = ['Manda os valores por item:', ''];
  activeBudgetItems(dados).forEach((item, index) => {
    lines.push(`${index + 1}. ${escapeTelegramMarkdown(describeBudgetItem(item))}`);
  });
  lines.push('', 'Valor fechado:', '1 200', '2 400', '', 'Por sessoes:', '1 2 sessoes 500', '2 total 400', '', `ref: \`${orcid}\``);
  return lines.join('\n');
}

function composeProposalLine(item, index = 0) {
  const proposal = item?.proposal || item;
  const desc = describeBudgetItem(item);
  const prefix = index === 0 ? 'A ideia de' : 'Ja a ideia de';
  if (proposal.pricing_mode === 'per_session') {
    const n = proposal.sessions_count;
    const plural = n === 1 ? 'sessao' : 'sessoes';
    const perSession = proposal.amount_per_session_text || `R$ ${fmtBRLValue(proposal.amount_per_session)}`;
    const total = proposal.total_text || proposal.valor_text || `R$ ${fmtBRLValue(proposal.total_amount || proposal.valor)}`;
    return `${prefix} ${desc} ficaria em ${n} ${plural} de ${perSession}, totalizando ${total}.`;
  }
  const valor = proposal.valor_text || `R$ ${fmtBRLValue(proposal.valor)}`;
  return `${prefix} ${desc} ficaria por ${valor}.`;
}

export function composeSingleBudgetProposal(conv = {}, valorFallback = null) {
  const dados = conv.dados_coletados || {};
  const summary = dados.proposal_summary || {};
  const nome = String(conv.dados_cadastro?.nome || '').trim().split(/\s+/)[0] || null;
  const abertura = nome ? `Fala ${nome}, tudo bem?` : 'Fala, tudo bem?';
  const intro = `${abertura} O tatuador acabou de me passar o seu orçamento.`;
  const item = {
    ...dados,
    proposal: summary.pricing_mode ? {
      pricing_mode: summary.pricing_mode,
      valor: summary.valor ?? valorFallback,
      valor_text: summary.valor_text,
      total_amount: summary.total ?? valorFallback,
      total_text: summary.total_text,
      sessions_count: summary.sessions_count,
      amount_per_session: summary.amount_per_session,
      amount_per_session_text: summary.amount_per_session_text,
    } : {
      pricing_mode: 'fixed_total',
      valor: valorFallback,
      valor_text: `R$ ${fmtBRLValue(valorFallback)}`,
    },
  };
  return [intro, composeProposalLine(item), 'Quer que eu veja um horario pra gente agendar?'].join('\n');
}

export function composeMultiBudgetProposal(conv = {}) {
  const dados = conv.dados_coletados || {};
  const items = activeBudgetItems(dados);
  const pricedItems = items.filter(item => item?.proposal?.status === 'priced' && item.proposal.valor != null);
  if (items.length < 2 || pricedItems.length !== items.length) return null;

  const nome = String(conv.dados_cadastro?.nome || '').trim().split(/\s+/)[0] || null;
  const abertura = nome ? `Fala ${nome}, tudo bem?` : 'Fala, tudo bem?';
  const intro = `${abertura} O tatuador acabou de me passar o orçamento das ${items.length} tattoos que voce pediu.`;
  const linhasValores = items.map(composeProposalLine);
  return [intro, ...linhasValores, 'Quer que eu veja um horario pra gente agendar?'].join('\n');
}
