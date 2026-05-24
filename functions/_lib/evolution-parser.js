// Pure function — sem I/O. Extrai shape canonico do payload Evolution v2.
// Skips sao ack 200 + log: cliente nao-acionavel, nao retry.
// Sub-4.1 task 3.

const MAX_MEDIA_B64 = 800_000;

const MESSAGE_WRAPPERS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
];

function unwrapMessage(message) {
  let current = message || {};
  for (let i = 0; i < 8; i++) {
    const wrapperKey = MESSAGE_WRAPPERS.find(k => current?.[k]?.message);
    if (!wrapperKey) break;
    current = current[wrapperKey].message || {};
  }
  return current || {};
}

function pickMediaBase64(data, message, media) {
  return data?.base64
    || message?.base64
    || media?.base64
    || media?.jpegThumbnail
    || null;
}

export function parseEvolutionPayload(body) {
  if (!body || body.event !== 'messages.upsert') {
    return { skip: 'wrong-event' };
  }
  const data = body.data;
  const key = data?.key;
  if (!key?.id) return { skip: 'no-key-id' };
  if (key.fromMe === true) return { skip: 'from-me' };
  const remoteJid = String(key.remoteJid || '');
  if (remoteJid.includes('@g.us')) return { skip: 'group-msg' };

  // @lid (numeros WhatsApp Business novos): key.remoteJid vem como <id>@lid
  // e o telefone real fica em key.remoteJidAlt. Fora desse caso, usa remoteJid.
  const isLid = key.addressingMode === 'lid' || remoteJid.endsWith('@lid');
  const jidParaTelefone = isLid ? String(key.remoteJidAlt || '') : remoteJid;

  const telefone = jidParaTelefone.split('@')[0].replace(/\D/g, '');
  if (!telefone) return { skip: 'no-telefone' };

  const message = unwrapMessage(data?.message);
  const texto = String(
    message.conversation ||
    message.imageMessage?.caption ||
    message.extendedTextMessage?.text ||
    message.audioMessage?.caption ||
    message.documentMessage?.caption ||
    message.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    ''
  );

  let mediaBase64 = null;
  let mediaMimetype = null;
  if (message.imageMessage) {
    mediaBase64 = pickMediaBase64(data, message, message.imageMessage);
    mediaMimetype = message.imageMessage.mimetype || null;
  } else if (message.audioMessage) {
    mediaBase64 = pickMediaBase64(data, message, message.audioMessage);
    mediaMimetype = message.audioMessage.mimetype || null;
  } else if (message.documentWithCaptionMessage?.message?.documentMessage) {
    const doc = message.documentWithCaptionMessage.message.documentMessage;
    mediaBase64 = pickMediaBase64(data, message, doc);
    mediaMimetype = doc.mimetype || null;
  }

  let mediaTruncated = false;
  if (mediaBase64 && mediaBase64.length > MAX_MEDIA_B64) {
    mediaBase64 = mediaBase64.slice(0, MAX_MEDIA_B64);
    mediaTruncated = true;
  }

  return {
    ok: true,
    inbound: {
      tenantEvoInstance: String(body.instance || ''),
      telefone,
      evoMessageId: String(key.id),
      texto,
      mediaBase64,
      mediaMimetype,
      mediaTruncated,
      pushName: data?.pushName ?? null,
    },
  };
}
