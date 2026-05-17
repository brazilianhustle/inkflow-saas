# Refator do prompt coleta tattoo — manifesto P5/P6 violations (v2)

**Data:** 2026-05-17
**Branch:** `feat/refator-prompt-tattoo-manifesto-v2`
**Status:** ready-to-plan
**Predecessor empírico:** `docs/inkflow-agent/reports/2026-05-17-eval-post-fase1.md` (manifesto fail 6/6 pós Caminho C Fase 1)
**Manifesto canônico:** `docs/manifesto-tatuador-bot.md` (P1-P6 cravados 2026-05-13)

---

## 1. Contexto

O **Caminho C — Fase 1** (PR #71 squash `0a0afee`, mergeado 2026-05-17 parte 4) eliminou 100% dos HTTP 500 do TattooAgent ao mover invariantes pro schema strict (discriminated union via OpenAI Responses API direta). Meta DoD principal atingida (**0/6 HTTP 500** vs 1/3 baseline).

Mas o eval re-baseline pós-Fase 1 mostrou **pass rate 0/6** nas 3 personas direcionadas (per-001, per-009, per-010). Os 6 fails são **consistentes** entre runs — não são flaky — e o diagnóstico do report `2026-05-17-eval-post-fase1.md` é cristalino:

> Manifesto fail (6/6) — **problema do prompt, não do schema strict.** Refator Fase 1 não alterou `generatePromptColetaTattoo`. O prompt continua igual.

Violations específicas observadas pelo judge `claude-haiku-4-5-20251001`:

- **P5 (modo CONSULTOR vs COLETOR):** bot usa linguagem formulário robotizada ("Anotei X. Qual a sua altura?") sem validar substantivamente a ideia que cliente acabou de dar.
- **P6 (cliente indeciso tratado como decidido):** em PER-009 (cliente troca rosa→leão no turn 4), bot trata como decidido e segue coletando, sem refletir a mudança.
- **P3 (foto antes de clareza):** bot pede foto quando cliente ainda explorando a ideia.

Este spec corrige a **camada do prompt** (não do schema, intocado).

## 2. Diagnóstico

Análise do código atual (`functions/_lib/prompts/coleta/tattoo/decisao.js` + `exemplos.js`) cruzada com o que o judge cobra revela **duas causas estruturais**, não falta de regra:

### Causa 1 — Os exemplos canonizam o anti-pattern

`exemplos.js` Exemplo 3 (linhas 31-40 atuais) ensina literalmente o anti-pattern que o judge reclama:

```
AGENTE: Massa! Em qual parte do corpo tu quer?
AGENTE: Show! E de estilo, tu curte mais fineline, realismo, blackwork ou tradicional?
AGENTE: Top! E qual a tua altura?
AGENTE: Anotei: rosa fineline no antebraco direito, altura 170cm
```

"Massa!/Show!/Top!" são interjeições vazias seguidas de pergunta direta. A frase final é declarativa pura ("Anotei X"). LLM seguindo exemplos do prompt produz exatamente o que o judge reclama. Os 9 exemplos foram desenhados pra demonstrar a **mecânica de coleta progressiva (R9 acoplamento decisão↔texto)**, não a **substantividade de tom (P5)**. Ensinam o que ensinam.

### Causa 2 — A regra de validação substantiva tá fechada no contexto handoff

`decisao.js §4.4 Mensagem-ponte (handoff)` cravou "Balão 1 — validação substantiva: comente UMA característica concreta…". Mas isso vive **APENAS dentro da seção handoff** (linha 8 da tabela §4.1). Em CADA turno de coleta (linhas 1, 4 da tabela), não existe regra que force comentar substantivo antes da pergunta.

R9 (acoplamento decisão↔texto) cobre estrutura ("confirma + pergunta?") mas "confirma" pode ser declarativo vazio ("Anotei rosa fineline no antebraço, altura 170cm"). Pra LLM, "validação substantiva" é coisa de handoff porque é onde a regra mora.

### Causas descartadas

- **Schema/Zod:** funcionando (0 HTTP 500). NÃO tocar.
- **Modelo:** Sub 1.C falsificou que swap pra `gpt-4o` resolve (mesmo fail manifesto). NÃO tocar.
- **Manifesto incompleto (Causa 3 considerada e rejeitada):** P5 ("valida ideia em 1 frase ANTES de pedir info") + P6 (modo consultor) cobrem conceitualmente. Gap residual em "mudança de decisão pós-coleta parcial" (PER-009 turn 4) é menor e tratável via exemplo novo, não exige edit do manifesto. Manifesto edit fica como follow-up se este spec não bater DoD.

---

## 3. Escopo

### Em escopo

- **R10 (nova regra)** em `functions/_lib/prompts/coleta/tattoo/decisao.js` §4.3 (regras de conteúdo): substantividade turn-a-turn como regra geral aplicável a todo turno de coleta.
- **Reescrita dos exemplos** em `functions/_lib/prompts/coleta/tattoo/exemplos.js`:
  - 3 exemplos com **reescrita completa/pesada** (Ex.3 reescrita do anti-pattern espinha-dorsal, Ex.4 expandido até handoff, Ex.9 reescrita do anti-pattern do R9)
  - 3 exemplos com **reescrita leve** (Ex.2, Ex.5, Ex.6 — ajustes de substantividade preservando estrutura)
  - 3 exemplos **mantidos** (Ex.1 saudação, Ex.7 pedido malicioso, Ex.8 cover-up) — não envolvem turn de coleta com info do cliente, R10 não aplica
  - 1 exemplo **NOVO** (Ex.10) cobrindo pivot de decisão mid-coleta (PER-009)
- **Eval re-validation** em preview deploy com as 3 personas (per-001, per-009, per-010), 2 rounds × 3 = 6 runs.

### Fora de escopo

- ❌ Schema (`functions/api/agent/agents/tattoo-schema.js`) — strict tá funcionando, NÃO TOCAR.
- ❌ Router (`functions/api/agent/router.js`) + `route.js` — bifurcação tattoo intocada.
- ❌ Outros arquivos de prompt do tattoo (`contexto.js`, `faq.js`, `objetivo.js`, `few-shot-tenant.js`, `generate.js`, `identidade.js`) — não tocados.
- ❌ Cadastro/Proposta prompts — Caminho C Fase 2.
- ❌ Manifesto (`docs/manifesto-tatuador-bot.md`) — fica como tá; extensão é follow-up se DoD falhar.
- ❌ PER-009 state_transition fail (gap rubric judge vs flow router — `aguardando_foto` não existe no NEXT_STATE) — entry separada no backlog, decisão Leandro pendente (3 opções A/B/C documentadas no Painel parte 4).
- ❌ Outras partes do agent (cover-up, portfolio, trigger gatilhos) — Exemplo 7 + 8 intocados, regressão protegida via suíte local.

### Princípio guia

**YAGNI cravado.** Se eval pós-A mostrar pass rate 0/3 ou 1/3 mesmo com refator competente (assumindo rubric estável), abre sub-spec follow-up com a evidência nova em mãos. NÃO especula playbook expandido ou manifesto extension agora.

---

## 4. Mudanças cravadas

### 4.1 R10 em `decisao.js`

**Localização:** `functions/_lib/prompts/coleta/tattoo/decisao.js`, dentro de `§4.3 Regras de conteudo`, **depois de R9** (após linha 120 atual).

**Texto a inserir:**

```text
**R10 (Manifesto P5). VALIDACAO SUBSTANTIVA POR TURNO.** Em CADA turno de
coleta (linhas 1, 4 da tabela §4.1 — antes do handoff), sua `resposta_cliente`
DEVE comentar UMA caracteristica concreta da info que o cliente acabou de dar
ANTES da pergunta pelo proximo OBR. Interjeicao vazia ("Massa!", "Show!",
"Top!", "Beleza!", "Anotei!") sozinha NAO satisfaz R10.

Validacao substantiva = comentar UM atributo concreto do que cliente disse:
- estetica/visual ("fineline fica delicado e envelhece bem")
- localizacao/proporcao ("antebraco da visibilidade e bom espaco")
- combinacao/relacao ("rosa fineline tem leitura limpa")
- estilo/movimento ("realismo no antebraco fica imponente")

Limite duro: **maximo 1 frase de validacao substantiva por turn.** Nao
acumule comentarios — uma observacao concreta + a pergunta. Tom de tatuador
comentando casualmente, NAO comentarista expert nem SDR.

Exemplos:
- ❌ ERRADO (`campos_faltando=[altura_cm]`):
  "Massa! E qual a tua altura?"  (interjeicao vazia)
- ❌ ERRADO:
  "Top! Anotei rosa fineline no antebraco. Qual a tua altura?"  (anotacao,
  nao validacao substantiva)
- ❌ ERRADO (inflado, viola limite duro):
  "Rosa fineline no antebraco fica bem delicada e tem leitura limpa, alem
  de envelhecer com elegancia e combinar com varios outfits. Qual a tua
  altura?"  (3 frases de validacao = exagero)
- ✅ CERTO:
  "Rosa fineline no antebraco tem uma leitura bem delicada. Qual a tua
  altura?"
- ✅ CERTO:
  "Massa, fineline combina com rosa — fica clean e envelhece bem. E qual
  a tua altura?"  (interjeicao + 1 frase de validacao substantiva = ok)

Excecoes (R10 NAO se aplica):
- Linha 8 (handoff) — coberta por §4.4 balao 1 (regra mais especifica).
- Linha 12 (pedido malicioso de tool) — recusa nao exige validacao.
- §4.5 (cliente pediu portfolio) — resposta curta natural.
- Cover-up / trigger / erro (`proxima_acao='erro'`) — segue padrao de erro.

**Combina com R9.** R9 cravou estrutura ("confirma + pergunta?"). R10 cravou
substantividade ("confirma O QUE"). Os dois juntos:
- "Rosa fineline no antebraco tem leitura delicada. Qual a tua altura?"
  ↑ valida substantivamente (R10) + pergunta direta com `?` (R9) ✅
```

**Razão da escolha de localização:** R10 entra em §4.3 junto com R1-R9, sem subseção nova. Minimiza ruído no arquivo. Referencia §4.4 e §4.5 explicitamente como exceções pra evitar conflito de regra.

**Razão de NÃO promover §4.4 globalmente:** §4.4 fala de handoff que tem regras próprias (2 balões + pedido cadastro). Promover globalmente quebraria a especificidade do handoff. R10 como regra paralela cobre só turnos de coleta.

### 4.2 Reescrita de `exemplos.js`

**Localização:** `functions/_lib/prompts/coleta/tattoo/exemplos.js`, função `exemplosTattoo(tenant)`.

#### Exemplo 1 — MANTÉM (1º contato sem dados)

Inalterado. Saudação não tem info do cliente pra validar substantivamente.

#### Exemplo 2 — REESCRITA LEVE (cliente vago, bot não persegue cm — P1)

**Antes:**
```
CLIENTE: quero uma rosa pequena
AGENTE: Massa! Sobre o tamanho o tatuador acerta a proporcao no dia. Em qual parte do corpo tu quer?
```

**Depois:**
```
CLIENTE: quero uma rosa pequena
AGENTE: Massa, rosa rende bastante — e sobre tamanho o tatuador acerta a proporcao no dia, olhando teu corpo. Em qual parte tu pensou?
```

Notas: (persiste `descricao_curta='rosa'`, `tamanho_cm` NÃO perguntado, faltam `local_corpo`/`altura_cm`/`estilo`, `proxima_acao=pergunta`).

#### Exemplo 3 — REESCRITA COMPLETA (coleta progressiva 4 OBR)

**Antes (ANTI-PATTERN canonizado — espinha dorsal do problema):**
```
CLIENTE: quero fazer uma rosa
AGENTE: Massa! Em qual parte do corpo tu quer?
CLIENTE: no antebraco direito
AGENTE: Show! E de estilo, tu curte mais fineline, realismo, blackwork ou tradicional?
CLIENTE: fineline
AGENTE: Top! E qual a tua altura?
CLIENTE: 1.70m
AGENTE: Anotei: rosa fineline no antebraco direito, altura 170cm
```

**Depois (validação substantiva em cada turn):**
```
CLIENTE: quero fazer uma rosa
AGENTE: Massa, rosa rende bastante — da pra ir do delicado ao mais detalhado. Em qual parte do corpo tu pensou?
CLIENTE: no antebraco direito
AGENTE: Antebraco e otimo pra rosa, da bom espaco e visibilidade. E de estilo, tu curte mais fineline (delicado), realismo (sombreado), blackwork (grafico) ou tradicional?
CLIENTE: fineline
AGENTE: Fineline com rosa fica clean e envelhece bem. E qual a tua altura?
CLIENTE: 1.70m
AGENTE: Anotei, 170cm. Rosa fineline no antebraco direito tem leitura bem delicada.
```

Notas: (persiste 4 OBR progressivamente via `dados_persistidos`, `proxima_acao=pergunta` até completar — turno final reverte pra handoff via §4.4; este exemplo só ilustra a coleta).

#### Exemplo 4 — EXPANDIDO (conflito tamanho → foto-negada → handoff sem confronto — PER-010 completo)

**Antes (incompleto, para no "sem problema"):**
```
CLIENTE: queria uma rosa pequena de 25cm no antebraco
AGENTE: Tu tem alguma foto de referencia desse desenho? Ajuda muito o tatuador entender a ideia
CLIENTE: nao tenho foto
AGENTE: Sem problema! E de estilo, tu prefere fineline, realismo, blackwork ou tradicional?
```

**Depois (PER-010 completo até handoff — cobre sub-caso "conflito pós-foto-negada"):**
```
CLIENTE: queria uma rosa pequena de 25cm no antebraco
AGENTE: Tu tem alguma foto de referencia desse desenho? Ajuda muito o tatuador entender a ideia
CLIENTE: nao tenho foto agora
AGENTE: Tranquilo, segue normal — o tatuador resolve o dimensionamento avaliando teu corpo no dia. E de estilo, tu prefere fineline (delicado), realismo (sombreado), blackwork (grafico) ou tradicional?
CLIENTE: fineline
AGENTE: Fineline com rosa fica clean. E qual a tua altura?
CLIENTE: 1.65m
AGENTE: Anotei, 165cm. Rosa fineline no antebraco tem leitura delicada.

AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve.
```

Notas: (`campos_conflitantes=['tamanho_cm']`, NÃO persiste `tamanho_cm`, persiste `descricao_curta='rosa'`, `local_corpo='antebraco'`, `estilo='fineline'`, `altura_cm=165`. Turnos intermediários `proxima_acao=pergunta`. Turno final `proxima_acao=handoff` com 2 balões: validação substantiva + pedido cadastro. **NUNCA confronta**, **NUNCA sugere range**).

#### Exemplo 5 — REESCRITA LEVE (4 OBR despejados, handoff com foto pedida 1x)

**Antes:**
```
CLIENTE: fineline rosa no pulso direito, tenho 1.65m
AGENTE: Rosa fineline no pulso fica delicada e bem visivel

AGENTE: Consegue mandar tambem uma foto do local? Ajuda o tatuador a ter nocao do espaco
CLIENTE: nao tenho foto agora
AGENTE: Tranquilo! Rosa fineline no pulso fica elegante e discreta

AGENTE: Pra liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna
```

**Depois (mantém estrutura, ajusta apenas o turno 1 pra substantividade alinhada ao R10):**
```
CLIENTE: fineline rosa no pulso direito, tenho 1.65m
AGENTE: Rosa fineline no pulso fica delicada e bem visivel — boa escolha de tamanho de local.

AGENTE: Consegue mandar tambem uma foto do pulso? Ajuda o tatuador a ter nocao do espaco
CLIENTE: nao tenho foto agora
AGENTE: Sem problema, rosa fineline no pulso fica elegante e discreta.

AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve.
```

Notas: (turno 1: 4 OBR completos despejados de uma vez, pede `foto_local` 1x, `proxima_acao=pergunta`. Turno 3: `foto_local=null` aceito, `proxima_acao=handoff`, resposta em 2 balões — validação substantiva + pedido cadastro texto corrido).

#### Exemplo 6 — REESCRITA LEVE (modo consultor)

**Antes:**
```
CLIENTE: queria fazer uma tattoo mas nao sei o que
AGENTE: Boa! Vou te ajudar a chegar la. Tem ideia de qual parte do corpo tu quer?
CLIENTE: no antebraco
AGENTE: Show! E de estilo — fineline (delicado), realismo (sombreado) ou blackwork (grafico)?
CLIENTE: fineline
AGENTE: Massa! Da uma olhada no Pinterest com "fineline antebraco" e me manda referencias
```

**Depois (mantém §4.6 modo consultor, ajusta substantividade):**
```
CLIENTE: queria fazer uma tattoo mas nao sei o que
AGENTE: Boa, primeira tattoo da pra construir junto. Tem ideia de qual parte do corpo?
CLIENTE: no antebraco
AGENTE: Antebraco rende bastante — funciona pra varios estilos. Tu prefere algo mais delicado tipo fineline, sombreado tipo realismo ou grafico tipo blackwork?
CLIENTE: fineline
AGENTE: Fineline e estilo que envelhece muito bem, especialmente em antebraco. Da uma olhada no Pinterest buscando "fineline antebraco" e me manda alguma referencia que te chamou atencao.
```

Notas: (modo consultor — coleta `local_corpo` + `estilo`, sugere Pinterest, aguarda referência; NÃO pede cm nem altura ainda).

#### Exemplo 7 — MANTÉM (pedido malicioso tool fora whitelist)

Inalterado. R10 não se aplica (recusa em linha 12 da tabela).

#### Exemplo 8 — MANTÉM (cover-up trigger)

Inalterado. R10 não se aplica (`proxima_acao=erro`).

#### Exemplo 9 — REESCRITA (R9 acoplamento — antes era anti-pattern direto)

**Antes (anti-pattern):**
```
CLIENTE: no antebraco
AGENTE: Show, antebraco anotado. E qual a tua altura?
```

**Depois (R9 + R10 combinados):**
```
CLIENTE: no antebraco
AGENTE: Antebraco da bom espaco e visibilidade. E qual a tua altura?
```

Notas: (persiste `local_corpo='antebraco'`, faltam `altura_cm`/`estilo`. `proxima_acao=pergunta`, `campos_faltando=[altura_cm, estilo]`, `resposta_cliente` OBRIGATORIAMENTE contém a pergunta pelo PRIMEIRO campo faltando — `?` presente — **E** validação substantiva concreta antes — R10. ERRADO seria responder apenas "Show, antebraco anotado" — viola R9 (sem `?`) **OU** "Show, antebraco. Qual a tua altura?" — viola R10 (interjeição vazia)).

#### Exemplo 10 — NOVO (pivot de decisão mid-coleta — PER-009)

```
CLIENTE: oi tudo bem? queria uma rosinha
AGENTE: Bem demais, e tu? Rosa rende bastante — da pra ir do delicado ao mais detalhado. Em qual parte do corpo tu pensou?
CLIENTE: fineline
AGENTE: Fineline com rosa fica clean. E em qual parte do corpo tu quer?
CLIENTE: no antebraco
AGENTE: Antebraco e otimo pra fineline, da boa visibilidade. Qual a tua altura?
CLIENTE: ah na verdade troquei de ideia, queria um leao realismo agora
AGENTE: Tranquilo, leao realismo e tatuagem que impoe — bem diferente da rosa fineline. Bora cravar com leao entao. No antebraco tambem ou tu pensou em outro lugar?
CLIENTE: no mesmo lugar, antebraco
AGENTE: Leao realismo no antebraco fica imponente — bom espaco pra detalhe. E qual a tua altura?
CLIENTE: 1.70m
AGENTE: Leao realismo no antebraco com 170cm tem boa proporcao pro corpo.

AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve.
```

Notas críticas (pivot de decisão):
- **RESET cravado:** quando cliente troca o desenho (turn 4 — "ah na verdade troquei de ideia"), bot DEVE resetar `descricao_curta` (antes `rosa`/`rosinha` → agora `leao`) e `estilo` (antes `fineline` → agora `realismo`). Esses 2 campos são **propriedades do desenho**.
- **MANTÉM:** `local_corpo` (cliente confirma "no mesmo lugar, antebraco" no turn 5 — re-confirmação. Se cliente dissesse outro lugar, RESETARIA também) e `altura_cm` (propriedade do CORPO do cliente, não do desenho — nunca reseta).
- **Validação substantiva no turn de pivot (turn 4 do bot):** comenta a diferença/contraste ("bem diferente da rosa fineline") ANTES de re-coletar. NÃO ignora a mudança nem trata como se cliente sempre tivesse dito leão.
- **Persistência final:** `descricao_curta='leao'`, `estilo='realismo'`, `local_corpo='antebraco'`, `altura_cm=170`. `proxima_acao=handoff` no turno final com 2 balões padrão §4.4.

### 4.3 Sem mudanças em outros arquivos

`identidade.js`, `contexto.js`, `faq.js`, `objetivo.js`, `few-shot-tenant.js`, `generate.js` — intocados. R10 mora em decisao.js, exemplos vivem em exemplos.js, restante do prompt não tem ponto de contato com substantividade turn-a-turn.

---

## 5. Estratégia de validação

### Pipeline (igual ao do Caminho C Fase 1)

1. **Suite local primeiro.** Rodar `npm test` antes de qualquer push. Esperado **773/773 PASS** (Fase 1 baseline). Sem mudança de schema, qualquer fail é regressão e bloqueia.

2. **Deploy preview** via wrangler:
```bash
wrangler pages deploy . --project-name inkflow-saas \
  --branch feat/refator-prompt-tattoo-manifesto-v2 --commit-dirty=true
```

3. **Run eval** (2 rounds × 3 personas = 6 runs) via harness com `BASE_URL` apontando pro preview + CF Access service token:
```bash
BASE_URL=https://feat-refator-prompt-tattoo.inkflow-saas.pages.dev \
  node evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo
```

4. **Judge:** `claude-haiku-4-5-20251001` (Anthropic), mesmo rubric do baseline pós-Fase 1. Permite comparação A/B direta.

5. **Custo previsto:** ~$1.50 (sem spike pré-PR caro como o da Fase 1).

### Smoke Cadastro/Proposta

Não precisa eval — prompts intocados, schema intocado, route bifurcação intocada. Suíte local (773 tests) protege regressão.

---

## 6. Definition of Done (8 checkpoints)

| # | Critério | Threshold | Bloqueia merge? |
|---|---|---|---|
| 1 | HTTP 500 rate | 0/6 (mantém ganho da Fase 1) | ✅ sim |
| 2 | **Pass rate** | **≥ 2/3 personas (4/6 runs)** | ✅ sim — DoD principal |
| 3 | Naturalidade média | ≥ 4.0 | ✅ sim |
| 4 | Manifesto adherence por persona com pass | ≥ 0.85 | ✅ sim |
| 5 | Suite local | 773/773 PASS | ✅ sim |
| 6 | Custo total eval | ≤ $2.00 | ⚠️ over = avisa, não bloqueia |
| 7 | `grep` em `decisao.js` | R10 presente após R9 | ✅ sim |
| 8 | `grep` em `exemplos.js` | Ex.3 + Ex.9 sem "Massa!/Show!/Top!" soltos como interjeição vazia, Ex.10 novo presente | ✅ sim |

**O que NÃO é DoD:**
- Pass rate 3/3 — não é exigido. Se chegar é bônus.
- PER-009 state_transition ✅ — gap rubric vs flow router, fora deste spec.
- Improvements em Cadastro/Proposta — fora.

---

## 7. Path B (DoD fail) — protocolo

Se pass rate < 2/3 mesmo com refator A competente (assumindo rubric estável):

1. **NÃO retroativar A** pra adicionar B/C inline. Mantém o spec A cravado.
2. **Mergeia A com DoD FAIL anotado** preservando spec + plan + report como evidência (mesmo padrão do PR #70 Sub 1.C).
3. **Abre sub-spec B** com a evidência empírica nova:
   - Se fails forem específicos (ex: per-009 ainda falha pivot, outros 2 passam) → spec focado em playbook expandido `§4.7`.
   - Se fails forem gerais (3 personas ainda 0/3) → spec re-diagnóstico, possivelmente manifesto extension OU swap de model OU outro caminho.

**Critério "refator A competente":** R10 cravado conforme spec, exemplos reescritos conforme spec, sem regressão em suite local. Se A não bater DoD com refator competente, é sinal forte de que diagnóstico subestimou complexidade — sub-spec B parte dessa evidência.

---

## 8. Risk mitigation

### Risco 1 — Tom inflado (comentarista demais)

Bot pode soar como SDR fazendo upselling: "Rosa fineline é uma das tatuagens que mais envelhece bem e tem demanda crescente entre clientes jovens, especialmente em antebraço…".

**Mitigação cravada em R10:** "Limite duro: **máximo 1 frase de validação substantiva por turn.**" + exemplo ❌ ERRADO inflado no próprio R10 mostrando o anti-pattern.

### Risco 2 — Jargão técnico (tatuador expert demais)

Bot pode usar vocabulário que cliente leigo não entende ("contornos negativos", "líneas paralelas"). Manifesto P4 já cravou que cliente é leigo.

**Mitigação:** tom validado por Leandro (tatuador real) no brainstorm — Exemplo 3 reescrito usa vocabulário concreto mas acessível ("rende bastante", "fica clean", "envelhece bem", "imponente", "boa visibilidade"). Mesmo registro replicado nos outros exemplos.

### Risco 3 — Regressão em cover-up / portfólio / cliente vago

Exemplos 7+8 intocados. Cobertura por suite local 773/773. Expansão Ex.4 testada via eval re-baseline.

**Mitigação:** suite local rodada antes do push (DoD #5). Eval cobre per-001 (happy), per-009 (pivot), per-010 (conflito). Cover-up + portfolio cobertos por testes unitários no suite.

### Risco 4 — R10 entra em conflito com R9

R9 (acoplamento estrutural) e R10 (substantividade) podem confundir LLM se mal-formulados.

**Mitigação cravada em R10:** seção explícita "Combina com R9" mostrando exemplo combinado válido. Ambas regras coexistem no mesmo `§4.3`, com R10 referenciando R9 textualmente.

---

## 9. Estimativas

| Fase | Estimativa | Custo |
|---|---|---|
| Edit R10 em decisao.js | 30min | $0 |
| Reescrita 4 exemplos pesados (Ex.2, 3, 4, 9) | 1h | $0 |
| Reescrita 2 exemplos leves (Ex.5, 6) | 30min | $0 |
| Exemplo 10 novo (pivot) | 30min | $0 |
| Suite local + lint | 15min | $0 |
| Commit + push + preview deploy | 15min | $0 |
| Eval re-baseline 2 rounds × 3 personas | 30min wall-clock | ~$1.50 |
| PR + smoke manual | 30min | $0 |
| **Total** | **~4h** | **~$1.50** |

---

## 10. Próximos passos

1. **Plan executável** via `/plan` neste spec OU `/superpowers:writing-plans`. Output esperado: ~7-10 tasks granulares (edit R10 → reescrever cada exemplo → suite local → deploy preview → eval → análise → PR).
2. **Execução** em sessão dedicada via `subagent-driven-development` OU `executing-plans` — esperado ~3-4h wall-clock.
3. **DoD pass** → squash merge em main. **DoD fail** → Path B (seção 7).

---

## Apêndice — Referências cruzadas

**Predecessor (DoD parcial pass):** Caminho C — Fase 1 (`docs/superpowers/specs/2026-05-17-caminho-c-fase1-tattoo-strict-schema-design.md`, PR #71 squash `0a0afee`).

**Manifesto canônico:** `docs/manifesto-tatuador-bot.md` (cravado 2026-05-13).

**Eval baseline pré-este-refator:** `docs/inkflow-agent/reports/2026-05-17-eval-post-fase1.md`.

**Personas:** `evals/inkflow-agent/directed/tattoo/per-001/01-happy-path.json` + `per-009/01-muda-decisao.json` + `per-010/01-conflito.json`.

**Prompts a modificar:** `functions/_lib/prompts/coleta/tattoo/decisao.js` + `exemplos.js`.

**Memory stale (NÃO usar):** `[[InkFlow — Brainstorm prep refator-prompts-coleta-v2]]` (escopo n8n single-agent abandonado 2026-05-08).
