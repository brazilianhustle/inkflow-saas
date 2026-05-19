// 15 refs no historico → cap 10: pega as 10 mais recentes (sem foto local).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  onRequest, buildContext, makeConversa, mediaRow, tgRouter, installFetchMock,
  tgCall, TENANT_ID,
} from './_orcamento-mocks.mjs';

test('cap 10: 15 refs → SELECT pega as 10 mais recentes (105..114)', async () => {
  const refIds = Array.from({ length: 15 }, (_, i) => 100 + i); // [100..114]
  const esperados = refIds.slice(-10); // [105..114]
  const conversa = makeConversa({
    dados_coletados: {
      descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline',
      refs_imagens: refIds.map(String),
      refs_imagens_msg_ids: refIds,
    },
  });
  const mock = installFetchMock({
    conversa,
    mediaRows: esperados.map(id => mediaRow(id)),
    telegram: tgRouter({ mediaGroupIds: esperados.map((_, i) => `g${i}`) }),
  });
  try {
    const resp = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: '+5511999' }));
    assert.equal(resp.status, 200);
    assert.ok(tgCall(mock.calls, 'sendMediaGroup'), 'sendMediaGroup chamado');
    const sel = mock.calls.supa.find(c => c.url.includes('/conversa_mensagens?id=in.'));
    const ids = sel.url.match(/id=in\.\(([^)]+)\)/)[1].split(',').map(Number);
    assert.equal(ids.length, 10);
    assert.deepEqual(ids, esperados);
  } finally {
    mock.restore();
  }
});
