// ── InkFlow — Sentry Middleware para TODAS as Edge Functions ─────────────────
// Este arquivo intercepta TODAS as chamadas /api/* e captura erros automaticamente.
// Envia para o Sentry via HTTP API (sem dependência de npm).
//
// Localização: functions/_middleware.js
// Referência: https://developers.cloudflare.com/pages/functions/middleware/
//
// O que ele faz:
//   1. Deixa a edge function rodar normalmente
//   2. Se der erro (throw), captura os detalhes
//   3. Envia o erro para o Sentry com contexto (qual endpoint, qual método, IP, etc.)
//   4. Retorna um erro 500 genérico para o usuário (sem vazar detalhes internos)

const SENTRY_DSN = 'https://c658b9d1be28f744f2aef5c552ef1b4f@o4511123798687744.ingest.us.sentry.io/4511123944505344';

// Extrai as partes do DSN para montar a URL da API do Sentry
function parseDSN(dsn) {
  const url = new URL(dsn);
  return {
    publicKey: url.username,
    host: url.hostname,
    protocol: url.protocol,
    projectId: url.pathname.replace('/', ''),
    // Porta da organização (subdomínio)
    origin: `${url.protocol}//${url.hostname}`,
  };
}

// Monta o payload do evento Sentry (formato envelope)
function buildSentryPayload(error, request, dsnParts) {
  const url = new URL(request.url);
  const now = new Date();

  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: now.toISOString(),
    platform: 'javascript',
    level: 'error',
    server_name: 'cloudflare-pages',
    environment: 'production',
    tags: {
      runtime: 'cloudflare-pages-function',
      endpoint: url.pathname,
      method: request.method,
    },
    request: {
      url: request.url,
      method: request.method,
      headers: {
        'user-agent': request.headers.get('user-agent') || 'unknown',
        'content-type': request.headers.get('content-type') || 'unknown',
        origin: request.headers.get('origin') || 'unknown',
      },
      query_string: url.search || '',
    },
    exception: {
      values: [
        {
          type: error.name || 'Error',
          value: error.message || 'Unknown error',
          stacktrace: error.stack
            ? {
                frames: error.stack
                  .split('\n')
                  .filter((line) => line.includes('at '))
                  .map((line) => ({
                    filename: line.trim(),
                    function: line.trim().replace(/^\s*at\s+/, '').split(' ')[0] || '?',
                  }))
                  .reverse(),
              }
            : undefined,
        },
      ],
    },
    extra: {
      cf_ray: request.headers.get('cf-ray') || 'unknown',
      cf_country: request.headers.get('cf-ipcountry') || 'unknown',
      cf_ip: request.headers.get('cf-connecting-ip') || 'unknown',
    },
  };

  return event;
}

// Envia o evento para o Sentry via HTTP (store endpoint)
async function sendToSentry(event, dsnParts) {
  const storeUrl = `${dsnParts.origin}/api/${dsnParts.projectId}/store/?sentry_version=7&sentry_key=${dsnParts.publicKey}`;

  try {
    await fetch(storeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (e) {
    // Se o próprio envio pro Sentry falhar, só loga — não pode derrubar a resposta
    console.error('Sentry send failed:', e.message);
  }
}

// ── Middleware principal ─────────────────────────────────────────────────────
export async function onRequest(context) {
  const dsnParts = parseDSN(SENTRY_DSN);

  try {
    const response = await context.next();

    // Captura 5xx que NÃO foram throw (ex: endpoints retornando 503 via json()).
    // Clona pra não consumir o body original.
    if (response.status >= 500) {
      try {
        const clone = response.clone();
        const bodyText = await clone.text().catch(() => '');
        const synthetic = new Error(`HTTP ${response.status} — ${bodyText.slice(0, 500)}`);
        synthetic.name = `HTTP${response.status}`;
        const event = buildSentryPayload(synthetic, context.request, dsnParts);
        event.tags.status_code = String(response.status);
        event.level = response.status >= 500 ? 'error' : 'warning';
        context.waitUntil(sendToSentry(event, dsnParts));
      } catch (captureErr) {
        console.error('[SENTRY-MIDDLEWARE] Falha ao capturar 5xx:', captureErr.message);
      }
    }

    return response;
  } catch (error) {
    console.error(`[SENTRY-MIDDLEWARE] Erro em ${context.request.url}:`, error.message);

    const event = buildSentryPayload(error, context.request, dsnParts);
    context.waitUntil(sendToSentry(event, dsnParts));

    return new Response(
      JSON.stringify({
        error: 'Erro interno do servidor. Nossa equipe já foi notificada.',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
        },
      }
    );
  }
}