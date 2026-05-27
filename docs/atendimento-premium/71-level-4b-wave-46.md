# Level 4B - Wave 46 - Tenant Config Em Modo Produto

## Objetivo

Provar que o bot respeita variacoes reais de configuracao do estudio, em vez de funcionar apenas no tenant atual com portfolio, estilos e regras ja favoraveis.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/68-frentes-finais-bot-premium.md
frente: Tenant/Config em modo produto
autonomy_level: 4B
level_4c: bloqueado
regra: mutacao de tenant so no tenant smoke controlado e sempre com snapshot/restore automatico
```

## Corte Inicial

```text
micro_slice_1: tenant sem portfolio
motivo: alto valor de produto, baixo risco financeiro/operacional
setup: tenant_portfolio_indisponivel
restore: tenant-restore.json + trap on_exit no runner
```

## Gates

```text
http_radar: obrigatorio
whatsapp_real: obrigatorio
tenant_restore: obrigatorio mesmo em falha
portfolio_tool: nao pode acionar enviar-portfolio
estado: coletando_tattoo
orcid: null
telemetria: tenant_context_portfolio_disponivel=false e portfolio_urls_count=0
```

## Status

```text
status: micro_slice_1_fechado_pass
decisao: tenant sem portfolio validado em HTTP radar + WhatsApp real definitivo
commit_funcional: a882ba8 fix: handle unavailable portfolio in router
```

## Falha Util E Correcao

O primeiro HTTP radar em producao provou que o `TenantContextManager` estava correto (`portfolio_disponivel=false`, `portfolio_urls_count=0`), mas o Agent operacional ignorou a intencao lateral e respondeu generico: `Me conta o que tu quer tatuar?`.

Decisao: nao remendar prompt. O comportamento foi promovido para o `ConversationRouter`: pedido de portfolio com portfolio indisponivel agora responde limite honesto, nao chama LLM e nao aciona `enviar-portfolio`.

## Evidencias

| Gate | Run ID | Resultado | Observacao |
|---|---|---|---|
| Testes locais | `npm test -- tests/_lib/conversation-router.test.mjs tests/_lib/whatsapp-pipeline.test.mjs` | PASS | 1220 pass / 0 fail |
| CI | `26499035681` | PASS | commit `a882ba8` |
| Deploy | `26499035721` | PASS | Cloudflare Pages deploy verde |
| HTTP radar | `scenario-lateral-portfolio-indisponivel-20260527T080754Z-25213` | PASS | tenant restore ok; sem envio de portfolio |
| WhatsApp real | `scenario-whatsapp-real-lateral-portfolio-indisponivel-20260527T080836Z-6152` | PASS | Evolution `central -> bot (*2357)` |
| Naturalness V2 | `.smoke-evidence/scenario-whatsapp-real-lateral-portfolio-indisponivel-20260527T080836Z-6152/` | PASS | 1 PASS / 0 watchlist / 0 rework / 0 stop, media 2.88 |

## Provas Conclusivas Reais

```text
Cliente: "tem exemplos de fineline?"
Bot: "Ainda nao tenho portfolio cadastrado aqui no chat. Mas posso seguir com teu atendimento: Me conta o que tu pensa em tatuar?"
```

## Garantias Observadas

```text
estado_final: coletando_tattoo
orcid: null
tenant_restore: ok
router_intent: portfolio_requested
router_reason: portfolio_unavailable_for_tenant
tenant_context_portfolio_disponivel: false
tenant_context_portfolio_urls_count: 0
portfolio_tool: nao acionada
copy_risk: baixo
```

## Proximo Corte

```text
decisao_metodologica: nao abrir nova variacao restritiva de tenant sem nova hipotese
proxima_variacao_possivel: identidade/vocabulario do estudio ou modo atendimento
condicao: somente se houver contrato objetivo de personalizacao positiva
alternativa_recomendada: fechar Wave 46 e abrir Replanejamento/Novo Pedido
autonomy_level: manter 4B
level_4c: segue bloqueado
```

## Strategic Slice Gate Da Wave 46

```text
hipotese_estrategica_original: bot respeita variacoes reais de configuracao do estudio, sem funcionar apenas no tenant atual
tipo: produto + risco
risco_principal: resposta generica ou operacionalmente errada quando a configuracao do estudio muda
evidencia_minima: pelo menos 2 variacoes com HTTP radar, WhatsApp real, telemetria tenant_context e restore quando houver mutacao
criterio_de_fechamento: limites por tenant provados sem LLM indevido, sem orcamento indevido e sem estado inseguro
decisao_liberada_se_passar: nao continuar abrindo restricoes equivalentes; escolher personalizacao positiva ou mudar de frente
```

Leitura critica apos tres micro-slices:

```text
tenant_sem_portfolio: provou ativo ausente
estilo_fora_catalogo: provou catalogo/restricao de estilo
cobertura_nao_aceita: provou regra operacional negativa com setup/restore
veredito: hipotese de limites restritivos por tenant esta suficientemente provada
```

Nao abrir novos micro-slices do tipo "tenant nao aceita X" sem evidencia de risco novo. Essa familia agora deve sair de micro-slices restritivos para uma destas decisoes:

- um ultimo slice positivo de identidade/modo, se houver contrato objetivo;
- ou fechamento da Wave 46 e abertura de Replanejamento/Novo Pedido.

## Micro-Slice 2 - Estilo Fora Do Catalogo

```text
status: fechado_pass
commit_funcional: c77bfdd fix: handle tenant unsupported tattoo styles
decisao: estilo reconhecido fora do catalogo aceito do tenant e tratado pelo Router, sem LLM e sem mutacao de estado/dados
```

O bot agora identifica `old school` como estilo reconhecido, cruza com `tenant_rules.estilos_aceitos` e responde limite de escopo quando o estilo nao pertence ao catalogo aceito. A resposta preserva `coletando_tattoo`, nao persiste `estilo`, nao cria `orcid` e nao entra em financeiro/agenda.

## Evidencias Micro-Slice 2

| Gate | Run ID | Resultado | Observacao |
|---|---|---|---|
| Testes locais | `npm test -- tests/_lib/conversation-router.test.mjs tests/_lib/whatsapp-pipeline.test.mjs` | PASS | 1222 pass / 0 fail |
| CI | `26499569403` | PASS | commit `c77bfdd` |
| Deploy | `26499569488` | PASS | Cloudflare Pages deploy verde |
| HTTP radar | `scenario-tenant-style-out-of-catalog-20260527T112003Z-6720` | PASS | estado preservado; sem persistir estilo; agent-log confirmou catalogo do tenant |
| WhatsApp real | `scenario-whatsapp-real-tenant-style-out-of-catalog-20260527T153034Z-16310` | PASS | Evolution `central -> bot (*2357)` |
| Naturalness V2 | `.smoke-evidence/scenario-whatsapp-real-tenant-style-out-of-catalog-20260527T153034Z-16310/` | PASS | 1 PASS / 0 watchlist / 0 rework / 0 stop, media 2.88 |

## Provas Conclusivas Reais Micro-Slice 2

```text
Cliente: "voces fazem old school?"
Bot: "Esse estilo nao esta no foco do estudio por aqui. Posso seguir se voce quiser adaptar pra outro estilo, ou acionar o estudio pra avaliar direto."
```

## Garantias Observadas Micro-Slice 2

```text
estado_final: coletando_tattoo
orcid: null
dados_coletados: {}
router_intent: tenant_unsupported_style
router_reason: tenant_style_not_accepted
router_can_mutate_state: false
tenant_context_has_style_catalog: true
tenant_context_has_accepted_styles: true
copy_risk: baixo
```

## Micro-Slice 3 - Cobertura Nao Aceita Pelo Tenant

```text
status: fechado_pass
commit_funcional: 1f9f561 fix: respect tenant cover up policy
setup: tenant_cobertura_nao_aceita
restore: tenant-restore.json + tenant-restore-status.txt
decisao: cobertura textual em tenant com aceita_cobertura=false e recusada pelo Router, sem LLM, sem handoff e sem orcamento
```

O runner ganhou setup reversivel para alterar apenas `config_agente.aceita_cobertura=false` no tenant smoke controlado. O Router agora diferencia cobertura aceita de cobertura nao aceita pelo estudio: se o tenant nao aceita cobertura, a resposta preserva estado e orienta o cliente a seguir apenas com tattoo nova em outro local.

## Evidencias Micro-Slice 3

| Gate | Run ID | Resultado | Observacao |
|---|---|---|---|
| Testes locais | `npm test -- tests/_lib/conversation-router.test.mjs tests/_lib/whatsapp-pipeline.test.mjs` | PASS | 1224 pass / 0 fail |
| CI | `26521712945` | PASS | commit `1f9f561` |
| Deploy | `26521712944` | PASS | Cloudflare Pages deploy verde |
| HTTP radar | `scenario-tenant-cover-up-not-accepted-20260527T154140Z-9998` | PASS | setup/restore ok; estado preservado; sem handoff/orcamento |
| WhatsApp real | `scenario-whatsapp-real-tenant-cover-up-not-accepted-20260527T154546Z-7369` | PASS | Evolution `central -> bot (*2357)` |
| Naturalness V2 | `.smoke-evidence/scenario-whatsapp-real-tenant-cover-up-not-accepted-20260527T154546Z-7369/` | PASS | 1 PASS / 0 watchlist / 0 rework / 0 stop, media 2.88 |

## Provas Conclusivas Reais Micro-Slice 3

```text
Cliente: "quero cobrir uma tattoo antiga no braco"
Bot: "Esse estudio nao faz cobertura por aqui. Se voce pensar em uma tattoo nova em outro local, posso seguir te ajudando."
```

## Garantias Observadas Micro-Slice 3

```text
estado_final: coletando_tattoo
orcid: null
dados_coletados: {}
tenant_restore: ok
router_intent: tenant_cover_up_not_accepted
router_reason: tenant_cover_up_not_accepted
router_can_mutate_state: false
tenant_context_aceita_cobertura: false
sem_handoff: true
sem_telegram: true
copy_risk: baixo
```
