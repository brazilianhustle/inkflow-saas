const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

const SYSTEM_PROMPT = `Você é um especialista em configurar assistentes virtuais para estúdios de tatuagem.

O usuário vai descrever como quer que o assistente se comporte, mas de forma informal e possivelmente com erros.

Sua tarefa:
1. Reescrever o texto de forma clara, concisa e profissional
2. Manter a essência e personalidade que o usuário descreveu
3. Corrigir erros de português
4. Formatar como uma instrução direta para o assistente (em 2a pessoa: "Você é...", "Seja...")
5. Máximo 3 frases curtas
6. Não inventar características que o usuário não mencionou

Responda APENAS com o texto reescrito, sem explicações.`;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'JSON inválido' }, 400); }

  const { texto } = body;
  if (!texto || typeof texto !== 'string' || texto.trim().length < 5) {
    return json({ error: 'Texto muito curto' }, 400);
  }

  if (!env.AI) {
    return json({ error: 'AI binding não configurado' }, 503);
  }

  try {
    const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: texto.trim() },
      ],
      max_tokens: 256,
      temperature: 0.4,
    });

    const resultado = result?.response?.trim();
    if (!resultado) {
      return json({ error: 'IA não retornou resultado' }, 500);
    }

    return json({ resultado });
  } catch (err) {
    console.error('aprimorar-persona error:', err);
    return json({ error: 'Erro ao processar com IA' }, 500);
  }
}
