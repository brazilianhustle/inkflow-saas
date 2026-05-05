// ── InkFlow — Grupos de Conversas: helper puro mapeando nome → estados + filtros ──
// Usado por list.js endpoint pra construir query Supabase cross-column.
// Função pura, sem side effects, sem fetch. Testável.
//
// Retorna 2 listas separadas porque:
//   `estado` é workflow do bot (escolhendo_horario, aguardando_sinal, confirmado, etc.)
//   `estado_agente` é fase de negociação humana (coletando_tattoo, propondo_valor, etc.)
// Painel "Hoje" precisa cruzar ambas. Caller (list.js) usa OR query quando ambas têm itens,
// ou forma direta quando só uma tem.

const GRUPOS = {
  hoje: {
    estados_agente: ['coletando_tattoo', 'coletando_cadastro'],
    estados: ['escolhendo_horario', 'aguardando_sinal'],
    inclui_filtro_hoje: true,
  },
  aguardando: {
    estados_agente: ['aguardando_tatuador', 'aguardando_decisao_desconto'],
    estados: [],
    inclui_filtro_hoje: false,
  },
  negociacao: {
    estados_agente: ['propondo_valor', 'lead_frio', 'pausada_tatuador'],
    estados: [],
    inclui_filtro_hoje: false,
  },
  historico: {
    estados_agente: ['fechado'],
    estados: [],
    inclui_filtro_hoje: false,
  },
};

// Retorna ISO string de hoje 00:00 BRT (= 03:00 UTC).
// BRT é UTC-3 ano-redondo (Brasil aboliu DST em 2019).
function isoHojeBrtUtc() {
  const now = new Date();
  const utc0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0));
  if (now.getTime() < utc0.getTime()) {
    utc0.setUTCDate(utc0.getUTCDate() - 1);
  }
  return utc0.toISOString();
}

export function getGrupoFilter(grupo) {
  if (typeof grupo !== 'string' || !GRUPOS[grupo]) return null;
  const cfg = GRUPOS[grupo];
  // Defensive: ambas listas vazias é estado inválido — não deve ocorrer com mapping atual.
  if (!cfg.estados_agente.length && !cfg.estados.length) return null;
  const result = {
    estados_agente: cfg.estados_agente,
    estados: cfg.estados,
  };
  if (cfg.inclui_filtro_hoje) {
    result.last_msg_at_gte = isoHojeBrtUtc();
  }
  return result;
}

export const GRUPOS_VALIDOS = Object.keys(GRUPOS);
