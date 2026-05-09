// functions/api/agent/_lib/lookup-horario.js
export function lookupHorario(slots, inicio, fim) {
  if (!Array.isArray(slots)) return null;
  return slots.find(s => s.inicio === inicio && s.fim === fim) || null;
}

export function isValidIso(s) {
  if (typeof s !== 'string') return false;
  if (!s.includes('T')) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}
