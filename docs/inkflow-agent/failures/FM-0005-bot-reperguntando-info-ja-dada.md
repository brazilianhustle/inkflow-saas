---
id: FM-0005
slug: bot-reperguntando-info-ja-dada
status: open
type: state_error
layers: [prompt, schema_invariant]
agents_affected: [TattooAgent, CadastroAgent]
personas_exposing: [PER-001, PER-006]
created: 2026-05-15
last_change: 2026-05-15
owner: leandro
---

# FM-0005 — Bot repergunta info já fornecida pelo cliente

## Descrição
Cliente forneceu campo (ex: estilo "fineline") em turn N. Em turn N+2, bot pergunta de novo "qual estilo prefere?". Cliente percebe que bot "não escutou".

## Gatilho
Conversa de 4+ turns com info espalhada por várias mensagens.

## Impacto
- Cliente final: percepção de "bot burro", frustração
- Tatuador: lead perdido
- Business: drop-off em happy path simples

## Diagnóstico
`dados_persistidos` não está sendo carregado consistentemente entre turns. Pode ser:
- Histórico não passado corretamente
- LLM ignorando dados_acumulados no contexto
- Prompt não enfatiza "não repita o que já tem"

## Contramedida
- Audit em Phase 1: verificar se `dados_acumulados` está chegando no prompt
- Adicionar regra explícita em `regras.js`: "se campo X já está em dados_persistidos, NÃO pergunte sobre ele"
- Eval directed PER-006 cobre regressão

## Regression test
- Pendente — Phase 1

## Eval gate
A definir.

## Histórico
- 2026-05-15: documentado no Phase 0 (observação preventiva)

## Notas
Failure mode comum em SDR bots. Validar com eval real antes de assumir frequência.
