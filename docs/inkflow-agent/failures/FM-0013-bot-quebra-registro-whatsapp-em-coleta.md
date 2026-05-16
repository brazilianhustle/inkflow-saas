---
id: FM-0013
slug: bot-quebra-registro-whatsapp-em-coleta
status: open
type: drift_persona
layers: [prompt]
agents_affected: [TattooAgent]
personas_exposing: [PER-010, PER-001]
created: 2026-05-15
last_change: 2026-05-15
owner: leandro
manifesto_principle: P5
---

# FM-0013 — Bot quebra registro WhatsApp em coleta (tom CRM vs tatuador)

## Descrição

Durante a coleta de dados (estado `coletando_tattoo`), o bot quebra o registro **cordial-profissional brasileiro** esperado em 2 pontos sistemáticos:

1. **Saudação (turn 1)** — exagero de emoji (`🎉🎉`), frase corrida sem split em bolhas, e pergunta vaga ("Me conta o que você está pensando em fazer?"). Auto-apresentação institucional em si ("Aqui é o X do Y") é DESEJADA — ver Notas sobre tom alvo.
2. **Confirmação (post-coleta)** — dump de dados em formato lista ("Anotei: rosa fineline no antebraco, altura 165cm") parecendo email de CRM.
3. **Pedido de foto** — justificativas formais com fraseologia professoral ("É importante pro tatuador ter noção do espaço e conseguir passar o valor certinho").

Diferente de FM-0011 (bot frio em momento emocional), aqui o problema é de **registro de coleta**: bot mistura turns adequados com turns que parecem copy/paste de email ou redação formal, quebrando a ilusão de atendimento profissional via WhatsApp.

## Gatilho

Coleta normal — sem trigger emocional ou conflito explícito necessário. Aparece sistematicamente em:
- **Turn 1 (saudação):** "oi tudo bem?" → bot devolve com `🎉🎉` exagerado, frase corrida em 1 bolha só, e pergunta vaga ("o que tá pensando em fazer?")
- **Turn N (pós-coleta):** quando bot confirma dados em formato lista (`Anotei: a, b, c`)
- **Pedido de foto:** quando bot justifica com "É importante" + razões em série conectadas por "e"

## Impacto

- **Cliente final:** sensação de estar falando com bot/CRM em vez de tatuador real — quebra ilusão de atendimento humano que é o diferencial do produto.
- **Tatuador:** percepção de marca enfraquece — cliente chega no estúdio comentando "achei estranho o WhatsApp de vocês".
- **Business:** afeta naturalidade (`n3_tom_consistente` e `n5_pontuacao`) — `evals/inkflow-agent/report-pre-fix-2026-05-15.json` mostra 2/5 em ambas dimensões pra PER-010. Naturalidade <4.0 recorrente em 3/3 baseline.

## Diagnóstico

**Camada de origem:** prompt (`functions/_lib/prompts/coleta/tattoo/decisao.js` + `exemplos.js`).

Hipóteses pra Sub 1.B investigar:
1. **Few-shots existentes têm formato lista** — `exemplos.js` provavelmente mostra dump `Anotei: X, Y, Z` como padrão pós-coleta. LLM replica.
2. **Justificativas formais não têm anti-exemplo** — prompt não diz "ao pedir foto, NÃO use 'É importante' nem justifique com lista de razões". LLM default → modo redação institucional.
3. **Saudação sem few-shot canonical** — bot improvisa o turn 1. Sem exemplo definindo (a) split em 2 bolhas via `\n\n`, (b) apresentação cordial-profissional com `{agent_name}` + `{nome_estudio}`, (c) pergunta direta de tatuagem como segunda bolha, o LLM cai em fórmula corrida com excesso de emoji + pergunta vaga.

## Evidência empírica

**Transcript PER-010 pré-fix** ([transcript completo](../reports/2026-05-15-per-010-transcript-pre-fix.json), capturado 2026-05-15 contra endpoint legacy `/api/tools/simular-conversa`):

```
[1] user: oi tudo bem?
[1] bot:  Oii, tudo certo! Aqui é o Assistente do InkFlow Sub4 Test.
          Me conta o que você está pensando em fazer? 🎉🎉    ← 🚨 tom CRM

[5] user: 1.65m
[5] bot:  Anotei: rosa fineline no antebraco, altura 165cm.   ← 🚨 dump lista

          Consegue mandar também uma foto do local? É importante
          pro tatuador ter noção do espaço e conseguir passar
          o valor certinho.                                    ← 🚨 justificativa formal
```

**Scores baseline:**
- `naturalidade.media` = 2.6 (threshold ≥4.0)
- `n3_tom_consistente` = 2/5
- `n5_pontuacao` = 2/5
- `manifesto.P3` = 0.5 (parcialmente violado — pedido de foto sem leveza)

## Contramedida

- **Sub 1.B (a definir):** revisar `functions/_lib/prompts/coleta/tattoo/exemplos.js` — substituir `"Anotei: X, Y, Z"` por padrão natural (ex: confirmação curta em 1 linha sem prefixo `Anotei:` + lista de campos). Adicionar few-shot de pedido de foto com leveza (`"manda uma foto do braço pra ele ver onde vai 📸"` em vez de `"É importante pro tatuador ter noção"`).
- **Sub 1.B (a definir):** revisar saudação inicial em `decisao.js` ou whichever bloco define o turn 1 — remover padrão `"Aqui é o Assistente do <estudio>"`. Few-shot tatuador-style.
- **Constraint:** evitar over-engineering — pode ser que 1 regra `R<N>` proibindo `Anotei:`, `É importante` e auto-apresentação institucional já reduza o gap.

## Regression test

- **Eval direcionado:** `evals/inkflow-agent/directed/tattoo/per-010/01-conflito.json` já existe. Re-rodar pós-Sub 1.B deve subir naturalidade ≥4.0.
- **Eval candidato adicional:** persona "saudação fria" (cliente só diz "oi") pra capturar turn 1 isoladamente. Não existe ainda.

## Eval gate

A definir em Sub 1.B (provavelmente entra na suíte `eval gate` do CI após contramedida em prod).

## Histórico

- **2026-05-15:** descoberto via baseline pré-fix harness (parte 2 da sessão InkFlow Agent Phase 1.A). Smoking gun isolado na violation P3 msg 9.
- **2026-05-15:** confirmado via captura completa do transcript (Triagem #2) — padrão se manifesta em 3 pontos distintos da mesma conversa.
- **2026-05-15:** promovido de "candidato" pra FM formal (Triagem #3).
- **2026-05-16:** ajustado tom alvo após feedback do owner — registro correto é cordial-profissional brasileiro, NÃO ultra-casual. Auto-apresentação institucional é desejada; problema real era emoji exagerado + frase corrida + pergunta vaga + ausência de split em bolhas.

## Notas

**FM-0014 candidato — "Bot não detecta conflito implícito":** durante a captura da Triagem #2, observei que o bot ignorou silenciosamente o conflito `"rosa pequena de uns 25cm"` (25cm não é pequeno). Tratou `25cm` como dado válido e seguiu coletando altura. Padrão diferente deste FM-0013 (que é tom), mais próximo de `policy_violation` ou `state_error`. **Não promovi a FM separado ainda** — evidence é de 1 persona só (PER-010). Aguardar Sub 1.B brainstorm pra decidir se vira FM-0014 standalone ou se entra como sub-caso de FM-0003 (bot sugere tamanho — já mitigated, mas detecção de inconsistência pode evoluir o escopo).

**Overlap com FM-0011 (bot frio em momento emocional):** ambos são `drift_persona / P5`. Diferença: FM-0011 é falta de calor; FM-0013 é registro errado em coleta. Contramedidas podem compartilhar few-shots de tom em `exemplos.js` mas atacam pontas opostas do espectro emocional vs formalidade-CRM.

**Tom alvo — cordial-profissional brasileiro (NÃO ultra-casual):**

O registro certo é "atendimento profissional de estúdio sério via WhatsApp", não "amigo do amigo trocando ideia". Auto-apresentação institucional ("Aqui é o {agent_name} do {nome_estudio}") **é desejada** — é cordialidade brasileira normal, não tom CRM. O problema na saudação observada não foi a apresentação, foram os outros sinais (emoji exagerado, frase corrida, pergunta vaga, ausência de split em 2 bolhas).

| Onde | ❌ Observado pré-fix | ✅ Tom alvo |
|---|---|---|
| Saudação turn 1 | `"Oii, tudo certo! Aqui é o Assistente do InkFlow Sub4 Test. Me conta o que você está pensando em fazer? 🎉🎉"` (1 bolha, emoji exagerado, pergunta vaga) | Bolha 1: `"Olá! Tudo tranquilo? Aqui é o {agent_name} do {nome_estudio}."`<br>Bolha 2: `"Qual idéia de tatuagem tem em mente?"` |
| Confirmação pós-coleta | `"Anotei: rosa fineline no antebraco, altura 165cm."` (formato lista email) | `"Beleza! Rosa fineline no antebraço, 1,65m de altura."` (frase natural sem prefixo Anotei:) |
| Pedido de foto | `"É importante pro tatuador ter noção do espaço e conseguir passar o valor certinho."` (justificativa formal em série) | `"Consegue mandar uma foto do braço? Ajuda o tatuador a passar o valor 📸"` (pergunta direta + 1 razão simples + emoji opcional) |

**Régua de tom (pra dúvidas no Sub 1.B):**
- Se a frase parece formal demais ("Olá! Tudo tranquilo?") → ainda é o tom certo.
- Se a frase parece descolada / gíria forte ("Manda aí 🤙", "Massa!", "tu tá pensando") → casual demais, NÃO usar.

**Pipeline multi-message:** o refator Coleta v2 (PR #63) já suporta split por `\n\n` — bot pode emitir 2 bolhas separadas no turn 1. Few-shot deve mostrar isso explicitamente.
