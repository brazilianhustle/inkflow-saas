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
proxima_variacao_recomendada: regra especifica de menoridade/cobertura por estudio ou identidade/vocabulario do estudio
motivo: valida personalizacao por regra de estudio sem entrar ainda em financeiro/agenda amplo
autonomy_level: manter 4B
level_4c: segue bloqueado
```

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
