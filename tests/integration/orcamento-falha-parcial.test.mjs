// sendMediaGroup falha (413) → orcamento texto sai com nota de falha, base64
// INTACTO (zero RPC zerar). Falha de foto NAO bloqueia o orcamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  onRequest, buildContext, makeConversa, mediaRow, tgRouter, installFetchMock,
  tgCall, supaRpcZerar, TENANT_ID,
} from './_orcamento-mocks.mjs';

test('falha upload fotos: texto sai com aviso, base64 intacto (zero RPC)', async () => {
  const conversa = makeConversa({
    dados_coletados: {
      descricao_curta: 'borboleta', local_corpo: 'pulso', altura_cm: 8, estilo: 'fineline',
      foto_local: 'presente', refs_imagens: ['r1'],
      foto_local_msg_id: 42, refs_imagens_msg_ids: [43],
    },
  });
  const mock = installFetchMock({
    conversa,
    mediaRows: [mediaRow(42), mediaRow(43)],
    telegram: tgRouter({ failMethod: 'sendMediaGroup' }),
  });
  try {
    const resp = await onRequest(buildContext({ tenant_id: TENANT_ID, telefone: '+5511999' }));
    assert.equal(resp.status, 200);

    const sendMsg = tgCall(mock.calls, 'sendMessage');
    assert.ok(sendMsg, 'sendMessage enviado mesmo com falha de foto');
    const text = JSON.parse(sendMsg.body).text;
    assert.match(text, /⚠️/);
    assert.match(text, /anexar/i);
    // base64 intacto: nenhum RPC zerar rodou
    assert.equal(supaRpcZerar(mock.calls).length, 0);
  } finally {
    mock.restore();
  }
});
