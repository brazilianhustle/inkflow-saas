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
proxima_variacao_recomendada: estilo fora do catalogo aceito do tenant
motivo: valida personalizacao por regra de estudio sem entrar ainda em financeiro/agenda
autonomy_level: manter 4B
level_4c: segue bloqueado
```
