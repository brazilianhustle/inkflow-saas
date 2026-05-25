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
ultimo_commit_validado: f9a5bd6 feat: gate smoke scenarios on agent logs
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
- Micro-slice `pergunta_imagem` com midia WhatsApp real passou: Evolution `central` usou `/message/sendMedia`, webhook registrou imagem/caption real e bot respondeu referencia vs local com `copy_risk=baixo`.
- Scenario WhatsApp real `whatsapp-real-lateral-tempo-sessao` passou: Evolution `central` enviou pergunta de tempo para o bot, webhook registrou humano real e a resposta manteve expectativa segura sem prometer horas, mesmo dia ou sessao certa.
- Scenario WhatsApp real `whatsapp-real-lateral-processo-tatuagem` passou: Evolution `central` enviou pergunta de processo para o bot, webhook registrou humano real e a resposta explicou o fluxo sem expor sistema, erro, preco fechado, agendamento ou sinal.
- Scenario WhatsApp real `whatsapp-real-lateral-portfolio-disponivel` passou: Evolution `central` enviou pedido de portfolio, webhook registrou humano real, resposta nao escreveu URL manual e tail confirmou `/api/tools/enviar-portfolio` HTTP 200.
- Scenario WhatsApp real `whatsapp-real-lateral-pergunta-imagem-sem-midia` passou: Evolution `central` enviou pergunta sobre imagem sem arquivo, webhook registrou humano real sem midia e a resposta pediu reenvio sem voltar ao formulario.
- Autonomy Gate promovido deliberadamente para Level 2 apos `atendimento-lateral` e `cadastro-handoff` passarem, com 14 cenarios recentes e 7 WhatsApp reais; janela maxima agora e 2 micro-slices relacionados por rodada.
- Micro-slice de cadastro `cadastro-data-idade-nao-persiste` encontrou e corrigiu dois gaps: polling aceitava AI anterior ao humano esperado e pipeline persistia `data_nascimento/email` como string vazia. Apos deploy, smoke passou com `dados_cadastro` preservando apenas `nome`.
- Compactacao de contexto corrigida na arquitetura: o bundle de continuidade agora e comando portavel (`scripts/smoke/continuity-bundle.sh --force`) e nao depende apenas de hook Claude Code.
- Copy premium de maioridade ajustada: idade isolada agora pede data completa com seguranca e registro de maioridade, sem frase fria como "idade nao e suficiente"; smoke HTTP em producao passou.
- Menoridade explicita em cadastro validada: `12/03/2015` agora aciona handoff humano seguro, persiste `data_nascimento=2015-03-12`, mantem `orcid=null`, nao chama envio de orcamento e passa bot/tail/poll gates em producao.
- Escalation Manager iniciado: menoridade agora gera `reason_code=minor_age`, `severity=high`, `requires_orcid=false` e mensagem de Telegram rastreavel, com smoke de producao sem regressao.
- Escalation Manager expandido para cobertura textual: `cover_up` agora sai para humano em `aguardando_tatuador`, sem `orcid`, sem coleta normal e sem orçamento automatico; smoke HTTP em producao passou.
- Escalation Manager expandido para pedido explicito de humano/tatuador: `human_requested` agora sai para humano em `aguardando_tatuador`, sem `orcid`, sem coleta normal e sem orcamento automatico; smoke HTTP em producao passou.
- Escalation Manager expandido para cliente irritado: `client_upset` agora sai para humano em `aguardando_tatuador`, sem `orcid`, sem coleta normal e sem orcamento automatico; smoke HTTP em producao passou.
- Observabilidade explicita do Escalation Manager validada: cada handoff humano agora registra um turn `agent_name=escalation_manager` em `agent_turn_logs` com `reason_code`, severidade, fonte, `requires_orcid`, estado final e resposta enviada; smoke HTTP em producao confirmou row `client_upset`.
- Smoke Scenario Registry agora tem gate automatico `EXPECTED_AGENT_LOG_JQ_TRUE`, com polling curto para logs fire-and-forget; o scenario `tattoo-cliente-irritado-handoff` valida comportamento e observabilidade no mesmo run.

## Ultimo Smoke PASS De Referencia

```text
run_id: scenario-tattoo-cliente-irritado-handoff-20260525T182425Z-29429
tipo: Scenario HTTP monitorado
base_url: https://inkflowbrasil.com
telefone: 5521970789797
expected_state: aguardando_tatuador
orcid: none
evidence: .smoke-evidence/scenario-tattoo-cliente-irritado-handoff-20260525T182425Z-29429/
```

Mensagem:

```text
voces demoram demais, ninguem responde
```

Resultado:

```text
estado_agente: aguardando_tatuador
resposta_ai_posterior_ao_humano: true
orcid: none
copy_risk: baixo
copy: pede desculpa pela frustracao e aciona pessoa do estudio para assumir, sem seguir coleta normal
escalation: client_upset / high / requires_orcid=false
observability: agent_turn_logs agent_name=escalation_manager reason_code=client_upset
observability_gate: EXPECTED_AGENT_LOG_JQ_TRUE PASS
chain: HTTP smoke -> webhook -> pipeline -> resposta
```

## Proximo Ataque

```text
Escolher o proximo bloco da Onda 1 em Level 2, com no maximo 2 micro-slices relacionados por rodada.
```

Escopo recomendado:

- rodar `check-autonomy-gate.sh` antes de iniciar a rodada;
- escolher ate 2 micro-slices relacionados;
- depois de cada micro-slice, registrar smoke/gate/commit saudavel antes de seguir;
- candidatos: consolidar proximo slice de cadastro premium, refinamento de observabilidade ou escalation/handoff humano mais formal.

## Comando De Retomada

Ao iniciar nova sessao ou apos compactacao:

```bash
git status --short
git log --oneline -5
bash scripts/smoke/continuity-bundle.sh --force
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
