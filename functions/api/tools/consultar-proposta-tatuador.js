// ── Tool — consultar_proposta_tatuador ────────────────────────────────────
// POST /api/tools/consultar-proposta-tatuador
// Headers: X-Inkflow-Tool-Secret
// Body: { conversa_id, tenant_id?, telefone? }
//
// Lê estado atual da conversa pra que o agente saiba qual valor apresentar e
// se o tatuador ja decidiu sobre algum desconto. Usado pelo agente nas fases
// 'propondo_valor', 'aguardando_decisao_desconto' (consulta passiva — bot
// nao deveria estar respondendo neste estado, mas tool disponivel pra
// completude).
//
// Resposta:
// {
//   ok: true,
//   estado_agente: '<estado atual>',
//   valor_proposto: <numero|null>,
//   valor_pedido_cliente: <numero|null>,
//   decisao_desconto: 'aceito' | 'recusado' | null,
//   recusou_pedido: bool,        // tatuador recusou o pedido inicial?
//   mensagem_tatuador: string|null,  // mensagem livre adicional (quando houver)
//   orcid: string|null,
// }
import { withTool, supaFetch } from './_tool-helpers.js';

async function carregarConversa(env, conversa_id) {
  const r = await supaFetch(env,
    `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}` +
    '&select=id,estado_agente,valor_proposto,valor_pedido_cliente,orcid,dados_coletados'
  );
  if (!r.ok) throw new Error(`conversa-fetch-${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function handle({ env, input }) {
  const { conversa_id } = input || {};
  if (!conversa_id) return { status: 400, body: { ok: false, error: 'conversa_id obrigatorio' } };

  const conv = await carregarConversa(env, conversa_id);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  const dados = conv.dados_coletados || {};
  // decisao_desconto e mensagem_tatuador sao escritos pelo handler do
  // webhook Telegram dentro de dados_coletados (campos ad-hoc, nao no
  // schema principal).
  const decisao = dados.decisao_desconto || null;
  const mensagem = dados.mensagem_tatuador || null;

  // recusou_pedido = true quando estado e 'lead_frio' por causa de recusa
  // do tatuador (callback "recusar"), distinto do cliente adiar.
  const recusouPedido = conv.estado_agente === 'lead_frio' && (mensagem === 'recusou' || dados.tatuador_recusou === true);

  return {
    status: 200,
    body: {
      ok: true,
      estado_agente: conv.estado_agente,
      valor_proposto: conv.valor_proposto !== null ? Number(conv.valor_proposto) : null,
      valor_pedido_cliente: conv.valor_pedido_cliente !== null ? Number(conv.valor_pedido_cliente) : null,
      decisao_desconto: decisao,
      recusou_pedido: recusouPedido,
      mensagem_tatuador: mensagem,
      orcid: conv.orcid,
    },
  };
}

export const onRequest = withTool('consultar_proposta_tatuador', handle);
