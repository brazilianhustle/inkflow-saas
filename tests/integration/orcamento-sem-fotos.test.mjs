// Sem fotos correlacionadas: orcamento texto sai normal, nenhum envio de midia,
// nenhum PATCH de file_ids, nenhum RPC zerar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  onRequest, buildContext, makeConversa, tgRouter, installFetchMock,
  tgCall, supaRpcZerar, supaPatchFileIds, TENANT_ID,
} from './_orcamento-mocks.mjs';

test('sem fotos: orcamento texto sai, zero midia, zero RPC zerar', async () => {
  const conversa = makeConversa(); // defaults: sem foto_local_msg_id nem refs_imagens_msg_ids
  const mock = installFetchMock({
    conversa,
    mediaRows: [],
    telegram: tgRouter(),
  });
  try {
    const resp = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: '+5511999' }));
    assert.equal(resp.status, 200);

    const sendMsg = tgCall(mock.calls, 'sendMessage');
    assert.ok(sendMsg, 'sendMessage enviado');
    assert.equal(tgCall(mock.calls, 'sendMediaGroup'), undefined);
    assert.equal(tgCall(mock.calls, 'sendPhoto'), undefined);
    assert.equal(tgCall(mock.calls, 'sendDocument'), undefined);
    assert.equal(supaPatchFileIds(mock.calls), undefined, 'nenhum PATCH de file_ids');
    assert.equal(supaRpcZerar(mock.calls).length, 0, 'nenhum RPC zerar');
  } finally {
    mock.restore();
  }
});
