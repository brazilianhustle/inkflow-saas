import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../functions/_lib/auditors/vps-limits.js';

test('detect is exported as async function', () => {
  assert.equal(typeof detect, 'function');
});

test('detect with no metrics returns empty array', async () => {
  const events = await detect({
    env: {},
    metrics: null,
    now: Date.now(),
  });
  assert.deepEqual(events, []);
});

test('symptom A: ram below warn threshold returns clean', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.50, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvent = events.find((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvent?.severity, 'clean');
});

test('symptom A: ram at warn threshold (0.75 boundary) fires warn', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.75, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvent = events.find((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvent?.severity, 'warn');
});

test('symptom A: ram between warn and critical fires warn', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.85, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvent = events.find((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvent?.severity, 'warn');
  assert.match(ramEvent.payload.summary, /RAM em 85%/);
});

test('symptom A: ram at critical threshold (0.90 boundary) fires critical', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.90, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvent = events.find((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvent?.severity, 'critical');
});

test('symptom A: ram above critical fires critical with live_value', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.95, ram_total_mb: 8000, disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvent = events.find((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvent?.severity, 'critical');
  assert.equal(ramEvent.payload.live_value, 0.95);
  assert.equal(ramEvent.payload.threshold_critical, 0.90);
  assert.equal(ramEvent.evidence.ram_total_mb, 8000);
});

test('symptom A: missing ram_used_pct skips silently', async () => {
  const events = await detect({
    env: {},
    metrics: { disk_used_pct: 0.20, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const ramEvents = events.filter((e) => e.payload.symptom === 'ram');
  assert.equal(ramEvents.length, 0);
});

test('symptom B: disk below warn threshold returns clean', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.50, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const diskEvent = events.find((e) => e.payload.symptom === 'disk');
  assert.equal(diskEvent?.severity, 'clean');
});

test('symptom B: disk at warn threshold fires warn', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.75, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const diskEvent = events.find((e) => e.payload.symptom === 'disk');
  assert.equal(diskEvent?.severity, 'warn');
});

test('symptom B: disk above critical fires critical with summary text', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.92, disk_total_gb: 150, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const diskEvent = events.find((e) => e.payload.symptom === 'disk');
  assert.equal(diskEvent?.severity, 'critical');
  assert.match(diskEvent.payload.summary, /Disco em 92%/);
  assert.equal(diskEvent.payload.live_value, 0.92);
});

test('symptom B: payload includes disk_total_gb in evidence', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, disk_used_pct: 0.78, disk_total_gb: 150, disk_used_gb: 117, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const diskEvent = events.find((e) => e.payload.symptom === 'disk');
  assert.equal(diskEvent.evidence.disk_total_gb, 150);
  assert.equal(diskEvent.evidence.disk_used_gb, 117);
});

test('symptom B: missing disk_used_pct skips silently', async () => {
  const events = await detect({
    env: {},
    metrics: { ram_used_pct: 0.30, ram_total_mb: 8000, load_avg_5m: 0.5, vcpu_count: 4 },
  });
  const diskEvents = events.filter((e) => e.payload.symptom === 'disk');
  assert.equal(diskEvents.length, 0);
});
