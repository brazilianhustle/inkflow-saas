// Tenant contaminado — FAQ menciona 'R$ 500' e 'pix'; few-shots do agente
// mencionam 'R$ 500-800' (e 'pix' aparece só no lado cliente, não no agente).
// Em modos sensíveis (Coleta — chega em PR 2), regra R3 deve suprimir
// menções monetárias do agent output. Em PR 1, usado pra invariantes
// Faixa/Exato (que PODEM falar valor).
import { TENANT_CANONICO } from './tenant-canonico.mjs';

export const TENANT_CONTAMINADO = {
  ...TENANT_CANONICO,
  faq_texto: 'Q: Quanto custa?\nA: Em torno de R$ 500 a peca pequena.\nQ: Sinal?\nA: 30% pix.',
  config_agente: {
    ...TENANT_CANONICO.config_agente,
    few_shot_exemplos: [
      { cliente: 'quanto?', agente: 'Em torno de R$ 500 a R$ 800 pelo estilo.' },
      { cliente: 'pix?', agente: 'Sim, 30% de sinal.' },
    ],
  },
};
