// Tenant "sujo" — FAQ e few-shots com valores monetários.
// Usado pra validar que regras de supressão (PR 2) bloqueiam vazamento.
// No PR 1 este fixture ainda não tem asserts fortes — é baseline pra Task 11.

import { tenantCanonicoFaixa } from './tenant-canonico.js';

export const tenantContaminado = {
  ...tenantCanonicoFaixa,
  id: '00000000-0000-0000-0000-000000000099',
  faq_texto: 'Valor mínimo R$ 300. Sinal de 30% via PIX. Tatuagem grande tem desconto R$ 100.',
  config_agente: {
    ...tenantCanonicoFaixa.config_agente,
    few_shot_exemplos: [
      { cliente: 'quanto fica?', agente: 'Fica R$ 500, paga R$ 150 de sinal' },
      { cliente: 'aceita PIX?', agente: 'Aceito. O sinal é R$ 150 — 30% do valor' },
    ],
  },
};
