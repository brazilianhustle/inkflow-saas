// functions/_lib/mp-token.js
// Fonte única do token Mercado Pago do fluxo de SINAL. Costura entre esta
// feature (Pix dinâmico) e o sub-projeto MP Connect (OAuth por estúdio).
//
// HOJE: devolve env.MP_ACCESS_TOKEN (conta global do InkFlow).
// AMANHÃ: o MP Connect preenche o token do estúdio (ex.: tenant.mp_access_token
// ou lookup numa tabela de conexões OAuth) e o sinal passa a cair na conta do
// estúdio SEM tocar no código do Pix (gerar-link-sinal / mp-sinal-handler).
//
// NÃO usar nos call-sites de assinatura SaaS (create-subscription, mp-ipn de
// assinatura, delete-tenant) — esses são da conta InkFlow por definição.
export function getMpAccessToken(env, tenant = null) {
  // Ponto de extensão do MP Connect:
  //   if (tenant?.mp_access_token) return tenant.mp_access_token;
  return env.MP_ACCESS_TOKEN;
}
