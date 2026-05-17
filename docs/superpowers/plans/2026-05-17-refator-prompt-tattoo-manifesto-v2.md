# Refator prompt coleta tattoo — manifesto P5/P6 (v2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir manifesto fail 6/6 do TattooAgent pós-Caminho C Fase 1 via cravar R10 (validação substantiva por turno) em `decisao.js` + reescrever 6 exemplos + criar Ex.10 (pivot) em `exemplos.js`. Schema strict intocado.

**Architecture:** Refator cirúrgico em 2 arquivos só (`functions/_lib/prompts/coleta/tattoo/decisao.js` + `exemplos.js`). R10 entra em `§4.3 Regras de conteudo` após R9. Reescreve Ex.2, Ex.3, Ex.4, Ex.5, Ex.6, Ex.9; cria Ex.10; mantém Ex.1, Ex.7, Ex.8. Validação via suite local (773/773) + eval direcionado (3 personas × 2 rounds) em preview deploy.

**Tech Stack:** JavaScript (Cloudflare Pages Functions), Vitest (suite local), OpenAI Responses API strict schema (intocado), eval harness `evals/inkflow-agent/_harness/run.mjs` com judge `claude-haiku-4-5-20251001`.

**Spec:** `docs/superpowers/specs/2026-05-17-refator-prompt-tattoo-manifesto-v2-design.md`

**Riscos cravados:**
- Tom inflado (comentarista demais) — mitigado pelo limite duro "1 frase substantiva/turn" no próprio R10
- Conflito R9 vs R10 — mitigado pela seção "Combina com R9" cravada no R10
- DoD pass rate < 2/3 — Path B documentado na §7 do spec (NÃO retroativa A, mergeia com DoD FAIL anotado, abre sub-spec B)
- Custo eval — orçado ~$1.50 (~$2.00 hard limit DoD #6)

---

### Task 1: Cravar R10 em `decisao.js` (§4.3, após R9)

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/decisao.js:120` (inserir bloco novo entre fim de R9 linha 120 e início de §4.4 linha 122)

- [ ] **Step 1: Aplicar edit — inserir R10 após o último parágrafo de R9**

Edit `functions/_lib/prompts/coleta/tattoo/decisao.js`:

`old_string` (final de R9 + linha em branco + cabeçalho de §4.4):
```
A invariante do servidor rejeita output que viole esse acoplamento — output retorna erro 500 e cliente nao recebe resposta. **Mantenha decisao alinhada ao texto.**

## §4.4 Mensagem-ponte (handoff — linha 8 da tabela)
```

`new_string`:
```
A invariante do servidor rejeita output que viole esse acoplamento — output retorna erro 500 e cliente nao recebe resposta. **Mantenha decisao alinhada ao texto.**

**R10 (Manifesto P5). VALIDACAO SUBSTANTIVA POR TURNO.** Em CADA turno de coleta (linhas 1, 4 da tabela §4.1 — antes do handoff), sua \`resposta_cliente\` DEVE comentar UMA caracteristica concreta da info que o cliente acabou de dar ANTES da pergunta pelo proximo OBR. Interjeicao vazia ("Massa!", "Show!", "Top!", "Beleza!", "Anotei!") sozinha NAO satisfaz R10.

Validacao substantiva = comentar UM atributo concreto do que cliente disse:
- estetica/visual ("fineline fica delicado e envelhece bem")
- localizacao/proporcao ("antebraco da visibilidade e bom espaco")
- combinacao/relacao ("rosa fineline tem leitura limpa")
- estilo/movimento ("realismo no antebraco fica imponente")

Limite duro: **maximo 1 frase de validacao substantiva por turn.** Nao acumule comentarios — uma observacao concreta + a pergunta. Tom de tatuador comentando casualmente, NAO comentarista expert nem SDR.

Exemplos:
- ❌ ERRADO (\`campos_faltando=[altura_cm]\`):
  "Massa! E qual a tua altura?"  (interjeicao vazia)
- ❌ ERRADO:
  "Top! Anotei rosa fineline no antebraco. Qual a tua altura?"  (anotacao, nao validacao substantiva)
- ❌ ERRADO (inflado, viola limite duro):
  "Rosa fineline no antebraco fica bem delicada e tem leitura limpa, alem de envelhecer com elegancia e combinar com varios outfits. Qual a tua altura?"  (3 frases de validacao = exagero)
- ✅ CERTO:
  "Rosa fineline no antebraco tem uma leitura bem delicada. Qual a tua altura?"
- ✅ CERTO:
  "Massa, fineline combina com rosa — fica clean e envelhece bem. E qual a tua altura?"  (interjeicao + 1 frase de validacao substantiva = ok)

Excecoes (R10 NAO se aplica):
- Linha 8 (handoff) — coberta por §4.4 balao 1 (regra mais especifica).
- Linha 12 (pedido malicioso de tool) — recusa nao exige validacao.
- §4.5 (cliente pediu portfolio) — resposta curta natural.
- Cover-up / trigger / erro (\`proxima_acao='erro'\`) — segue padrao de erro.

**Combina com R9.** R9 cravou estrutura ("confirma + pergunta?"). R10 cravou substantividade ("confirma O QUE"). Os dois juntos:
- "Rosa fineline no antebraco tem leitura delicada. Qual a tua altura?"
  ↑ valida substantivamente (R10) + pergunta direta com \`?\` (R9) ✅

## §4.4 Mensagem-ponte (handoff — linha 8 da tabela)
```

- [ ] **Step 2: Verificar via grep que R10 entrou após R9 e antes de §4.4**

Run:
```bash
grep -n "^\*\*R10\|^## §4.4" functions/_lib/prompts/coleta/tattoo/decisao.js
```

Expected (linha de R10 deve ser MENOR que linha de §4.4):
```
122:**R10 (Manifesto P5). VALIDACAO SUBSTANTIVA POR TURNO.** Em CADA turno de coleta...
156:## §4.4 Mensagem-ponte (handoff — linha 8 da tabela)
```
(números aproximados — o que importa é R10 < §4.4 e R10 > R9 na linha 110).

- [ ] **Step 3: Verificar suite local não regrediu**

Run:
```bash
npm test 2>&1 | tail -20
```

Expected: `Tests  773 passed (773)` ou número equivalente da baseline pós-Fase 1. Se algum teste falhar mencionando snapshot de prompt, atualizar snapshot com `npm test -- -u` SÓ se a diff for o R10 entrando — qualquer outra diff é regressão real.

- [ ] **Step 4: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/decisao.js
git commit -m "$(cat <<'EOF'
feat(prompt-tattoo): crava R10 — validacao substantiva por turn (Manifesto P5)

Spec: docs/superpowers/specs/2026-05-17-refator-prompt-tattoo-manifesto-v2-design.md
DoD #7: R10 presente em §4.3 depois de R9.

R10 cobre o que R9 nao cobria: estrutura (R9) vs substantividade (R10).
Inclui limite duro "1 frase/turn", 5 exemplos (3 errados + 2 certos) e
secao "Combina com R9" para evitar conflito de regra.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Reescrita pesada — Exemplos 3, 4, 9, 10 em `exemplos.js`

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/exemplos.js:30-50` (Ex.3 e Ex.4)
- Modify: `functions/_lib/prompts/coleta/tattoo/exemplos.js:92-98` (Ex.9)
- Modify: `functions/_lib/prompts/coleta/tattoo/exemplos.js:98` (após Ex.9 — adicionar Ex.10 novo)

**Razão de agrupar:** todas as 4 mudanças tocam o mesmo arquivo, todas são "reescrita pesada/nova" do spec §4.2, e fazem sentido juntas como o "core do refator de exemplos".

- [ ] **Step 1: Reescrever Exemplo 3 (espinha dorsal anti-pattern)**

Edit `functions/_lib/prompts/coleta/tattoo/exemplos.js`:

`old_string`:
```
## Exemplo 3 — Linha 4: coleta progressiva dos 4 OBR
\`\`\`
CLIENTE: quero fazer uma rosa
AGENTE: Massa! Em qual parte do corpo tu quer?
CLIENTE: no antebraco direito
AGENTE: Show! E de estilo, tu curte mais fineline, realismo, blackwork ou tradicional?
CLIENTE: fineline
AGENTE: Top! E qual a tua altura?
CLIENTE: 1.70m
AGENTE: Anotei: rosa fineline no antebraco direito, altura 170cm
\`\`\`
(persiste 4 OBR progressivamente via dados_persistidos, proxima_acao=pergunta ate completar)
```

`new_string`:
```
## Exemplo 3 — Linha 4: coleta progressiva dos 4 OBR (validacao substantiva R10 em cada turn)
\`\`\`
CLIENTE: quero fazer uma rosa
AGENTE: Massa, rosa rende bastante — da pra ir do delicado ao mais detalhado. Em qual parte do corpo tu pensou?
CLIENTE: no antebraco direito
AGENTE: Antebraco e otimo pra rosa, da bom espaco e visibilidade. E de estilo, tu curte mais fineline (delicado), realismo (sombreado), blackwork (grafico) ou tradicional?
CLIENTE: fineline
AGENTE: Fineline com rosa fica clean e envelhece bem. E qual a tua altura?
CLIENTE: 1.70m
AGENTE: Anotei, 170cm. Rosa fineline no antebraco direito tem leitura bem delicada.
\`\`\`
(persiste 4 OBR progressivamente via dados_persistidos, proxima_acao=pergunta ate completar — turno final reverte pra handoff via §4.4; este exemplo so ilustra a coleta)
```

- [ ] **Step 2: Expandir Exemplo 4 (PER-010 completo até handoff)**

`old_string`:
```
## Exemplo 4 — Linha 6: conflito de dados (pede foto, NAO confronta — P1)
\`\`\`
CLIENTE: queria uma rosa pequena de 25cm no antebraco
AGENTE: Tu tem alguma foto de referencia desse desenho? Ajuda muito o tatuador entender a ideia
CLIENTE: nao tenho foto
AGENTE: Sem problema! E de estilo, tu prefere fineline, realismo, blackwork ou tradicional?
\`\`\`
(campos_conflitantes=['tamanho_cm'], NAO persiste tamanho_cm, persiste descricao_curta='rosa' e local_corpo='antebraco', proxima_acao=pergunta — NUNCA confronta nem sugere range)
```

`new_string`:
```
## Exemplo 4 — Linha 6 + linha 8: conflito → foto-negada → completa OBR → handoff (PER-010 completo)
\`\`\`
CLIENTE: queria uma rosa pequena de 25cm no antebraco
AGENTE: Tu tem alguma foto de referencia desse desenho? Ajuda muito o tatuador entender a ideia
CLIENTE: nao tenho foto agora
AGENTE: Tranquilo, segue normal — o tatuador resolve o dimensionamento avaliando teu corpo no dia. E de estilo, tu prefere fineline (delicado), realismo (sombreado), blackwork (grafico) ou tradicional?
CLIENTE: fineline
AGENTE: Fineline com rosa fica clean. E qual a tua altura?
CLIENTE: 1.65m
AGENTE: Anotei, 165cm. Rosa fineline no antebraco tem leitura delicada.

AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve.
\`\`\`
(campos_conflitantes=['tamanho_cm'], NAO persiste tamanho_cm, persiste descricao_curta='rosa', local_corpo='antebraco', estilo='fineline', altura_cm=165. Turnos intermediarios proxima_acao=pergunta. Turno final proxima_acao=handoff com 2 baloes: validacao substantiva + pedido cadastro. NUNCA confronta, NUNCA sugere range)
```

- [ ] **Step 3: Reescrever Exemplo 9 (R9 + R10 combinados, sem "Show, anotado")**

`old_string`:
```
## Exemplo 9 — R9: acoplamento decisao↔texto (confirma + pergunta proximo OBR)
\`\`\`
CLIENTE: no antebraco
AGENTE: Show, antebraco anotado. E qual a tua altura?
\`\`\`
(persiste local_corpo='antebraco', faltam altura_cm/estilo. proxima_acao=pergunta, campos_faltando=[altura_cm, estilo], resposta_cliente OBRIGATORIAMENTE contem a pergunta pelo PRIMEIRO campo faltando — '?' presente. ERRADO seria responder apenas "No antebraco" — viola R9, dispara invariant-violation no servidor.)
`
```

`new_string`:
```
## Exemplo 9 — R9 + R10: acoplamento decisao↔texto com validacao substantiva
\`\`\`
CLIENTE: no antebraco
AGENTE: Antebraco da bom espaco e visibilidade. E qual a tua altura?
\`\`\`
(persiste local_corpo='antebraco', faltam altura_cm/estilo. proxima_acao=pergunta, campos_faltando=[altura_cm, estilo], resposta_cliente OBRIGATORIAMENTE contem a pergunta pelo PRIMEIRO campo faltando — '?' presente — E validacao substantiva concreta antes — R10. ERRADO seria responder apenas "Show, antebraco anotado" — viola R10 (interjeicao + anotacao vazia, sem comentario substantivo) OU "Antebraco." — viola R9 (sem '?').)

## Exemplo 10 — Pivot de decisao mid-coleta (PER-009 — cliente troca desenho no meio)
\`\`\`
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
\`\`\`
(pivot de decisao — quando cliente troca desenho no turn 4, bot DEVE resetar descricao_curta=rosa→leao e estilo=fineline→realismo. MANTEM local_corpo (cliente re-confirma "no mesmo lugar") e altura_cm (propriedade do corpo, nao do desenho). Validacao substantiva no turn de pivot comenta a diferenca/contraste ANTES de re-coletar — NAO trata como se cliente sempre tivesse dito leao. Persistencia final: descricao_curta='leao', estilo='realismo', local_corpo='antebraco', altura_cm=170. proxima_acao=handoff no turno final com 2 baloes padrao §4.4.)
`
```

- [ ] **Step 4: Verificar via grep que reescritas pesadas pegaram**

Run:
```bash
echo "=== Ex.3 (anti-pattern removido) ==="
grep -c "Massa! Em qual parte" functions/_lib/prompts/coleta/tattoo/exemplos.js
echo "=== Ex.3 (novo substantivo) ==="
grep -c "rosa rende bastante" functions/_lib/prompts/coleta/tattoo/exemplos.js
echo "=== Ex.4 (handoff cravado) ==="
grep -c "liberar teu orcamento personalizado" functions/_lib/prompts/coleta/tattoo/exemplos.js
echo "=== Ex.9 (anti-pattern removido) ==="
grep -c "Show, antebraco anotado" functions/_lib/prompts/coleta/tattoo/exemplos.js
echo "=== Ex.10 (novo pivot) ==="
grep -c "leao realismo" functions/_lib/prompts/coleta/tattoo/exemplos.js
```

Expected:
```
=== Ex.3 (anti-pattern removido) ===
0
=== Ex.3 (novo substantivo) ===
1
=== Ex.4 (handoff cravado) ===
2   # uma no Ex.4 expandido + uma no Ex.10 (ambos têm handoff)
=== Ex.9 (anti-pattern removido) ===
0
=== Ex.10 (novo pivot) ===
2   # "leao realismo" aparece 2x no Ex.10 (turn pivot + handoff final)
```

Se algum count estiver errado, revisar edit e repetir.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/exemplos.js
git commit -m "$(cat <<'EOF'
feat(prompt-tattoo): reescreve Ex.3/4/9 (anti-patterns), cria Ex.10 (pivot)

Spec §4.2 — reescritas pesadas:
- Ex.3: espinha-dorsal "Massa!/Show!/Top!" -> validacao substantiva em cada turn
- Ex.4: expandido ate handoff (PER-010 completo, cobre "conflito pos-foto-negada")
- Ex.9: corrige anti-pattern "Show, anotado" -> R9 + R10 combinados
- Ex.10 (novo): pivot de decisao mid-coleta (PER-009 — reset descricao_curta + estilo, mantem local_corpo + altura_cm)

DoD #8: Ex.3 + Ex.9 sem "Massa!/Show!/Top!" como interjeicao vazia, Ex.10 presente.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Reescrita leve — Exemplos 2, 5, 6 em `exemplos.js`

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/exemplos.js:23-28` (Ex.2)
- Modify: `functions/_lib/prompts/coleta/tattoo/exemplos.js:52-63` (Ex.5)
- Modify: `functions/_lib/prompts/coleta/tattoo/exemplos.js:65-74` (Ex.6)

**Razão de agrupar:** todos são ajustes pontuais (1-2 linhas cada) preservando estrutura. Não justifica 3 commits separados — bundle como "ajustes leves de substantividade".

- [ ] **Step 1: Reescrita leve Ex.2 (cliente vago)**

Edit `functions/_lib/prompts/coleta/tattoo/exemplos.js`:

`old_string`:
```
CLIENTE: quero uma rosa pequena
AGENTE: Massa! Sobre o tamanho o tatuador acerta a proporcao no dia. Em qual parte do corpo tu quer?
```

`new_string`:
```
CLIENTE: quero uma rosa pequena
AGENTE: Massa, rosa rende bastante — e sobre tamanho o tatuador acerta a proporcao no dia, olhando teu corpo. Em qual parte tu pensou?
```

- [ ] **Step 2: Reescrita leve Ex.5 (4 OBR despejados + foto pedida 1x + handoff)**

Substituir Ex.5 completo. `old_string`:
```
## Exemplo 5 — Linha 8: 4 OBR completos, pede foto 1x e faz handoff
\`\`\`
CLIENTE: fineline rosa no pulso direito, tenho 1.65m
AGENTE: Rosa fineline no pulso fica delicada e bem visivel

AGENTE: Consegue mandar tambem uma foto do local? Ajuda o tatuador a ter nocao do espaco
CLIENTE: nao tenho foto agora
AGENTE: Tranquilo! Rosa fineline no pulso fica elegante e discreta

AGENTE: Pra liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna
\`\`\`
(turno 2: 4 OBR completos, pede foto_local 1x, proxima_acao=pergunta. turno 3: foto_local=null aceito, proxima_acao=handoff, resposta em 2 baloes — validacao substantiva + pedido cadastro texto corrido)
```

`new_string`:
```
## Exemplo 5 — Linha 8: 4 OBR completos, pede foto 1x e faz handoff
\`\`\`
CLIENTE: fineline rosa no pulso direito, tenho 1.65m
AGENTE: Rosa fineline no pulso fica delicada e bem visivel — boa escolha de tamanho de local.

AGENTE: Consegue mandar tambem uma foto do pulso? Ajuda o tatuador a ter nocao do espaco
CLIENTE: nao tenho foto agora
AGENTE: Sem problema, rosa fineline no pulso fica elegante e discreta.

AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve.
\`\`\`
(turno 1: 4 OBR completos despejados de uma vez, pede foto_local 1x, proxima_acao=pergunta. Turno 3: foto_local=null aceito, proxima_acao=handoff, resposta em 2 baloes — validacao substantiva + pedido cadastro texto corrido)
```

- [ ] **Step 3: Reescrita leve Ex.6 (modo consultor)**

`old_string`:
```
## Exemplo 6 — §4.6: modo consultor (cliente indeciso)
\`\`\`
CLIENTE: queria fazer uma tattoo mas nao sei o que
AGENTE: Boa! Vou te ajudar a chegar la. Tem ideia de qual parte do corpo tu quer?
CLIENTE: no antebraco
AGENTE: Show! E de estilo — fineline (delicado), realismo (sombreado) ou blackwork (grafico)?
CLIENTE: fineline
AGENTE: Massa! Da uma olhada no Pinterest com "fineline antebraco" e me manda referencias
\`\`\`
(modo consultor — coleta local_corpo + estilo, sugere Pinterest, aguarda referencia; NAO pede cm nem altura ainda)
```

`new_string`:
```
## Exemplo 6 — §4.6: modo consultor (cliente indeciso)
\`\`\`
CLIENTE: queria fazer uma tattoo mas nao sei o que
AGENTE: Boa, primeira tattoo da pra construir junto. Tem ideia de qual parte do corpo?
CLIENTE: no antebraco
AGENTE: Antebraco rende bastante — funciona pra varios estilos. Tu prefere algo mais delicado tipo fineline, sombreado tipo realismo ou grafico tipo blackwork?
CLIENTE: fineline
AGENTE: Fineline e estilo que envelhece muito bem, especialmente em antebraco. Da uma olhada no Pinterest buscando "fineline antebraco" e me manda alguma referencia que te chamou atencao.
\`\`\`
(modo consultor — coleta local_corpo + estilo, sugere Pinterest, aguarda referencia; NAO pede cm nem altura ainda)
```

- [ ] **Step 4: Verificar via grep que reescritas leves pegaram**

Run:
```bash
echo "=== Ex.2 (novo) ==="
grep -c "Massa, rosa rende bastante" functions/_lib/prompts/coleta/tattoo/exemplos.js
echo "=== Ex.5 (novo Sem problema, rosa) ==="
grep -c "Sem problema, rosa fineline no pulso" functions/_lib/prompts/coleta/tattoo/exemplos.js
echo "=== Ex.6 (novo Boa, primeira tattoo) ==="
grep -c "Boa, primeira tattoo da pra construir" functions/_lib/prompts/coleta/tattoo/exemplos.js
echo "=== anti-pattern Show! solto sobrevivente (deve ser 0) ==="
grep -cE "^AGENTE: (Massa!|Show!|Top!|Beleza!) [A-ZÀ-Ú]" functions/_lib/prompts/coleta/tattoo/exemplos.js
```

Expected:
```
=== Ex.2 (novo) ===
1
=== Ex.5 (novo Sem problema, rosa) ===
1
=== Ex.6 (novo Boa, primeira tattoo) ===
1
=== anti-pattern Show! solto sobrevivente (deve ser 0) ===
0
```

Se o último count > 0, alguma reescrita ainda tem interjeição vazia solta — investigar via `grep -nE "^AGENTE: (Massa!|Show!|Top!|Beleza!) [A-ZÀ-Ú]" functions/_lib/prompts/coleta/tattoo/exemplos.js` e corrigir.

- [ ] **Step 5: Commit**

```bash
git add functions/_lib/prompts/coleta/tattoo/exemplos.js
git commit -m "$(cat <<'EOF'
feat(prompt-tattoo): reescrita leve Ex.2/5/6 — substantividade alinhada a R10

Spec §4.2 — reescritas leves preservando estrutura:
- Ex.2: "Massa!" -> "Massa, rosa rende bastante" (cliente vago + P1 cm)
- Ex.5: turn 1 ganha "boa escolha de tamanho de local", turn 3 reformula
- Ex.6: modo consultor com validacao substantiva em cada turn

DoD #8 reforco: nenhum "Massa!/Show!/Top!" solto como interjeicao vazia em exemplos de coleta.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Validação local — suite + greps DoD #5, #7, #8

**Files:**
- Verify: `functions/_lib/prompts/coleta/tattoo/decisao.js`
- Verify: `functions/_lib/prompts/coleta/tattoo/exemplos.js`
- Run: `npm test`

- [ ] **Step 1: Rodar suite completa**

Run:
```bash
npm test 2>&1 | tail -40
```

Expected: `Tests  773 passed (773)` (ou o número da baseline pós-Fase 1, presumível 773). Se algum teste falhar:
- **Snapshot de prompt:** se a diff é só R10 entrando OU exemplos reescritos, atualizar com `npm test -- -u` e re-rodar.
- **Qualquer outra falha:** é regressão real. Investigar antes de seguir.

- [ ] **Step 2: Greps DoD #7 e #8 cravados**

Run:
```bash
echo "=== DoD #7: R10 entre R9 e §4.4 ==="
grep -nE "^\*\*R(9|10)|^## §4\.4" functions/_lib/prompts/coleta/tattoo/decisao.js | head -10

echo ""
echo "=== DoD #8a: Ex.3 sem anti-pattern 'Massa! Em qual' ==="
grep -c "Massa! Em qual parte do corpo tu quer?" functions/_lib/prompts/coleta/tattoo/exemplos.js

echo "=== DoD #8b: Ex.9 sem 'Show, antebraco anotado' ==="
grep -c "Show, antebraco anotado" functions/_lib/prompts/coleta/tattoo/exemplos.js

echo "=== DoD #8c: Ex.10 presente ==="
grep -c "Exemplo 10 — Pivot de decisao" functions/_lib/prompts/coleta/tattoo/exemplos.js

echo ""
echo "=== DoD #8d: nenhuma interjeicao vazia solta em exemplos de coleta ==="
grep -cE "^AGENTE: (Massa!|Show!|Top!|Beleza!) E? [a-zA-Zà-ú]" functions/_lib/prompts/coleta/tattoo/exemplos.js
```

Expected:
```
=== DoD #7: R10 entre R9 e §4.4 ===
[linha X]:**R9. ACOPLAMENTO DECISAO↔TEXTO ...
[linha Y]:**R10 (Manifesto P5). VALIDACAO SUBSTANTIVA ...    # Y > X
[linha Z]:## §4.4 Mensagem-ponte ...                          # Z > Y

=== DoD #8a: Ex.3 sem anti-pattern 'Massa! Em qual' ===
0

=== DoD #8b: Ex.9 sem 'Show, antebraco anotado' ===
0

=== DoD #8c: Ex.10 presente ===
1

=== DoD #8d: nenhuma interjeicao vazia solta em exemplos de coleta ===
0
```

Qualquer divergência bloqueia — voltar pra Task 1, 2 ou 3 e corrigir.

- [ ] **Step 3: Sem commit nesta task** — Task 4 é validação só.

Se suite + greps passam, prosseguir pra Task 5. Se algo falhou e foi corrigido, fazer fix-up commit:
```bash
git add functions/_lib/prompts/coleta/tattoo/
git commit -m "fix(prompt-tattoo): corrige <descricao do que falhou no grep>"
```

---

### Task 5: Push + deploy preview

**Files:**
- Push: branch `feat/refator-prompt-tattoo-manifesto-v2` pro origin
- Deploy: Cloudflare Pages preview via wrangler

- [ ] **Step 1: Push da branch atual**

Run:
```bash
git status
git log --oneline -5
git push origin feat/refator-prompt-tattoo-manifesto-v2
```

Expected: 3 commits ahead (Task 1 R10 + Task 2 exemplos pesados + Task 3 exemplos leves; opcional Task 4 fix-up). Push OK.

- [ ] **Step 2: Deploy preview via wrangler**

Run:
```bash
wrangler pages deploy . --project-name inkflow-saas \
  --branch feat/refator-prompt-tattoo-manifesto-v2 --commit-dirty=true 2>&1 | tee /tmp/wrangler-deploy.log
```

Expected: linha final tipo:
```
✨ Deployment complete! Take a peek over at https://feat-refator-prompt-tattoo.inkflow-saas.pages.dev
```

Salvar a URL exata pra Task 6. Se o subdomínio for diferente (truncamento de branch), usar o que o wrangler retornou.

- [ ] **Step 3: Smoke ping no preview**

Run:
```bash
PREVIEW_URL=$(grep -oE 'https://[a-z0-9-]+\.inkflow-saas\.pages\.dev' /tmp/wrangler-deploy.log | tail -1)
echo "PREVIEW_URL=$PREVIEW_URL"
curl -sI "$PREVIEW_URL" | head -5
```

Expected: `HTTP/2 200` ou `HTTP/2 401` (se CF Access tá ligado, é esperado — eval harness tem service token).

- [ ] **Step 4: Sem commit nesta task.** Deploy é side effect, não muda código local.

---

### Task 6: Run eval direcionado (3 personas × 2 rounds = 6 runs)

**Files:**
- Run: `evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo`
- Output: `evals/inkflow-agent/_runs/<timestamp>/...` (JSON + report.md)

**Pré-condição:** preview URL da Task 5 ativo + CF Access service token configurado nas env vars locais (`CF_ACCESS_CLIENT_ID` + `CF_ACCESS_CLIENT_SECRET`).

- [ ] **Step 1: Verificar env vars do CF Access**

Run:
```bash
echo "CF_ACCESS_CLIENT_ID set: $([ -n "$CF_ACCESS_CLIENT_ID" ] && echo YES || echo NO)"
echo "CF_ACCESS_CLIENT_SECRET set: $([ -n "$CF_ACCESS_CLIENT_SECRET" ] && echo YES || echo NO)"
echo "ANTHROPIC_API_KEY set: $([ -n "$ANTHROPIC_API_KEY" ] && echo YES || echo NO)"
```

Expected: 3x YES. Se algum NO, carregar via `source .env.eval` ou perguntar ao Leandro qual arquivo carregar.

- [ ] **Step 2: Rodar eval — round 1**

Run:
```bash
PREVIEW_URL=$(grep -oE 'https://[a-z0-9-]+\.inkflow-saas\.pages\.dev' /tmp/wrangler-deploy.log | tail -1)
BASE_URL="$PREVIEW_URL" \
  node evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo 2>&1 | tee /tmp/eval-round1.log
```

Expected: 3 runs (per-001, per-009, per-010) executados com judge `claude-haiku-4-5-20251001`. Cada um produz: `manifesto.pass`, `manifesto.adherence`, `naturalidade.score`, `state_transition.pass`. Output JSON em `evals/inkflow-agent/_runs/<timestamp>/`.

Capturar pass rate ao final do log.

- [ ] **Step 3: Rodar eval — round 2 (réplica idêntica)**

Run:
```bash
BASE_URL="$PREVIEW_URL" \
  node evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo 2>&1 | tee /tmp/eval-round2.log
```

Expected: outro set de 3 runs. Total = 6 runs.

- [ ] **Step 4: Custo + sanity check HTTP 500**

Run:
```bash
echo "=== HTTP 500 count (DoD #1, esperado 0/6) ==="
grep -cE "HTTP 500|status: 500" /tmp/eval-round1.log /tmp/eval-round2.log

echo ""
echo "=== Custo total (DoD #6, esperado <= \$2.00) ==="
grep -E "total.*cost|cost.*total|\\\$" /tmp/eval-round1.log /tmp/eval-round2.log | tail -10
```

Se HTTP 500 > 0, é regressão da Fase 1 — investigar antes de seguir pra Task 7.

- [ ] **Step 5: Sem commit nesta task.** Eval logs ficam em `/tmp` por enquanto; preservação cai no report da Task 7.

---

### Task 7: Análise DoD + PR (ou Path B se fail)

**Files:**
- Create: `docs/inkflow-agent/reports/2026-05-17-eval-refator-manifesto-v2.md`
- Action: `gh pr create` (se DoD pass) OU update do report com FAIL anotado + abertura de sub-spec B (se DoD fail)

- [ ] **Step 1: Compilar números do eval em report**

Ler manualmente:
- `evals/inkflow-agent/_runs/<timestamp-round1>/per-001/judge.json` + per-009 + per-010
- `evals/inkflow-agent/_runs/<timestamp-round2>/per-001/judge.json` + per-009 + per-010

Extrair pra tabela:
| Persona | Round 1 manifesto.pass | Round 2 manifesto.pass | Round 1 adherence | Round 2 adherence | Round 1 nat | Round 2 nat | HTTP 500 |
|---|---|---|---|---|---|---|---|

Escrever em `docs/inkflow-agent/reports/2026-05-17-eval-refator-manifesto-v2.md` seguindo o template de `2026-05-17-eval-post-fase1.md` (predecessor). Inclui:
- Summary 1-paragraph
- Tabela DoD 1-8 com PASS/FAIL por critério
- Comparação A/B contra baseline pós-Fase 1
- Análise das falhas (se houver) — qual P1-P6 caiu, quoting do judge
- Veredito final: DoD PASS ou DoD FAIL

- [ ] **Step 2: Decisão branch — DoD PASS ou FAIL?**

**Critério DoD principal (#2):** pass rate ≥ 2/3 personas (≥ 4/6 runs com `manifesto.pass=true`).

**Se PASS (≥ 2/3):**
- Prosseguir pra Step 3 (abrir PR).

**Se FAIL (< 2/3):**
- Pular pra Step 4 (Path B documentado).

- [ ] **Step 3 (PASS): Commit report + abrir PR**

```bash
git add docs/inkflow-agent/reports/2026-05-17-eval-refator-manifesto-v2.md
git commit -m "$(cat <<'EOF'
docs(eval): report refator-prompt-tattoo-manifesto-v2 — DoD PASS

DoD #2 (pass rate >= 2/3): <numero>/3 personas passaram manifesto.
Comparado contra baseline pos-Fase 1 (0/6 pass).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push origin feat/refator-prompt-tattoo-manifesto-v2

gh pr create --title "feat(prompt-tattoo): refator manifesto P5/P6 v2 — R10 + reescrita exemplos" --body "$(cat <<'EOF'
## Summary
- Crava R10 (validacao substantiva por turn — Manifesto P5) em `decisao.js` §4.3 apos R9
- Reescreve Ex.2/3/4/5/6/9 em `exemplos.js` removendo "Massa!/Show!/Top!" soltos
- Cria Ex.10 cobrindo pivot de decisao mid-coleta (PER-009)
- Schema strict (`tattoo-schema.js`) INTOCADO — 0/6 HTTP 500 mantido

## DoD (8/8 PASS)
Ver report: `docs/inkflow-agent/reports/2026-05-17-eval-refator-manifesto-v2.md`

## Test plan
- [x] Suite local 773/773 PASS
- [x] Eval direcionado 3 personas x 2 rounds (6 runs) em preview
- [x] DoD #2: pass rate >= 2/3
- [x] DoD #3: naturalidade >= 4.0
- [x] DoD #4: adherence >= 0.85 nas personas que passaram
- [x] DoD #7-8: greps R10 + exemplos cravados

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Pegar URL do PR e mostrar pro Leandro. **PARAR aqui** — merge é decisão Leandro.

- [ ] **Step 4 (FAIL): Path B — preservar evidência + sub-spec B**

Seguir protocolo do spec §7:

1. **NÃO retroativar A** — manter spec + plan + commits desta branch como evidência.
2. **Commit report com DoD FAIL anotado:**

```bash
git add docs/inkflow-agent/reports/2026-05-17-eval-refator-manifesto-v2.md
git commit -m "$(cat <<'EOF'
docs(eval): report refator-prompt-tattoo-manifesto-v2 — DoD FAIL

DoD #2 (pass rate >= 2/3): <numero>/3 personas passaram manifesto.
Refator A competente nao bateu DoD — sinal forte de que diagnostico subestimou
complexidade. Path B: sub-spec follow-up com evidencia empirica nova.

Spec: docs/superpowers/specs/2026-05-17-refator-prompt-tattoo-manifesto-v2-design.md §7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git push origin feat/refator-prompt-tattoo-manifesto-v2
```

3. **Apresentar pro Leandro:**
   - Pass rate observado
   - Quais personas falharam e qual P (P3/P5/P6) caiu
   - 2 opções: (a) abrir sub-spec B focado nos fails específicos OU (b) mergeia A como evidência sem PR de produção
   - Decisão final é do Leandro

4. **PR opcional com DoD FAIL anotado** (padrão PR #70 Sub 1.C):

```bash
gh pr create --title "feat(prompt-tattoo): refator manifesto v2 — DoD FAIL (evidencia para sub-spec B)" --body "$(cat <<'EOF'
## Status: DoD FAIL — evidencia preservada
Pass rate <numero>/3. Refator A competente nao bateu DoD principal (>= 2/3 personas).

## Por que mergeia mesmo com FAIL?
Mesma logica do PR #70 (Sub 1.C): spec + plan + commits + report cravados como evidencia empirica para sub-spec B.
Path B documentado em spec §7.

## Proximos passos
Decisao Leandro:
- (a) Abrir sub-spec B focado nos fails (P5 residual ou playbook expandido §4.7)
- (b) Mergeia como evidencia sem PR de producao (revert manual depois)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notas finais

**Wall-clock estimado:** ~3-4h (spec §9 cravou ~4h com $1.50 custo eval).

**Riscos cravados (recap):**
1. **Tom inflado** — mitigação no próprio R10 (limite duro 1 frase + exemplo ❌ ERRADO inflado).
2. **Conflito R9 ↔ R10** — seção "Combina com R9" no fim do R10 com exemplo combinado válido.
3. **Regressão em Ex.7/Ex.8** — intocados; cobertura via suite local 773 tests.
4. **DoD fail (< 2/3)** — Path B documentado (não retroativa A, preserva evidência, sub-spec B).

**O que NÃO está neste plano (fora do spec §3):**
- Schema strict (`tattoo-schema.js`) — intocado
- Router / route.js — intocado
- Manifesto canônico (`docs/manifesto-tatuador-bot.md`) — intocado (extensão é follow-up condicional)
- PER-009 state_transition gap (rubric judge vs flow router) — backlog separado
- Prompts Cadastro / Proposta — Caminho C Fase 2 separado

**Memória relevante:**
- [[project_agente_autonomo]] (rastreamento Refator Coleta v2 Multi-Agent — Sub-3.x)
- [[InkFlow Agent — Visão (2026-05-15)]] (programa cross-agent qualidade)
