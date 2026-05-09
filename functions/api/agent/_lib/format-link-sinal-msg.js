// functions/api/agent/_lib/format-link-sinal-msg.js
// Template fixo §3.4 — 3 partes separadas por linha em branco, URL crua.
// PROIBIDO markdown — WhatsApp nao renderiza.
export function formatLinkSinalMessage({ agent_text, sinal_pct, valor_sinal, link_pagamento, hold_horas }) {
  const linha1 = `Pra agendar a gente trabalha com sinal de ${sinal_pct}% do valor, fica em R$ ${formatBRL(valor_sinal)}.`;
  const linha2 = link_pagamento;
  const linha3 = `O link tem validade de ${hold_horas} horas. Se expirar, so me chamar que envio outro.`;
  const prefix = agent_text && agent_text.trim() ? `${agent_text.trim()}\n\n` : '';
  return `${prefix}${linha1}\n\n${linha2}\n\n${linha3}`;
}

function formatBRL(n) {
  return Number(n).toFixed(2).replace('.', ',');
}
