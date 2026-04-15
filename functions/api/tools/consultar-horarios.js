// ── Tool 3.2 — consultar_horarios_livres ───────────────────────────────────
// POST /api/tools/consultar-horarios
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, data_preferida?, duracao_h? }
// Retorna ate N slots livres (default 5) a partir de data_preferida, usando
// horario_funcionamento do tenant + agendamentos existentes (tentative/confirmed).

import { withTool, supaFetch } from './_tool-helpers.js';
import { slotsDoDia, filtrarConflitos, HORARIO_DEFAULT } from '../../_lib/agenda.js';

const MAX_SLOTS = 5;
const DIAS_LOOKAHEAD = 14;

function toBrISO(d) {
  return d.toISOString();
}

async function bumpEstadoEscolhendo(env, tenant_id, telefone) {
  if (!telefone) return;
  try {
    await supaFetch(env, `/rest/v1/conversas?tenant_id=eq.${encodeURIComponent(tenant_id)}&telefone=eq.${encodeURIComponent(telefone)}&estado=in.(qualificando,orcando,expirado)`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: 'escolhendo_horario', updated_at: new Date().toISOString() }),
    });
  } catch {}
}

export const onRequest = withTool('consultar_horarios_livres', async ({ env, input, context }) => {
  const { tenant_id, data_preferida, duracao_h, telefone } = input || {};
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };

  const r = await supaFetch(env, `/rest/v1/tenants?id=eq.${encodeURIComponent(tenant_id)}&select=horario_funcionamento,duracao_sessao_padrao_h`);
  if (!r.ok) return { status: 500, body: { ok: false, error: 'db-error' } };
  const rows = await r.json();
  if (!Array.isArray(rows) || rows.length === 0) return { status: 404, body: { ok: false, error: 'tenant-nao-encontrado' } };
  const t = rows[0];
  const horario = (t.horario_funcionamento && Object.keys(t.horario_funcionamento).length > 0)
    ? t.horario_funcionamento : HORARIO_DEFAULT;
  const duracao = Number(duracao_h) > 0 ? Number(duracao_h) : (t.duracao_sessao_padrao_h || 3);

  // Data de inicio
  let inicio = data_preferida ? new Date(data_preferida) : new Date();
  if (!Number.isFinite(inicio.getTime())) inicio = new Date();
  // Se cliente mandou data sem hora, comeca hoje; se e passado ou hoje, pula pro proximo dia util
  const agora = new Date();
  if (inicio.getTime() < agora.getTime()) inicio = agora;

  // Busca agendamentos futuros do tenant nos proximos N dias
  const ateData = new Date(inicio.getTime() + DIAS_LOOKAHEAD * 86400000);
  const aRes = await supaFetch(
    env,
    `/rest/v1/agendamentos?tenant_id=eq.${encodeURIComponent(tenant_id)}&inicio=gte.${encodeURIComponent(inicio.toISOString())}&inicio=lte.${encodeURIComponent(ateData.toISOString())}&status=in.(tentative,confirmed)&select=inicio,fim,status`
  );
  const agendamentos = aRes.ok ? await aRes.json() : [];

  // Gera slots dia a dia ate acumular MAX_SLOTS
  const slotsResp = [];
  for (let d = 0; d < DIAS_LOOKAHEAD && slotsResp.length < MAX_SLOTS; d++) {
    const dia = new Date(inicio);
    dia.setDate(dia.getDate() + d);
    dia.setHours(0, 0, 0, 0);
    const slotsDia = slotsDoDia(dia, horario, duracao);
    const livres = filtrarConflitos(slotsDia, agendamentos);
    // Se for hoje, filtra slots que ja passaram ou que comecam nas proximas 2h
    const agoraComBuffer = new Date(Date.now() + 2 * 3600000);
    const futuros = livres.filter(s => s.inicio > agoraComBuffer);
    for (const s of futuros) {
      if (slotsResp.length >= MAX_SLOTS) break;
      slotsResp.push({ inicio: toBrISO(s.inicio), fim: toBrISO(s.fim) });
    }
  }

  if (context && telefone && slotsResp.length > 0) {
    context.waitUntil(bumpEstadoEscolhendo(env, tenant_id, telefone));
  }

  return {
    status: 200,
    body: {
      ok: true,
      duracao_h: duracao,
      slots: slotsResp,
      total: slotsResp.length,
    },
  };
});
