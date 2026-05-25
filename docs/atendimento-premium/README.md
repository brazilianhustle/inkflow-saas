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

## Estado Atual

Versão inicial criada em 2026-05-24 com foco na primeira frente:

- `pergunta_imagem`
- `preco_generico`
- `tempo_sessao`
- `processo_tatuagem`
- `portfolio`
- `historia_vida`

Essas intents foram escolhidas por alto impacto na sensação de atendimento e baixo risco operacional relativo.
