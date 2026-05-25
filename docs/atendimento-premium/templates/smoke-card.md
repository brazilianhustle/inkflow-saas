# Smoke: `<intent/cenario>`

## Data

`YYYY-MM-DD`

## Objetivo

O que este smoke valida.

## Ambiente

- URL:
- tenant:
- telefone:
- branch/deploy:
- feature flags:

## Estado Inicial

- `estado_agente`:
- `dados_coletados`:
- `dados_cadastro`:
- observações:

## Script De Mensagens

1. Cliente:
   ```text
   
   ```
2. Cliente:
   ```text
   
   ```

## Resultado Esperado

- resposta:
- estado:
- dados persistidos:
- side effects:
- logs:

## Resultado Real

- resposta:
- estado:
- dados persistidos:
- side effects:
- logs:

## Prova De Mensagem Real

Preencher quando `SCENARIO_TYPE=whatsapp_real`.

- envio Evolution:
  - arquivo: `evolution-send.json`
  - instance:
  - destino bot:
  - http_status:
  - message id:
- webhook/Supabase:
  - arquivo: `poll.json`
  - humano `received`:
  - bot `processed`:
- transcript:
  - arquivo: `transcript.md`
  - ultimo humano:
  - ultimo bot:
- julgamento:
  - arquivo: `judgment.md`
  - copy_risk:
- observabilidade, se aplicavel:
  - arquivo: `agent-turn-logs.json`
  - gate: `scenario-agent-log-jq.txt`
  - decisao observada:

## Veredito

`pass | partial | fail`

## Achados

- 
- 

## Ações

- 
- 
