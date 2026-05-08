// §5 FAQ — opcional. Le array estruturado tenant.faqs ([{pergunta, resposta}]).
// Cap 10 itens pra evitar abuse de tenant config (prompt growth attack).
// Vazio/ausente = retorna '' que e filtrado em generate.js.
export function faqTattoo(tenant) {
  const faqs = Array.isArray(tenant?.faqs) ? tenant.faqs : [];
  if (!faqs.length) return '';

  const linhas = ['# §5 FAQ DO ESTUDIO'];
  for (const item of faqs.slice(0, 10)) {
    if (!item?.pergunta || !item?.resposta) continue;
    linhas.push(`- **${item.pergunta}** ${item.resposta}`);
  }
  return linhas.length === 1 ? '' : linhas.join('\n');
}
