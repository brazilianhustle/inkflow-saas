---
id: FM-0002
slug: bot-pressiona-fechamento
status: open
type: policy_violation
layers: [prompt]
agents_affected: [TattooAgent, PropostaAgent]
personas_exposing: [PER-003]
created: 2026-05-15
last_change: 2026-05-15
owner: leandro
manifesto_principle: P5
---

# FM-0002 — Bot insiste pra cliente fechar quando ele só pesquisa

## Descrição
Cliente em modo pesquisa de preço (PER-003) recebe valor e diz "obrigado vou ver". Bot insiste em fechar ("posso te reservar?", "valor pode mudar amanhã"). Tom comercial agressivo viola P5 (conversa simpática, sem objeção robotizada).

## Gatilho
Cliente abandona conversa após receber valor.

## Impacto
- Cliente final: percepção de bot "pressivo" — queima marca do tatuador
- Tatuador: reputação afetada em rede informal
- Business: cliente pesquisador não volta nunca

## Diagnóstico
PropostaAgent (e talvez TattooAgent) tem few-shots ou regras que tendem a "fechar" em vez de respeitar timing do cliente.

## Contramedida
- Phase 3 (PropostaAgent): audit de prompts em busca de linguagem pressiva
- Adicionar regra explícita: "cliente pode sair sem fechar — bot agradece e encerra educadamente"
- Eval directed PER-003 em `evals/inkflow-agent/directed/proposta/per-003/`

## Regression test
- Pendente — Phase 3

## Eval gate
A definir em Phase 3.

## Histórico
- 2026-05-15: hipótese a partir do manifesto P5

## Notas
Pode ser que o PropostaAgent atual já não pressiona; eval em Phase 3 valida primeiro antes de assumir falha.
