# Failure Taxonomy — 2 eixos

Toda failure entry tem `type` (tipo de falha) + `layers` (camadas onde manifesta) no frontmatter.

## Eixo 1 — Tipo de falha

| Tipo | Exemplo |
|---|---|
| `hallucination` | Bot inventa preço, agenda, política |
| `policy_violation` | Bot sugere tamanho (viola P1), confronta cliente |
| `drift_persona` | Bot sai do tom (vira robô formal mid-conversa) |
| `format_error` | Output sem `?` em pergunta, mensagem-textão sem split |
| `state_error` | Bot transiciona pra estado errado |
| `data_error` | Schema rejeita input válido (data BR, telefone fmt) |
| `tool_error` | Tool falha + bot não comunica isso |
| `invariant_violation` | Output passa pelo invariante mas semanticamente errado |
| `latency` | Resposta >10s percebido pelo cliente |
| `cost` | Turn consome >X tokens sem justificativa |

## Eixo 2 — Camada onde manifesta

| Camada | Local de fix |
|---|---|
| `prompt` | `functions/_lib/prompts/coleta/<agent>/*.js` |
| `schema_invariant` | `functions/api/agent/agents/<agent>.js` (Zod + validador) |
| `pipeline` | `functions/_lib/whatsapp-pipeline.js` |
| `tool` | `functions/api/tools/*.js` |
| `provider` | LLM model issue (raro, pode levar à mudança de modelo) |
| `data` | Migration / schema Supabase |

## Status lifecycle

```
[open] ─── contramedida em prod ──► [mitigated]
   ▲                                    │
   │ regressão                          │ regression test passa N ciclos (4 weeks default)
   │                                    ▼
   └────────── reabertura ────────  [fixed]
                                        │
                                        │ failure obsoleto (schema mudou)
                                        ▼
                                    [archived]
```

## Regras

- `agents_affected`: lista os agents que sofrem com o failure
- `personas_exposing`: lista as personas (PER-NNN) que historicamente expõem
- `manifesto_principle`: opcional — P1-P6 quando aplicável
- Lint `scripts/inkflow-agent/failure-catalog-lint.mjs` valida cross-refs
