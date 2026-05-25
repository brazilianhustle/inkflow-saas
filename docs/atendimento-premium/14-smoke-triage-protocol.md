# Smoke Triage Protocol

Este protocolo transforma falha de smoke em diagnostico operacional. O objetivo e evitar debate solto depois de um FAIL: o evidence dir precisa dizer se o problema e infraestrutura, contrato de estado, handoff, resposta ausente ou linguagem.

## Comando Manual

```bash
bash scripts/smoke/render-triage.sh .smoke-evidence/<run_id> <exit_code>
```

O `run-scenario.sh` chama esse script automaticamente quando um scenario falha.

## Arquivo Gerado

```text
.smoke-evidence/<run_id>/triage.md
```

## Classes De Falha

```text
infra_evolution_send          Evolution/sendText falhou ou instancia nao enviou
infra_inbound_http            webhook HTTP retornou erro
pipeline_failed_message       existe conversa_mensagens.status=failed
contract_state_not_reached    EXPECTED_STATE nao foi atingido
contract_handoff_without_orcid aguardando_tatuador sem orcid
webhook_human_not_recorded    mensagem humana nao entrou no Supabase
agent_no_response             humano entrou, mas nao houve AI
copy_risk_high                fluxo tecnico passou, mas linguagem falhou
scenario_gate_failed          gate final bloqueou sem classe mais especifica
pass_triage                   baseline sem acao corretiva obrigatoria
unknown                       evidencia insuficiente
```

## Sinais Minimos

O `triage.md` registra:

- `run_id`, `scenario_id`, `scenario_type`, `exit_code`;
- `failure_class`;
- `expected_state`, `final_state`, `orcid`, `copy_risk`;
- contadores de mensagens humanas, AI e failed;
- ultima mensagem humana e ultima resposta do bot;
- sinal resumido da tail;
- proxima acao recomendada.

## Regra De Decisao

- `infra_*`: corrigir ambiente, Evolution, webhook ou runtime antes de mexer no plano do bot.
- `contract_*`: reabrir plano do slice; o contrato esperado nao foi cumprido.
- `copy_risk_*`: manter fluxo tecnico e atacar linguagem, ResponseComposer ou prompt.
- `agent_no_response`: investigar fila/session queue e logs do agent.
- `pass_triage`: registrar baseline e seguir para o proximo scenario.

## Padrao De Guerra

Depois de qualquer FAIL:

1. abrir `triage.md`;
2. confirmar `failure_class`;
3. abrir apenas os artefatos apontados pela classe;
4. corrigir em mini-passo;
5. rerodar o mesmo scenario;
6. registrar PASS/FAIL em `smoke-runs.md`.
