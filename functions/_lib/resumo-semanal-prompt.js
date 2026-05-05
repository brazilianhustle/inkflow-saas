/**
 * resumo-semanal-prompt.js
 * Helper para gerar resumos semanais via OpenAI gpt-4o-mini.
 *
 * Exports:
 *   buildPrompt(stats) → string (user prompt para o LLM)
 *   callLlm({ prompt, apiKey, fetchFn }) → Promise<string>
 */

const SYSTEM_PROMPT =
  'Você é um assistente de negócios para estúdios de tatuagem no Brasil. ' +
  'Gere UM parágrafo em pt-BR casual, máximo 600 chars, ' +
  'com tom positivo sempre (mesmo em semanas ruins), ' +
  'inclua os números e a comparação com a semana anterior, ' +
  'sem sugestão de ação, sem emoji, sem markdown.';

/**
 * Monta o user prompt para o LLM a partir das stats da semana.
 *
 * @param {{ semana_atual: object, semana_anterior: object, nome_estudio: string }} stats
 * @returns {string}
 */
export function buildPrompt({ semana_atual, semana_anterior, nome_estudio }) {
  const sa = semana_atual;
  const sp = semana_anterior;

  return (
    `Estúdio: ${nome_estudio}\n\n` +
    `Semana atual:\n` +
    `- ${sa.conversas} conversas\n` +
    `- ${sa.orcamentos} orçamentos\n` +
    `- ${sa.fechados} fechados\n` +
    `- Sinal recebido: R$ ${sa.sinal_recebido.toFixed(2)}\n\n` +
    `Semana anterior:\n` +
    `- ${sp.conversas} conversas\n` +
    `- ${sp.orcamentos} orçamentos\n` +
    `- ${sp.fechados} fechados\n` +
    `- Sinal recebido: R$ ${sp.sinal_recebido.toFixed(2)}\n\n` +
    `Gere um parágrafo de resumo comparado com a semana anterior. ` +
    `Use tom positivo sempre, mesmo que os números tenham caído. ` +
    `Sem sugestão de ação. Máximo 600 chars.`
  );
}

/**
 * Chama a API OpenAI e retorna o texto gerado.
 *
 * @param {{ prompt: string, apiKey: string, fetchFn?: Function }} options
 * @returns {Promise<string>}
 */
export async function callLlm({ prompt, apiKey, fetchFn = fetch }) {
  const url = 'https://api.openai.com/v1/chat/completions';

  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(`openai-error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  let text = data.choices[0].message.content.trim();

  if (text.length > 600) {
    text = text.slice(0, 597) + '...';
  }

  return text;
}
