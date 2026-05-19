// functions/_lib/agent-runtime/contracts/cadastro-handoff.js
// Contrato cross-agent: payload validado quando estado='cadastro' transiciona
// pra 'aguardando_tatuador' via proxima_acao='handoff'.
//
// Espelha tattoo-handoff.js (Fase 1).
// Spec Caminho C Fase 2 section 2.1.
import { z } from 'zod';

export const CadastroHandoffPayload = z.object({
  nome: z.string().min(1),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email().nullable(),
  email_recusado: z.boolean(),
});

export function extractCadastroHandoff(out) {
  if (!out || out.proxima_acao !== 'handoff') return null;
  return CadastroHandoffPayload.parse({
    nome: out.dados_persistidos?.nome,
    data_nascimento: out.dados_persistidos?.data_nascimento,
    email: out.dados_persistidos?.email ?? null,
    email_recusado: out.email_recusado,
  });
}
