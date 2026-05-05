// ── InkFlow — Lifecycle helper pra transições terminais de conversas ──
// Centraliza a lógica de "marcar conversa como fechada" pra evitar drift entre callers.
// Callers automáticos:
//   - mp-sinal-handler.js (motivo='sinal_pago' após estado='confirmado')
//   - cron/expira-holds.js (motivo='hold_expirado' após estado='expirado')
// Motivo 'tatuador_descartou' enum-ready sem caller atual (YAGNI).

export const MOTIVOS_FECHAR_VALIDOS = Object.freeze([
  'sinal_pago',
  'hold_expirado',
  'tatuador_descartou',
]);

/**
 * Marca conversa como fechada (estado_agente='fechado' + motivo + timestamp em dados_coletados).
 * Idempotente: chamadas repetidas retornam ja_estava_fechada=true sem efeito.
 *
 * @param {object} args
 * @param {string} args.supabaseUrl - ex.: 'https://bfzuxxuscyplfoimvomh.supabase.co'
 * @param {string} args.supabaseKey - service role key
 * @param {string} args.conversa_id - UUID da conversa
 * @param {string} args.motivo - um de MOTIVOS_FECHAR_VALIDOS
 * @returns {Promise<{fechada: boolean, ja_estava_fechada: boolean}>}
 * @throws {Error} se motivo inválido, conversa não encontrada, ou rede/PostgREST falhar
 */
export async function markConversaFechada({ supabaseUrl, supabaseKey, conversa_id, motivo }) {
  if (!MOTIVOS_FECHAR_VALIDOS.includes(motivo)) {
    throw new Error(`motivo inválido: ${motivo}. Válidos: ${MOTIVOS_FECHAR_VALIDOS.join(', ')}`);
  }
  if (typeof conversa_id !== 'string' || !conversa_id) {
    throw new Error('conversa_id obrigatório');
  }

  const baseHeaders = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  // 1) Read current dados_coletados + estado_agente (preserva keys existentes)
  const r1 = await fetch(
    `${supabaseUrl}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&select=dados_coletados,estado_agente`,
    { headers: baseHeaders }
  );
  if (!r1.ok) throw new Error(`fetch conversa falhou: ${r1.status}`);
  const rows = await r1.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`conversa ${conversa_id} não encontrada`);
  }
  const conv = rows[0];

  // Short-circuit: já estava fechada
  if (conv.estado_agente === 'fechado') {
    return { fechada: false, ja_estava_fechada: true };
  }

  const dadosAtualizados = {
    ...(conv.dados_coletados || {}),
    fechado_motivo: motivo,
    fechado_em: new Date().toISOString(),
  };

  // 2) PATCH com idempotência via filtro estado_agente=neq.fechado.
  // Se outro processo fechou nessa janela, PATCH afeta 0 rows → ja_estava_fechada.
  const r2 = await fetch(
    `${supabaseUrl}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&estado_agente=neq.fechado`,
    {
      method: 'PATCH',
      headers: {
        ...baseHeaders,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        estado_agente: 'fechado',
        dados_coletados: dadosAtualizados,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!r2.ok) {
    const errText = await r2.text().catch(() => '');
    throw new Error(`PATCH conversa falhou: ${r2.status} ${errText}`);
  }
  const updated = await r2.json();
  return {
    fechada: Array.isArray(updated) && updated.length > 0,
    ja_estava_fechada: Array.isArray(updated) && updated.length === 0,
  };
}
