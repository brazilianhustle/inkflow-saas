# Rollback And Staging Protocol

Este protocolo define como executar ondas maiores sem tratar producao como area de experimento. Ele existe para permitir Level 4 com controle: staging primeiro quando o risco pedir, producao so com gates claros, e rollback antes de insistir.

## Objetivo

```text
Garantir que qualquer rodada autonoma maior tenha ambiente seguro, criterio de rollback e fronteiras de producao antes de tocar comportamento real do bot.
```

## Principio Central

Level 4 nao significa executar mais rapido. Significa executar mais tempo com mais controle.

Se uma mudanca nao tem caminho de rollback claro, ela nao e candidata a Level 4.

## Zonas De Risco

| Zona | Exemplos | Ambiente inicial | Rollback esperado |
|---|---|---|---|
| Verde | docs, smoke runner, transcript, julgamento, gates sem mudar runtime do bot | local + HTTP radar | revert do commit ou ajuste do script |
| Amarela | Router, Policy, Workflow, Context Manager, ResponseComposer sem dinheiro/agenda | local + HTTP radar + WhatsApp real | revert do commit ou hotfix pequeno com mesmo scenario |
| Vermelha | preco, sinal, pagamento, agenda, Telegram do tatuador, secrets, tenant real amplo | staging/preview obrigatorio antes de producao | rollback documentado antes do deploy |

## Ambientes

### Local

Uso:

- testes unitarios e contratos de script;
- validacao de parsing, policy, workflow e renderizadores;
- nenhuma conclusao final de comportamento conversacional.

Comandos comuns:

```bash
node --test tests/**/*.test.mjs
bash -n scripts/smoke/run-scenario.sh
bash -n scripts/smoke/render-report.sh
```

### Preview/Staging

Uso obrigatorio quando a mudanca tocar zona vermelha ou alterar contrato amplo de runtime.

Requisitos minimos:

- URL preview conhecida e registrada na evidencia;
- secrets/bindings equivalentes sem apontar para tenant sensivel;
- telefone/tenant de teste ou fixture controlado;
- cleanup restrito ao telefone de teste;
- smoke com tail ativa.

Comando padrao:

```bash
BASE_URL=https://<preview>.inkflow-saas.pages.dev SMOKE_TAIL_ENVIRONMENT=preview \
  bash scripts/smoke/run-scenario.sh <scenario>
```

### Producao Controlada

Uso:

- validacao definitiva de comportamento conversacional;
- sempre depois de local passar;
- para zona amarela, HTTP radar antes de WhatsApp real;
- para zona vermelha, apenas depois de staging/preview passar.

Comando padrao:

```bash
BASE_URL=https://inkflowbrasil.com bash scripts/smoke/run-scenario.sh <scenario>
```

## Ordem De Ataque

1. Classificar a mudanca em zona verde, amarela ou vermelha.
2. Confirmar `git status --short` limpo ou entender mudancas pendentes.
3. Rodar testes locais relevantes.
4. Para zona vermelha, rodar staging/preview antes de producao.
5. Rodar HTTP radar em producao controlada quando for comportamento conversacional.
6. Rodar WhatsApp real definitivo quando o comportamento afeta atendimento.
7. Rodar slice gate e Autonomy Gate.
8. Registrar `smoke-runs.md`, `current-objective.md` e, se mudou regra, `08-decision-log.md`.

## Rollback

### Rollback Por Revert

Uso quando o commit ja foi publicado e a regressao veio do diff novo.

```bash
git revert <commit_sha>
git push
```

Depois:

1. aguardar CI e deploy;
2. rerodar o mesmo scenario que falhou;
3. registrar FAIL original e PASS de recuperacao em `smoke-runs.md`.

### Rollback Por Hotfix

Uso quando:

- o bug e pequeno;
- a causa esta isolada;
- o revert quebraria um slice ja validado;
- o hotfix pode ser testado no mesmo scenario.

Requisitos:

- patch pequeno;
- teste local focado;
- mesmo scenario FAIL precisa virar PASS;
- WhatsApp real se o comportamento conversacional foi afetado.

### Rollback Operacional

Uso quando o problema esta em ambiente, secrets, Evolution, Supabase, Cloudflare ou integracao externa.

Acao:

- parar implementacao;
- nao alterar prompts/codigo do bot sem evidencia;
- classificar falha via `triage.md`;
- corrigir ambiente ou aguardar estabilizacao externa;
- rerodar o mesmo scenario.

## Criterios De Parada

Parar imediatamente e nao continuar a rodada se ocorrer:

- CI falhar;
- deploy falhar;
- cleanup tocar telefone fora do teste;
- WhatsApp real falhar sem causa clara;
- estado final divergente;
- mensagem duplicada;
- `agent_turn_logs` ausente quando o gate exige observabilidade;
- `copy_risk=alto`;
- qualquer risco de preco, pagamento, sinal ou agendamento;
- qualquer mudanca em secret sem aprovacao explicita.

## Evidencia Obrigatoria

Para cada rodada que usa este protocolo:

- `summary.md`;
- `poll.json`;
- `transcript.md`;
- `judgment.md`;
- `agent-turn-logs.json` quando houver gate de observabilidade;
- `scenario-agent-log-jq.txt` quando houver gate de log;
- `triage.md` e `plan-review.md` em caso de falha;
- registro em `smoke-runs.md`.

## Parametros Para Avancar A Level 4

Este protocolo so remove o bloqueio documental de staging/rollback. Ele nao promove o nivel sozinho.

Para discutir promocao:

- Autonomy Gate deve retornar `decision=promote_available`;
- Level 3 precisa estar sem bloqueadores manuais;
- docs 18 e 19 precisam existir;
- ultimo ciclo deve ter PASS em HTTP radar e WhatsApp real;
- nao pode haver falha aberta sem triage;
- a primeira rodada Level 4 deve ser uma onda de baixo risco ou medio risco, nunca zona vermelha.

## Parametros Para Rebaixar

Mesmo apos Level 4, voltar para Level 3 se ocorrer:

- 1 falha WhatsApp real sem causa clara;
- 1 falha de deploy/CI durante a rodada;
- 1 divergencia de estado;
- 1 limpeza insegura;
- 1 incidente em preco, pagamento, sinal ou agenda;
- 2 falhas de contrato na mesma familia.

## Veredito

Este protocolo autoriza preparar Level 4, mas nao autoriza promover Level 4. Promocao continua sendo decisao deliberada em `autonomy-gate.env`, com commit proprio.
