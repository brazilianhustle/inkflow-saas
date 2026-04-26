// ── §6 FAQ — shared ────────────────────────────────────────────────────────

export function faqBlock(tenant) {
  const faq = (tenant.faq_texto || '').trim();
  if (!faq) return '';
  return `# §6 FAQ DO ESTUDIO\n${faq}`;
}
