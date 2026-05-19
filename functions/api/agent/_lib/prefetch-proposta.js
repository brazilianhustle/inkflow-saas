// functions/api/agent/_lib/prefetch-proposta.js
import { callTool } from './call-tool.js';

export async function prefetchPropostaContext({ env, tenant, conversa, telefone, estado_atual }) {
  const ctx = {
    valor_proposto: conversa?.valor_proposto ?? null,
    decisao_desconto: conversa?.dados_coletados?.decisao_desconto ?? null,
  };

  if (estado_atual === 'propondo_valor' || estado_atual === 'escolhendo_horario') {
    // NAO passa telefone — evita side-effect bumpEstadoEscolhendo da tool.
    const r = await callTool(env, 'consultar-horarios', {
      tenant_id: tenant.id,
      data_preferida: null,
    });
    ctx.horarios_livres = r.ok ? (r.slots || []) : [];
  }

  if (estado_atual === 'aguardando_sinal') {
    // Caminho C Fase 2B TC-P09: agendamento ativo do cliente. Slot ja
    // reservado nao consta em horarios_livres — extractPropostaAction
    // (contract) aceita slot em horarios_livres OR slots_reservados.
    const r = await callTool(env, 'consultar-proposta-tatuador', {
      tenant_id: tenant.id,
      telefone,
    });
    ctx.proposta_status = r.ok ? r.status : null;
    ctx.slots_reservados = r.ok && Array.isArray(r.slots_reservados) ? r.slots_reservados : [];
  }

  return ctx;
}
