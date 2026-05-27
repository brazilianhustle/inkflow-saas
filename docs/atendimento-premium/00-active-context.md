# Active Context - Atendimento Premium

Este e o primeiro arquivo a ler apos compactacao, troca de aba ou retomada. Ele deve caber em contexto curto e apontar apenas para os documentos necessarios do proximo passo.

## Estado De Comando

```text
status: replanejamento_metodologico_organic_sentinel
branch: main
autonomy_level: 4B
level_4c: bloqueado
onda_ativa: Wave 47 pausada antes da execucao
proxima_acao: criar Organic Conversation Sentinel Pack antes de retomar Wave 47
motivo: teste manual WhatsApp real mostrou regressao organica nao coberta por micro-slices controlados
```

## Evidencia Que Travou A Frente

```text
origem: teste manual WhatsApp real do usuario
cliente: "opa" / "tranquilo" / "quero fzr uma tattoo" / "na perna" / "um dragao bolado" / "grandao"
bot: "Tu imagina fazer em qual parte do corpo?" / "Qual tua altura?"
falhas: abertura pouco humanizada, nao reagiu ao briefing "dragao bolado", tratou conversa organica como formulario, fragmentos multi-bolha nao viraram contexto rico
classificacao: gap metodologico + gap conversacional
decisao: nao executar novos slices conversacionais sem sentinel organico
```

## Regra Ativa

```text
HTTP production smoke = radar inicial
WhatsApp real central -> bot = validacao definitiva
Organic Conversation Sentinel = obrigatorio quando a frente envolve experiencia conversacional, abertura, coleta organica, naturalidade ou regressao manual real
```

## Proximo Ataque

1. Oficializar Organic Conversation Sentinel Pack.
2. Cobrir conversa organica multi-bolha de primeiro contato com slang/fragmentos.
3. Exigir transcript real, tail, agent logs, estado final e julgamento de naturalidade.
4. So depois retomar Wave 47 - Replanejamento/Novo Pedido.

## Arquivos Para Ler

```text
docs/atendimento-premium/52-premium-operational-chain.md
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
sentinel organico ausente apos regressao manual
bot responder como formulario quando o cliente trouxe briefing organico
bot ignorar fragmentos semanticamente relevantes em sequencia
mensagem duplicada, estado final errado ou IA depois de handoff humano
compactacao sem active context ou continuity bundle
```
