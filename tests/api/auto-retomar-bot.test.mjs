import { test } from 'node:test';
import assert from 'node:assert/strict';

const NOW = new Date('2026-05-04T18:00:00Z');

test('pickConversasToResume — conversa pausada há 7h com config 6h → retoma', async () => {
  const { pickConversasToResume } = await import('../../functions/api/cron/auto-retomar-bot.js');
  const conversas = [{
    id: 'c1',
    tenant_id: 't1',
    estado_agente: 'pausada_tatuador',
    pausada_em: '2026-05-04T11:00:00Z',
    estado_agente_anterior: 'aguardando_tatuador',
    tenant_config_agente: { auto_retomar_horas: 6 },
  }];
  const result = pickConversasToResume(conversas, NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'c1');
});

test('pickConversasToResume — conversa pausada há 3h com config 6h → ignora', async () => {
  const { pickConversasToResume } = await import('../../functions/api/cron/auto-retomar-bot.js');
  const conversas = [{
    id: 'c2',
    tenant_id: 't1',
    estado_agente: 'pausada_tatuador',
    pausada_em: '2026-05-04T15:00:00Z',
    tenant_config_agente: { auto_retomar_horas: 6 },
  }];
  const result = pickConversasToResume(conversas, NOW);
  assert.equal(result.length, 0);
});

test('pickConversasToResume — config null (nunca retomar) → ignora mesmo se pausada há semana', async () => {
  const { pickConversasToResume } = await import('../../functions/api/cron/auto-retomar-bot.js');
  const conversas = [{
    id: 'c3',
    tenant_id: 't1',
    estado_agente: 'pausada_tatuador',
    pausada_em: '2026-04-25T10:00:00Z',
    tenant_config_agente: { auto_retomar_horas: null },
  }];
  const result = pickConversasToResume(conversas, NOW);
  assert.equal(result.length, 0);
});

test('pickConversasToResume — config ausente (default 6h) → retoma se pausada há > 6h', async () => {
  const { pickConversasToResume } = await import('../../functions/api/cron/auto-retomar-bot.js');
  const conversas = [{
    id: 'c4',
    tenant_id: 't1',
    estado_agente: 'pausada_tatuador',
    pausada_em: '2026-05-04T10:00:00Z',  // 8h atrás
    tenant_config_agente: {},
  }];
  const result = pickConversasToResume(conversas, NOW);
  assert.equal(result.length, 1);
});

test('pickConversasToResume — conversa não pausada → ignora', async () => {
  const { pickConversasToResume } = await import('../../functions/api/cron/auto-retomar-bot.js');
  const conversas = [{
    id: 'c5',
    estado_agente: 'ativo',
    pausada_em: null,
    tenant_config_agente: { auto_retomar_horas: 6 },
  }];
  const result = pickConversasToResume(conversas, NOW);
  assert.equal(result.length, 0);
});
