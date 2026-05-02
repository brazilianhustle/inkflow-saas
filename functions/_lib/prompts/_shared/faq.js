// ── §6 FAQ — extraido de generate-prompt.js linhas 414-418 ──────────────────
export function faqBlock(tenant) {
  const faq = (tenant.faq_texto || '').trim();
  if (!faq) return '';
  return `# §6 FAQ DO ESTUDIO\n${faq}`;
}
