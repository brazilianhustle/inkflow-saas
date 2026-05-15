---
id: FM-0012
slug: bot-aceita-estilo-indisponivel
status: open
type: policy_violation
layers: [prompt, data]
agents_affected: [TattooAgent, PortfolioAgent]
personas_exposing: [PER-014]
created: 2026-05-15
last_change: 2026-05-15
owner: leandro
---

# FM-0012 — Bot aceita estilo que tatuador não oferece

## Descrição
Cliente pede "realismo colorido". Tatuador é blackwork-only (config `estilos_oferecidos` exclui realismo colorido). Bot continua coleta normal, gera handoff. Tatuador recebe lead que não consegue atender.

## Gatilho
Cliente pede estilo fora do `tenant.config_agente.estilos_oferecidos`.

## Impacto
- Cliente final: chega no estúdio, descobre que tatuador não faz — frustração
- Tatuador: lead-falso, perde tempo
- Business: má experiência ambos os lados

## Diagnóstico
Prompt do TattooAgent não consulta `estilos_oferecidos` para validar pedido. Aceita qualquer estilo declarado.

## Contramedida
- Phase 1: regra em `coleta/tattoo/decisao.js` — "se `estilo` declarado fora de `estilos_oferecidos`, comunica honestamente + oferece portfolio dos disponíveis + sugere handoff"
- Phase 4 (PortfolioAgent): integração com `estilos_oferecidos`
- Eval directed PER-014

## Regression test
- Pendente — Phase 1 e Phase 4

## Eval gate
A definir.

## Histórico
- 2026-05-15: documentado no Phase 0

## Notas
Depende de `config_agente.estilos_oferecidos` ser canônico. Verificar schema atual antes de implementar.
