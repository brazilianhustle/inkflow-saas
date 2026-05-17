// functions/_lib/agent-runtime/contracts/tattoo-handoff.js
// Contrato cross-agent: payload validado quando estado='tattoo' transiciona
// pra 'cadastro' via proxima_acao='handoff'.
//
// Espelha as garantias do branch HandoffOutput do TattooOutputSchema, mas
// existe como contrato explicito (Principio 2 spec Caminho C Fase 1):
// router consome pra validar pre-condicoes de transicao independente do
// schema do agent (separation of concerns).
import { z } from 'zod';

export const TattooHandoffPayload = z.object({
  descricao_curta: z.string().min(1),
  local_corpo: z.string().min(1),
  altura_cm: z.number().positive().max(250),
  estilo: z.string().min(1),
  tamanho_cm: z.number().positive().max(200).nullable(),
  cor_preferencia: z.string().nullable(),
  foto_local: z.string().nullable(),
});

export function extractHandoffPayload(tattooOutput) {
  if (!tattooOutput || tattooOutput.proxima_acao !== 'handoff') return null;
  return TattooHandoffPayload.parse(tattooOutput.dados_persistidos);
}
