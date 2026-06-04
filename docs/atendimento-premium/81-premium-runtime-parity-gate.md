# Premium Runtime Parity Gate

## Motivo

O teste manual real em 2026-06-04 mostrou resposta imediata e mecanica no WhatsApp:

```text
cliente: "oi, voces fazem old school?"
bot: "Oi, tudo bem. Peguei a ideia: oi, voces fazem old school?. Tu imagina fazer em qual parte do corpo?"
```

Isso invalida qualquer PASS baseado apenas em HTTP smoke ou copy isolada. Antes de continuar slices de naturalidade, a cadeia runtime precisa provar que a conversa real passa pelo mesmo contrato premium esperado: inbound -> SessionQueue -> process-batch -> pipeline -> router/workflow/escalation -> resposta unica.

## Contrato De PASS

Um cenario conversacional premium so passa quando a evidencia real mostrar:

- `session_queue_observed == true` em `agent_turn_logs.context_metadata`.
- `session_queue_version == "session_queue_v1"`.
- `session_queue_batch_message_count` igual ou maior que as bolhas humanas do burst.
- `session_queue_silence_wait_ms >= 10000` para bursts organicos.
- Uma unica mensagem AI depois do lote, sem resposta intermediaria para cada balao.
- `client_input_text` do router contendo o briefing agrupado, nao apenas a primeira bolha.
- Decisao registrada pelo agente correto (`conversation_router`, `workflow_manager`, `escalation_manager` ou `stale_batch_guard`) com os metadados da fila.

## Cenarios Obrigatorios

```text
whatsapp-real-organic-burst-2-bubbles
whatsapp-real-organic-burst-3-bubbles
whatsapp-real-organic-continuous-burst-2-bubbles
whatsapp-real-organic-continuous-burst-3-bubbles
```

Esses cenarios agora exigem metadados reais da SessionQueue no log do router. Se o bot responder instantaneamente, se o binding da fila nao estiver ativo, ou se o processamento cair por rota direta, o smoke deve falhar.

## Observador Manual

Quando o operador precisa mandar as bolhas pelo WhatsApp, usar:

```sh
MIN_BUBBLES=2 SMOKE_SENDER_PHONE=5521970789797 bash scripts/smoke/observe-premium-runtime-gate.sh
```

O script nao envia WhatsApp. Ele abre uma janela de observacao, grava `poll.json`, consulta `agent-turn-logs.json` e aplica o mesmo contrato de fila: uma unica resposta AI depois do burst e `session_queue_*` no `conversation_router`.

## Regra De Avanco

Enquanto esse gate nao passar em deploy + WhatsApp real, nao continuar slices de naturalidade, copy, prompt ou estilo. Ajuste pontual de texto pode mascarar a falha, mas nao corrige a arquitetura.

Quando o gate passar, retomar a comparacao com o bot premium legado em `inkflow-platform` por camadas:

```text
session_queue
bot_orchestrator
bot_brain_premium
tenant_context
conversation_policy
response_strategy
guardrails
naturalness_rubric
```
