// functions/_lib/prompts/coleta/cadastro/faq.js
// §5 FAQ — opcional. Cap 10 entries (anti prompt-growth attack — paridade tattoo/faq.js).
export function faqCadastro(tenant) {
  const faqs = Array.isArray(tenant?.faqs) ? tenant.faqs : [];
  if (!faqs.length) return '';

  const linhas = ['# §5 FAQ DO ESTUDIO'];
  for (const item of faqs.slice(0, 10)) {
    if (!item?.pergunta || !item?.resposta) continue;
    linhas.push(`- **${item.pergunta}** ${item.resposta}`);
  }
  return linhas.length === 1 ? '' : linhas.join('\n');
}
