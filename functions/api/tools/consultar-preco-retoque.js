import { withTool, supaFetch } from './_tool-helpers.js';
import { loadConfigPrecificacao, calcularOrcamento } from '../../_lib/pricing.js';

export const onRequest = withTool('consultar_preco_retoque', async ({ env, input }) => {
  const { tenant_id, tamanho_cm, estilo, regiao } = input || {};
  if (!tenant_id) {
    return { status: 400, body: { ok: false, error: 'tenant_id obrigatório' } };
  }

  const cm = Number(tamanho_cm) || 10;
  const estiloVal = estilo || 'blackwork';
  const regiaoVal = regiao || 'antebraco';

  async function sf(path) {
    return supaFetch(env, path);
  }

  const cfg = await loadConfigPrecificacao(sf, tenant_id);

  const resultado = calcularOrcamento(
    { tamanho_cm: cm, estilo: estiloVal, regiao: regiaoVal, cor_bool: false, nivel_detalhe: 'baixo' },
    cfg
  );

  const tenantRes = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=desconto_retoque_pct`);
  let descontoPct = 50;
  if (tenantRes.ok) {
    const tenants = await tenantRes.json();
    if (tenants[0]?.desconto_retoque_pct != null) descontoPct = tenants[0].desconto_retoque_pct;
  }

  const fator = 1 - descontoPct / 100;

  if (resultado.valor_tipo === 'faixa') {
    const minRetoque = Math.round(resultado.valor_minimo * fator);
    const maxRetoque = Math.round(resultado.valor_maximo * fator);
    const minimo = cfg.valor_minimo || 200;

    return {
      body: {
        ok: true,
        tipo: 'retoque',
        valor_tipo: 'faixa',
        valor_minimo: Math.max(minRetoque, minimo),
        valor_maximo: Math.max(maxRetoque, minimo),
        desconto_retoque_pct: descontoPct,
        valor_integral_min: resultado.valor_minimo,
        valor_integral_max: resultado.valor_maximo,
        mensagem: `Retoque com ${descontoPct}% de desconto sobre o valor integral.`,
      },
    };
  }

  const valorRetoque = Math.round(resultado.valor * fator);
  const minimo = cfg.valor_minimo || 200;

  return {
    body: {
      ok: true,
      tipo: 'retoque',
      valor_tipo: 'exato',
      valor: Math.max(valorRetoque, minimo),
      desconto_retoque_pct: descontoPct,
      valor_integral: resultado.valor,
      mensagem: `Retoque com ${descontoPct}% de desconto sobre o valor integral.`,
    },
  };
});
