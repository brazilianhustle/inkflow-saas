# Active Context - Atendimento Premium

Este e o primeiro arquivo a ler apos compactacao, troca de aba ou retomada. Ele deve caber em contexto curto e apontar apenas para os documentos necessarios do proximo passo.

## Estado De Comando

```text
status: organic_conversation_sentinel_pass
branch: main
autonomy_level: 4B
level_4c: bloqueado
onda_ativa: Wave 47 liberada para retomar
proxima_acao: retomar Wave 47 - Novo Pedido Depois Do Handoff
motivo: Organic Conversation Sentinel Pack passou em WhatsApp real burst de 3 bolhas e 2 bolhas apos fix estrutural
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
pass_3_bolhas: scenario-whatsapp-real-organic-burst-3-bubbles-20260527T163643Z-11019
pass_2_bolhas: scenario-whatsapp-real-organic-burst-2-bubbles-20260527T163821Z-10923
naturalness_v2: 2 PASS / 0 watchlist / 0 rework / 0 stop / media 2.88
```

## Regra Ativa

```text
HTTP production smoke = radar inicial
WhatsApp real central -> bot = validacao definitiva
Organic Conversation Sentinel = obrigatorio quando a frente envolve experiencia conversacional, abertura, coleta organica, naturalidade ou regressao manual real
```

## Proximo Ataque

1. Retomar `docs/atendimento-premium/72-level-4b-wave-47.md`.
2. Executar Micro-Slice 1 - Novo Pedido Depois Do Handoff.
3. Manter Organic Conversation Sentinel como gate principal para novas frentes conversacionais.

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
sentinel organico ausente apos nova regressao manual
bot responder como formulario quando o cliente trouxe briefing organico
bot ignorar fragmentos semanticamente relevantes em sequencia
bot responder entre bolhas de um burst real antes da ultima mensagem humana
mensagem duplicada, estado final errado ou IA depois de handoff humano
compactacao sem active context ou continuity bundle
```
