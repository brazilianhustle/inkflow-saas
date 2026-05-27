# InkFlow Atendimento Premium

Este diretório é o vault versionado do plano para transformar o bot do InkFlow de um fluxo de coleta robotizado em um atendente SaaS de alto nível para estúdios de tatuagem.

Use este vault como fonte de verdade antes de mexer em prompts, router, agents, testes ou smoke. A ideia central é separar atendimento humano de execução operacional.

## Objetivo

Criar uma camada de atendimento que entenda o turno humano antes de enviar a mensagem para o workflow de coleta/proposta/agendamento.

Hoje o sistema tende a perguntar:

```text
Estou em qual estado e qual campo falta?
```

O atendimento premium precisa perguntar primeiro:

```text
O que o cliente está tentando fazer neste turno?
```

Depois disso o sistema decide se deve:

- responder direto;
- retomar a coleta;
- chamar um agent operacional;
- persistir dados;
- mudar estado;
- acionar o tatuador;
- pausar o bot;
- abrir novo orçamento;
- bloquear risco.

## Como Navegar

- [01-doutrina.md](./01-doutrina.md): princípios estratégicos e limites do atendimento premium.
- [02-mapa-turnos-humanos.md](./02-mapa-turnos-humanos.md): mapa V1 dos tipos de turno humano.
- [03-dossie-bloco-1-atendimento-lateral.md](./03-dossie-bloco-1-atendimento-lateral.md): primeira frente recomendada para implementação.
- [04-ciclo-implementacao-validacao.md](./04-ciclo-implementacao-validacao.md): loop de mapear, implementar, testar, ajustar.
- [05-arquitetura-alvo.md](./05-arquitetura-alvo.md): arquitetura desejada em camadas.
- [06-plano-tecnico-slice-1.md](./06-plano-tecnico-slice-1.md): plano técnico do primeiro slice do ConversationRouter.
- [07-arquitetura-prompt-premium.md](./07-arquitetura-prompt-premium.md): visão de general da arquitetura de prompt, policy, router, composer, guardrails e próximos slices para bot premium.
- [08-decision-log.md](./08-decision-log.md): decisões técnicas e estratégicas da frente de atendimento premium.
- [09-session-handoff.md](./09-session-handoff.md): ponto de retomada para próximas sessões em Claude Code, Codex e NotebookLM.
- [10-smoke-monitoring-process.md](./10-smoke-monitoring-process.md): processo oficial de smoke monitorado com tail, correlation id, polling e evidencias.
- [11-real-whatsapp-smoke.md](./11-real-whatsapp-smoke.md): smoke superior com envio real via WhatsApp usando Evolution.
- [12-loop-continuity-protocol.md](./12-loop-continuity-protocol.md): protocolo para continuar em loop apos compactacao de contexto.
- [13-smoke-scenario-registry.md](./13-smoke-scenario-registry.md): registry de cenarios para smokes reproduziveis por comando unico.
- [14-smoke-triage-protocol.md](./14-smoke-triage-protocol.md): triagem automatica de falhas de scenario.
- [15-smoke-plan-review-protocol.md](./15-smoke-plan-review-protocol.md): reanalise automatica de plano para falhas de contrato.
- [16-slice-completion-gate.md](./16-slice-completion-gate.md): gate formal de conclusao de slice por cenarios obrigatorios.
- [17-autonomy-gate.md](./17-autonomy-gate.md): controle objetivo da janela maxima de execucao autonoma.
- [18-rollback-staging-protocol.md](./18-rollback-staging-protocol.md): protocolo de rollback, staging e zonas de risco para ondas maiores.
- [19-level-4-loop-policy.md](./19-level-4-loop-policy.md): politica de loop supervisionado, promocao e regressao de Level 4.
- [20-level-4-rehearsal-plan.md](./20-level-4-rehearsal-plan.md): plano de ensaio Level 4 executado ainda sob Level 3.
- [21-level-4a-wave-1.md](./21-level-4a-wave-1.md): primeira onda Level 4A de monitoramento, smoke e seguranca operacional.
- [22-level-4a-wave-2.md](./22-level-4a-wave-2.md): segunda onda Level 4A para `QuestionPolicy` de cadastro com WhatsApp real por micro-slice.
- [23-level-4b-wave-1.md](./23-level-4b-wave-1.md): primeira onda Level 4B para conversas multi-turn.
- [24-level-4b-wave-2.md](./24-level-4b-wave-2.md): segunda onda Level 4B para multi-info de tattoo.
- [26-level-4b-wave-3.md](./26-level-4b-wave-3.md): terceira onda Level 4B para respostas a campos pendentes de tattoo junto de duvidas laterais.
- [25-multi-agent-governance.md](./25-multi-agent-governance.md): governanca para agentes paralelos com comandante unico, single-writer e WhatsApp real serial.
- [52-premium-operational-chain.md](./52-premium-operational-chain.md): cadeia operacional profissional do bot premium, com regra de avanco, nao avanco, Definition of Done e cadencia correta.
- [53-level-4b-wave-29.md](./53-level-4b-wave-29.md): auditoria da familia cadastro/handoff com Naturalness V2 e revalidacao atual HTTP + WhatsApp real.
- [54-level-4b-wave-30.md](./54-level-4b-wave-30.md): auditoria da familia menoridade/risco e calibragem da Naturalness V2 para reclamacao de demora no atendimento.
- [55-level-4b-wave-31.md](./55-level-4b-wave-31.md): auditoria pos-handoff texto/midia e calibragem da Naturalness V2 para ignorar IA historica antes do ultimo humano.
- [56-level-4b-wave-32.md](./56-level-4b-wave-32.md): revalidacao atual de lateral tempo/processo com WhatsApp real novo quando evidencia antiga nao e suficiente.
- [57-level-4b-wave-33.md](./57-level-4b-wave-33.md): revalidacao atual de portfolio com HTTP radar, WhatsApp real novo, tail e Tenant Context Manager.
- [58-level-4b-wave-34.md](./58-level-4b-wave-34.md): revalidacao atual de pergunta de imagem sem midia e com midia usando HTTP radar e WhatsApp real novo.
- [59-level-4b-wave-35.md](./59-level-4b-wave-35.md): revalidacao atual de historia de vida/homenagem com equilibrio entre acolhimento, funcao e seguranca.
- [slice-gates/workflow-manager.env](./slice-gates/workflow-manager.env): gate formal da camada de transicao segura de estado.
- [current-objective.md](./current-objective.md): estado vivo, proximo ataque e comandos de retomada.
- [smoke-runs.md](./smoke-runs.md): indice versionado dos smokes relevantes.
- [templates/intent-card.md](./templates/intent-card.md): template para cadastrar novas intents.
- [templates/smoke-card.md](./templates/smoke-card.md): template para validar no WhatsApp real.

## Regra De Manutenção

Toda nova intent, bug conversacional ou comportamento humano observado em smoke deve virar uma ficha neste vault antes de virar implementação ampla.

Fluxo esperado:

```text
observação real -> ficha de intent -> plano técnico -> testes -> smoke -> ajuste da ficha
```

## Comando De Preflight De Onda

Antes de iniciar uma onda ou pacote de scenarios em Level 4B, usar:

```bash
bash scripts/smoke/wave-runner.sh <scenario> [scenario...]
```

A versao atual e apenas um preflight seguro: ela roda dry-run e gates, mas nao executa HTTP/WhatsApp real nem altera evidencias.

Para gerar uma linha sugerida de registro depois de um smoke:

```bash
bash scripts/smoke/evidence-registrar.sh .smoke-evidence/<run_id>
```

Esse comando nao edita `smoke-runs.md`; ele apenas imprime a sugestao para revisao.

Para auditar divergencia entre registros e artifacts:

```bash
bash scripts/smoke/evidence-orphan-gate.sh
```

O modo padrao falha para registro quebrado e mostra avisos para evidencias recentes ainda nao registradas.

## Estado Atual

Versão inicial criada em 2026-05-24 com foco na primeira frente:

- `pergunta_imagem`
- `preco_generico`
- `tempo_sessao`
- `processo_tatuagem`
- `portfolio`
- `historia_vida`

Essas intents foram escolhidas por alto impacto na sensação de atendimento e baixo risco operacional relativo.
