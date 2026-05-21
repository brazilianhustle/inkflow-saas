---
title: Refator Prompts Coleta + Proposta — 4 bugs do smoke do Pix
date: 2026-05-21
status: aprovado (design) — aguardando review do spec
branch: feat/refator-prompts-coleta-proposta
related:
  - docs/manifesto-tatuador-bot.md
  - memory: project_bugs_coleta_proposta
---

# Refator Prompts Coleta + Proposta

## 1. Contexto e problema

No smoke real do Pix (2026-05-21, PR #85), com uma conversa de verdade do começo ao fim, apareceram 5 bugs de comportamento do bot **fora do escopo do Pix** (que passou). Quatro são de **prompt** (o bot desobedece regras que já existem) e um é estrutural (batching/debounce). Esta feature ataca os **4 de prompt** — 2 na fase de **coleta** (TattooAgent) e 2 na fase de **proposta** (PropostaAgent).

Diagnóstico-raiz comum: **as regras já estão escritas nos prompts, mas o LLM as desobedece** em pontos onde nada o impede (campo opcional sem invariante, gatilho ambíguo, contexto incompleto). Portanto o fix não é "escrever a regra" — é reforçar o prompt **e** fechar a brecha que deixa o LLM escapar.

Arquitetura atual (pós-migração multi-agent, OpenAI Responses API strict + CF Workers): agentes em `functions/api/agent/agents/`, prompts em `functions/_lib/prompts/coleta/{tattoo,proposta}/`, schemas strict por substate.

## 2. Objetivo

Corrigir os 4 bugs de comportamento abaixo, cada um coberto por um cenário de eval que **falha antes do fix e passa depois**, fechando com um **smoke E2E real**.

### Non-goals (fora de escopo)
- **Bug 5 — batching/debounce** (estrutural, `cron-worker/src/session-queue.js`, `DEBOUNCE_MS=8s`) → sessão separada. Ver memória `project_bug_batching_debounce`.
- Repensar o design de "pedir altura da pessoa como proxy de tamanho" (Manifesto P1) → mantido; só corrigimos a extração/desambiguação. Vira sub-feature **apenas se** a regra de desambiguação (§5.3) não resolver na prática.
- Refator estrutural da máquina de estados da negociação (era a abordagem C, rejeitada).

## 3. Abordagem geral

**Prompt + 2 travas leves** (abordagem B). Os 4 bugs são corrigidos no prompt; os 2 mais teimosos (Bugs 1 e 2, que dependem do LLM "lembrar" de obedecer) ganham uma trava barata na causa-raiz, sem refatorar a máquina de estados.

**Validação:** eval-driven + smoke real (decisão do Leandro). Para cada bug, ≥1 cenário de eval nas fixtures (`tests/agent/_fixtures/`) que reproduz o bug (falha hoje) e passa após o fix; snapshots de prompt atualizados; smoke E2E real no fim.

## 4. Design por bug

> Ordem de apresentação: Bug 1 (TattooAgent) → Bugs 2 e 4 (PropostaAgent, agrupados por agente) → Bug 3 (TattooAgent, por último porque detalha a §5). Numeração preservada do diagnóstico original (memória `project_bugs_coleta_proposta`, onde Bug 5 = batching, fora de escopo).

### Bug 1 — não pede foto do local (TattooAgent)
**Sintoma:** bot capta a referência mas pula o pedido da foto do local do corpo antes do handoff.
**Causa:** `§4.4` (`coleta/tattoo/decisao.js`) manda pedir a foto 1x antes do handoff, mas a foto é **opcional** (sem invariante de servidor) → o LLM pula. Há ainda contradição interna: `§4.2` diz "Pedida até 2x", `§4.4` diz "PECA A FOTO 1 VEZ".

**Fix:**
- *Prompt:* padronizar "1x" em §4.2 e §4.4; reforçar §4.4 como passo obrigatório pré-handoff (alinhar com Exemplo 5).
- *Trava leve:* o handoff só é liberado se a foto do local já foi **pedida** ≥1x (não "coletada" — a foto continua opcional). Se o contador = 0 e sem `foto_local` → o fluxo força um turno `pergunta` (pedido da foto) antes de aceitar `handoff`. Onde gatear (route.js vs contrato) fica pro `/plan`.
  - ⚠️ **Achado do self-review (2026-05-21):** o campo `tentativas_foto_local` é **lido** em 3 lugares (`whatsapp-pipeline.js:233`, `foto-classifier.js`, `tattoo/contexto.js:46`) mas **nunca é escrito/incrementado** — está dormente (o contexto sempre vê `0`; a linha "foto pedida Nx" nunca dispara). Logo a trava **não** é só "reaproveitar" o campo: exige **implementar o incremento + persistência** do contador quando o bot pede a foto (em `dados_coletados` ou `estado_extra` — decidir no `/plan`) e só então gatear o handoff. Esse contador morto é, provavelmente, parte da própria causa do Bug 1.

**Critério de aceitação (eval):** cenário "4 OBR completos, `tentativas_foto_local=0`, sem foto → bot emite `pergunta` pedindo a foto, NÃO `handoff`".

### Bug 2 — pergunta valor depois de aceito (PropostaAgent) ⚠️ crítico
**Sintoma:** bot dá o orçamento, cliente aceita ("bora"), e o bot pergunta "Qual o valor que tu tinha em mente?".
**Causa:** o estado fica em `propondo_valor` mesmo após o valor já ter sido apresentado. O contexto (`coleta/proposta/contexto.js`) **não informa se o valor já foi apresentado**, e `§3.1` (`fluxo.js`) manda "abrir apresentando o valor" sempre. O LLM trata o "bora" como pechincha e copia o texto da linha 2 da tabela (`§4.1`, "Quanto tu tava pensando?").

**Fix:**
- *Prompt:* desambiguar gatilhos em `propondo_valor` — "bora/sim/fechou/vamos/ok/topo" = **aceitação** → `oferecendo_horario`, nunca perguntar valor. Reescrever o Exemplo 2 (`exemplos.js`) deixando explícito que "Quanto tu tava pensando?" só vale quando o cliente reclama do preço **sem** aceitar.
- *Trava leve:* injetar no contexto um sinal **"valor já apresentado ao cliente: sim/não"** (derivável do histórico/flag). Quando "sim", o prompt proíbe re-apresentar e re-perguntar o valor.
  - ⚠️ **Self-review:** tratar a interação com `decisao_desconto`. Quando o tatuador aceita um desconto, o valor muda e é **re-apresentado** (§3.1 variante "aceito") — o sinal "valor já apresentado" precisa refletir o **valor atual** (resetar/atualizar ao surgir novo valor pós-desconto), senão o bot pula a re-apresentação do novo valor. Resolver no `/plan`.

**Critério de aceitação (eval):** cenário "histórico já contém a proposta de valor + cliente diz 'bora' → `oferecendo_horario`, resposta NÃO contém 'quanto tu tava pensando'".

### Bug 4 — rebaixa orçamento sem limite (PropostaAgent)
**Sintoma:** cliente pechincha ("faz por R$2?") e o bot topa qualquer valor verbalmente ("topou em R$2").
**Causa:** `§4.2 R2` já proíbe, mas o LLM **verbaliza** a aceitação na `resposta_cliente`. O schema (`proposta-schema.js`) **não** permite o bot mudar `valor_proposto` — só `valor_pedido_cliente` dentro de `pediu_desconto`. Logo o sistema não cobra errado; é só a *fala* que mente (igual ao bug "falou 700, cobrou 500").

**Fix:**
- *Prompt:* reforçar R2 — o bot **jamais** verbaliza aceitação de valor diferente do `valor_proposto`. Qualquer "faz por X / deixa por X" → `pediu_desconto` (consulta o tatuador), e a `resposta_cliente` não pode confirmar o valor pechinchado.

**Critério de aceitação (eval):** cenário "cliente 'faz por R$2' → `pediu_desconto`, `resposta_cliente` NÃO confirma R$2 (não contém 'topou'/'fechou em R$2'/aceite de valor menor)".

### Bug 3 — ignora altura / multi-campo / foto como tema (TattooAgent)
**Sintoma:** cliente manda "quero tatuagem, tenho 1.81, na perna, realismo" + foto numa só mensagem; o bot capta local+estilo, **ignora a altura** (re-pergunta), e fica pedindo "tema/ideia" sem usar a foto de referência como descrição.
**Causa:** `§4.1`/`§4.3` mandam preencher `dados_persistidos` com todos os campos válidos e perguntar só o que falta, mas o LLM falha em (a) normalizar "1.81"→181 e diferenciar altura de tamanho, (b) extrair multi-campo de uma vez, (c) usar a referência visual como tema.

**Fix (prompt, 3 partes):**
- **(a) Desambiguação ALTURA × TAMANHO** (§5.3 abaixo) — o ponto que o Leandro condicionou a "resolver de vez".
- **(b) Multi-campo:** persistir **todos** os campos válidos de uma mensagem num único turno (reforço da regra existente).
- **(c) Foto como tema:** quando vem foto de referência e o cliente não deu tema em texto, usar a descrição visual como `descricao_curta` (parar de pedir "tema/ideia").

**Critério de aceitação (eval):** cenário "cliente: 'rosa fineline na perna, 5cm, sou 1.81' → persiste `descricao_curta=rosa`, `estilo=fineline`, `local_corpo=perna`, `tamanho_cm=5`, `altura_cm=181`, sem re-perguntar campo já dado".

## 5. Regra de desambiguação ALTURA × TAMANHO (Bug 3a)

Validada com o Leandro (tatuador) — corrigida a partir da proposta inicial (zona de ambiguidade era grande demais):

- **Normalização:** "1.81", "1,81", "1.81m", "1,81 m" → **181** (`altura_cm`); "181" → 181.
- **Classificação por magnitude:**
  - número **≤ 50** (com ou sem "cm") → **tamanho da tattoo** (`tamanho_cm`, opcional, nunca perguntado proativamente — Manifesto P1). Nunca é altura.
  - número em **metros** (1,40–2,49) **ou** inteiro **≥ ~140** → **altura da pessoa** (`altura_cm`).
  - **zona morta rara** (≈51–139): caso raríssimo → **na dúvida, perguntar** se é altura ou tamanho.
- **Sinal de contexto:** se o bot acabou de perguntar a altura, o número da resposta é altura (desambigua sozinho na maioria dos casos reais).

> Premissa do Leandro: "ninguém vai mandar número entre 1 e 50 como altura". A separação por magnitude é limpa; a zona morta é exceção rara.

## 6. Estratégia de validação

1. **Eval por bug** — adicionar cenários nas fixtures:
   - `tests/agent/_fixtures/scenarios.json` (TattooAgent — Bugs 1 e 3)
   - `tests/agent/_fixtures/scenarios-proposta.json` (PropostaAgent — Bugs 2 e 4)
   - Rodar `npm run eval:tattoo` / `npm run eval:proposta` (chamam o agente real, gpt-4o-mini, precisam de `OPENAI_API_KEY`). Confirmar que cada cenário **falha antes** do fix.
2. **Snapshots de prompt** — atualizar via `scripts/update-prompt-snapshots.sh` após as edições; `npm test -- tests/prompts/snapshot.test.mjs` verde.
3. **Suíte completa** verde.
4. **Smoke E2E real** — conversa de verdade do zero confirmando os 4 bugs corrigidos (banco limpo no tenant de teste).

## 7. Arquivos afetados (estimativa — detalhar no /plan)

**Prompt:**
- `functions/_lib/prompts/coleta/tattoo/decisao.js` (§4.2/§4.4 foto; §4.1/§4.3 multi-campo + altura×tamanho)
- `functions/_lib/prompts/coleta/tattoo/exemplos.js` (exemplo de multi-campo c/ altura; reforço foto)
- `functions/_lib/prompts/coleta/proposta/decisao.js` (R2; §4.1 gatilhos)
- `functions/_lib/prompts/coleta/proposta/fluxo.js` (§3.1 "valor já apresentado")
- `functions/_lib/prompts/coleta/proposta/exemplos.js` (reescrever Exemplo 2)

**Travas leves (estrutural mínimo):**
- `functions/_lib/prompts/coleta/proposta/contexto.js` (injetar "valor já apresentado") + origem do flag
- `functions/_lib/prompts/coleta/tattoo/contexto.js` e/ou validação de handoff (gate foto pedida ≥1x) — local exato no `/plan`

**Testes:**
- `tests/agent/_fixtures/scenarios.json`, `tests/agent/_fixtures/scenarios-proposta.json`
- `tests/prompts/snapshots/*` (regeneração)

## 8. Critérios de aceitação (DoD da feature)

- [ ] 4 cenários de eval (1 por bug) adicionados; cada um falhava antes e passa depois.
- [ ] Suíte completa verde + snapshots atualizados.
- [ ] Bug 1: contador `tentativas_foto_local` passa a ser escrito/incrementado (hoje dormente); handoff bloqueado sem foto pedida ≥1x.
- [ ] Bug 2: "valor já apresentado" no contexto + aceitação → `oferecendo_horario` sem re-perguntar.
- [ ] Bug 3: extração multi-campo + altura×tamanho conforme §5; foto-como-tema.
- [ ] Bug 4: pechincha → `pediu_desconto` sem verbalizar aceite de valor menor.
- [ ] Smoke E2E real validou os 4.

## 9. Referências
- Memória `project_bugs_coleta_proposta` (diagnóstico dos 5 bugs)
- `docs/manifesto-tatuador-bot.md` (P1 tamanho, P3 foto/altura, P6 modos)
- PR #85 (Pix dinâmico — smoke que revelou os bugs)
- Snapshot atual: `tests/prompts/snapshots/coleta-tattoo.txt`, `coleta-proposta.txt`
