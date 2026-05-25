export function buildHandoffPackageTraceId({ conversa, prefix = 'hp' } = {}) {
  const source = conversa?.id || conversa?.orcid || 'unknown';
  const short = String(source).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  return `${prefix}_${short || 'unknown'}`;
}
