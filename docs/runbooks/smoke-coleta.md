# Runbook — Smoke da coleta (InkFlow)

Processo padrao pra rodar um smoke E2E da coleta/proposta num tenant de teste,
do zero, sem contaminacao. Tudo bash puro (curl + jq) + wrangler pro tail.

Spec/design: `docs/superpowers/specs/2026-05-22-smoke-harness-design.md`.

## Pre-requisitos

- `.dev.vars` na raiz com `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- `jq` e `curl` instalados.
- `wrangler login` feito (ou `CLOUDFLARE_API_TOKEN` no ambiente) — so pro tail.
- Tenant de teste: `db686ef2-...` (InkFlow Sub4 Test). Telefone: `5521970789797`.

## Fluxo

1. **Validar schema** (nunca limpa com schema divergente):
   ```bash
   bash scripts/smoke/preflight.sh
   ```
   Espera `OK: schema valido`. Avisos sobre `chat_messages`/`chats`/`dados_cliente`/`tenants`
   sao esperados (vestigiais n8n + a tabela `tenants` que tem coluna de telefone do estudio;
   nenhuma esta no manifest de proposito).

2. **Limpar o terreno** (rastro de conversa do telefone de teste):
   ```bash
   bash scripts/smoke/clean.sh 5521970789797
   ```
   Confirma o DELETE; ao final `total residuo: 0`.

3. **Ligar o tail** (noutro terminal, deixa rodando):
   ```bash
   bash scripts/smoke/tail.sh
   ```
   Linhas prefixadas `[pages]` / `[cron]`.

4. **Executar os roteiros** pelo WhatsApp (tabela abaixo).

5. **Inspecionar entre passos**:
   ```bash
   bash scripts/smoke/verify.sh 5521970789797
   ```

## Template de roteiro

| # | Roteiro (passos) | O que testamos | Resposta esperada | Como verificar |
|---|---|---|---|---|
| - | (passos numerados do que digitar no WhatsApp) | (a regra/comportamento sob teste) | (o que o bot/estado deve fazer) | (campo no `verify.sh` ou linha no tail) |

## Roteiros atuais (pos-refator coleta/proposta — commit 82726de)

| # | Roteiro | O que testamos | Resposta esperada | Como verificar |
|---|---|---|---|---|
| R1 | Ir ate cadastro; dizer "tenho 30 anos"; depois "nasci em 15/03/1996" | S1: idade solta nao vira data_nascimento | `data_nascimento` segue null apos idade; bot pede a data; persiste so apos data explicita | `verify.sh` -> `[conversas] data_nasc` |
| R2 | Acionar reentrada automatica; cliente responde depois | S2: reentrada entra no historico do agente | Fala automatica aparece em `conversa_mensagens` (type=ai); bot nao age como se nada tivesse acontecido | `verify.sh` -> `[conversa_mensagens]` |
| R3 | Em proposta, aceitar valor; antes de escolher slot, "manda o pix" | S3: sem Pix antes do horario | Bot pede pra escolher horario; sem agendamento/mp_payment_id | `verify.sh` -> `[agendamentos]` vazio; tail `[cron]` sem reservar-horario |
| R4 | Resposta com confirmacao+pergunta; reentrada; confirmacao pos-pagamento | S4/S5: baloes por `\n\n` | Textos separados por linha em branco saem como mensagens separadas | `verify.sh` -> content com ⏎; tail Evolution |
| R5 | Briefing com local "perna"; pedir desconto; escolher horario | Proposta + briefing | Briefing "na perna"; bot nao confirma desconto sozinho; confirma dia/horario ao escolher | `verify.sh` -> `[conversas] valor_proposto`; tail briefing |

## Sinais de regressao (abrir item se aparecer)

- `data_nascimento` nasce de idade solta.
- Reentrada aparece no WhatsApp mas nao entra no historico do agente.
- Pix/sinal gerado antes do slot escolhido.
- Texto com `\n\n` chega em um unico balao.
- Bot confirma desconto sem decisao do tatuador.
- Briefing volta a escrever "no perna".
