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
- Naturalidade do fechamento de cadastro melhorada; HTTP e WhatsApp real passaram com `copy_risk=baixo`.
- Reanalise automatica de plano criada com `plan-review.md` para falhas `contract_*`.
- Gate formal de conclusao de slice criado com cenarios obrigatorios e PASS recente registrado em `smoke-runs.md`.
- Slice `atendimento-lateral` ganhou cenarios HTTP obrigatorios para preco generico, tempo de sessao e processo; os tres passaram e o gate retornou `slice_completion: pass`.
- Ensaio WhatsApp real para `lateral-preco-generico` passou e virou `FINAL_REHEARSAL_SCENARIO` obrigatorio do gate `atendimento-lateral`.
- Scenario `lateral-portfolio-disponivel` passou com bot text gate e tail gate confirmando acionamento de portfolio.
- Scenario `lateral-historia-vida-homenagem` passou no contrato minimo: acolhimento breve, uma pergunta util e estado seguro.
- Scenario WhatsApp real `whatsapp-real-lateral-historia-vida-homenagem` passou apos correcao do Router/Composer para nao ignorar briefing emocional em primeiro contato.
- Autonomy Gate oficializado para controlar a janela maxima de execucao autonoma por evidencia, slice gates e bloqueadores.
- Primeiro check do Autonomy Gate retornou `decision=promote_available` para Level 2 com 7 scenario PASS, 2 WhatsApp real PASS e `atendimento-lateral` PASS; nivel permanece 1 ate promocao deliberada.
- Micro-slice `pergunta_imagem` iniciado pelo fallback sem midia: scenario HTTP `lateral-pergunta-imagem-sem-midia` passou com reenvio de foto e sem retorno ao formulario.
- Micro-slice `pergunta_imagem` com midia HTTP passou apos suporte de media no runner e guardrail anti-resposta apologetica: imagem persistida, resposta pergunta referencia vs local, `copy_risk=baixo`.

## Ultimo Smoke PASS De Referencia

```text
run_id: scenario-lateral-pergunta-imagem-com-midia-20260525T082057Z-32499
tipo: Scenario HTTP monitorado
base_url: https://inkflowbrasil.com
telefone: 5521970789797
expected_state: coletando_tattoo
orcid: none
evidence: .smoke-evidence/scenario-lateral-pergunta-imagem-com-midia-20260525T082057Z-32499/
```

Mensagem:

```text
o que você viu na imagem?
```

Resultado:

```text
estado_agente: coletando_tattoo
media_persistida: image/png
bot_perguntou_referencia_ou_local: true
fallback_sem_midia_nao_acionado: true
copy_risk: baixo
chain: HTTP inbound -> pipeline -> resposta
```

## Proximo Ataque

```text
Levar `pergunta_imagem` com midia para cadeia WhatsApp real via instancia `central`.
```

Escopo recomendado:

- adicionar suporte de midia ao runner WhatsApp real se a Evolution aceitar `/message/sendMedia`;
- criar scenario `whatsapp-real-lateral-pergunta-imagem-com-midia`;
- validar envio real `central -> bot`, transcript, julgamento e bot text gate;
- so promover autonomia se o gate do slice e o Autonomy Gate continuarem verdes.

## Comando De Retomada

Ao iniciar nova sessao ou apos compactacao:

```bash
git status --short
git log --oneline -5
sed -n '1,220p' docs/atendimento-premium/current-objective.md
sed -n '1,220p' docs/atendimento-premium/smoke-runs.md
sed -n '1,220p' docs/atendimento-premium/12-loop-continuity-protocol.md
bash scripts/smoke/check-autonomy-gate.sh
```

## Regras De Atualizacao

Atualizar este arquivo quando:

- mudar o objetivo ativo;
- um smoke virar referencia de PASS ou FAIL;
- houver deploy relevante;
- houver commit que mude o proximo passo;
- uma compactacao/retomada exigir contexto que nao esta em nenhum outro arquivo.

Nao registrar detalhes longos aqui. Detalhes longos ficam no evidence, decision log ou docs especificas.
