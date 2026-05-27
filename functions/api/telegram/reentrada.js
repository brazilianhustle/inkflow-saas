// ── Reentrada do bot na conversa do cliente (Modo Coleta v2) ───────────────
// POST /api/telegram/reentrada
// Headers: X-Inkflow-Tool-Secret
// Body: { conversa_id, evento, orcid, valor? }
//
// Chamado pelo /api/telegram/webhook após callback do tatuador (fechar valor,
// aceitar desconto, manter valor, recusar). Monta mensagem template baseada
// no evento, envia via Evolution sendText, loga em chat_messages.
//
// Por que isso e um endpoint CF Pages e nao um workflow n8n:
// - Reentrada e simples: 1 mensagem template + 1 chamada Evolution.
// - n8n seria overkill pra esse caso especifico.
// - Endpoint interno e versionado em git, testavel, mais rapido (sem hop n8n).
// - Se virar mais complexo no futuro, da pra migrar pra n8n facilmente.
//
// Eventos suportados:
// - 'fechar'           → reintroduz o cliente + apresenta valor contextualizado em 2 balões.
// - 'aceitar_desconto' → "Show! Ele topou em R$ X. Bora marcar?"
// - 'manter_valor'     → "Ele preferiu manter R$ X. Tá fechado pra ti? Bora marcar?"
// - 'recusar'          → "Infelizmente o tatuador não vai poder fazer essa peça. Posso te ajudar com outra ideia?"

import { composeMultiBudgetProposal, composeSingleBudgetProposal } from '../../_lib/budget-proposal-manager.js';
import { evoSendTextBaloes } from '../../_lib/evolution-send.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Inkflow-Tool-Secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function authTool(request, env) {
  const secret = env.INKFLOW_TOOL_SECRET;
  if (!secret) return { ok: false, reason: 'secret-missing' };
  const got = request.headers.get('X-Inkflow-Tool-Secret');
  if (!got || got !== secret) return { ok: false, reason: 'bad-secret' };
  return { ok: true };
}

function supaKey(env) {
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
}

async function supaFetch(env, path, init = {}) {
  const key = supaKey(env);
  if (!key) throw new Error('SUPABASE_SERVICE_KEY ausente');
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

function fmtBRL(valor) {
  if (valor === null || valor === undefined) return '?';
  const n = Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  // Sem decimais se for valor inteiro, com 2 decimais caso contrario
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace('.', ',');
}

function primeiroNome(nome) {
  const s = String(nome || '').trim();
  if (!s) return null;
  return s.split(/\s+/)[0] || null;
}

function nomeTatuador(tenant = {}) {
  const cfg = tenant.config_agente || {};
  return (
    tenant.tatuador_nome ||
    tenant.nome_tatuador ||
    cfg.tatuador_nome ||
    cfg.nome_tatuador ||
    cfg.nome_profissional ||
    tenant.tatuador_telegram_username ||
    null
  );
}

function rotuloTatuador(tenant = {}) {
  const cfg = tenant.config_agente || {};
  const genero = String(cfg.tatuador_genero || cfg.genero_tatuador || '').toLowerCase();
  const artigo = genero === 'feminino' || genero === 'f' || genero === 'mulher' ? 'a' : 'o';
  const papel = artigo === 'a' ? 'tatuadora' : 'tatuador';
  const nome = nomeTatuador(tenant);
  return nome ? `${artigo} noss${artigo} ${papel} ${nome}` : `${artigo} noss${artigo} ${papel}`;
}

function ucfirst(s) {
  const str = String(s || '');
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}

function localComPreposicao(local) {
  const s = String(local || '').trim();
  if (!s) return '';
  const primeira = s.toLowerCase().split(/\s+/)[0];
  if (['perna', 'coxa', 'panturrilha', 'costela', 'mao', 'mão', 'nuca', 'barriga'].includes(primeira)) return `na ${s}`;
  if (['costas', 'costelas'].includes(primeira)) return `nas ${s}`;
  if (['bracos', 'braços', 'dedos', 'pes', 'pés'].includes(primeira)) return `nos ${s}`;
  return `no ${s}`;
}

function artigoIndefinido(descricao) {
  const s = String(descricao || '').trim().toLowerCase();
  if (/^(rosa|flor|borboleta|frase|escrita|mandala|caveira)\b/.test(s)) return 'Uma';
  return 'Um';
}

function resumoTattoo(dados = {}) {
  const descricao = String(dados.descricao_tattoo || dados.descricao_curta || 'tatuagem').trim();
  const estilo = String(dados.estilo || '').toLowerCase();
  const local = localComPreposicao(dados.local_corpo);
  const base = `${artigoIndefinido(descricao)} ${descricao}`;
  const detalhe = estilo.includes('fine') && !/delicad/i.test(descricao) ? ' delicada' : '';
  const localTxt = local ? ` ${local}` : '';
  const tamanhoTxt = dados.tamanho_cm != null ? ' nessa pegada de tamanho' : '';
  return `${base}${detalhe}${localTxt}${tamanhoTxt}`;
}

function montarMensagem(evento, valor, valor_proposto, conv = {}) {
  switch (evento) {
    case 'fechar': {
      if (conv.dados_coletados?.proposal_summary?.pricing_mode) {
        return composeSingleBudgetProposal(conv, valor);
      }
      const nomeCliente = primeiroNome(conv.dados_cadastro?.nome);
      const abertura = nomeCliente ? `Fala ${nomeCliente}, tudo bem?` : 'Fala, tudo bem?';
      const intro = `${abertura} ${ucfirst(rotuloTatuador(conv.tenants))} acabou de me passar o seu orçamento`;
      const proposta = `${resumoTattoo(conv.dados_coletados)} ficaria por R$ ${fmtBRL(valor)}! O que me diz, vamos agendar?`;
      return `${intro}\n\n${proposta}`;
    }
    case 'fechar_multi':
      return composeMultiBudgetProposal(conv);
    case 'aceitar_desconto':
      return `Show! Ele topou em R$ ${fmtBRL(valor)}. Bora marcar?`;
    case 'manter_valor':
      return `Ele preferiu manter R$ ${fmtBRL(valor_proposto)}. Tá fechado pra ti? Bora marcar?`;
    case 'recusar':
      return 'Infelizmente o tatuador não vai poder fazer essa peça. Posso te ajudar com outra ideia?';
    default:
      return null;
  }
}

async function logChatMessage(env, { tenant_id, conversa_id, telefone, conteudo, direcao = 'out' }) {
  try {
    await supaFetch(env, '/rest/v1/chat_messages', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        tenant_id, conversa_id, telefone,
        direcao, tipo: 'texto',
        conteudo,
      }),
    });
  } catch (e) {
    console.warn('reentrada: log chat_messages falhou:', e.message);
  }
}

async function logConversaMensagem(env, { tenant_id, telefone, conteudo }) {
  try {
    await supaFetch(env, '/rest/v1/conversa_mensagens', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        session_id: `${tenant_id}_${telefone}`,
        message: { type: 'ai', content: conteudo },
        status: 'processed',
      }),
    });
  } catch (e) {
    console.warn('reentrada: log conversa_mensagens falhou:', e.message);
  }
}

async function handle(env, input) {
  const { conversa_id, evento, orcid, valor } = input || {};
  if (!conversa_id) return { status: 400, body: { ok: false, error: 'conversa_id obrigatorio' } };
  if (!evento) return { status: 400, body: { ok: false, error: 'evento obrigatorio' } };

  // Carrega conversa + tenant
  const r = await supaFetch(env,
    `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}` +
    '&select=id,telefone,valor_proposto,orcid,tenant_id,dados_coletados,dados_cadastro,tenants(id,nome,nome_agente,tatuador_telegram_username,config_agente,evo_instance,evo_apikey,evo_base_url)'
  );
  if (!r.ok) return { status: 500, body: { ok: false, error: 'db-error' } };
  const rows = await r.json();
  const conv = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  const tenant = conv.tenants;
  if (!tenant?.evo_instance) {
    return { status: 400, body: { ok: false, error: 'evo-instance-ausente' } };
  }
  if (!conv.telefone) {
    return { status: 400, body: { ok: false, error: 'telefone-ausente' } };
  }

  // Valida orcid se fornecido (extra safety)
  if (orcid && conv.orcid !== orcid) {
    return { status: 400, body: { ok: false, error: 'orcid-mismatch', dica: `conversa tem orcid '${conv.orcid}', recebido '${orcid}'` } };
  }

  // Monta mensagem
  const msg = montarMensagem(evento, valor, conv.valor_proposto, conv);
  if (!msg) {
    return { status: 400, body: { ok: false, error: `evento desconhecido: ${evento}` } };
  }

  const sendTenant = {
    ...tenant,
    evo_base_url: tenant.evo_base_url || env.EVO_BASE_URL || 'https://evo.inkflowbrasil.com',
    evo_apikey: tenant.evo_apikey || env.EVO_GLOBAL_KEY || '',
  };
  const evoRes = await evoSendTextBaloes(env, sendTenant, { to: conv.telefone, text: msg });
  if (!evoRes.ok) {
    return { status: 502, body: { ok: false, error: 'evolution-error', detail: evoRes.error || 'unknown' } };
  }

  // Logs fail-open, mas aguardados: se a resposta voltar antes, o runtime pode
  // encerrar a promise e a fala automatica nao entrar no historico do agente.
  await Promise.all([
    logChatMessage(env, {
      tenant_id: conv.tenant_id,
      conversa_id: conv.id,
      telefone: conv.telefone,
      conteudo: msg,
      direcao: 'out',
    }),
    logConversaMensagem(env, {
      tenant_id: conv.tenant_id,
      telefone: conv.telefone,
      conteudo: msg,
    }),
  ]);

  return {
    status: 200,
    body: {
      ok: true,
      evento,
      mensagem_enviada: msg,
      conversa_id: conv.id,
      telefone: conv.telefone,
    },
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: HEADERS });
  }
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method-not-allowed' }, 405);
  }

  const auth = authTool(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.reason }, 401);

  let input;
  try { input = await request.json(); }
  catch { return json({ ok: false, error: 'invalid-json' }, 400); }

  try {
    const res = await handle(env, input);
    return json(res.body, res.status);
  } catch (e) {
    console.error('reentrada error:', e);
    return json({ ok: false, error: 'internal', detail: String(e?.message || e) }, 500);
  }
}

// Exports pra teste
export { montarMensagem, fmtBRL, handle, resumoTattoo, rotuloTatuador };
