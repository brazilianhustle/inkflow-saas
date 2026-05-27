import { extractTattooHints } from './conversation-router.js';

const REPLANNING_RE = /\b(mudei\s+de\s+ideia|troquei\s+de\s+ideia|queria\s+(?:fazer\s+)?(?:uma?\s+)?(?:outra|novo|nova)?|quero\s+(?:fazer\s+)?(?:mais\s+uma|outra|novo|nova)|tamb[eé]m\s+(?:quero|queria)|segunda\s+(?:tattoo|tatuagem))\b/i;

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function pickBudgetSnapshot(dados = {}) {
  const out = {};
  for (const key of ['descricao_curta', 'local_corpo', 'estilo', 'altura_cm', 'tamanho_cm', 'foto_local_msg_id', 'refs_imagens_msg_ids']) {
    if (hasValue(dados[key]) || Array.isArray(dados[key])) out[key] = dados[key];
  }
  return out;
}

function hasTattooSignal(hints = {}) {
  return hasValue(hints.descricao_curta) || hasValue(hints.local_corpo) || hasValue(hints.estilo) || hasValue(hints.tamanho_cm);
}

export function detectBudgetChangeRequest({ estado_agente, mensagem, dados_coletados = {} } = {}) {
  if (estado_agente !== 'aguardando_tatuador') return { matched: false, reason: 'state_not_supported' };
  const text = String(mensagem || '').trim();
  if (!text) return { matched: false, reason: 'empty_message' };

  const proposedItem = extractTattooHints(text, {});
  if (!REPLANNING_RE.test(text) || !hasTattooSignal(proposedItem)) {
    return { matched: false, reason: 'no_budget_replanning_signal' };
  }

  return {
    matched: true,
    reason: 'new_budget_item_or_replacement_ambiguous',
    response: 'Beleza! Mas so pra eu entender certinho, voce quer fazer somente essa ou a anterior tambem?',
    pending: {
      status: 'awaiting_replace_or_add',
      source: 'budget_items_manager',
      reason: 'new_budget_item_or_replacement_ambiguous',
      client_text: text,
      previous_item_snapshot: pickBudgetSnapshot(dados_coletados),
      proposed_item: proposedItem,
    },
  };
}

export function applyBudgetChangePending(dados_coletados = {}, detection = {}) {
  if (!detection?.matched) return dados_coletados || {};
  return {
    ...(dados_coletados || {}),
    budget_change_pending: detection.pending,
  };
}

export function composeBudgetChangeTelegram({ telefone, tenant, detection } = {}) {
  const previous = detection?.pending?.previous_item_snapshot || {};
  const proposed = detection?.pending?.proposed_item || {};
  const prevText = [previous.descricao_curta, previous.local_corpo].filter(Boolean).join(' na ') || 'orcamento anterior';
  const nextText = [proposed.descricao_curta, proposed.local_corpo].filter(Boolean).join(' na ') || detection?.pending?.client_text || 'nova ideia';
  return [
    `🧭 Cliente ${telefone} (${tenant?.nome_estudio || 'estudio'}) sinalizou mudanca/novo orcamento.`,
    `Anterior: ${prevText}`,
    `Nova ideia: ${nextText}`,
    'Bot perguntou se e substituicao ou tattoo adicional.',
  ].join('\n');
}

function detectConfirmationAction(text = '') {
  const s = String(text || '').toLowerCase();
  if (/\b(as\s+duas|ambas|os\s+dois|as\s+2|duas\s+mesmo|anterior\s+tamb[eé]m|tamb[eé]m\s+a\s+anterior|mais\s+essa)\b/.test(s)) {
    return 'add';
  }
  if (/\b(s[oó]\s+essa|somente\s+essa|apenas\s+essa|troca|trocar|substitui|substituir|fica\s+s[oó]\s+com\s+essa|esquece\s+a\s+anterior)\b/.test(s)) {
    return 'replace';
  }
  return null;
}

function nextItemId(items = []) {
  return `item_${items.length + 1}`;
}

function firstMissingForItem(item = {}, dados = {}) {
  if (!hasValue(item.descricao_curta)) return 'descricao_curta';
  if (!hasValue(item.local_corpo)) return 'local_corpo';
  if (!hasValue(item.estilo)) return 'estilo';
  if (!hasValue(dados.altura_cm) && !hasValue(item.altura_cm)) return 'altura_cm';
  if (!hasValue(item.foto_local_msg_id) && !hasValue(item.foto_local)) return 'foto_local';
  return null;
}

function questionForMissing(item = {}, missing) {
  const brief = [item.descricao_curta, item.local_corpo ? `na ${item.local_corpo}` : null].filter(Boolean).join(' ');
  if (missing === 'descricao_curta') return 'Qual seria a ideia dessa tattoo nova?';
  if (missing === 'local_corpo') return `Em qual parte do corpo seria ${brief || 'essa tattoo'}?`;
  if (missing === 'estilo') return `Pra ${brief || 'essa tattoo'}, qual estilo voce imagina?`;
  if (missing === 'altura_cm') return 'Qual tua altura?';
  if (missing === 'foto_local') return `Me manda uma foto do local do corpo pra ${brief || 'essa tattoo'}?`;
  return 'Boa, tenho o necessario pra seguir com essa ideia.';
}

export function resolveBudgetChangeConfirmation({ mensagem, dados_coletados = {} } = {}) {
  const pending = dados_coletados?.budget_change_pending;
  if (pending?.status !== 'awaiting_replace_or_add') return { matched: false, reason: 'no_pending_budget_change' };
  const action = detectConfirmationAction(mensagem);
  if (!action) return { matched: false, reason: 'confirmation_not_clear' };

  const existingItems = Array.isArray(dados_coletados.budget_items) ? dados_coletados.budget_items : [];
  const previousBase = Object.keys(pending.previous_item_snapshot || {}).length > 0
    ? pending.previous_item_snapshot
    : pickBudgetSnapshot(dados_coletados);
  const previousItem = {
    item_id: existingItems[0]?.item_id || nextItemId([]),
    ...(existingItems[0] || previousBase),
    status: action === 'add' ? 'sent_to_artist' : 'replaced',
  };
  const proposedItem = {
    item_id: nextItemId([previousItem]),
    ...(pending.proposed_item || {}),
    altura_cm: pending.proposed_item?.altura_cm || dados_coletados.altura_cm || null,
    status: 'collecting',
  };
  const budgetItems = action === 'add' ? [previousItem, proposedItem] : [previousItem, proposedItem];
  const nextDados = {
    ...dados_coletados,
    ...pending.proposed_item,
    altura_cm: proposedItem.altura_cm || dados_coletados.altura_cm || null,
    foto_local_msg_id: pending.proposed_item?.foto_local_msg_id || null,
    refs_imagens_msg_ids: pending.proposed_item?.refs_imagens_msg_ids || [],
    budget_items: budgetItems,
    active_budget_item_id: proposedItem.item_id,
    budget_change_pending: {
      ...pending,
      status: 'resolved',
      resolution: action,
      resolved_at: null,
    },
  };
  const missing = firstMissingForItem(proposedItem, nextDados);
  const prefix = action === 'add'
    ? 'Fechado, vou considerar as duas.'
    : 'Fechado, vou seguir somente com essa nova ideia.';

  return {
    matched: true,
    action,
    next_dados_coletados: nextDados,
    estado_agente: 'coletando_tattoo',
    response: `${prefix} ${questionForMissing(proposedItem, missing)}`,
    missing,
  };
}

export function composeBudgetConfirmationTelegram({ telefone, tenant, resolution } = {}) {
  const actionText = resolution?.action === 'add' ? 'adicionar nova tattoo' : 'substituir tattoo anterior';
  return [
    `🧭 Cliente ${telefone} (${tenant?.nome_estudio || 'estudio'}) confirmou replanejamento: ${actionText}.`,
    'Bot retomou a coleta da nova ideia antes de montar novo pacote.',
  ].join('\n');
}

export function syncActiveBudgetItem(dados_coletados = {}) {
  const activeId = dados_coletados?.active_budget_item_id;
  const items = Array.isArray(dados_coletados?.budget_items) ? dados_coletados.budget_items : null;
  if (!activeId || !items) return dados_coletados || {};
  const fields = pickBudgetSnapshot(dados_coletados);
  return {
    ...dados_coletados,
    budget_items: items.map((item) => (
      item?.item_id === activeId
        ? { ...item, ...fields, status: item.status || 'collecting' }
        : item
    )),
  };
}
