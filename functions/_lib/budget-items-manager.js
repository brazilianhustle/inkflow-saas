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
