---
id: FM-0004
slug: coverup-nao-pediu-foto
status: open
type: policy_violation
layers: [prompt, schema_invariant]
agents_affected: [TattooAgent]
personas_exposing: [PER-004]
created: 2026-05-15
last_change: 2026-05-15
owner: leandro
manifesto_principle: P3
---

# FM-0004 — Cover-up sem foto da tatuagem antiga

## Descrição
Cliente pede cover-up (cobrir tatuagem existente). Bot coleta 4 OBR padrão mas NÃO pede foto da tatuagem atual. Tatuador recebe handoff cego — não sabe se consegue cobrir.

## Gatilho
Cliente menciona "cover-up", "cobrir tattoo antiga", "tem uma tribal que quero cobrir".

## Impacto
- Cliente final: chega no estúdio sem material que tatuador precisa
- Tatuador: tem que pedir foto/avaliar presencial — frustração
- Business: caso técnico mal-conduzido = chance perdida

## Diagnóstico
Prompt do TattooAgent não detecta caso "cover-up" como categoria especial. Pede 4 OBR e foto do local (P3) mas não foto da tatuagem antiga.

## Contramedida
- Phase 1: adicionar detecção de keyword cover-up no `coleta/tattoo/decisao.js`
- Quando detecta, pede foto da tatuagem atual além das 4 OBR padrão
- Se `tenant.config_agente.aceita_cobertura === false`, comunica e oferece handoff

## Regression test
- Pendente — eval directed PER-004 em Phase 1

## Eval gate
A definir em Phase 1.

## Histórico
- 2026-05-15: documentado no Phase 0

## Notas
Coverup é spec próprio futuro. Phase 0 só documenta o failure.
