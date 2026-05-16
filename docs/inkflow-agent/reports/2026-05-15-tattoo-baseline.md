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

## Re-baseline pós-fix-harness (2026-05-15 — Triagem #1)

Baseline original tinha 4 bugs do harness (ver `docs/superpowers/specs/2026-05-15-fix-eval-harness-pipeline-real-design.md`):
1. Endpoint legacy `/api/tools/simular-conversa` em vez de `/api/agent/route` (orchestrator real)
2. `playConv` descartava `proxima_acao` do JSON output do bot
3. judge state-transition recebia `expected.proxima_acao_esperada` mascarado como output real
4. judge prompt listava `enviar_orcamento_tatuador` que não existe no schema (canonical = `handoff`)

Esta seção compara scores pre-fix vs post-fix:

### Diff de scores

| eval | nat pre | nat post | man pre | man post | state pre | state post |
|------|---------|----------|---------|----------|-----------|-------------|
| per-001 | 3.4 | 3.4 | 0.92 | 0.92 | 0 | 1 |
| per-009 | 3.8 | (error: http 500) | 0.60 | (error) | 0 | (error) |
| per-010 | 2.6 | (error: http 500) | 0.90 | (error) | 0 | (error) |

### Conclusões revisadas

- **state_transition para per-001 agora passa (0 → 1)**: o judge agora vê o `proxima_acao` REAL do bot (Task 6 fix) e o vocabulário canonical do schema (Task 3 fix). Comprova que 3/3 fail do baseline pré-fix era artefato do harness, não bug do bot na trilha happy path.
- **per-001 manifesto + naturalidade inalterados**: o `/api/agent/route` (orchestrator real, Task 5 swap) produz output equivalente ao `/api/tools/simular-conversa` pra esta persona. Naturalidade 3.4 < 4.0 é signal LEGÍTIMO do bot, não artefato.
- **per-009 e per-010 agora retornam http 500 (invariant-violation)**: NOVO sinal exposto pelo orchestrator real. O fluxo multi-agent tem validator closure que rejeita output do LLM quando viola invariantes (ex: `proxima_acao=pergunta` mas resposta sem '?'). O `simular-conversa` legacy não tinha esse validator, então output ruim passava silenciosamente. **Esses 500s são sinal real**: bot não-determinístico produz output inválido em parte dos turns das personas adversariais (cinismo, conflito).
- **Recomendação atualizada brainstorm Sub 1.B**: priorizar redução de invariant-violations (Sub-3.3 reliability) ANTES de mexer em naturalidade/FM-0001. Sem o pipeline confiável, não dá pra medir avanço.

### Pré-fix snapshot preservado

- `evals/inkflow-agent/report-pre-fix-2026-05-15.json`
- `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline-pre-fix.md`

## Próximos passos sugeridos pra Sub 1.B

(Preencher manualmente após review do report — quais FMs reproduziram empiricamente, ordem de prioridade.)