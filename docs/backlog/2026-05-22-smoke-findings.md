# Smoke E2E 2026-05-22 — Validação + Backlog (terreno p/ revisão com Codex)

> Smoke real rodado no tenant de teste `InkFlow Sub4 Test` (db686ef2), telefone `5521970789797`,
> contra **produção** rodando o código da branch `feat/refator-prompts-coleta-proposta` (commit `f41702a`,
> deploy manual via `wrangler pages deploy`). **A branch NÃO está merdeada/pushed** — prod está com código
> não-mergeado; decidir merge vs rollback depois.

## Como usar este doc
- **Parte 1**: validação dos 4 bugs que o smoke testava (cumprido / parcial / não).
- **Parte 2**: backlog dos achados NOVOS, separado por **PROMPT** (copy/tom/balões) e **ESTRUTURAL** (lógica/fluxo/dados/idempotência).
- **Parte 3**: mecanismos já confirmados (não re-investigar) + ordem sugerida.

---

## Parte 1 — Validação dos 4 bugs testados

| Bug | Status | Evidência no smoke |
|---|---|---|
| **Bug 1** — foto do local pedida 1x antes do handoff | ✅ **CUMPRIDO** | Após os 4 OBR, bot pediu "Consegue mandar uma foto do local?"; cliente mandou foto real → classificada como `foto_local` (briefing Telegram: "Mandou a foto do local"). Visão funcionou. |
| **Bug 3** — multi-campo + altura×tamanho | ✅ **CUMPRIDO** | 1 msg ("rosa fineline na perna, 5cm, sou 1.81") → briefing: rosa/fineline/perna/~5cm/**altura 181cm**. 181 (altura) vs 5 (tamanho) corretos, nada re-perguntado. |
| **Bug 2** — aceitação não re-pergunta valor | ⚠️ **PARCIAL** | Bot **não** perguntou "quanto tu tava pensando" (nosso fix OK). MAS no 1º "bora" ele **re-apresentou** "Show! Ele topou em R$ 10. Bora marcar?" em vez de avançar; só avançou pros horários no 2º "bora". Causa = **S2** (estrutural), não o nosso fix de prompt. |
| **Bug 4** — não verbaliza aceite de pechincha | ✅ **CUMPRIDO** (core) | Cliente "ele cobrou 10, consegue?" → bot "Anotado! Vou consultar com o tatuador e te retorno." Não confirmou R$10. UX a melhorar em **P4**. |

**Resumo:** 3 de 4 cumpridos; Bug 2 com fix correto mas mascarado por bug estrutural pré-existente (S2).

---

## Parte 2 — Backlog dos achados novos

### A) PROMPT-level (copy / tom / balões / recall)

> Mecanismo confirmado: o pipeline JÁ divide `resposta_cliente` em balões por `\n\n` (whatsapp-pipeline.js:299).
> Logo, "veio em 1 balão" = **o LLM não emitiu `\n\n`**. Fix = instruir o prompt a emitir `\n\n` nesses pontos.

| ID | Achado | Evidência | Arquivo provável | Sev |
|---|---|---|---|---|
| **P1** | Saudação de 1º contato veio em 1 balão; deveria ser 2 ("Oii, tudo bem?" \n\n "Me conta o que você está pensando em fazer?") | M1 | `prompts/coleta/tattoo/contexto.js` (já diz "saudacao 2 baloes") + `decisao.js`/`exemplos.js` — reforçar `\n\n` | baixa |
| **P2** | Confirmação + pergunta no mesmo balão ("Rosa fineline na perna, 5cm. Consegue mandar foto?") → 2 balões: "Rosa fineline na perna, 5cm, anotado." \n\n "Consegue mandar uma foto do local que deseja tatuar?". **Padrão geral anti-robotização** (confirmar num balão, perguntar no outro) | foto-ask | `prompts/coleta/tattoo/decisao.js` (§4.4) + `exemplos.js` | média |
| **P3** | Apresentação de valor robotizada ("Show! Pelo trabalho ficou em R$15. Bora marcar?") → 2 balões: recall ("Fala Mario, tudo bem?") \n\n info personalizada ("Nosso tatuador montou seu orçamento — essa **{tattoo}** na **{local}** ficaria na faixa de R$ {valor}.") | proposta entry | `prompts/coleta/proposta/fluxo.js` (§3.1) + `exemplos.js` | média |
| **P4** | Pechincha: antes de "vou consultar", segurar posição cordialmente. 2 balões: "Poxa Mario, esse é o valor que o {tatuador} geralmente cobra." \n\n "Vou passar tua proposta pra ele(a) e te retorno por aqui, beleza?" — e só então acionar o tatuador | M5 (pediu_desconto) | `prompts/coleta/proposta/decisao.js` (R2) + `exemplos.js` | média |
| **P5** | Pós-decisão do desconto: 2 balões (recall + resposta). **Aceito:** "Fala Mario, tudo tranquilo?" \n\n "Nosso tatuador analisou e topou fazer por R$ {valor}! Quer agendar pra quando?". **Recusado:** recall \n\n "...infelizmente não rola por R$ {valor} 😕. O que dá é parcelar em até {N}x de R$ {parcela} sem juros (mín. R$100/parcela), ajuda?" | pós-desconto | `prompts/coleta/proposta/*` + **cálculo de parcelas = híbrido (ver S6)** | média |
| **P6** | Confirmação ao escolher horário (copy): "Perfeito! Vamos seguir com teu agendamento pro dia 22." (dia em número/dia-da-semana, natural) — ANTES do balão do Pix | agendamento | `prompts/coleta/proposta/*` (depende do fluxo S3) | média |
| **P7** | Recall deve **variar** entre turnos (não repetir literalmente o recall anterior) | P3/P5 | prompts proposta | baixa |
| **P8** | Briefing Telegram: "no perna" → "na perna" (concordância de gênero) | briefing | template do briefing Telegram (procurar "quer uma tatuagem de") | baixa |
| **P9** | Cadastro alucinou data: regra "idade não vale, peça data" JÁ existe (`cadastro/decisao.js:83`) mas o LLM violou. Reforçar: **NUNCA derive/invente `data_nascimento` a partir de idade** — sempre peça a data real. (Ver S1: avaliar guard estrutural complementar.) | M (cadastro) | `prompts/coleta/cadastro/decisao.js` | **alta** |

### B) ESTRUTURAL-level (lógica / fluxo / dados / idempotência)

| ID | Achado | Evidência | Arquivo provável | Sev |
|---|---|---|---|---|
| **S1** | **Cadastro persistiu `data_nascimento` ALUCINADA**: cliente disse "30 anos" → bot gravou "32 anos (19/10/1993)" (data inventada, idade nem bate com 30). Dado falso do cliente chegou ao tatuador. Regra de prompt existe (P9) mas falhou. Avaliar **guard estrutural**: rejeitar `data_nascimento` quando o turno do cliente continha só idade (ex: regex "\d+ anos" sem data) → força `pergunta` pela data real. | briefing "32 anos (19/10/1993)" | `agents/cadastro.js` / `api/agent/route.js` (perto de `enforceMenorIdade`) | **alta** |
| **S2** | **Re-apresentação no 1º "bora" (Bug 2 mascarado)**: a msg de valor pós-desconto ("Show! Ele topou em R$ 10. Bora marcar?") é **auto-enviada** pela decisão do tatuador, e provavelmente **não é persistida em `conversa_mensagens`**. Então no 1º "bora" o `valorJaApresentado(historico, valor)` não acha o valor no histórico → `valor_apresentado=nao` → agente re-apresenta. No 2º "bora" a re-apresentação já está no histórico → avança. **Isso explica por que o eval TC-P12 passa (fixture tem o valor no histórico) mas prod falha.** Fix: persistir auto-sends no histórico, OU sinal `valor_apresentado` mais robusto (flag de estado em vez de derivar do texto). **Lead:** um grep rápido NÃO achou insert óbvio de respostas do bot em `conversa_mensagens` (role=assistant/autor=bot) — 1º passo da próxima sessão: confirmar SE e COMO as respostas do bot são persistidas no histórico (se não forem, `valorJaApresentado` quebra sempre em prod, e o eval só passa porque a fixture injeta o valor no histórico). A msg "Ele topou em R$10" é o copy de entrada `§3.1` do PropostaAgent na reentrada com `decisao_desconto='aceito'`. | M6 (1º vs 2º "bora") | fluxo de reentrada propondo_valor + `agents/proposta.js` (`valorJaApresentado`) + persistência de `conversa_mensagens` | **alta** |
| **S3** | **Pix prematuro**: ao dizer "bora", o bot mandou os horários **E** o Pix do sinal no mesmo turno, ANTES do cliente escolher. Fluxo desejado: horários → cliente escolhe → (agendado + Pix). Investigar se `reservar_horario` disparou sem escolha, ou se batching/duplicação juntou turnos (ligado a S2/Bug 5). | M (após "bora") | `api/agent/route.js` (`executeOrchestration` → reservar_horario/gerar-link-sinal) + SessionQueue/batching | **alta** |
| **S4** | **"Recebemos teu sinal" em 1 balão**: `mp-sinal-handler.js:44` monta a msg numa string só, **sem `\n\n`**, e envia **fora** do pipeline de split. Quer 2 balões: "Recebemos teu sinal! ✅ Teu horário tá confirmado pra {quando}." \n\n "Qualquer coisa é só chamar aqui. Até lá!" | confirmação de sinal | `_lib/mp-sinal-handler.js:44` (add `\n\n` + garantir split no send, ou 2 `evoSend`) | média |
| **S5** | **Split `\n\n` só existe no pipeline do agente** (Etapa 7). Sends de SISTEMA diretos (mp-sinal-handler, e qualquer outro auto-send) não dividem. Padronizar um helper `sendComSplit()` reutilizável (split `\n\n` + delay entre balões) e usar em todos os senders. | transversal | `_lib/evolution-send.js` + call-sites (`mp-sinal-handler.js`, decisão-desconto) | média |
| **S6** | **Parcelamento (suporte ao P5-recusado)**: pra oferecer "Nx de R$Y sem juros (mín R$100)", precisa de cálculo estrutural (parcelas a partir do valor, regra de mínimo) + provavelmente config do tenant (aceita parcelamento? nº máx?). Hoje não existe. | P5 | novo helper + `config_precificacao` | média (feature) |
| **S7** | **Duplicação de resposta genérica ("persiste")**: além de S2, o usuário marcou "bug de agendamento com resposta duplicada persiste". Confirmar se há duplicate-SEND (mesma msg 2x via webhook/batching) independente de S2. Ligado ao backlog conhecido de **batching/debounce (Bug 5)**. | M6/M7 | SessionQueue DO (cron-worker) + idempotência do inbound | média |

---

## Parte 3 — Notas pra a próxima sessão (Codex)

**Mecanismos JÁ confirmados (não re-investigar):**
- `whatsapp-pipeline.js:299` divide `resposta_cliente` do agente em balões por `/\n\s*\n/` e manda 1 `evoSend` por balão. ✅
- `format-link-sinal-msg.js` (Pix e link) usa `\n\n` → o Pix do sinal **já** quebra em balões. ✅
- `mp-sinal-handler.js:44` (confirmação pós-pagamento) **NÃO** usa `\n\n` e envia fora do pipeline → fonte do S4/S5.
- `cadastro/decisao.js:83` já manda não aceitar idade-só → LLM violou (P9/S1).

**Divisão estrutural vs prompt (resumo):**
- **Só prompt:** P1, P2, P3, P4, P6, P7, P8 (emitir `\n\n` + copy/tom/recall).
- **Só estrutural:** S2, S3, S4, S5, S7.
- **Híbrido (prompt + estrutural):** P9+S1 (alucinação de data), P5+S6 (parcelamento).

**Ordem sugerida de ataque (maior risco/dano primeiro):**
1. **S1/P9** — alucinação de `data_nascimento` (dado falso do cliente). Crítico.
2. **S2** — valor re-apresentado no 1º "bora" (persistir auto-send no histórico OU flag de estado). Quebra a UX de fechamento.
3. **S3** — Pix prematuro (gerar sinal só após escolha de horário).
4. **S4/S5** — split `\n\n` em mensagens de sistema (helper reutilizável).
5. **P-batch** (P1–P8) — pode ir junto numa leva de prompt, com snapshots regenerados + evals.
6. **S6/P5** — parcelamento (feature nova).
7. **S7/Bug 5** — batching/duplicação (já tem backlog próprio: `project_bug_batching_debounce`).

**Cuidados ao mexer em prompt:** o prompt da Proposta está a **2480/2500 tokens** (contrato `coleta-proposta`). Qualquer texto novo (P3/P4/P5) vai precisar condensar algo OU rever o limite. Tattoo tem mais folga. Todo edit de prompt regenera snapshot (`scripts/update-prompt-snapshots.sh`) + roda evals.

**Operacional:** prod está com `f41702a` (branch não-mergeada). Antes de qualquer novo deploy, decidir: mergear a branch atual (os 4 bugs + 2 fixes da review) ou rollback. Rollback: `wrangler pages deployment list --project-name=inkflow-saas` → ID anterior.
