# Coleta Multi-Agent — Prompt Tuning H2/H3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atingir gate ≥7/9 PASS nos cenários originais TC-01..TC-09 (com TC-05/TC-07/TC-08/TC-09 obrigatórios) **+ TC-10 (multi-turn) PASS** no eval suite, via prompt tuning cirúrgico nos blocos da fase tattoo + reescrita do `REFORCO_HANDOFF`. Unblockar Sub-3 (cutover n8n).

**Architecture:** 100% prompt-only. Mexe em 4 arquivos de prompt + dedup do `REFORCO_HANDOFF` no eval + adiciona TC-10 (multi-turn) em scenarios.json pra cobrir o caso real de produção. Não toca `route.js`, `router.js`, `sdk-init.js`, `TattooOutputSchema`. Não modifica oráculos TC-01..TC-09 (apenas adiciona TC-10). Modelo permanece `gpt-4o-mini` (paridade n8n). Iteração medida pelo eval suite real contra OpenAI.

**Tech Stack:** Node.js 22, OpenAI Agents SDK (`@openai/agents`), Zod schemas, `node:test` runner, gpt-4o-mini.

**Spec:** [`docs/superpowers/specs/2026-05-07-coleta-multi-agent-prompt-tuning-h2-h3-design.md`](../specs/2026-05-07-coleta-multi-agent-prompt-tuning-h2-h3-design.md)

**Pré-requisitos:** `OPENAI_API_KEY` no env. Branch `feat/coleta-multi-agent-handoff` com Sub-1 já mergeado.

---

## File Map

| Arquivo | Tipo | Responsabilidade após mudança |
|---------|------|-------------------------------|
| `functions/api/agent/agents/tattoo.js` | Modify | (a) `export` no `REFORCO_HANDOFF`; (b) reescrever conteúdo focando "uma chamada por campo + emitir output e parar" |
| `functions/_lib/prompts/coleta/tattoo/regras.js` | Modify | Substituir 4 refs a `acionar_handoff` (R6/R6b/R7/T4) por `proxima_acao='erro'` + adicionar **R9** (conflito de dados) |
| `functions/_lib/prompts/coleta/tattoo/fluxo.js` | Modify | (a) §3.3c.3 e §3.5: trocar `acionar_handoff(motivo=...)` por `proxima_acao='erro'`; (b) inserir §3.4b explícita sobre handoff_to_cadastro + output `proxima_acao='handoff'` no mesmo turno |
| `functions/_lib/prompts/coleta/tattoo/few-shot.js` | Modify | Adicionar Exemplo 6 (conflito/R9) e Exemplo 7 (one-shot até handoff) |
| `tests/agent/tattoo-agent.eval.mjs` | Modify | Importar `REFORCO_HANDOFF` de `tattoo.js` (eliminar duplicação) |
| `tests/agent/_fixtures/scenarios.json` | Modify (append-only) | Adicionar TC-10 (multi-turn handoff) — usa campo `historico` que já existe no schema, não modifica TC-01..TC-09 |
| `docs/auditoria/2026-05-07-sub1-eval-results.md` | Modify | Apêndice com run final + decisão Sub-2 unblocked |
| `docs/superpowers/specs/2026-05-07-coleta-multi-agent-prompt-tuning-h2-h3-design.md` | Modify | Preencher seção `## Outcome` com resultado final |

---

## Riscos chave (do spec, top 3)

1. **Custo OpenAI:** orçamento $2 cumulativo (~$0.40/iter). Stop condition explícito após iter 5.
2. **Regressão em TC-07/TC-08:** rollback do último commit + investigar antes de prosseguir. Cada iteração é um commit pra granularidade.
3. **Acoplamento eval↔prod:** a deduplicação faz o eval rodar EXATAMENTE o `REFORCO_HANDOFF` de produção — desejado pelo spec; valida o que vai pra prod.

**Não tem migration. Não tem secret novo. Não tem deploy.**

---

## Tasks

### Task 1: Refactor — Export REFORCO_HANDOFF e eliminar duplicação no eval

**Files:**
- Modify: `functions/api/agent/agents/tattoo.js:16` (adicionar `export`)
- Modify: `tests/agent/tattoo-agent.eval.mjs:18` (estender import) e `:39-42` (remover cópia local)

Esse é refactor seguro: trocar literal duplicado por import único. Faz isolado em commit próprio pra que iter 1 mude só semântica do prompt.

- [ ] **Step 1: Adicionar `export` à constante `REFORCO_HANDOFF` em `tattoo.js`**

  Localizar linha 16 e prefixar com `export`:

  ```js
  // antes:
  const REFORCO_HANDOFF = `
  // depois:
  export const REFORCO_HANDOFF = `
  ```

  Use `Edit` com `old_string: "const REFORCO_HANDOFF = \`"` → `new_string: "export const REFORCO_HANDOFF = \`"`.

- [ ] **Step 2: Estender import em `tests/agent/tattoo-agent.eval.mjs:18`**

  Antes:
  ```js
  import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo.js';
  ```

  Depois:
  ```js
  import { TattooOutputSchema, REFORCO_HANDOFF } from '../../functions/api/agent/agents/tattoo.js';
  ```

- [ ] **Step 3: Remover cópia local de `REFORCO_HANDOFF` em `eval.mjs:39-42`**

  Apagar o bloco inteiro:

  ```js
  const REFORCO_HANDOFF = `

  # §HANDOFF — INVARIANTE CRITICO
  JAMAIS chame \`handoff_to_cadastro\` quando \`dados_completos=false\` ou quando houver \`campos_conflitantes\` nao-vazio. O schema validara e rejeitara — voce voltara a perguntar. Resolva conflitos primeiro (R9: devolva contradicao ao cliente, NUNCA decida por ele).`;
  ```

  O comentário `// Builder pro eval...` na linha seguinte deve permanecer como o próximo elemento.

- [ ] **Step 4: Smoke test — confirmar que eval ainda compila (sem rodar suite completa)**

  Run:
  ```bash
  node --check tests/agent/tattoo-agent.eval.mjs
  node --check functions/api/agent/agents/tattoo.js
  ```

  Expected: ambos retornam exit 0 sem output. Se erro de sintaxe: arrumar o import/export antes de prosseguir.

- [ ] **Step 5: Audit grep `REFORCO_HANDOFF` no repo**

  ```bash
  grep -rn "REFORCO_HANDOFF" --include="*.js" --include="*.mjs" --include="*.ts" --include="*.tsx" .
  ```

  Expected: 4 ocorrências total — 2 em `tattoo.js` (definição + uso em `buildTattooAgent`) e 2 em `eval.mjs` (import + uso em `buildAgentForEval`). Nenhuma cópia literal solta. Se aparecer outra: investigar antes de continuar (risco identificado no spec).

- [ ] **Step 6: Commit**

  ```bash
  git add functions/api/agent/agents/tattoo.js tests/agent/tattoo-agent.eval.mjs
  git commit -m "refactor(coleta-multi-agent-sub2): export REFORCO_HANDOFF, eliminate eval dup

  Eval e prod precisam rodar EXATAMENTE o mesmo prompt — caso contrario
  o eval valida a coisa errada. Sem mudanca semantica nesta etapa."
  ```

---

### Task 2: Aplicar todas as mudanças de prompt (Iter 1 prep)

Spec marca essas como "interdependentes" — aplica tudo, depois roda eval. Um único commit.

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/regras.js`
- Modify: `functions/_lib/prompts/coleta/tattoo/fluxo.js`
- Modify: `functions/_lib/prompts/coleta/tattoo/few-shot.js`
- Modify: `functions/api/agent/agents/tattoo.js` (REFORCO_HANDOFF body)

#### Subtask 2.1: `regras.js` — Substituir R6/R6b/R7/T4 + adicionar R9

- [ ] **Step 1: Substituir R6 em `regras.js:23`**

  `old_string`:
  ```js
  linhas.push(`**R6.** HANDOFF: chame \`acionar_handoff\` APENAS quando: (a) cliente mencionar gatilho do estudio: ${quoteList(gatilhos)}; (b) cliente pedir explicitamente pra falar com humano; (c) conflito grave (cliente bravo, insulto, fora do escopo); (d) tamanho impossivel de obter mesmo apos fallback (R3c). Nunca por "caso complexo" — coleta da tattoo e SUA funcao.`);
  ```

  `new_string`:
  ```js
  linhas.push(`**R6.** Casos que voce NAO resolve nesta fase (gatilho do estudio: ${quoteList(gatilhos)}, cliente pede humano, cover-up, conflito grave): emita output com \`proxima_acao='erro'\` e \`resposta_cliente\` reconhecendo "Pra esse caso o tatuador avalia pessoalmente — ja sinalizei pra ele". NUNCA chame \`handoff_to_cadastro\` nesses casos.`);
  ```

- [ ] **Step 2: Substituir R6b em `regras.js:24`**

  `old_string`:
  ```js
  linhas.push('**R6b.** Ao DETECTAR gatilho, PARE IMEDIATAMENTE a coleta. Nao pergunte mais nada. Responda em 1 frase reconhecendo: "Pra esse caso o tatuador avalia pessoalmente — ja sinalizei pra ele" e chame `acionar_handoff`.');
  ```

  `new_string`:
  ```js
  linhas.push('**R6b.** Ao DETECTAR gatilho, PARE IMEDIATAMENTE. Resposta de 1 frase + `proxima_acao=\'erro\'`. NAO chame `handoff_to_cadastro`.');
  ```

- [ ] **Step 3: Substituir bloco R7 (linha 31, dentro de `if (aceitaCobertura)`)**

  `old_string`:
  ```js
      linhas.push('- Se cliente confirmar: chame `acionar_handoff(motivo="cover_up_detectado")` — cobertura sempre passa pelo tatuador, mesmo neste modo.');
  ```

  `new_string`:
  ```js
      linhas.push('- Se cliente confirmar: emita `proxima_acao=\'erro\'` + resposta "Pra cobertura o tatuador avalia pessoalmente — ja sinalizei pra ele". NAO chame `handoff_to_cadastro`.');
  ```

- [ ] **Step 4: Substituir T4 em `regras.js:51`**

  `old_string`:
  ```js
  linhas.push('**T4.** `acionar_handoff` — conforme R6/R7. Nunca por "caso complexo" — coleta da tattoo e SUA funcao.');
  ```

  `new_string`:
  ```js
  linhas.push('**T4.** `handoff_to_cadastro` — chame APENAS quando os 3 OBR (descricao_tattoo, tamanho_cm, local_corpo) estao completos E `campos_conflitantes=[]`. Use `proxima_acao=\'handoff\'` no output no mesmo turno.');
  ```

- [ ] **Step 5: Inserir R9 ANTES da linha em branco que precede §4b (após o bloco R8 atual em `regras.js:41-42`)**

  Localizar o final do bloco R8 (linha 41 termina com `linhas.push('- Tatuagens em segundo plano = ignore.');`) e inserir antes de `linhas.push('');` da linha 43 o seguinte bloco:

  `old_string`:
  ```js
  linhas.push('- Tatuagens em segundo plano = ignore.');

  linhas.push('');
  linhas.push('# §4b TOOLS — QUANDO INVOCAR (interno, invisivel ao cliente)');
  ```

  `new_string`:
  ```js
  linhas.push('- Tatuagens em segundo plano = ignore.');

  linhas.push('');
  linhas.push('**R9. CONFLITO DE DADOS:** quando cliente fornece valores contraditorios pro mesmo campo na MESMA mensagem (ex: "rosa pequena de 25cm" — pequena vs 25cm sao incompativeis), voce DEVE:');
  linhas.push('- (a) NAO chamar `dados_coletados` pra esse campo (nao persiste valor inferido);');
  linhas.push('- (b) popular `campos_conflitantes` no output com o nome do campo (ex: ["tamanho_cm"]);');
  linhas.push('- (c) usar `proxima_acao=\'pergunta\'`;');
  linhas.push('- (d) NUNCA chamar `handoff_to_cadastro` enquanto houver conflito.');
  linhas.push('Devolva a contradicao ao cliente em 1 frase e deixe ELE decidir. Ex: "tu disse pequena mas 25cm ja e tatuagem grande — me confirma se e 25cm mesmo ou tu quer algo bem menor (uns 5-8cm)?". JAMAIS escolha pelo cliente.');

  linhas.push('');
  linhas.push('# §4b TOOLS — QUANDO INVOCAR (interno, invisivel ao cliente)');
  ```

- [ ] **Step 6: Verificar — grep de `acionar_handoff` em regras.js**

  ```bash
  grep -n "acionar_handoff" functions/_lib/prompts/coleta/tattoo/regras.js
  ```

  Expected: ZERO matches. Se sobrar referência → corrigir antes de prosseguir.

- [ ] **Step 7: Verificar — grep de `R9` e `handoff_to_cadastro` em regras.js**

  ```bash
  grep -nE "R9|handoff_to_cadastro" functions/_lib/prompts/coleta/tattoo/regras.js
  ```

  Expected: pelo menos 1 match de `**R9.` (a nova regra) e 2 matches de `handoff_to_cadastro` (T4 + nas R6/R6b/R7).

#### Subtask 2.2: `fluxo.js` — Trocar §3.3c.3 e §3.5 + inserir §3.4b

- [ ] **Step 1: Substituir §3.3c.3 em `fluxo.js:53`**

  `old_string`:
  ```js
  linhas.push('3. Se mesmo assim nao souber: chame `acionar_handoff(motivo="cliente_sem_referencia_tamanho")`');
  ```

  `new_string`:
  ```js
  linhas.push('3. Se mesmo assim nao souber: emita `proxima_acao=\'erro\'` + resposta "Sem referencia de tamanho fica dificil orcar — o tatuador vai te ajudar com isso pessoalmente". NAO chame `handoff_to_cadastro`.');
  ```

- [ ] **Step 2: Inserir §3.4b ANTES do bloco §3.5 (entre `fluxo.js:64` e `:67`)**

  `old_string`:
  ```js
  linhas.push('Apos esta mensagem, PARE. Nao chame mais tools nesse turno. Aguarde resposta do cliente.');
  linhas.push('');

  // §3.5 Gatilhos imediatos de handoff
  linhas.push('## §3.5 Gatilhos imediatos (PARE a coleta e chame `acionar_handoff`)');
  ```

  `new_string`:
  ```js
  linhas.push('Apos esta mensagem, PARE. Nao chame mais tools nesse turno. Aguarde resposta do cliente.');
  linhas.push('');

  // §3.4b Sinal de fim da fase (handoff_to_cadastro + output handoff)
  linhas.push('## §3.4b SINAL DE FIM DA FASE (UNICA forma de terminar a fase tattoo)');
  linhas.push('Quando os 3 OBR (descricao_tattoo, tamanho_cm, local_corpo) estao completos E `campos_conflitantes=[]`:');
  linhas.push('1. Chame `handoff_to_cadastro({dados_completos: true, campos_conflitantes: []})` UMA vez.');
  linhas.push('2. Emita output JSON com `proxima_acao=\'handoff\'` + `dados_completos=true` + `resposta_cliente` contendo a mensagem-ponte de §3.4 (validacao substantiva + pedido de cadastro em texto corrido).');
  linhas.push('3. PARE. Nao chame `dados_coletados` de novo nesse turno.');
  linhas.push('Sem chamar `handoff_to_cadastro` + emitir output `handoff` no MESMO turno, voce continua na fase tattoo.');
  linhas.push('');

  // §3.5 Gatilhos imediatos (proxima_acao=erro)
  linhas.push('## §3.5 Gatilhos imediatos (PARE a coleta e emita `proxima_acao=\'erro\'`)');
  ```

- [ ] **Step 3: Substituir o intro do §3.5 em `fluxo.js:69`**

  `old_string`:
  ```js
  linhas.push('Se detectar QUALQUER um destes durante a coleta, PARE imediatamente e chame `acionar_handoff(motivo=<motivo>)` UMA vez:');
  ```

  `new_string`:
  ```js
  linhas.push('Se detectar QUALQUER um destes durante a coleta, PARE imediatamente, emita output com `proxima_acao=\'erro\'` + `resposta_cliente` apropriada. NAO chame `handoff_to_cadastro` nesses casos:');
  ```

- [ ] **Step 4: Limpar sufixos `→ \`<motivo>\`` da lista de gatilhos (`fluxo.js:70-77`)**

  Os 8 itens da lista têm sufixo `→ \`motivo_xpto\`` que era passado pra `acionar_handoff`. Sem essa tool, a etiqueta de motivo perde sentido — substituir cada item.

  Use `Edit` com `replace_all: false` em cada linha individualmente para evitar matches errados:

  | Antes | Depois |
  |-------|--------|
  | `'- Cover-up (cliente menciona "cobrir/tapar/disfarcar tattoo antiga" OU foto mostra pele tatuada no local pretendido) → \`cover_up_detectado\`'` | `'- Cover-up (cliente menciona "cobrir/tapar/disfarcar tattoo antiga" OU foto mostra pele tatuada no local pretendido)'` |
  | `'- Menor de idade (cliente diz idade <18 OU peca em local sensivel pra menor) → \`menor_idade\`'` | `'- Menor de idade (cliente diz idade <18 OU peca em local sensivel pra menor)'` |
  | `'- Area restrita (rosto, pescoco, maos, dedos, genital, intimas) → \`area_restrita\`'` | `'- Area restrita (rosto, pescoco, maos, dedos, genital, intimas)'` |
  | `'- Retoque de tattoo antiga → \`retoque\`'` | `'- Retoque de tattoo antiga'` |
  | `'- Cliente agressivo / insultos → \`cliente_agressivo\`'` | `'- Cliente agressivo / insultos'` |
  | `'- Idioma diferente do portugues → \`idioma_nao_suportado\`'` | `'- Idioma diferente do portugues'` |
  | `'- Fora do escopo (procedimento medico, piercing, etc) → \`fora_escopo\`'` | `'- Fora do escopo (procedimento medico, piercing, etc)'` |
  | `'- Cliente evasivo (3 vezes sem responder OBR mesmo reformulando) → \`cliente_evasivo_infos_incompletas\`'` | `'- Cliente evasivo (3 vezes sem responder OBR mesmo reformulando)'` |

- [ ] **Step 5: Verificar — grep de `acionar_handoff` em fluxo.js**

  ```bash
  grep -n "acionar_handoff" functions/_lib/prompts/coleta/tattoo/fluxo.js
  ```

  Expected: ZERO matches. (As 2 originais — §3.3c.3 e §3.5 — foram substituídas.)

#### Subtask 2.3: `few-shot.js` — Adicionar Exemplo 6 e Exemplo 7

- [ ] **Step 1: Inserir Exemplo 6 e 7 ANTES do `return linhas.join('\n');`**

  Localizar `few-shot.js:79` (linha após `linhas.push('```');` do Exemplo 5).

  `old_string`:
  ```js
    linhas.push('```');

    return linhas.join('\n');
  ```

  `new_string`:
  ```js
    linhas.push('```');
    linhas.push('');

    // Exemplo 6: conflito de dados (R9)
    linhas.push('## Exemplo 6 — Conflito de dados (R9)');
    linhas.push('```');
    linhas.push('CLIENTE: queria uma rosa pequena de 25cm no antebraco');
    linhas.push('AGENTE: Tu disse pequena mas 25cm ja e tatuagem bem grande — me confirma se e 25cm mesmo ou tu quer algo bem menor (uns 5-8cm)?');
    linhas.push('```');
    linhas.push('');

    // Exemplo 7: cliente da tudo de uma vez (one-shot ate handoff)
    linhas.push('## Exemplo 7 — Cliente da tudo de uma vez (one-shot ate handoff)');
    linhas.push('```');
    linhas.push('CLIENTE: fineline rosa 7cm pulso direito, podes ja agendar');
    linhas.push('AGENTE: Rosa fineline de 7cm no pulso fica delicada e bem visivel — combinacao top');
    linhas.push('');
    linhas.push('AGENTE: Sobre agendar, o tatuador confirma quando avaliar tua ideia — ja te passo pra ele. Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
    linhas.push('```');

    return linhas.join('\n');
  ```

- [ ] **Step 2: Verificar — grep dos novos exemplos**

  ```bash
  grep -nE "Exemplo 6|Exemplo 7" functions/_lib/prompts/coleta/tattoo/few-shot.js
  ```

  Expected: 2 matches (1 cada).

#### Subtask 2.4: `tattoo.js` — Reescrever conteúdo do REFORCO_HANDOFF

- [ ] **Step 1: Substituir bloco `REFORCO_HANDOFF` em `tattoo.js:16-22`**

  `old_string`:
  ```js
  export const REFORCO_HANDOFF = `

  # §HANDOFF — INVARIANTE CRITICO
  JAMAIS chame \`handoff_to_cadastro\` quando \`dados_completos=false\` ou quando houver \`campos_conflitantes\` nao-vazio. Resolva conflitos primeiro (R9: devolva contradicao ao cliente, NUNCA decida por ele).

  # §OUTPUT FINAL — OBRIGATORIO
  APOS chamar tools relevantes neste turn (ou se nao precisa de tool), voce DEVE produzir o output estruturado final no formato JSON definido. NAO continue chamando dados_coletados em loop — uma chamada por campo coletado e suficiente. Se ja chamou dados_coletados pra todos os campos detectados na mensagem do cliente, PARE e entregue o output final com resposta_cliente + proxima_acao + campos_faltando + dados_persistidos.`;
  ```

  `new_string`:
  ```js
  export const REFORCO_HANDOFF = `

  # §HANDOFF — INVARIANTE
  NUNCA chame \`handoff_to_cadastro\` se: (a) qualquer dos 3 OBR (descricao_tattoo, tamanho_cm, local_corpo) esta faltando, OU (b) \`campos_conflitantes\` nao-vazio. Resolva conflitos primeiro (R9).

  # §OUTPUT FINAL — UMA VEZ POR TURNO
  Apos chamar tools necessarias, emita o output JSON estruturado UMA vez e PARE. NAO chame \`dados_coletados\` mais de uma vez pro mesmo campo no mesmo turno. NAO continue em loop apos emitir output.`;
  ```

- [ ] **Step 2: Verificar sintaxe e imports**

  ```bash
  node --check functions/api/agent/agents/tattoo.js
  node --check functions/_lib/prompts/coleta/tattoo/regras.js
  node --check functions/_lib/prompts/coleta/tattoo/fluxo.js
  node --check functions/_lib/prompts/coleta/tattoo/few-shot.js
  node --check tests/agent/tattoo-agent.eval.mjs
  ```

  Expected: todos exit 0 sem output. Se algum falhar com unterminated string / unexpected token: revisar escapes de backtick e aspas simples nos novos blocos antes de continuar.

#### Subtask 2.5: Commit batch único

- [ ] **Step 1: Commit**

  ```bash
  git add functions/_lib/prompts/coleta/tattoo/regras.js \
          functions/_lib/prompts/coleta/tattoo/fluxo.js \
          functions/_lib/prompts/coleta/tattoo/few-shot.js \
          functions/api/agent/agents/tattoo.js
  git commit -m "feat(coleta-multi-agent-sub2): prompt tuning H2/H3 — R9 conflito + handoff disciplina

  - regras.js: R9 (conflito de dados) + R6/R6b/R7/T4 trocam acionar_handoff
    por proxima_acao='erro'
  - fluxo.js: §3.4b explicita handoff_to_cadastro + output handoff no mesmo
    turno; §3.3c.3 e §3.5 trocam acionar_handoff por proxima_acao='erro'
  - few-shot.js: Ex 6 (conflito/R9) + Ex 7 (one-shot ate handoff)
  - tattoo.js: REFORCO_HANDOFF foco em uma chamada por campo + emit-and-stop

  Atinge gate quando rodado contra eval suite (Task 3+)."
  ```

---

### Task 3: Iteração 1 — Run eval suite + gate check

**Files:**
- Read-only: `tests/agent/_fixtures/scenarios.json`
- Output (manual): registrar resultados em commit message + (no fim) `docs/auditoria/2026-05-07-sub1-eval-results.md`

- [ ] **Step 1: Rodar suite completa**

  ```bash
  OPENAI_API_KEY=$(cat ~/.config/inkflow/openai-key 2>/dev/null || echo "$OPENAI_API_KEY") \
    node --test tests/agent/tattoo-agent.eval.mjs 2>&1 | tee /tmp/eval-iter1.log
  ```

  (Se a key não estiver no path acima, exporte antes: `export OPENAI_API_KEY=sk-...`.)

  Expected (sucesso): cada cenário imprime `# PASS` ou `# FAIL`. Custo ~$0.02-0.40 dependendo de retries.

- [ ] **Step 2: Tabular resultado**

  Extrair contagem com:
  ```bash
  grep -c "^# PASS" /tmp/eval-iter1.log || true
  grep -c "^not ok" /tmp/eval-iter1.log || true
  grep -E "^(ok|not ok) [0-9]+" /tmp/eval-iter1.log
  ```

  Anotar:
  - Total: N/9
  - TC-01..TC-09: PASS / FAIL individual
  - TC-05 (H2 obrigatório): _resultado_
  - TC-09 (H3 obrigatório): _resultado_
  - TC-07 (não regredir): _resultado_
  - TC-08 (não regredir): _resultado_

- [ ] **Step 3: Avaliar gate**

  Gate = (Total ≥ 7/9) AND (TC-05 PASS) AND (TC-09 PASS) AND (TC-07 PASS) AND (TC-08 PASS).

  - Se **gate atingido** → ir para Task 7 (cross-validation), pulando Tasks 4/5/6.
  - Se **regressão em TC-07 ou TC-08** (estavam PASS no Sub-1, agora FAIL) → STOP. `git revert HEAD` no commit do prompt edit (Task 2), reabrir spec, investigar regressão antes de prosseguir.
  - Se **gate não atingido sem regressão crítica** → ir para Task 4 (iter 2).

- [ ] **Step 4: Commit do resultado iter 1**

  ```bash
  git commit --allow-empty -m "test(coleta-multi-agent-sub2): iter1 eval — N/9 PASS

  TC-01: PASS|FAIL
  TC-02: PASS|FAIL
  TC-03: PASS|FAIL
  TC-04: PASS|FAIL
  TC-05: PASS|FAIL  (H2 obrigatorio)
  TC-06: PASS|FAIL
  TC-07: PASS|FAIL  (sem regressao schema)
  TC-08: PASS|FAIL  (sem regressao whitelist)
  TC-09: PASS|FAIL  (H3 obrigatorio)

  Gate atingido: SIM|NAO
  Custo aprox: \$0.XX"
  ```

  (Substituir N e os PASS|FAIL pelos valores reais. Commit `--allow-empty` porque a iteração não muda código — apenas registra resultado.)

---

### Task 4: Iteração 2 — Refinar prompt (CONDICIONAL)

**Pular esta task se Task 3 atingiu o gate.**

Foco: ajustar few-shots e/ou texto baseado nos cenários que falharam. Spec: "Ajustar few-shots ou texto baseado nos cenários que falharam."

**Decisão de tuning (priorizar nesta ordem):**

1. Se TC-05 falhou (R9 não disparou): reforçar Exemplo 6 (variar a frase do agente, deixar o "deixa ELE decidir" mais explícito) ou inverter ordem dos exemplos pra Ex 6 vir antes do Ex 1.
2. Se TC-09 falhou (handoff não disparou one-shot): reforçar §3.4b (deixar a triple call → output mais saliente) ou Exemplo 7.
3. Se TC-01/02/04/06 falharam por max-turns: reforçar §OUTPUT FINAL no `REFORCO_HANDOFF` (frase "PARE apos emit" mais firme).
4. Se TC-03 falhou (campos_faltando errados): adicionar uma linha em §3.2 explicitando que `campos_faltando` lista os 3 OBR da fase tattoo (NÃO cadastro).
5. Se TC-07 ou TC-08 falharam: STOP — regressão. Veja Step 3 do Task 3.

- [ ] **Step 1: Identificar TCs falhados em /tmp/eval-iter1.log**

  ```bash
  grep -E "^not ok|FAIL.*TC-" /tmp/eval-iter1.log
  ```

- [ ] **Step 2: Aplicar UMA mudança cirúrgica**

  Não mexer em mais de um arquivo por iteração. Se múltiplos TCs falharam, atacar o de maior prioridade (lista acima). A regra empírica: "menor mudança que pode resolver o TC mais crítico".

  Use `Edit` com `old_string`/`new_string` precisos. Documente a mudança no próximo commit message.

- [ ] **Step 3: `node --check` em todos os arquivos modificados**

  ```bash
  node --check functions/_lib/prompts/coleta/tattoo/regras.js
  node --check functions/_lib/prompts/coleta/tattoo/fluxo.js
  node --check functions/_lib/prompts/coleta/tattoo/few-shot.js
  node --check functions/api/agent/agents/tattoo.js
  ```

- [ ] **Step 4: Re-rodar eval suite completa**

  ```bash
  OPENAI_API_KEY=$OPENAI_API_KEY \
    node --test tests/agent/tattoo-agent.eval.mjs 2>&1 | tee /tmp/eval-iter2.log
  grep -E "^(ok|not ok) [0-9]+" /tmp/eval-iter2.log
  ```

- [ ] **Step 5: Avaliar gate (mesma lógica do Task 3 Step 3)**

  - Gate atingido → Task 7
  - Regressão TC-07/TC-08 → STOP, `git revert HEAD` (apenas o commit deste passo)
  - Continua sem gate → Task 5

- [ ] **Step 6: Commit**

  ```bash
  git add <arquivo(s) modificado(s)>
  git commit -m "test(coleta-multi-agent-sub2): iter2 eval — N/9 PASS

  Mudanca: <1 linha descrevendo o ajuste>
  TC-XX: FAIL→PASS (ou descricao do shift)
  Custo cumulativo: \$0.XX"
  ```

---

### Task 5: Iteração 3 — Refinar prompt (CONDICIONAL)

**Pular se Task 3 ou Task 4 atingiu o gate.**

Mesmo procedimento da Task 4 — UMA mudança cirúrgica, eval, gate check, commit. Spec: "Refinamento fino (ordem dos blocos, tom de R9) se 1-2 cenários ainda falham."

- [ ] **Step 1: Analisar diff entre /tmp/eval-iter1.log e /tmp/eval-iter2.log**

  ```bash
  diff <(grep -E "^(ok|not ok) [0-9]+" /tmp/eval-iter1.log) \
       <(grep -E "^(ok|not ok) [0-9]+" /tmp/eval-iter2.log)
  ```

  Identificar: que cenário virou? que ainda falha? Há padrão (ex: todos os FAILs envolvem multi-info)?

- [ ] **Step 2: Aplicar UMA mudança cirúrgica diferente da iter 2**

  Se a mudança da iter 2 não converteu nenhum cenário extra, ela pode ter sido na direção errada — considerar revertê-la antes de tentar outra. (Não acumular ruído.)

- [ ] **Step 3: `node --check` + Re-rodar suite + tabular**

  ```bash
  for f in functions/_lib/prompts/coleta/tattoo/{regras,fluxo,few-shot}.js functions/api/agent/agents/tattoo.js; do
    node --check "$f" || { echo "syntax error in $f"; exit 1; }
  done
  OPENAI_API_KEY=$OPENAI_API_KEY \
    node --test tests/agent/tattoo-agent.eval.mjs 2>&1 | tee /tmp/eval-iter3.log
  grep -E "^(ok|not ok) [0-9]+" /tmp/eval-iter3.log
  ```

- [ ] **Step 4: Avaliar gate (mesma lógica)**

  - Gate atingido → Task 7
  - Regressão crítica → STOP + revert
  - Continua sem gate → Task 6

- [ ] **Step 5: Commit**

  ```bash
  git add <arquivo(s) modificado(s)>
  git commit -m "test(coleta-multi-agent-sub2): iter3 eval — N/9 PASS

  Mudanca: <1 linha>
  Custo cumulativo: \$0.XX"
  ```

---

### Task 6: Iterações 4-5 (RESERVA, CONDICIONAL)

**Pular se gate atingido nas tasks 3/4/5.**

**Critério de pausa (não é sobre custo, é sobre hipótese):** iter 1-3 são cirúrgicas — cada uma tem hipótese clara herdada do spec (R9 elimina TC-05; §3.4b + Ex 7 destrava TC-09; REFORCO_HANDOFF "emit-and-stop" reduz max-turns). Se 3 iters dirigidas não convergiram, o problema **mudou de natureza** — provavelmente não é mais wording. Continuar tuneando sem hipótese vira gambiarra autônoma.

- [ ] **Step 1: Pausa estratégica — apresentar diagnóstico ao Leandro**

  Após iter 3 sem gate, NÃO seguir direto pra iter 4. Apresentar:

  > "Iter 1-3 esgotadas. Estado:
  >   - Originais: N/9 PASS (gap em TC-XX, TC-YY).
  >   - TC-10 (multi-turn): _se já adicionado, status_.
  >   - Quais mudanças cirúrgicas restam (se alguma).
  >
  > Próxima decisão técnica:
  > (a) Iter 4-5 com mudança específica que ainda não testei (qual? hipótese?);
  > (b) Escalar pra Abordagem B — reescrita do prompt v2 do zero ($0.40+ por iter);
  > (c) Subir pra `gpt-4o` — mantém prompt atual, paga premium de modelo, vê se é incapacidade do mini ($1+ por eval);
  > (d) Aceitar gap atual, documentar limitação, prosseguir Sub-3 com cobertura parcial.
  >
  > Recomendo: (escolha do agente baseada no padrão de falhas)."

  Aguardar decisão antes de gastar mais qualquer iteração.

- [ ] **Step 2 (se decisão = a): rodar iter 4 igual Task 5**

  Aplicar UMA mudança específica acordada, eval, commit (`iter4 eval — N/9 + TC-10`).

- [ ] **Step 3: avaliar — gate atingido → Task 7. Caso contrário → Step 4.**

- [ ] **Step 4 (se sem gate após iter 4): rodar iter 5 igual Task 5**

  Aplicar UMA última mudança, eval, commit.

- [ ] **Step 5: STOP CONDITION OBRIGATÓRIO**

  Após iter 5, INDEPENDENTE do resultado, ir para Task 7 (rerun com TC-10 incluso) e Task 8 (documentar status final — gate ou gap).

---

### Task 7: Adicionar TC-10 (multi-turn handoff) ao eval suite

**Files:**
- Modify (append-only): `tests/agent/_fixtures/scenarios.json`

**Justificativa:** spec pediu cross-val "com histórico simulado (2 turnos prévios)". O eval suite **já suporta** esse formato — `tattoo-agent.eval.mjs:101-103` faz `[...scenario.input.historico, ...scenario.input.mensagens]`, e TC-01..TC-09 já têm `historico: []` no schema. Adicionar TC-10 com `historico` populado é usar capacidade existente, não construir paralelo.

Não viola "não modificar scenarios.json" — adicionar um cenário é expandir cobertura, não manipular oráculos. A regra de não-batota se aplica a alterar TC-01..TC-09 pra fazer passar; isso fica intocado.

Vantagem vs script ad-hoc em `/tmp/`: TC-10 protege regressões em todo refactor futuro (Sub-3, Sub-4, qualquer ajuste de prompt). Custo marginal: ~$0.005 por run (10 cenários vs 9). Trade-off claramente positivo.

- [ ] **Step 1: Append TC-10 em `scenarios.json`**

  Localizar o final do array (após bloco de TC-09, antes de `]\n}`). Inserir vírgula no fechamento do `}` de TC-09 e adicionar:

  `old_string` (final do arquivo):
  ```json
        "tools_chamadas": ["dados_coletados", "handoff_to_cadastro"]
        }
      }
    ]
  }
  ```

  `new_string`:
  ```json
        "tools_chamadas": ["dados_coletados", "handoff_to_cadastro"]
        }
      },
      {
        "id": "TC-10",
        "descricao": "Multi-turn handoff: cliente fecha 3 OBR no 3o turno apos 2 turnos previos",
        "hipoteses": ["H3"],
        "input": {
          "tenant_id": "00000000-0000-0000-0000-000000000001",
          "telefone": "+5511900000010",
          "mensagens": [
            { "role": "user", "content": "fineline rosa 7cm pulso direito, podes ja agendar" }
          ],
          "estado_atual": "tattoo",
          "dados_acumulados": {},
          "historico": [
            { "role": "user", "content": "oi quero fazer uma tattoo" },
            { "role": "assistant", "content": "Oii, tudo bem? Aqui e atendente do Estudio Eval\n\nMe conta o que esta pensando em fazer?" }
          ]
        },
        "expected": {
          "proxima_acao": "handoff",
          "dados_completos": true,
          "tools_chamadas": ["dados_coletados", "handoff_to_cadastro"]
        }
      }
    ]
  }
  ```

  **Atenção:** vírgula após `}` que fecha TC-09 é nova. Sem ela, JSON quebra.

- [ ] **Step 2: Validar JSON**

  ```bash
  node -e "JSON.parse(require('fs').readFileSync('tests/agent/_fixtures/scenarios.json', 'utf8'))" && echo "JSON OK"
  node -e "const {scenarios}=JSON.parse(require('fs').readFileSync('tests/agent/_fixtures/scenarios.json','utf8')); console.log('Total:', scenarios.length); console.log('IDs:', scenarios.map(s=>s.id).join(', '))"
  ```

  Expected: `JSON OK`, `Total: 10`, `IDs: TC-01, ..., TC-10`. Se quebrou: vírgula errada ou aspas escapadas — corrigir antes de rodar eval.

- [ ] **Step 3: Rodar suite completa (com TC-10)**

  ```bash
  OPENAI_API_KEY=$OPENAI_API_KEY \
    node --test tests/agent/tattoo-agent.eval.mjs 2>&1 | tee /tmp/eval-final.log
  grep -E "^(ok|not ok) [0-9]+" /tmp/eval-final.log
  ```

  Expected: 10 cenários executados. TC-10 esperado PASS — agente chama `dados_coletados` 3x (descricao, tamanho, local) + `handoff_to_cadastro` + emite output `proxima_acao='handoff'` mesmo com 2 turnos prévios no histórico.

- [ ] **Step 4: Análise — TC-10 PASS é gate adicional**

  Resultado do score:
  - **Originais TC-01..TC-09:** N/9 (gate principal — ≥7/9 + TC-05/07/08/09 PASS)
  - **TC-10 (multi-turn):** PASS/FAIL (gate adicional — obrigatório PASS pra fechar Sub-2)

  Se TC-10 FAIL mas originais ≥7/9: **gap documentado** — agent fecha handoff em one-shot mas não em multi-turn. Sub-2 técnico-aprovado mas com limitação para Sub-3 considerar.

  Se TC-10 PASS e originais ≥7/9: **gate completo atingido**. Sub-3 unblocked sem caveats.

- [ ] **Step 5: Commit**

  ```bash
  git add tests/agent/_fixtures/scenarios.json
  git commit -m "test(coleta-multi-agent-sub2): add TC-10 multi-turn handoff cross-val

  Validacao spec: TC-09 (one-shot) + TC-10 (multi-turn, 2 turnos previos)
  cobrem o caso real de producao. Originais N/9, TC-10 PASS|FAIL.

  Eval suite ja suportava 'historico' no schema — adicionar TC-10
  expande cobertura sem alterar oraculos TC-01..TC-09."
  ```

---

### Task 8: Atualizar auditoria + outcome do spec + Sub-2 unblock

**Files:**
- Modify: `docs/auditoria/2026-05-07-sub1-eval-results.md` (apêndice com run final)
- Modify: `docs/superpowers/specs/2026-05-07-coleta-multi-agent-prompt-tuning-h2-h3-design.md` (preencher seção `## Outcome`)

- [ ] **Step 1: Atualizar `docs/auditoria/2026-05-07-sub1-eval-results.md`**

  Append no fim do arquivo:

  ```markdown

  ---

  ## Apêndice — Run pós Sub-2 (prompt tuning H2/H3)

  **Data:** 2026-05-07
  **Spec:** `docs/superpowers/specs/2026-05-07-coleta-multi-agent-prompt-tuning-h2-h3-design.md`
  **Iterações:** N

  | TC | Sub-1 baseline | Sub-2 final |
  |----|----------------|-------------|
  | TC-01 | FAIL (max-turns) | PASS\|FAIL |
  | TC-02 | FAIL (max-turns) | PASS\|FAIL |
  | TC-03 | FAIL (campos errados) | PASS\|FAIL |
  | TC-04 | FAIL (max-turns) | PASS\|FAIL |
  | TC-05 | FAIL (handoff indevido) | PASS\|FAIL |
  | TC-06 | FAIL (max-turns) | PASS\|FAIL |
  | TC-07 | PASS | PASS\|FAIL |
  | TC-08 | PASS | PASS\|FAIL |
  | TC-09 | FAIL (handoff não disparou) | PASS\|FAIL |
  | TC-10 (novo, multi-turn) | — | PASS\|FAIL |

  **Originais (TC-01..TC-09):** 2/9 → N/9
  **TC-10 (multi-turn):** PASS\|FAIL
  **Custo cumulativo Sub-2:** $X.XX
  **Gate principal (≥7/9 + TC-05/07/08/09 PASS):** ATINGIDO\|NÃO
  **Gate adicional (TC-10 PASS):** ATINGIDO\|NÃO
  **Sub-2 unblock Sub-3 (cutover n8n):** SIM\|GAP-DOCUMENTADO\|NÃO
  ```

  (Substituir os placeholders pelos resultados reais do último run.)

- [ ] **Step 2: Preencher seção `## Outcome` no spec**

  Editar `docs/superpowers/specs/2026-05-07-coleta-multi-agent-prompt-tuning-h2-h3-design.md`:

  Substituir o bloco que começa com `## Outcome (preencher pós-implementação)` pelo conteúdo final:

  ```markdown
  ## Outcome

  **Status:** done | gap-documentado | aborted

  **Resultado por cenário:**
  - TC-01: PASS|FAIL
  - TC-02: PASS|FAIL
  - TC-03: PASS|FAIL
  - TC-04: PASS|FAIL
  - TC-05: PASS|FAIL
  - TC-06: PASS|FAIL
  - TC-07: PASS|FAIL
  - TC-08: PASS|FAIL
  - TC-09: PASS|FAIL
  - TC-10 (multi-turn, novo): PASS|FAIL

  **Originais TC-01..TC-09:** N/9
  **TC-10 (multi-turn):** PASS|FAIL
  **Custo total:** $X.XX
  **Iterações:** N
  **Sub-2 unblocked?** SIM|GAP-DOCUMENTADO|NÃO

  **Lições:**
  - <2-3 bullets sobre o que funcionou e o que ficou de fora>
  ```

- [ ] **Step 3: Atualizar campo `Status` no header do spec**

  Substituir:
  ```
  **Status:** `ready-to-plan`
  ```

  Por (caso atingido):
  ```
  **Status:** `done`
  ```

  Ou (caso gap aceito):
  ```
  **Status:** `gap-documentado`
  ```

- [ ] **Step 4: Commit final**

  ```bash
  git add docs/auditoria/2026-05-07-sub1-eval-results.md \
          docs/superpowers/specs/2026-05-07-coleta-multi-agent-prompt-tuning-h2-h3-design.md
  git commit -m "docs(coleta-multi-agent-sub2): eval results + Sub-2 unblocked

  Originais: N/9 PASS apos M iteracoes (\$X.XX cumulativo).
  TC-10 (multi-turn): PASS|FAIL.
  Gate principal: SIM|NAO. Gate adicional (TC-10): SIM|NAO.
  Sub-3 (cutover n8n) unblock: SIM|GAP-DOCUMENTADO|NAO."
  ```

- [ ] **Step 5 (opcional): push**

  ```bash
  git push origin feat/coleta-multi-agent-handoff
  ```

  (Se Leandro quiser PR, abrir manualmente — não é parte deste plano.)

---

## Self-Review (resumo do checklist)

**Spec coverage:**
- ✅ Refactor REFORCO_HANDOFF (spec "Eliminação de duplicação no eval") → Task 1
- ✅ Substituições R6/R6b/R7/T4 + R9 (regras.js) → Task 2.1
- ✅ §3.3c.3 + §3.4b + §3.5 (fluxo.js) → Task 2.2
- ✅ Exemplo 6 + 7 (few-shot.js) → Task 2.3
- ✅ Novo REFORCO_HANDOFF (tattoo.js) → Task 2.4
- ✅ Plano de iteração até 5 iters → Tasks 3-6
- ✅ Cross-validation com histórico → Task 7 (como TC-10 permanente em scenarios.json, não script ad-hoc — usa capacidade já existente do eval suite e protege regressões futuras)
- ✅ Update auditoria + Outcome spec → Task 8
- ✅ Stop conditions explícitas (gate / regressão / pausa estratégica após iter 3) → Tasks 3, 4, 5, 6

**Sem placeholders:** todos os `old_string`/`new_string` têm conteúdo concreto. Onde digo "anotar resultado", o template do commit message está pronto pra preencher.

**Type consistency:** `REFORCO_HANDOFF` exportado em `tattoo.js` é importado em `eval.mjs` com mesmo nome. Schema `TattooOutputSchema` intocado. Tools `dados_coletados` / `handoff_to_cadastro` têm os mesmos parâmetros em prod, eval e cross-val script.

**Tamanho:** 8 tasks (Tasks 4/5/6 são condicionais). <15 ✓.

**Checkpoints testáveis:** Task 1 (smoke compile), Task 2.4 (`node --check` 5 arquivos), Tasks 3-6 (eval N/9), Task 7 (cross-val PASS/FAIL), Task 8 (docs). Cada um termina em commit.

**Riscos sinalizados:** custo OpenAI ($2 cap), regressão TC-07/TC-08 (rollback granular por commit), acoplamento eval↔prod (intencional, validado pelo spec).
