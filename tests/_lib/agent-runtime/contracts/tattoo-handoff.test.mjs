import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TattooHandoffPayload,
  extractHandoffPayload,
} from '../../../../functions/_lib/agent-runtime/contracts/tattoo-handoff.js';

test('TattooHandoffPayload aceita 4 OBR + 3 opcionais nullable', () => {
  const ok = TattooHandoffPayload.safeParse({
    descricao_curta: 'rosa pequena',
    local_corpo: 'braco direito',
    altura_cm: 170,
    estilo: 'fineline',
    tamanho_cm: null,
    cor_preferencia: null,
    foto_local: null,
  });
  assert.equal(ok.success, true);
});

test('TattooHandoffPayload rejeita descricao_curta vazio', () => {
  const r = TattooHandoffPayload.safeParse({
    descricao_curta: '', local_corpo: 'x', altura_cm: 170, estilo: 'y',
    tamanho_cm: null, cor_preferencia: null, foto_local: null,
  });
  assert.equal(r.success, false);
});

test('TattooHandoffPayload rejeita altura_cm > 250', () => {
  const r = TattooHandoffPayload.safeParse({
    descricao_curta: 'x', local_corpo: 'y', altura_cm: 300, estilo: 'z',
    tamanho_cm: null, cor_preferencia: null, foto_local: null,
  });
  assert.equal(r.success, false);
});

test('extractHandoffPayload: handoff valido extrai payload', () => {
  const out = {
    proxima_acao: 'handoff',
    resposta_cliente: 'beleza',
    dados_persistidos: {
      descricao_curta: 'x', local_corpo: 'y', altura_cm: 170, estilo: 'z',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  };
  const payload = extractHandoffPayload(out);
  assert.equal(payload.descricao_curta, 'x');
  assert.equal(payload.altura_cm, 170);
});

test('extractHandoffPayload: proxima_acao !== handoff retorna null', () => {
  const out = { proxima_acao: 'pergunta', dados_persistidos: {} };
  assert.equal(extractHandoffPayload(out), null);
});

test('extractHandoffPayload: dados_persistidos invalido lanca ZodError', () => {
  const out = {
    proxima_acao: 'handoff',
    dados_persistidos: { descricao_curta: '' },
  };
  assert.throws(() => extractHandoffPayload(out));
});
