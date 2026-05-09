// functions/api/agent/_lib/prefetch-portfolio.js
// Helper isolado — deriva portfolio_disponivel:boolean de tenant.portfolio_urls.length > 0.
//
// Usado por route.js antes de rodar qualquer agent (3 fases).
// Sub-3.3: tenant chega via body.tenant (paridade Sub-1/2/3.2 stub).
// Sub-4: route.js puxa tenant do Supabase, helper continua o mesmo.
//
// Args: (env, tenant)  — env nao usado hoje, mantido pra symmetry com prefetchPropostaContext
// Return: { portfolio_disponivel: boolean }
export async function prefetchPortfolio(_env, tenant) {
  if (!tenant) return { portfolio_disponivel: false };
  const urls = Array.isArray(tenant.portfolio_urls) ? tenant.portfolio_urls : [];
  return { portfolio_disponivel: urls.length > 0 };
}
