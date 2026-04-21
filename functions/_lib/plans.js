// ── InkFlow — Catalogo unico de planos SaaS ──────────────────────────────────
// Single source of truth dos planos. Importado por:
//   - functions/api/public-start.js          (validacao de plano aceito)
//   - functions/api/create-onboarding-link.js (validacao)
//   - functions/api/create-tenant.js          (validacao)
//   - functions/api/create-subscription.js    (amount + nome para MP preapproval)
//   - functions/api/evo-create-instance.js    (gate de free trial)
//   - functions/api/mp-ipn.js                 (preco_mensal snapshot para grandfathering)
//
// Regras:
//   - Mexeu no preco de um plano? Aqui e o unico lugar.
//   - Novo plano? Adiciona uma entrada — consumidores pegam automaticamente.
//   - Trial nao cria assinatura MP (mpAmount: 0, mpNome: null). Cron expira-trial
//     processa conversao depois de 7 dias.

export const PLANS = {
  trial: {
    id: 'trial',
    label: 'Trial 7 dias',
    priceBRL: 0,
    mpAmount: 0,
    mpNome: null,
    cycle: '/7 dias · sem cartão',
    isFreeTrial: true,
  },
  individual: {
    id: 'individual',
    label: 'Individual',
    priceBRL: 197,
    mpAmount: 197.00,
    mpNome: 'InkFlow Individual',
    cycle: '/mês · cobrança recorrente',
    isFreeTrial: false,
  },
  estudio: {
    id: 'estudio',
    label: 'Estúdio',
    priceBRL: 497,
    mpAmount: 497.00,
    mpNome: 'InkFlow Estúdio',
    cycle: '/mês · cobrança recorrente',
    isFreeTrial: false,
  },
  premium: {
    id: 'premium',
    label: 'Estúdio VIP',
    priceBRL: 997,
    mpAmount: 997.00,
    mpNome: 'InkFlow Estúdio VIP',
    cycle: '/mês · cobrança recorrente',
    isFreeTrial: false,
  },
};

export const PLAN_IDS = Object.keys(PLANS);
export const PAID_PLAN_IDS = PLAN_IDS.filter((p) => !PLANS[p].isFreeTrial);

// Shape { id: {nome, valor} } consumido por create-subscription.js no payload MP.
export const PLANOS = Object.fromEntries(
  PAID_PLAN_IDS.map((id) => [id, { nome: PLANS[id].mpNome, valor: PLANS[id].mpAmount }]),
);

// Snapshot BRL inteiro gravado em tenants.preco_mensal. Trava o preco no momento
// da ativacao (grandfathering) — reajuste futuro nao afeta base instalada.
export const PLANO_PRECO_BRL = Object.fromEntries(
  PAID_PLAN_IDS.map((id) => [id, PLANS[id].priceBRL]),
);

export function isValidPlan(plano) {
  return PLAN_IDS.includes(plano);
}

export function isPaidPlan(plano) {
  return PAID_PLAN_IDS.includes(plano);
}

export function isFreeTrial(plano) {
  return PLANS[plano]?.isFreeTrial === true;
}
