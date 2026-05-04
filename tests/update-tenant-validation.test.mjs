import { test } from 'node:test';
import assert from 'node:assert/strict';

// Modo Coleta v2: 'faixa' REMOVIDO; 'coleta' default novo; 'exato' beta.
// fewshots_por_modo keys atualizadas: coleta_tattoo, coleta_cadastro, coleta_proposta, exato.

test('validateFieldTypes — fewshots_por_modo aceita objeto com 4 chaves esperadas (v2)', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const ok = validateFieldTypes({
    fewshots_por_modo: { coleta_tattoo: [], coleta_cadastro: [], coleta_proposta: [], exato: [] }
  });
  assert.equal(ok.ok, true);
});

test('validateFieldTypes — fewshots_por_modo rejeita array', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: [] });
  assert.equal(r.ok, false);
  assert.match(r.erro, /fewshots_por_modo/);
});

test('validateFieldTypes — fewshots_por_modo rejeita chave desconhecida', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: { coleta_tattoo: [], inventado: [] } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /chave/i);
});

test('validateFieldTypes — fewshots_por_modo rejeita chave legacy "faixa"', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: { faixa: [], exato: [] } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /chave invalida.*faixa/i);
});

test('validateFieldTypes — fewshots_por_modo aceita objeto vazio (partial update intencional)', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ fewshots_por_modo: {} });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — modo=coleta ACEITO (v2: default novo)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'coleta' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — modo=exato ACEITO (v2: beta secundário)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'exato' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — modo=faixa REJEITADO (v2: removido)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'faixa' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /faixa removido/i);
});

test('validateConfigPrecificacao — modo invalido rejeitado', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'inventado' });
  assert.equal(r.ok, false);
});

test('validateConfigPrecificacao — config sem modo OK (partial update)', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ sinal_percentual: 30 });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — coleta_submode legacy v1 ignorado (não rejeita)', async () => {
  // v2 só tem reentrada e callback Telegram. Migration apaga esses campos.
  // Validação não rejeita pra não quebrar payloads em flight.
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'coleta', coleta_submode: 'puro' });
  assert.equal(r.ok, true);
});

test('validateConfigPrecificacao — trigger_handoff legacy v1 ignorado', async () => {
  const { validateConfigPrecificacao } = await import('../functions/api/update-tenant.js');
  const r = validateConfigPrecificacao({ modo: 'coleta', trigger_handoff: 'qualquer coisa' });
  assert.equal(r.ok, true);
});

// ── Testes PR 1: config_notificacoes (novo campo JSONB) ───────────────────────

test('validateFieldTypes — config_notificacoes aceita objeto JSON', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_notificacoes: { email_enabled: true, push_enabled: false } });
  assert.equal(r.ok, true);
});

test('validateFieldTypes — config_notificacoes rejeita string', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_notificacoes: 'not-an-object' });
  assert.equal(r.ok, false);
  assert.match(r.erro, /config_notificacoes/);
});

test('validateFieldTypes — config_notificacoes rejeita array', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_notificacoes: [] });
  assert.equal(r.ok, false);
  assert.match(r.erro, /config_notificacoes/);
});

// ── Testes PR 1: ALLOWED_FIELDS — campos Artistas removidos ──────────────────

test('ALLOWED_FIELDS — exclui parent_tenant_id (campo Artistas removido)', async () => {
  const { ALLOWED_FIELDS } = await import('../functions/api/update-tenant.js');
  assert.equal(ALLOWED_FIELDS.has('parent_tenant_id'), false);
});

test('ALLOWED_FIELDS — exclui is_artist_slot (campo Artistas removido)', async () => {
  const { ALLOWED_FIELDS } = await import('../functions/api/update-tenant.js');
  assert.equal(ALLOWED_FIELDS.has('is_artist_slot'), false);
});

test('ALLOWED_FIELDS — exclui max_artists (campo Artistas removido)', async () => {
  const { ALLOWED_FIELDS } = await import('../functions/api/update-tenant.js');
  assert.equal(ALLOWED_FIELDS.has('max_artists'), false);
});

// ── Testes PR 1: ALLOWED_FIELDS — novos campos adicionados ───────────────────

test('ALLOWED_FIELDS — inclui ativo_ate (novo campo PR 1)', async () => {
  const { ALLOWED_FIELDS } = await import('../functions/api/update-tenant.js');
  assert.equal(ALLOWED_FIELDS.has('ativo_ate'), true);
});

test('ALLOWED_FIELDS — inclui deletado_em (novo campo PR 1)', async () => {
  const { ALLOWED_FIELDS } = await import('../functions/api/update-tenant.js');
  assert.equal(ALLOWED_FIELDS.has('deletado_em'), true);
});

test('ALLOWED_FIELDS — inclui config_notificacoes (novo campo PR 1)', async () => {
  const { ALLOWED_FIELDS } = await import('../functions/api/update-tenant.js');
  assert.equal(ALLOWED_FIELDS.has('config_notificacoes'), true);
});

// ── Testes PR 1: MODOS_ATENDIMENTO — artista_slot removido ───────────────────

test('MODOS_ATENDIMENTO — exclui artista_slot (valor removido)', async () => {
  const { MODOS_ATENDIMENTO } = await import('../functions/api/update-tenant.js');
  assert.equal(MODOS_ATENDIMENTO.includes('artista_slot'), false);
});

test('MODOS_ATENDIMENTO — inclui individual, tatuador_dono, recepcionista', async () => {
  const { MODOS_ATENDIMENTO } = await import('../functions/api/update-tenant.js');
  assert.equal(MODOS_ATENDIMENTO.includes('individual'), true);
  assert.equal(MODOS_ATENDIMENTO.includes('tatuador_dono'), true);
  assert.equal(MODOS_ATENDIMENTO.includes('recepcionista'), true);
});

// ── Testes PR 3: config_agente — kill-switch fields + emoji_favorito + reject usa_giria ───

test('validateFieldTypes — config_agente rejeita usa_giria (campo removido PR 3)', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { tom: 'amigavel', usa_giria: true } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /usa_giria/);
});

test('validateFieldTypes — config_agente.frase_assumir aceita string', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { frase_assumir: '/eu assumo' } });
  assert.equal(r.ok, true);
});

test('validateFieldTypes — config_agente.frase_assumir rejeita string > 60', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { frase_assumir: 'a'.repeat(61) } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /frase_assumir/);
});

test('validateFieldTypes — config_agente.auto_retomar_horas aceita null', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { auto_retomar_horas: null } });
  assert.equal(r.ok, true);
});

test('validateFieldTypes — config_agente.auto_retomar_horas aceita 6', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { auto_retomar_horas: 6 } });
  assert.equal(r.ok, true);
});

test('validateFieldTypes — config_agente.auto_retomar_horas rejeita 5 (fora do enum)', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { auto_retomar_horas: 5 } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /auto_retomar_horas/);
});

test('validateFieldTypes — config_agente.emoji_favorito aceita emoji curto', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { emoji_favorito: '🔥' } });
  assert.equal(r.ok, true);
});

test('validateFieldTypes — config_agente.mensagem_ao_retomar rejeita > 280 chars', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { mensagem_ao_retomar: 'a'.repeat(281) } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /mensagem_ao_retomar/);
});
