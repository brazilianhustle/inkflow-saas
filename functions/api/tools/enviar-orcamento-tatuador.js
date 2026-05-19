// ── Tool — enviar_orcamento_tatuador ──────────────────────────────────────
// POST /api/tools/enviar-orcamento-tatuador
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, telefone }
//
// Monta orcamento formatado a partir de dados_coletados + dados_cadastro,
// envia mensagem Telegram pro chat_id do tatuador (tenants.tatuador_telegram_chat_id),
// gera orcid unico, transiciona estado_agente pra 'aguardando_tatuador'.
//
// Pre-condicoes (validadas):
// - tenant tem tatuador_telegram_chat_id setado (senao 400)
// - conversa tem 4 OBR de tattoo (descricao, local, altura_cm, estilo) populados
// - conversa tem 2 OBR de cadastro (nome, data_nascimento) populados
//
// Resposta sucesso:
// { ok: true, orcid, telegram_message_id, estado_agente: 'aguardando_tatuador' }
//
// Idempotencia: se conversa ja tem orcid, NAO reenvia — retorna o orcid
// existente (a tool deve ser chamada UMA vez por orcamento; reentrada do
// agente em propondo_valor nao re-chama esta tool).
import { withTool, supaFetch } from './_tool-helpers.js';
import { sendTelegramPhoto, sendTelegramDocument, sendTelegramMediaGroup } from '../../_lib/telegram-media.js';

const TENANT_FIELDS = [
  'id', 'nome_estudio', 'tatuador_telegram_chat_id', 'tatuador_telegram_username',
].join(',');

const FOTO_CAP_TOTAL = 10;
const TELEGRAM_PHOTO_MIMETYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function gerarOrcid() {
  // 6 chars base36 (alfanumerico). Probabilidade de colisao baixa pra
  // volume esperado (centenas/mes). UNIQUE constraint no banco apanha
  // colisao caso aconteca.
  const rand = Math.random().toString(36).slice(2, 8);
  return `orc_${rand}`;
}

export function formatarDataBr(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function calcIdade(isoNasc, today = new Date()) {
  const m = isoNasc.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const nasc = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  const hoje = today instanceof Date ? today : new Date(today);
  let idade = hoje.getUTCFullYear() - nasc.getUTCFullYear();
  const mNow = hoje.getUTCMonth(); const dNow = hoje.getUTCDate();
  const mN = nasc.getUTCMonth();   const dN = nasc.getUTCDate();
  if (mNow < mN || (mNow === mN && dNow < dN)) idade--;
  return idade >= 0 ? idade : null;
}

export function montarLinhaIdade(cad, today = new Date()) {
  if (!cad?.data_nascimento) return null;
  const dataBr = formatarDataBr(cad.data_nascimento);
  const idade = calcIdade(cad.data_nascimento, today);
  if (!dataBr || idade === null) return null;
  return `🎂 ${idade} anos (${dataBr})`;
}

export function montarBriefing(conv) {
  const dc = conv?.dados_coletados || {};
  const nome = conv?.dados_cadastro?.nome || 'O cliente';
  // dados_coletados (via tool dados_coletados) usa descricao_tattoo/tamanho_cm;
  // aceitamos os aliases legados descricao_curta/altura_cm pra robustez.
  const descricao = dc.descricao_tattoo || dc.descricao_curta;
  const tamanho = dc.altura_cm ?? dc.tamanho_cm;
  const partes = [];
  if (descricao) partes.push(`uma tatuagem de ${descricao}`);
  if (dc.estilo) partes.push(`estilo ${dc.estilo}`);
  if (dc.local_corpo) partes.push(`no ${dc.local_corpo}`);
  if (tamanho != null) partes.push(`~${tamanho}cm`);

  let frase = `${nome} quer ${partes.join(', ')}.`;
  const detalhes = [];
  if (dc.foto_local) detalhes.push('a foto do local');
  const nRefs = Array.isArray(dc.refs_imagens) ? dc.refs_imagens.length : 0;
  if (nRefs > 0) detalhes.push(`${nRefs} referência${nRefs > 1 ? 's' : ''}`);
  if (detalhes.length > 0) frase += ` Mandou ${detalhes.join(' + ')}.`;
  return frase;
}

export function montarTextoOrcamento(conv, resultadoFotos = null, today = new Date()) {
  const nome = conv?.dados_cadastro?.nome || 'cliente';
  const email = conv?.dados_cadastro?.email;
  const linhas = ['📋 Novo orçamento', '', `👤 ${nome}`];
  const linhaIdade = montarLinhaIdade(conv?.dados_cadastro, today);
  if (linhaIdade) linhas.push(linhaIdade);
  if (email) linhas.push(`📧 ${email}`);
  linhas.push('', montarBriefing(conv));

  if (resultadoFotos?.falhas_total) {
    linhas.push('', '📸 ⚠️ Não foi possível anexar as fotos do briefing. Abra a conversa pra ver.');
  } else if (resultadoFotos?.falhas > 0) {
    linhas.push('', `📸 ⚠️ ${resultadoFotos.falhas} de ${resultadoFotos.tentadas} fotos não anexaram.`);
  }
  return linhas.join('\n');
}

export function selecionarFotosOrcamento(conv) {
  const dc = conv?.dados_coletados || {};
  const out = [];
  if (dc.foto_local_msg_id) out.push({ msg_id: dc.foto_local_msg_id, tipo: 'local' });
  const refs = Array.isArray(dc.refs_imagens_msg_ids) ? dc.refs_imagens_msg_ids : [];
  // Cap: total 10. Se tem local, sobra 9 pra refs. Pega as mais recentes (ultimos).
  const restante = FOTO_CAP_TOTAL - out.length;
  const refsSel = refs.slice(-restante);
  for (const id of refsSel) out.push({ msg_id: id, tipo: 'ref' });
  return out;
}

export async function enviarFotosOrcamento(env, chatId, conv, depsOverride = {}) {
  const deps = {
    supaFetch: async (path, init) => await supaFetch(env, path, init),
    sendTelegramPhoto, sendTelegramDocument, sendTelegramMediaGroup,
    ...depsOverride,
  };
  const itens = selecionarFotosOrcamento(conv);
  if (itens.length === 0) return { tentadas: 0, enviadas: 0, falhas: 0 };

  // Batch SELECT base64 + mimetype
  const ids = itens.map(x => x.msg_id);
  const sel = await deps.supaFetch(
    `/rest/v1/conversa_mensagens?id=in.(${ids.join(',')})&select=id,message`,
  );
  const rows = await sel.json();
  const byId = new Map(rows.map(r => [r.id, r.message || {}]));

  // Separa em buckets por mimetype
  const carrossel = [];  // JPEGs/PNGs/WEBPs
  const documents = [];  // HEIC/HEIF/TIFF/outros
  for (const it of itens) {
    const m = byId.get(it.msg_id);
    if (!m?.media_base64) continue;
    const mt = (m.media_mimetype || '').toLowerCase();
    const bucket = TELEGRAM_PHOTO_MIMETYPES.has(mt) ? carrossel : documents;
    bucket.push({ ...it, base64: m.media_base64, mimetype: m.media_mimetype });
  }

  const tentadas = carrossel.length + documents.length;
  let enviadas = 0; let falhas = 0;
  // Ordem: foto_local-file_id primeiro (pra mapeamento PATCH); refs collect na sequencia
  let fotoLocalFileId = null;
  const refsFileIds = [];
  const usedIds = [];  // msg_ids enviados com sucesso (para RPC zerar)

  // Documents primeiro (sem caption, individuais)
  for (const d of documents) {
    try {
      const { file_id } = await deps.sendTelegramDocument(env, chatId, d.base64, d.mimetype, null, null);
      if (d.tipo === 'local') fotoLocalFileId = file_id;
      else refsFileIds.push(file_id);
      usedIds.push(d.msg_id);
      enviadas++;
    } catch (e) {
      console.warn(`[orc] doc ${d.msg_id} falhou: ${e.message}`);
      falhas++;
    }
  }

  // Carrossel
  if (carrossel.length === 1) {
    const c = carrossel[0];
    try {
      const nome = conv.dados_cadastro?.nome || 'cliente';
      const { file_id } = await deps.sendTelegramPhoto(env, chatId, c.base64, c.mimetype, `📸 ${nome} — fotos do briefing`);
      if (c.tipo === 'local') fotoLocalFileId = file_id;
      else refsFileIds.push(file_id);
      usedIds.push(c.msg_id);
      enviadas++;
    } catch (e) {
      console.warn(`[orc] foto solo ${c.msg_id} falhou: ${e.message}`);
      falhas++;
    }
  } else if (carrossel.length >= 2) {
    const nome = conv.dados_cadastro?.nome || 'cliente';
    const groupItems = carrossel.map((c, i) => ({
      base64: c.base64,
      mimetype: c.mimetype,
      ...(i === 0 ? { caption: `📸 ${nome} — fotos do briefing` } : {}),
    }));
    try {
      const results = await deps.sendTelegramMediaGroup(env, chatId, groupItems);
      results.forEach((r, i) => {
        const c = carrossel[i];
        if (c.tipo === 'local') fotoLocalFileId = r.file_id;
        else refsFileIds.push(r.file_id);
        usedIds.push(c.msg_id);
      });
      enviadas += carrossel.length;
    } catch (e) {
      console.warn(`[orc] mediaGroup falhou: ${e.message}`);
      falhas += carrossel.length;
    }
  }

  // Se nenhum upload deu certo, return falha total — NAO faz PATCH nem cleanup
  if (enviadas === 0) {
    return { tentadas, enviadas: 0, falhas, falhas_total: true };
  }

  // PATCH dados_coletados com file_ids
  const dadosAtuais = conv.dados_coletados || {};
  const novosDados = { ...dadosAtuais };
  if (fotoLocalFileId) novosDados.foto_local_file_id = fotoLocalFileId;
  if (refsFileIds.length > 0) {
    const atuais = Array.isArray(dadosAtuais.refs_imagens_file_ids) ? dadosAtuais.refs_imagens_file_ids : [];
    novosDados.refs_imagens_file_ids = [...atuais, ...refsFileIds];
  }
  await deps.supaFetch(`/rest/v1/conversas?id=eq.${conv.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ dados_coletados: novosDados }),
  });

  // Cleanup base64 via RPC atomico, so dos msg_ids que upload OK
  for (const id of usedIds) {
    try {
      await deps.supaFetch('/rest/v1/rpc/zerar_media_base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_msg_id: id }),
      });
    } catch (e) {
      console.warn(`[orc] RPC zerar ${id} falhou: ${e.message}`);
    }
  }

  return { tentadas, enviadas, falhas };
}

function inlineKeyboard(orcid) {
  return {
    inline_keyboard: [[
      { text: '✅ Fechar valor', callback_data: `fechar:${orcid}` },
      { text: '❌ Recusar',      callback_data: `recusar:${orcid}` },
    ]],
  };
}

async function carregarConversaPorPar(env, tenant_id, telefone) {
  const r = await supaFetch(env,
    `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}` +
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
  const { tenant_id, telefone } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!telefone)  return { status: 400, body: { ok: false, error: 'telefone obrigatorio' } };

  const conv = await carregarConversaPorPar(env, tenant_id, telefone);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  const conversa_id = conv.id;
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

  // Valida pre-condicoes (4 OBR tattoo + 2 OBR cadastro)
  const dat = conv.dados_coletados || {};
  const cad = conv.dados_cadastro || {};
  const faltando = [];
  if (!dat.descricao_tattoo && !dat.descricao_curta) faltando.push('descricao_tattoo');
  if (!dat.local_corpo) faltando.push('local_corpo');
  if (dat.altura_cm == null) faltando.push('altura_cm');
  if (!dat.estilo) faltando.push('estilo');
  // tamanho_cm não-bloqueante (refator manifesto 2026-05-13 — opcional)
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
    tgResult = await enviarTelegram(env, tenant.tatuador_telegram_chat_id, montarTextoOrcamento(conv), inlineKeyboard(orcid));
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
export { gerarOrcid, inlineKeyboard };
