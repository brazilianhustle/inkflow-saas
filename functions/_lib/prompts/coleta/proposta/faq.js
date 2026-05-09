// functions/_lib/prompts/coleta/proposta/faq.js
// FAQ do tenant — paridade Sub-3.1 cadastro/faq.js.
export function faqProposta(tenant) {
  const faqs = Array.isArray(tenant?.faqs) ? tenant.faqs : [];
  if (faqs.length === 0) return '';
  const linhas = faqs.slice(0, 8).map((f, i) => `${i + 1}. ${f.pergunta || f.q}: ${f.resposta || f.a}`).join('\n');
  return `# §6 FAQ DO ESTUDIO\n\n${linhas}`;
}
