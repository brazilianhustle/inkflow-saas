import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayStartBrt, weekStartBrt, daysAgoBrt } from '../../functions/_lib/dashboard-time.js';

test('todayStartBrt — 12:00 UTC (09:00 BRT) retorna mesmo dia 03:00 UTC', () => {
  const now = new Date('2026-05-05T12:00:00Z');
  const result = todayStartBrt(now);
  assert.equal(result.toISOString(), '2026-05-05T03:00:00.000Z');
});

test('todayStartBrt — 02:00 UTC (23:00 BRT do dia anterior) retorna ontem 03:00 UTC', () => {
  const now = new Date('2026-05-05T02:00:00Z');
  const result = todayStartBrt(now);
  assert.equal(result.toISOString(), '2026-05-04T03:00:00.000Z');
});

test('weekStartBrt — quarta 12:00 UTC retorna segunda 03:00 UTC', () => {
  // 2026-05-06 = quarta-feira; segunda anterior = 2026-05-04
  const now = new Date('2026-05-06T12:00:00Z');
  const result = weekStartBrt(now);
  assert.equal(result.toISOString(), '2026-05-04T03:00:00.000Z');
});

test('weekStartBrt — segunda 04:00 UTC (01:00 BRT segunda) retorna segunda 03:00 UTC (mesma semana)', () => {
  // 2026-05-04 = segunda. 04:00 UTC = 01:00 BRT segunda — week_start_brt é segunda atual.
  const now = new Date('2026-05-04T04:00:00Z');
  const result = weekStartBrt(now);
  assert.equal(result.toISOString(), '2026-05-04T03:00:00.000Z');
});

test('daysAgoBrt(30) — retorna 30d antes do today_start_brt', () => {
  const now = new Date('2026-05-05T12:00:00Z');
  const result = daysAgoBrt(30, now);
  assert.equal(result.toISOString(), '2026-04-05T03:00:00.000Z');
});

test('weekStartBrt — segunda 15:00 UTC (12:00 BRT segunda) retorna mesma segunda 03:00 UTC', () => {
  const now = new Date('2026-05-04T15:00:00Z');
  const result = weekStartBrt(now);
  assert.equal(result.toISOString(), '2026-05-04T03:00:00.000Z');
});
