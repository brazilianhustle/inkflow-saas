// ── Tool — enviar_orcamento_tatuador ──────────────────────────────────────
// POST /api/tools/enviar-orcamento-tatuador
// Headers: X-Inkflow-Tool-Secret
// Body: { conversa_id, tenant_id?, telefone? }
//
// Monta orcamento formatado a partir de dados_coletados + dados_cadastro,
// envia mensagem Telegram pro chat_id do tatuador (tenants.tatuador_telegram_chat_id),
// gera orcid unico, transiciona estado_agente pra 'aguardando_tatuador'.
//
// Pre-condicoes (validadas):
// - tenant tem tatuador_telegram_chat_id setado (senao 400)
// - conversa tem 3 OBR de tattoo (descricao, tamanho, local) populados
// - conversa tem 2 OBR de cadastro (nome, data_nascimento) populados
//
// Resposta sucesso:
// { ok: true, orcid, telegram_message_id, estado_agente: 'aguardando_tatuador' }
//
// Idempotencia: se conversa ja tem orcid, NAO reenvia — retorna o orcid
// existente (a tool deve ser chamada UMA vez por orcamento; reentrada do
// agente em propondo_valor nao re-chama esta tool).
import { withTool, supaFetch } from './_tool-helpers.js';

const TENANT_FIELDS = [
  'id', 'nome_estudio', 'tatuador_telegram_chat_id', 'tatuador_telegram_username',
].join(',');

function gerarOrcid() {
  // 6 chars base36 (alfanumerico). Probabilidade de colisao baixa pra
  // volume esperado (centenas/mes). UNIQUE constraint no banco apanha
  // colisao caso aconteca.
  const rand = Math.random().toString(36).slice(2, 8);
  return `orc_${rand}`;
}

function calcularIdadeAnos(isoDate) {
  if (!isoDate) return null;
  const nasc = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - nasc.getUTCFullYear();
  const m = hoje.getUTCMonth() - nasc.getUTCMonth();
  if (m < 0 || (m === 0 && hoje.getUTCDate() < nasc.getUTCDate())) idade--;
  return idade;
}

function escapeMarkdown(s) {
  // Escape Markdown V1 do Telegram (parse_mode: 'Markdown'). Escapa _ * ` [
  if (!s) return '';
  return String(s).replace(/[_*`[]/g, m => `\\${m}`);
}

function montarTextoOrcamento(orcid, conv) {
  const cad = conv.dados_cadastro || {};
  const dat = conv.dados_coletados || {};
  const idade = calcularIdadeAnos(cad.data_nascimento);
  const nome = escapeMarkdown(cad.nome || '?');
  const desc = escapeMarkdown(dat.descricao_tattoo || '?');
  const local = escapeMarkdown(dat.local_corpo || '?');
  const estilo = dat.estilo ? escapeMarkdown(dat.estilo) : null;
  const fotos = dat.foto_local ? 1 : 0;
  const refs = Array.isArray(dat.refs_imagens) ? dat.refs_imagens.length : 0;

  const linhas = [
    '📋 *Novo orçamento*',
    '',
    `👤 ${nome}${idade !== null ? ` (${idade} anos)` : ''}`,
  ];
  if (cad.email) linhas.push(`📧 ${escapeMarkdown(cad.email)}`);
  linhas.push(`🆔 \`${orcid}\``);
  linhas.push('');
  linhas.push('🎨 *Tattoo*');
  linhas.push(`   • ${desc}`);
  linhas.push(`   • ${dat.tamanho_cm}cm`);
  linhas.push(`   • ${local}`);
  if (estilo) linhas.push(`   • estilo: ${estilo}`);
  linhas.push('');
  linhas.push(`📸 Fotos: ${fotos} do local, ${refs} referência${refs === 1 ? '' : 's'}`);

  return linhas.join('\n');
}

function inlineKeyboard(orcid) {
  return {
    inline_keyboard: [[
      { text: '✅ Fechar valor', callback_data: `fechar:${orcid}` },
      { text: '❌ Recusar',      callback_data: `recusar:${orcid}` },
    ]],
  };
}

async function carregarConversaComTenant(env, conversa_id) {
  const r = await supaFetch(env,
    `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}` +
    `&select=id,estado_agente,orcid,dados_coletados,dados_cadastro,tenant_id,tenants(${encodeURIComponent(TENANT_FIELDS)})`
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
  const { conversa_id } = input || {};
  if (!conversa_id) return { status: 400, body: { ok: false, error: 'conversa_id obrigatorio' } };

  const conv = await carregarConversaComTenant(env, conversa_id);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  const tenant = conv.tenants;
  if (!tenant?.tatuador_telegram_chat_id) {
    return {
      status: 400,
      body: { ok: false, error: 'tatuador-sem-telegram', dica: 'tenant precisa conectar Telegram via onboarding/studio antes de enviar orcamentos' },
    };
  }

  // Idempotencia: se ja tem orcid, retorna o existente sem reenviar
  if (conv.orcid) {
    return {
      status: 200,
      body: {
        ok: true,
        orcid: conv.orcid,
        idempotente: true,
        estado_agente: conv.estado_agente,
        dica: 'orcamento ja enviado anteriormente',
      },
    };
  }

  // Valida pre-condicoes (3 OBR tattoo + 2 OBR cadastro)
  const dat = conv.dados_coletados || {};
  const cad = conv.dados_cadastro || {};
  const faltando = [];
  if (!dat.descricao_tattoo) faltando.push('descricao_tattoo');
  if (!dat.tamanho_cm) faltando.push('tamanho_cm');
  if (!dat.local_corpo) faltando.push('local_corpo');
  if (!cad.nome) faltando.push('nome');
  if (!cad.data_nascimento) faltando.push('data_nascimento');
  if (faltando.length > 0) {
    return {
      status: 400,
      body: { ok: false, error: 'campos-faltando', faltando, dica: 'colete os campos OBR antes de enviar orcamento' },
    };
  }

  const orcid = gerarOrcid();

  // Reservar orcid + estado ANTES de mandar Telegram (rollback se Telegram falhar e quisermos reentregar)
  await supaFetch(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ orcid, estado_agente: 'aguardando_tatuador' }),
  });

  // Envia Telegram. Se falhar, reverter estado pra agente poder tentar de novo.
  let tgResult;
  try {
    tgResult = await enviarTelegram(env, tenant.tatuador_telegram_chat_id, montarTextoOrcamento(orcid, conv), inlineKeyboard(orcid));
  } catch (e) {
    // Rollback: limpar orcid e voltar estado pra coletando_cadastro
    await supaFetch(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ orcid: null, estado_agente: 'coletando_cadastro' }),
    });
    throw e;
  }

  return {
    status: 200,
    body: {
      ok: true,
      orcid,
      telegram_message_id: tgResult.message_id,
      estado_agente: 'aguardando_tatuador',
    },
  };
}

export const onRequest = withTool('enviar_orcamento_tatuador', handle);
export { gerarOrcid, montarTextoOrcamento, inlineKeyboard };
