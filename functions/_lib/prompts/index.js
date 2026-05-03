// ── Dispatcher de prompts — Modo Coleta v2 (principal) ──────────────────────
// Coleta = modo principal/default. Exato = beta secundário. Faixa removido.
//
// Estados da máquina Coleta (em conversas.estado_agente):
//   coletando_tattoo, coletando_cadastro, aguardando_tatuador,
//   propondo_valor, aguardando_decisao_desconto, escolhendo_horario,
//   aguardando_sinal, lead_frio, fechado.
//
// Estados em que o bot NÃO responde (retorna null pro n8n curto-circuitar):
//   aguardando_tatuador, lead_frio, fechado.
import { generatePromptColetaTattoo } from './coleta/tattoo/generate.js';
import { generatePromptColetaCadastro } from './coleta/cadastro/generate.js';
import { generatePromptColetaProposta } from './coleta/proposta/generate.js';
import { generatePromptExato } from './exato/generate.js';

const ESTADOS_BOT_NAO_RESPONDE = new Set([
  'aguardando_tatuador',
  'aguardando_decisao_desconto',  // bot espera tatuador decidir desconto
  'lead_frio',
  'fechado',
]);

export function generateSystemPrompt(tenant, conversa, clientContext) {
  const modo = tenant?.config_precificacao?.modo || 'coleta';

  // Modo Exato (beta): comportamento linear como antes, sem state-machine.
  if (modo === 'exato') {
    return generatePromptExato(tenant, conversa, clientContext);
  }

  // Modo Coleta (default): state-machine por estado_agente.
  const estado = conversa?.estado_agente || 'coletando_tattoo';

  if (ESTADOS_BOT_NAO_RESPONDE.has(estado)) {
    // Sinaliza pro n8n não chamar LLM. Ack/no-op.
    return null;
  }

  switch (estado) {
    case 'coletando_cadastro':
      return generatePromptColetaCadastro(tenant, conversa, clientContext);
    case 'propondo_valor':
    case 'escolhendo_horario':
    case 'aguardando_sinal':
      return generatePromptColetaProposta(tenant, conversa, clientContext);
    case 'coletando_tattoo':
    default:
      return generatePromptColetaTattoo(tenant, conversa, clientContext);
  }
}
