// Tool — handoff_to_cadastro — sinaliza fim da fase tattoo.
// POST /api/tools/handoff-to-cadastro
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, telefone, dados_completos, campos_conflitantes }
//
// Sub-1: stub no-op que valida invariante (dados_completos=true E
// campos_conflitantes=[]) e retorna { ok, handoff, proximo_estado }.
// Persistencia real (mover state.estado_agente em conversas) fica pra Sub-3.
//
// Substitui o sinal `proxima_fase: 'cadastro'` que a tool dados_coletados
// retornava implicitamente no single-agent. Aqui e EXPLICITO.
import { withTool } from './_tool-helpers.js';

async function handle({ input }) {
  const tenant_id = String(input?.tenant_id || '').trim();
  const telefone = String(input?.telefone || '').trim();
  // Strict equality: LLMs as vezes serializam boolean como string "false" — Boolean("false")===true seria silent-pass.
  const dados_completos = input?.dados_completos === true;
  const campos_conflitantes = Array.isArray(input?.campos_conflitantes) ? input.campos_conflitantes : [];

  if (!tenant_id || !telefone) {
    return { status: 400, body: { ok: false, error: 'tenant_id e telefone obrigatorios' } };
  }

  if (!dados_completos) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'dados_completos=false — handoff so quando coleta tattoo terminar',
      },
    };
  }

  if (campos_conflitantes.length > 0) {
    return {
      status: 400,
      body: {
        ok: false,
        error: `campos_conflitantes nao-vazio: ${campos_conflitantes.join(', ')} — resolva antes de handoff`,
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      handoff: true,
      proximo_estado: 'cadastro',
      tenant_id,
      telefone,
    },
  };
}

export const onRequest = withTool('handoff_to_cadastro', handle);
