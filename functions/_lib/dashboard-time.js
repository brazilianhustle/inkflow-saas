/**
 * dashboard-time.js
 *
 * Helpers para calcular janelas de tempo em BRT (UTC-3, sem DST desde 2019)
 * usadas pelos endpoints de Dashboard. Todos os retornos são Date em UTC
 * prontos para comparação com timestamps do Supabase.
 *
 * BRT = UTC-3 ano-redondo.
 */

const BRT_OFFSET_MS = 3 * 3600_000; // 3 horas em ms

/**
 * Retorna o início do dia BRT atual como Date UTC.
 * "00:00 BRT" = "03:00 UTC" do mesmo dia calendário BRT.
 * Edge case: se now UTC < 03:00, o dia BRT ainda é o dia anterior.
 *
 * @param {Date} [now=new Date()] - instante de referência
 * @returns {Date} 03:00 UTC do dia BRT correspondente
 */
export function todayStartBrt(now = new Date()) {
  // Desloca o relógio para "hora BRT" (subtrai 3h), zera horas, desloca de volta
  const brtClock = new Date(now.getTime() - BRT_OFFSET_MS);
  brtClock.setUTCHours(0, 0, 0, 0);
  return new Date(brtClock.getTime() + BRT_OFFSET_MS);
}

/**
 * Retorna segunda-feira 00:00 BRT da semana atual como Date UTC.
 * Se hoje BRT for domingo (getUTCDay() === 0 no relógio BRT), volta 6 dias.
 *
 * @param {Date} [now=new Date()] - instante de referência
 * @returns {Date} segunda-feira 03:00 UTC da semana BRT atual
 */
export function weekStartBrt(now = new Date()) {
  // Desloca para relógio BRT
  const brtClock = new Date(now.getTime() - BRT_OFFSET_MS);
  const dayOfWeek = brtClock.getUTCDay(); // 0=dom, 1=seg, ..., 6=sáb
  // segunda (1) → 0 dias atrás; domingo (0) → 6 dias atrás; demais → dayOfWeek - 1
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  // Vai para meia-noite BRT do dia atual, depois subtrai dias até segunda
  brtClock.setUTCHours(0, 0, 0, 0);
  brtClock.setUTCDate(brtClock.getUTCDate() - daysToMonday);
  return new Date(brtClock.getTime() + BRT_OFFSET_MS);
}

/**
 * Retorna o início do dia BRT de N dias atrás como Date UTC.
 *
 * @param {number} n - número de dias para voltar
 * @param {Date} [now=new Date()] - instante de referência
 * @returns {Date} 03:00 UTC de N dias antes do dia BRT atual
 */
export function daysAgoBrt(n, now = new Date()) {
  return new Date(todayStartBrt(now).getTime() - n * 86400_000);
}
