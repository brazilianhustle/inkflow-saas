// ── InkFlow — Grupos de Conversas: helper puro mapeando nome → estados + filtros ──
// Usado por list.js endpoint pra construir query Supabase.
// Função pura, sem side effects, sem fetch. Testável.

const GRUPOS = {
  hoje: {
    estados: ['coletando_tattoo', 'coletando_cadastro', 'escolhendo_horario', 'aguardando_sinal'],
    inclui_filtro_hoje: true,
  },
  aguardando: {
    estados: ['aguardando_tatuador', 'aguardando_decisao_desconto'],
    inclui_filtro_hoje: false,
  },
  negociacao: {
    estados: ['propondo_valor', 'lead_frio', 'pausada_tatuador'],
    inclui_filtro_hoje: false,
  },
  historico: {
    estados: ['fechado'],
    inclui_filtro_hoje: false,
  },
};

// Retorna ISO string de hoje 00:00 BRT (= 03:00 UTC).
// BRT é UTC-3 ano-redondo (Brasil aboliu DST em 2019).
function isoHojeBrtUtc() {
  const now = new Date();
  // Construir 00:00 UTC de hoje, depois +3h pra obter 03:00 UTC = 00:00 BRT.
  const utc0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0));
  // Edge: se agora UTC é antes de 03:00 (ex.: 02:30 UTC = 23:30 BRT do dia anterior),
  // "hoje BRT" ainda é o dia anterior. Subtrair 1 dia se aplicável.
  if (now.getTime() < utc0.getTime()) {
    utc0.setUTCDate(utc0.getUTCDate() - 1);
  }
  return utc0.toISOString();
}

export function getGrupoFilter(grupo) {
  if (typeof grupo !== 'string' || !GRUPOS[grupo]) return null;
  const cfg = GRUPOS[grupo];
  const result = { estados: cfg.estados };
  if (cfg.inclui_filtro_hoje) {
    result.last_msg_at_gte = isoHojeBrtUtc();
  }
  return result;
}

export const GRUPOS_VALIDOS = Object.keys(GRUPOS);
