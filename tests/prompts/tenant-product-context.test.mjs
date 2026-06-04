import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contexto as contextoShared } from '../../functions/_lib/prompts/_shared/contexto.js';
import { contextoTattoo } from '../../functions/_lib/prompts/coleta/tattoo/contexto.js';

const tenant = {
  config_agente: {
    aceita_cobertura: true,
    estilos_aceitos: ['legacy'],
    estilos_recusados: [],
  },
  config_precificacao: {
    modo: 'coleta',
  },
  gatilhos_handoff: ['legacy_trigger'],
};

const tenantProductContext = {
  portfolio_disponivel: false,
  tenant_product: {
    service_policy: {
      cover_up_policy: 'rejected',
    },
    style_policy: {
      focus_styles: ['fineline'],
      rejected_styles: ['tribal'],
      out_of_catalog_behavior: 'ask_artist',
    },
    pricing_policy: {
      pricing_mode: 'artist_quote_only',
    },
    handoff_policy: {
      handoff_triggers: ['rosto'],
    },
  },
};

test('contextoTattoo usa tenant_product antes de config legado', () => {
  const out = contextoTattoo(tenant, { dados_coletados: {} }, tenantProductContext);

  assert.match(out, /Gatilhos handoff: "rosto"/);
  assert.match(out, /NAO ACEITA cobertura/);
  assert.match(out, /Estilos de foco do estudio: fineline/);
  assert.match(out, /Estilos que o estudio NAO faz: tribal/);
  assert.match(out, /Estilo fora do foco exige avaliacao direta do tatuador/);
  assert.doesNotMatch(out, /legacy|legacy_trigger/);
});

test('contexto compartilhado usa tenant_product antes de config legado', () => {
  const out = contextoShared(tenant, { estado: 'qualificando', dados_coletados: {} }, tenantProductContext);

  assert.match(out, /Sinal: 30% do valor combinado pelo tatuador/);
  assert.match(out, /Estilos em que o estudio e especializado: fineline/);
  assert.match(out, /Estilos que NAO faz: tribal/);
  assert.match(out, /Estilo fora do foco exige avaliacao direta do tatuador/);
  assert.match(out, /NAO ACEITA cobertura/);
  assert.doesNotMatch(out, /legacy/);
});
