# Active Context - Atendimento Premium

Este e o primeiro arquivo a ler apos compactacao, troca de aba ou retomada. Ele deve caber em contexto curto e apontar apenas para os documentos necessarios do proximo passo.

## Estado De Comando

```text
status: wave_47_micro_slice_1_full_journey_pass
branch: main
autonomy_level: 4B
level_4c: bloqueado
onda_ativa: Wave 47 - Replanejamento E Novo Pedido
proxima_acao: decidir proximo subcaso da Wave 47: replanejamento antes do handoff ou conversa antiga nao-terminal
motivo: cobertura terminal pos-handoff passou em WhatsApp real full journey desde o inicio
```

## Evidencia Que Travou A Frente

```text
origem: teste manual WhatsApp real do usuario
cliente: "opa" / "tranquilo" / "quero fzr uma tattoo" / "na perna" / "um dragao bolado" / "grandao"
bot: "Tu imagina fazer em qual parte do corpo?" / "Qual tua altura?"
falhas: abertura pouco humanizada, nao reagiu ao briefing "dragao bolado", tratou conversa organica como formulario, fragmentos multi-bolha nao viraram contexto rico
classificacao: gap metodologico + gap conversacional
decisao: falha corrigida e sentinel organico definitivo passou
```

## Evidencia Definitiva

```text
falha_inicial: scenario-whatsapp-real-organic-burst-3-bubbles-20260527T163151Z-11946
fix_commit: 1374747 fix: handle organic tattoo burst briefing
pass_lead_new_3_bolhas: scenario-whatsapp-real-organic-burst-3-bubbles-20260527T165145Z-10140
pass_continuous_3_bolhas: scenario-whatsapp-real-organic-continuous-burst-3-bubbles-20260527T165236Z-21063
pass_continuous_2_bolhas: scenario-whatsapp-real-organic-continuous-burst-2-bubbles-20260527T165321Z-29744
fix_continuous_commit: 9c6f635 fix: keep organic burst conversations continuous
naturalness_v2_continuous: 2 PASS / 0 watchlist / 0 rework / 0 stop / media 2.88
wave_47_full_journey_pos_handoff: scenario-whatsapp-real-long-journey-post-handoff-new-request-20260527T172227Z-14895
wave_47_decisao: PASS; novo pedido pos-handoff foi encaminhado ao humano sem IA nova, sem novo ORCID, com tail delta limpo
```

## Regra Ativa

```text
HTTP production smoke = radar inicial
WhatsApp real central -> bot = validacao definitiva
Organic Conversation Sentinel = obrigatorio quando a frente envolve experiencia conversacional, abertura, coleta organica, naturalidade ou regressao manual real
Lead-new burst valida abertura; continuous burst sem cleanup valida conversa real
Full Journey Validation Gate: seed de meio de fluxo pode ser radar tecnico, mas validacao definitiva deve comecar do inicio quando o comportamento depende de contexto acumulado
```

## Proximo Ataque

1. Nao reabrir o subcaso terminal pos-handoff sem falha nova.
2. Escolher o proximo subcaso da Wave 47: mudanca de ideia antes do handoff ou conversa antiga nao-terminal/retomada.
3. Continuar exigindo jornada completa desde o inicio quando o comportamento depender de contexto acumulado.
4. Manter tail delta por etapa como regra obrigatoria para gates de observabilidade.

## Arquivos Para Ler

```text
docs/atendimento-premium/52-premium-operational-chain.md
docs/atendimento-premium/73-organic-conversation-sentinel-pack.md
docs/atendimento-premium/72-level-4b-wave-47.md
docs/atendimento-premium/current-objective.md somente se precisar de historico amplo
docs/atendimento-premium/smoke-runs.md somente se precisar de evidencia antiga
scripts/smoke/continuity-bundle.sh
```

## Politica De Contexto

```text
nao_ler_tudo_por_padrao: sim
fonte_primaria_de_retomada: docs/atendimento-premium/00-active-context.md
historico_duravel: docs/atendimento-premium/current-objective.md
indice_de_evidencia: docs/atendimento-premium/smoke-runs.md
wave_docs: ler somente a onda ativa ou a onda citada no active context
```

## Stop Conditions Atuais

```text
WhatsApp real ausente em comportamento conversacional
fechamento definitivo com seed de meio de fluxo quando o risco depende de contexto acumulado
sentinel organico ausente apos nova regressao manual
bot responder como formulario quando o cliente trouxe briefing organico
bot ignorar fragmentos semanticamente relevantes em sequencia
bot responder entre bolhas de um burst real antes da ultima mensagem humana
mensagem duplicada, estado final errado ou IA depois de handoff humano
compactacao sem active context ou continuity bundle
```
