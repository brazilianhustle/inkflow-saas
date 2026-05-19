// Cliente "seco": 5 fotos sequenciais sem foto local → todas refs → sendMediaGroup(5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  onRequest, buildContext, makeConversa, mediaRow, tgRouter, installFetchMock,
  tgCall, TENANT_ID,
} from './_orcamento-mocks.mjs';

test('multi refs seco: 5 refs sem foto local → sendMediaGroup com 5 ids', async () => {
  const refIds = [50, 51, 52, 53, 54];
  const conversa = makeConversa({
    dados_coletados: {
      descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline',
      refs_imagens: ['a', 'b', 'c', 'd', 'e'],
      refs_imagens_msg_ids: refIds,
    },
  });
  const mock = installFetchMock({
    conversa,
    mediaRows: refIds.map(id => mediaRow(id)),
    telegram: tgRouter({ mediaGroupIds: ['g0', 'g1', 'g2', 'g3', 'g4'] }),
  });
  try {
    const resp = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: '+5511999' }));
    assert.equal(resp.status, 200);
    assert.ok(tgCall(mock.calls, 'sendMediaGroup'), 'sendMediaGroup chamado');
    // SELECT pegou os 5 msg_ids
    const sel = mock.calls.supa.find(c => c.url.includes('/conversa_mensagens?id=in.'));
    const ids = sel.url.match(/id=in\.\(([^)]+)\)/)[1].split(',').map(Number);
    assert.deepEqual(ids, refIds);
  } finally {
    mock.restore();
  }
});
