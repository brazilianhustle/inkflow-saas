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
- Scenario registry validado com `cadastro-handoff-email-recusado`; polling agora trata `EXPECTED_STATE` como criterio autoritativo.
- Scenario WhatsApp real `whatsapp-real-cadastro-handoff` validado com Evolution `central` enviando mensagem real para o numero do bot.
- Triage automatica de falhas de scenario criada com `triage.md` e classes operacionais.

## Ultimo Smoke PASS De Referencia

```text
run_id: scenario-whatsapp-real-cadastro-handoff-20260525T063724Z-20686
tipo: Scenario WhatsApp real
base_url: https://inkflowbrasil.com
telefone: 5521970789797
expected_state: aguardando_tatuador
orcid: orc_wus13k
evidence: .smoke-evidence/scenario-whatsapp-real-cadastro-handoff-20260525T063724Z-20686/
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
orcid: orc_wus13k
copy_risk: medio
chain: central -> WhatsApp real -> bot -> webhook -> pipeline -> handoff
```

## Proximo Ataque

```text
Atacar naturalidade premium da resposta final marcada como `copy_risk=medio`.
```

Escopo recomendado:

- localizar ResponseComposer/prompt responsavel por "Confirmo por aqui e sigo com teu orçamento";
- substituir fechamento seco por copy mais humana sem prometer preco/prazo;
- manter handoff e `orcid` intactos;
- rerodar scenario HTTP e WhatsApp real quando a alteracao tocar resposta final.

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
