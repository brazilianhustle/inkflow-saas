# Current Objective - Atendimento Premium

Este arquivo e o estado vivo da frente. Ele existe para permitir retomada apos compactacao de contexto, troca de aba ou pausa longa sem depender da memoria do chat.

## Objetivo Ativo

```text
Fortalecer o processo de smoke premium ate cobrir envio WhatsApp real, monitoramento completo, transcript legivel e julgamento estruturado da resposta.
```

## Estado Atual

```text
status: em-andamento
branch: main
ultimo_commit: conferir `git log --oneline -1`
deploy: GitHub Actions Deploy to Cloudflare Pages passou em 2026-05-25
tests: node --test tests/**/*.test.mjs passou local e no GitHub Actions
prompts_ci: passou no GitHub Actions
worktree_esperado: limpo
```

## Ultimos Marcos

- Workflow Manager implementado para promover cadastro completo para `aguardando_tatuador`.
- Smoke HTTP monitorado oficializado com tail, snapshots, polling, evidencia e `orcid` obrigatorio em handoff.
- Smoke WhatsApp real criado usando Evolution `central` como instancia remetente.
- Polling agora pode exigir a mensagem humana exata via `SMOKE_EXPECT_HUMAN_TEXT`.
- CI estabilizado apos duas falhas de contrato: regex com `braço` acentuado e limite real do prompt `coleta-tattoo`.
- Loop Continuity Protocol criado para retomada apos compactacao.
- `transcript.md` e `judgment.md` integrados aos runners de smoke HTTP e WhatsApp real.

## Ultimo Smoke PASS De Referencia

```text
run_id: smoke-20260525T053147Z-23172
tipo: HTTP monitorado
base_url: https://inkflowbrasil.com
telefone: 5521970789797
expected_state: aguardando_tatuador
orcid: orc_2x6t5l
evidence: .smoke-evidence/smoke-20260525T053147Z-23172/
```

Mensagem:

```text
pode seguir sem email
quanto tempo demora?
```

Resultado:

```text
estado_agente: aguardando_tatuador
email_recusado: true
data_nascimento: 1995-03-12
orcid: orc_2x6t5l
```

## Proximo Ataque

```text
Rodar o primeiro smoke WhatsApp real usando `central` com transcript.md + judgment.md nativos.
```

Escopo recomendado:

- informar `SMOKE_BOT_NUMBER`;
- limpar/preparar o estado da conversa de teste quando necessario;
- executar `scripts/smoke/run-real-whatsapp.sh`;
- atualizar `smoke-runs.md` com o primeiro run real que sair com transcript + julgamento;
- depois avaliar se vale adicionar judge LLM opcional.

## Comando De Retomada

Ao iniciar nova sessao ou apos compactacao:

```bash
git status --short
git log --oneline -5
sed -n '1,220p' docs/atendimento-premium/current-objective.md
sed -n '1,220p' docs/atendimento-premium/smoke-runs.md
sed -n '1,220p' docs/atendimento-premium/12-loop-continuity-protocol.md
```

## Regras De Atualizacao

Atualizar este arquivo quando:

- mudar o objetivo ativo;
- um smoke virar referencia de PASS ou FAIL;
- houver deploy relevante;
- houver commit que mude o proximo passo;
- uma compactacao/retomada exigir contexto que nao esta em nenhum outro arquivo.

Nao registrar detalhes longos aqui. Detalhes longos ficam no evidence, decision log ou docs especificas.
