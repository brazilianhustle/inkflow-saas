// POST /api/evo-create-instance
// Cria instancia na Evolution API usando a chave global (server-side)
// Body: { instanceName: string, tenant_id: string }
// [FIX] Bug #4: CORS headers + OPTIONS handler
// [FIX] Bug #8: Salva evo_apikey no tenant via Supabase (server-side)
// [FIX] Bug #2A: Configura webhook n8n (server-side, removido do frontend)

import { isFreeTrial } from '../_lib/plans.js';

// FIX AUDIT-2 #6: SUPABASE_URL extraído para constante (era hardcoded na linha 156)
const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const EVO_BASE_URL    = env.EVO_BASE_URL;
  const N8N_WEBHOOK     = env.N8N_WEBHOOK_URL;
  const GLOBAL_KEY      = env.EVO_GLOBAL_KEY;
  const WEBHOOK_SECRET  = env.N8N_WEBHOOK_SECRET;

  if (!GLOBAL_KEY || !EVO_BASE_URL || !N8N_WEBHOOK) {
    console.error('evo-create-instance: env vars ausentes', { EVO_BASE_URL: !!EVO_BASE_URL, N8N_WEBHOOK: !!N8N_WEBHOOK, GLOBAL_KEY: !!GLOBAL_KEY });
    return json({ error: 'Configuração interna ausente' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body invalido' }, 400);
  }

  const { instanceName, tenant_id } = body;

  if (!instanceName || !tenant_id) {
    return json({ error: 'instanceName e tenant_id sao obrigatorios' }, 400);
  }

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instanceName)) {
    return json({ error: 'instanceName invalido (apenas letras, numeros, hifen e underscore)' }, 400);
  }

  // ── Gate: só cria instancia Evolution se tenant tem pagamento confirmado ──
  // Evita instancia orfa quando card e recusado ou retry falha no meio do fluxo.
  // Status liberados: authorized|approved|paid (MP confirmou), artist_slot (heredado),
  // trial (free trial 7 dias). Bloqueia: rascunho, pending, cancelled, refused.
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (SB_KEY) {
    try {
      const tRes = await fetch(
        `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=status_pagamento,plano,is_artist_slot`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (tRes.ok) {
        const rows = await tRes.json();
        if (Array.isArray(rows) && rows.length > 0) {
          const t = rows[0];
          const ALLOWED = ['authorized', 'approved', 'paid', 'artist_slot'];
          const freeTrial = isFreeTrial(t.plano);
          const isArtist = t.is_artist_slot === true || t.status_pagamento === 'artist_slot';
          const paymentOk = ALLOWED.includes(t.status_pagamento);
          if (!paymentOk && !freeTrial && !isArtist) {
            console.warn(`evo-create-instance: bloqueado — tenant=${tenant_id} status=${t.status_pagamento} plano=${t.plano}`);
            return json({ error: 'Pagamento nao confirmado. Conclua o checkout antes de criar a instancia.', code: 'payment_required', status_pagamento: t.status_pagamento }, 403);
          }
        }
      }
    } catch (e) {
      console.error('evo-create-instance: erro ao verificar status_pagamento:', e);
      // Nao bloqueia em caso de falha de DB — melhor falhar aberto do que travar tudo
    }
  }

  let apikey = null;
  let already_existed = false;

  // Verifica se instancia ja existe (idempotencia)
  try {
    const checkRes = await fetch(
      `${EVO_BASE_URL}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
      { headers: { apikey: GLOBAL_KEY } }
    );
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (Array.isArray(checkData) && checkData.length > 0) {
        const existing = checkData[0];
        apikey = (typeof existing.hash === 'string' ? existing.hash : existing.hash?.apikey) || existing.instance?.apikey || existing.apikey || existing.token || null;
        if (apikey) already_existed = true;
      }
    }
  } catch (e) {
    console.error('evo-create-instance: erro ao verificar instancia existente:', e);
  }

  // Cria nova instancia se nao existir
  if (!apikey) {
    // Bug 2 fix: enviar configuracoes completas na criacao da instancia
    // [FIX AUDIT5 #4] try/catch no fetch de criacao de instancia
    let createRes, createData;
    try {
      createRes = await fetch(`${EVO_BASE_URL}/instance/create`, {
        method: 'POST',
        headers: {
          apikey: GLOBAL_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceName,
          qrcode: false,
          integration: 'WHATSAPP-BAILEYS',
          // Settings corretos para o InkFlow
          rejectCall: false,          // NAO rejeitar ligacoes
          groupsIgnore: true,         // ignorar mensagens de grupo
          alwaysOnline: false,        // NAO mostrar sempre online
          readMessages: false,        // nao marcar como lido automaticamente
          readStatus: false,          // nao ler status/stories
          syncFullHistory: false,     // nao sincronizar historico antigo
          webhookBase64: true,        // [FIX] midia enviada como base64 no webhook
        }),
      });
      createData = await createRes.json();
    } catch (fetchErr) {
      console.error('evo-create-instance: erro de rede ao criar instancia:', fetchErr);
      return json({ error: 'Erro de conexao com a Evolution API. Tente novamente.' }, 502);
    }

    if (!createRes.ok) {
      console.error('evo-create-instance: falha ao criar instancia:', JSON.stringify(createData));
      return json({ error: 'Falha ao criar instancia na Evolution API' }, createRes.status);
    }

    apikey = (typeof createData.hash === 'string' ? createData.hash : createData.hash?.apikey) || createData.instance?.apikey || createData.apikey || null;
  }

  if (!apikey) {
    return json({ error: 'apikey nao encontrada na resposta' }, 500);
  }

  // ── [FIX webhook] Configurar webhook n8n com multi-format fallback ─────────
  // Evolution API v2 tem variacoes de payload entre versoes:
  //   Formato A (v2 nested com nomes curtos): { webhook: { enabled, url, byEvents, base64, events, headers } }
  //   Formato B (flat com nomes longos):      { enabled, url, webhookByEvents, webhookBase64, events, headers }
  //   Formato C (nested com nomes longos):    { webhook: { enabled, url, webhookByEvents, webhookBase64, events, headers } }
  // O response do /webhook/find sempre usa nomes longos flat (webhookByEvents/webhookBase64).
  // Estrategia: tenta cada formato em ordem com apikey da instancia. Se verify falhar, repete com GLOBAL_KEY.
  // Se todos falharem, RETORNA ERRO (nao mais silencioso) para o onboarding avisar o usuario.

  const secretHdr = WEBHOOK_SECRET ? { 'x-webhook-secret': WEBHOOK_SECRET } : {};
  const WEBHOOK_FORMATS = [
    {
      label: 'A:nested-short',
      body: { webhook: { enabled: true, url: N8N_WEBHOOK, byEvents: false, base64: true, events: ['MESSAGES_UPSERT'], ...(WEBHOOK_SECRET ? { headers: secretHdr } : {}) } }
    },
    {
      label: 'B:flat-long',
      body: { enabled: true, url: N8N_WEBHOOK, webhookByEvents: false, webhookBase64: true, events: ['MESSAGES_UPSERT'], ...(WEBHOOK_SECRET ? { headers: secretHdr } : {}) }
    },
    {
      label: 'C:nested-long',
      body: { webhook: { enabled: true, url: N8N_WEBHOOK, webhookByEvents: false, webhookBase64: true, events: ['MESSAGES_UPSERT'], ...(WEBHOOK_SECRET ? { headers: secretHdr } : {}) } }
    },
  ];

  async function findWebhook(useKey) {
    try {
      const r = await fetch(`${EVO_BASE_URL}/webhook/find/${instanceName}`, { headers: { apikey: useKey } });
      const txt = await r.text();
      let data = null;
      try { data = JSON.parse(txt); } catch {}
      const wh = Array.isArray(data) ? data[0] : data;
      return { status: r.status, raw: txt, wh };
    } catch (e) {
      return { status: 0, raw: String(e), wh: null };
    }
  }

  function webhookIsCorrect(wh) {
    if (!wh) return { ok: false, reason: 'no wh object' };
    if (wh.enabled !== true) return { ok: false, reason: `enabled=${wh.enabled}` };
    // response pode usar base64 OU webhookBase64 dependendo da versao
    const b64 = wh.webhookBase64 === true || wh.base64 === true;
    if (!b64) return { ok: false, reason: `webhookBase64=${wh.webhookBase64}, base64=${wh.base64}` };
    const events = Array.isArray(wh.events) ? wh.events : [];
    if (!events.includes('MESSAGES_UPSERT')) return { ok: false, reason: `events=${JSON.stringify(events)}` };
    return { ok: true };
  }

  async function trySetWebhook(useKey, keyLabel) {
    for (const fmt of WEBHOOK_FORMATS) {
      let status = 0, rawResp = '';
      try {
        const r = await fetch(`${EVO_BASE_URL}/webhook/set/${instanceName}`, {
          method: 'POST',
          headers: { apikey: useKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(fmt.body),
        });
        status = r.status;
        rawResp = await r.text().catch(() => '');
      } catch (e) {
        console.error(`[webhook] SET ${keyLabel}/${fmt.label} network error:`, e);
        continue;
      }
      console.log(`[webhook] SET ${keyLabel}/${fmt.label} status=${status} resp=${rawResp.slice(0, 300)}`);
      if (status < 200 || status >= 300) continue;

      // verifica imediatamente
      const found = await findWebhook(useKey);
      console.log(`[webhook] FIND ${keyLabel}/${fmt.label} status=${found.status} raw=${(found.raw || '').slice(0, 400)}`);
      const check = webhookIsCorrect(found.wh);
      if (check.ok) {
        console.log(`[webhook] OK com formato ${fmt.label} usando ${keyLabel}`);
        return { ok: true, format: fmt.label, keyUsed: keyLabel, wh: found.wh };
      }
      console.warn(`[webhook] formato ${fmt.label} aplicado mas incorreto: ${check.reason}`);
    }
    return { ok: false };
  }

  let webhookResult = await trySetWebhook(apikey, 'instance-key');
  if (!webhookResult.ok) {
    console.warn('[webhook] todos formatos falharam com apikey da instancia. Retry com GLOBAL_KEY...');
    webhookResult = await trySetWebhook(GLOBAL_KEY, 'global-key');
  }

  const webhookOk = webhookResult.ok;
  if (!webhookOk) {
    console.error('[webhook] FALHA TOTAL: nenhum formato configurou webhook corretamente para', instanceName);
  }

  // ── Settings: tambem tenta flat e nested ─────────────────────────────────
  const SETTINGS_BODIES = [
    // Flat (v2 atual)
    { rejectCall: false, groupsIgnore: true, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false, webhookBase64: true },
    // Nested (legado)
    { settings: { rejectCall: false, groupsIgnore: true, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: false, webhookBase64: true } },
  ];
  for (const sb of SETTINGS_BODIES) {
    try {
      const r = await fetch(`${EVO_BASE_URL}/settings/set/${instanceName}`, {
        method: 'POST',
        headers: { apikey, 'Content-Type': 'application/json' },
        body: JSON.stringify(sb),
      });
      const txt = await r.text().catch(() => '');
      console.log(`[settings] status=${r.status} body=${JSON.stringify(sb).slice(0, 100)} resp=${txt.slice(0, 200)}`);
      if (r.ok) break;
    } catch (settingsErr) {
      console.warn('[settings] update failed (nao fatal):', settingsErr);
    }
  }

  // [FIX Bug #8] Salvar evo_apikey e evo_instance no tenant via Supabase
  // SB_KEY ja foi declarado no topo da funcao (gate de pagamento). Reusa aqui.
  if (SB_KEY && tenant_id) {
    try {
      await fetch(SUPABASE_URL + '/rest/v1/tenants?id=eq.' + encodeURIComponent(tenant_id), {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY,
          Authorization: 'Bearer ' + SB_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ evo_apikey: apikey, evo_instance: instanceName })
      });
    } catch (sbErr) {
      console.error('evo-create-instance: falha ao salvar apikey no tenant:', sbErr);
    }
  }

  // Se o webhook nao ficou correto, retorna 502 para o onboarding avisar o usuario
  // (instancia foi criada e apikey salva, mas IA nao vai responder sem webhook correto)
  if (!webhookOk) {
    return json({
      error: 'Instância criada mas webhook não configurou corretamente. Contate o suporte para ativar o assistente.',
      instanceName,
      already_existed,
      webhook_configured: false,
    }, 502);
  }

  return json({
    instanceName,
    already_existed,
    webhook_configured: true,
    webhook_format: webhookResult.format,
    webhook_key_used: webhookResult.keyUsed,
  });
}
