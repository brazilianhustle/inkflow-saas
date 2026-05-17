import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTransition } from '../../functions/api/agent/router.js';

test('validateTransition: tattoo + handoff valido retorna payload extraido', () => {
  const out = {
    proxima_acao: 'handoff',
    resposta_cliente: 'beleza',
    dados_persistidos: {
      descricao_curta: 'rosa', local_corpo: 'braco', altura_cm: 170, estilo: 'fineline',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  };
  const payload = validateTransition('tattoo', out);
  assert.equal(payload.descricao_curta, 'rosa');
  assert.equal(payload.altura_cm, 170);
});

test('validateTransition: proxima_acao != handoff retorna null', () => {
  const payload = validateTransition('tattoo', { proxima_acao: 'pergunta' });
  assert.equal(payload, null);
});

test('validateTransition: estado sem contrato (cadastro Fase 2) retorna null', () => {
  const payload = validateTransition('cadastro', { proxima_acao: 'handoff', dados_persistidos: {} });
  assert.equal(payload, null);
});

test('validateTransition: handoff com payload invalido lanca', () => {
  const out = {
    proxima_acao: 'handoff',
    dados_persistidos: { descricao_curta: '', local_corpo: 'x', altura_cm: 170, estilo: 'y', tamanho_cm: null, cor_preferencia: null, foto_local: null },
  };
  assert.throws(() => validateTransition('tattoo', out));
});

test('validateTransition: out null retorna null (sem crash)', () => {
  assert.equal(validateTransition('tattoo', null), null);
  assert.equal(validateTransition('tattoo', undefined), null);
});
