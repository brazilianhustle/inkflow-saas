// ── Tool — enviar_objecao_tatuador ────────────────────────────────────────
// POST /api/tools/enviar-objecao-tatuador
// Headers: X-Inkflow-Tool-Secret
// Body: { conversa_id, valor_pedido_cliente, tenant_id?, telefone? }
//
// Quando cliente pede desconto na fase Proposta, esta tool dispara mensagem
// Telegram pro tatuador com botoes [Aceitar X / Manter Y]. Atualiza estado
// pra 'aguardando_decisao_desconto' (bot nao responde mais ate tatuador
// decidir).
//
// Pre-condicoes:
// - conversa em estado 'propondo_valor' (ou 'aguardando_decisao_desconto'
//   pra retry)
// - conversa.valor_proposto setado (valor original que o tatuador fechou)
// - conversa.orcid setado (vem da tool enviar_orcamento_tatuador)
// - tenant.tatuador_telegram_chat_id setado
//
// Resposta sucesso:
// { ok: true, telegram_message_id, estado_agente: 'aguardando_decisao_desconto' }
import { withTool, supaFetch } from './_tool-helpers.js';

const TENANT_FIELDS = ['id', 'tatuador_telegram_chat_id'].join(',');

function escapeMarkdown(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[_*`[]/g, m => `\\${m}`);
}

function montarTextoObjecao(orcid, valor_proposto, valor_pedido_cliente, nome_cliente) {
  const linhas = [
    '🧾 *Cliente pediu desconto*',
    '',
  ];
  if (nome_cliente) linhas.push(`👤 ${escapeMarkdown(nome_cliente)} — \`${orcid}\``);
  else linhas.push(`🆔 \`${orcid}\``);
  linhas.push('');
  linhas.push(`💰 Valor original: R$ ${valor_proposto.toFixed(2).replace('.', ',')}`);
  linhas.push(`🙏 Cliente pediu: R$ ${valor_pedido_cliente.toFixed(2).replace('.', ',')}`);
  return linhas.join('\n');
}

function inlineKeyboardObjecao(orcid, valor_pedido_cliente, valor_proposto) {
  // callback_data tem limite de 64 bytes — abreviamos
  return {
    inline_keyboard: [[
      { text: `✅ Aceitar ${valor_pedido_cliente.toFixed(0)}`, callback_data: `aceitar:${orcid}:${valor_pedido_cliente.toFixed(0)}` },
      { text: `❌ Manter ${valor_proposto.toFixed(0)}`,        callback_data: `manter:${orcid}` },
    ]],
  };
}

async function carregarConversa(env, conversa_id) {
  const r = await supaFetch(env,
    `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}` +
    `&select=id,estado_agente,valor_proposto,valor_pedido_cliente,orcid,dados_cadastro,tenants(${encodeURIComponent(TENANT_FIELDS)})`
  );
  if (!r.ok) throw new Error(`conversa-fetch-${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function enviarTelegram(env, chat_id, text, reply_markup) {
  const token = env.INKFLOW_TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('INKFLOW_TELEGRAM_BOT_TOKEN ausente');
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'Markdown', reply_markup }),
  });
  const body = await r.json();
  if (!body.ok) throw new Error(`telegram-${body.error_code}: ${body.description}`);
  return body.result;
}

async function handle({ env, input }) {
  const { conversa_id, valor_pedido_cliente } = input || {};
  if (!conversa_id) return { status: 400, body: { ok: false, error: 'conversa_id obrigatorio' } };
  if (valor_pedido_cliente === undefined || valor_pedido_cliente === null) {
    return { status: 400, body: { ok: false, error: 'valor_pedido_cliente obrigatorio' } };
  }
  const valorPedido = Number(valor_pedido_cliente);
  if (!Number.isFinite(valorPedido) || valorPedido <= 0) {
    return { status: 400, body: { ok: false, error: 'valor_pedido_cliente invalido (esperado numero > 0)' } };
  }

  const conv = await carregarConversa(env, conversa_id);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  if (!conv.valor_proposto) {
    return { status: 400, body: { ok: false, error: 'valor_proposto-ausente', dica: 'tatuador precisa fechar valor antes de objecao chegar' } };
  }
  if (!conv.orcid) {
    return { status: 400, body: { ok: false, error: 'orcid-ausente', dica: 'orcamento nao foi enviado pro tatuador ainda' } };
  }

  const tenant = conv.tenants;
  if (!tenant?.tatuador_telegram_chat_id) {
    return { status: 400, body: { ok: false, error: 'tatuador-sem-telegram' } };
  }

  const valorPropostoNum = Number(conv.valor_proposto);
  // Persistir valor pedido + estado ANTES de Telegram (idempotencia se Telegram falhar e retentar)
  await supaFetch(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      valor_pedido_cliente: valorPedido,
      estado_agente: 'aguardando_decisao_desconto',
    }),
  });

  const nome = conv.dados_cadastro?.nome;
  const tgResult = await enviarTelegram(
    env,
    tenant.tatuador_telegram_chat_id,
    montarTextoObjecao(conv.orcid, valorPropostoNum, valorPedido, nome),
    inlineKeyboardObjecao(conv.orcid, valorPedido, valorPropostoNum)
  );

  return {
    status: 200,
    body: {
      ok: true,
      telegram_message_id: tgResult.message_id,
      estado_agente: 'aguardando_decisao_desconto',
      valor_pedido_cliente: valorPedido,
      valor_proposto: valorPropostoNum,
    },
  };
}

export const onRequest = withTool('enviar_objecao_tatuador', handle);
export { montarTextoObjecao, inlineKeyboardObjecao };
