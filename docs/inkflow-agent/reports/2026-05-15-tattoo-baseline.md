# TattooAgent — Baseline Run 2026-05-15

**Eval harness:** evals/inkflow-agent/_harness/run.mjs
**Judge model:** claude-haiku-4-5-20251001
**Base URL:** https://inkflowbrasil.com
**Rodado em:** 2026-05-15T23:09:44.098Z

**Total:** 3 evals - 0 pass - 1 fail - 2 error

## per-001-01-happy-path
**FAIL**
- naturalidade: 3.4
- manifesto: 0.92
- state: 1
- violations:
  - msg 5 — P2 violação parcial: bot pede altura (um dos 4 OBR) mas a sequência de coleta não segue ordem clara. Altura foi coletada antes de 'estilo' ser explicitamente confirmado (fineline foi mencionado pelo cliente, mas bot não validou como estilo formal). Não é violação grave, mas P2 exige os 4 OBR de forma estruturada.
  - msg 9 — P2 violação parcial: bot não coletou explicitamente 'estilo' como confirmação formal (fineline foi inferido, não validado). Dos 4 OBR obrigatórios (descricao_curta, local_corpo, altura_cm, estilo), apenas 3 foram coletados de forma clara e estruturada.
- falhou em: naturalidade

## per-009-01-muda-decisao
**ERROR**
- error: http 500

## per-010-01-conflito-tamanho
**ERROR**
- error: http 500

## Próximos passos sugeridos pra Sub 1.B

(Preencher manualmente após review do report — quais FMs reproduziram empiricamente, ordem de prioridade.)