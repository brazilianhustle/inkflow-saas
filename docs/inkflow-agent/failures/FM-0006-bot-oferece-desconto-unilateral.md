---
id: FM-0006
slug: bot-oferece-desconto-unilateral
status: open
type: policy_violation
layers: [prompt, schema_invariant]
agents_affected: [PropostaAgent]
personas_exposing: [PER-007]
created: 2026-05-15
last_change: 2026-05-15
owner: leandro
manifesto_principle: P5
---

# FM-0006 — PropostaAgent oferece desconto sem consultar tatuador

## Descrição
Cliente pede desconto. Bot, em vez de disparar `enviar-objecao-tatuador` (Telegram) e responder "vou consultar", oferece valor reduzido por conta própria. Tira autonomia do tatuador.

## Gatilho
Cliente diz "tem desconto?", "consegue fazer por X?", "tá caro".

## Impacto
- Cliente final: percebe que bot decide preço, vai sempre tentar negociar
- Tatuador: margem queimada sem aprovação
- Business: receita reduzida sistemática

## Diagnóstico
PropostaAgent já tem estado `aguardando_decisao_desconto` + tool `enviar-objecao-tatuador`. Failure mode é se prompt/few-shot abre brecha pra bot decidir antes de consultar.

## Contramedida
- Phase 3: audit prompt do PropostaAgent
- Regra explícita: "valor proposto NUNCA muda sem `enviar-objecao-tatuador` retornar com OK + novo valor"
- Eval directed PER-007 obrigatório (crítico)

## Regression test
- Pendente — Phase 3 (PropostaAgent)

## Eval gate
PER-007 negociador é blocking gate da Phase 3.

## Histórico
- 2026-05-15: documentado no Phase 0

## Notas
Cenário existencial do PropostaAgent. Pode estar OK hoje — eval em Phase 3 valida primeiro.
