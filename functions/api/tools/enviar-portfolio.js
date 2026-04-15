// ── Tool 3.7 — enviar_portfolio ────────────────────────────────────────────
// POST /api/tools/enviar-portfolio
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, estilo?, max? }
// Retorna ate 5 URLs do portfolio_urls do tenant (filtrado por estilo se fornecido).
// A tool so retorna os links — o envio efetivo da midia cabe ao workflow n8n
// via evo api (assim evitamos duplicar logica de envio de imagem).

import { withTool, supaFetch } from './_tool-helpers.js';

const DEFAULT_MAX = 5;

export const onRequest = withTool('enviar_portfolio', async ({ env, input }) => {
  const { tenant_id, estilo, max } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };

  const r = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=portfolio_urls,nome_estudio`);
  if (!r.ok) return { status: 500, body: { ok: false, error: 'db-error' } };
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return { status: 404, body: { ok: false, error: 'tenant-nao-encontrado' } };
  const t = rows[0];

  const urls = Array.isArray(t.portfolio_urls) ? t.portfolio_urls : [];
  if (urls.length === 0) {
    return { status: 200, body: { ok: true, urls: [], motivo: 'portfolio_vazio' } };
  }

  // Filtro por estilo: matcha URL que tenha o estilo na string (ex: ".../blackwork/1.jpg")
  let filtrados = urls;
  if (estilo && typeof estilo === 'string') {
    const needle = estilo.toLowerCase().trim();
    const matches = urls.filter(u => String(u).toLowerCase().includes(needle));
    if (matches.length > 0) filtrados = matches;
  }

  const limit = Math.min(Math.max(1, Number(max) || DEFAULT_MAX), 10);
  return {
    status: 200,
    body: {
      ok: true,
      estudio: t.nome_estudio || null,
      urls: filtrados.slice(0, limit),
      total: filtrados.length,
    },
  };
});
