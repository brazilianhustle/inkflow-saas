---
id: FM-0005
slug: bot-reperguntando-info-ja-dada
status: open
type: state_error
layers: [prompt, schema_invariant]
agents_affected: [TattooAgent, CadastroAgent]
personas_exposing: [PER-001, PER-006]
created: 2026-05-15
last_change: 2026-05-16
owner: leandro
notes: "Sub 1.B tentou prompt iteration (R10) — 2 iterações, ambas com dano colateral. Marcado intratável-via-prompt. Defer pra solução estrutural."
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
- 2026-05-16: **Sub 1.B Task 5 Iteração 1 (R10 v1 anti-repergunta)** — adicionada regra R10 em `decisao.js` + Exemplo 10 em `exemplos.js`. PER-001 happy path 3 runs: 1 pass (nat 4.2) + 2 com HTTP 500. R10 v1 piorou flake da R9 (na Task 3a PER-001 era 1/1 pass; com R10 v1 caiu pra 1/3). Hipótese: R10 deslocou atenção do modelo de "PERGUNTE o faltante" pra "não repergunte ja coletado", efeito colateral involuntário.
- 2026-05-16: **Sub 1.B Task 5 Iteração 2 (R10 v2 algoritmo passo-a-passo)** — refatorada R10 como algoritmo explícito de 4 passos (lista OBRs → check dados_persistidos → pega primeiro faltando → pergunta). PER-001 3 runs: 1 pass (nat 4.4) + 2 fail mas SEM 500 ✅ (algoritmo eliminou 500s de PER-001). PORÉM regressão em PER-009 (1/1 HTTP 500, baseline pós-R9 sozinha era 0/2 500) e PER-010 (1/1 HTTP 500, body confirma issue pré-existente de foto_local + handoff).
- 2026-05-16: **Marcado intratável-via-prompt nesta sub.** R10 (qualquer versão) introduz dano colateral em personas que dependem de fluxo §4.4 (mensagem-ponte com `foto_local`). Cap de 3 iterações da Task 5 não comporta refinar R10 sem comprometer FMs subsequentes. Defer pra solução estrutural — opções pra exploration futura:
    - Validação no schema/Zod do `dados_persistidos` consumido (rejeitar campos_faltando que repitam já-coletado)
    - Refator do contrato `campos_faltando` pra ser derivado server-side em vez de emitido pelo modelo
    - Persona PER-006 dedicada (atualmente sem eval no harness) pode dar sinal mais limpo do FM isolado

## Notas
Failure mode comum em SDR bots. Validar com eval real antes de assumir frequência.

Tentativas Sub 1.B revertidas. R9 (sub anterior) continua protegendo contra a invariant-violation mais comum (resposta sem `?` quando campos_faltando não-vazio). Status: `open` — fica candidato pra Sub 1.C ou Sub futura com mecanismo mais robusto.
