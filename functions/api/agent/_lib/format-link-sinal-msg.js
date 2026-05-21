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

// Variante Pix — copia-e-cola em balão próprio. O pipeline (whatsapp-pipeline.js)
// quebra a resposta_cliente em balões por \n\n; aqui o código fica isolado no
// último balão pra o cliente copiar com um toque. PROIBIDO markdown — WhatsApp
// não renderiza e poluiria o copia-e-cola.
export function formatPixSinalMessage({ agent_text, sinal_pct, valor_sinal, copia_e_cola, hold_horas }) {
  const explicacao =
    `Pra garantir teu horario a gente pede um sinal de ${sinal_pct}%, que fica em R$ ${formatBRL(valor_sinal)}. ` +
    `E so copiar o codigo Pix abaixo e pagar no app do teu banco — assim que cair, teu horario ta confirmado. ` +
    `(O codigo vale ${hold_horas}h.)`;
  const prefix = agent_text && agent_text.trim() ? `${agent_text.trim()}\n\n` : '';
  return `${prefix}${explicacao}\n\n${copia_e_cola}`;
}
