// functions/api/agent/_lib/calcular-sinal.js
export function calcularValorSinal(valor_proposto, sinal_pct) {
  if (typeof valor_proposto !== 'number' || valor_proposto <= 0) return 0;
  if (typeof sinal_pct !== 'number' || sinal_pct <= 0) return 0;
  return Math.round((valor_proposto * sinal_pct) / 100 * 100) / 100;
}
