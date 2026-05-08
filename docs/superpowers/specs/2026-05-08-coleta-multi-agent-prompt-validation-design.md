# Coleta Multi-Agent — Prompt Validation Session (design)

**Data:** 2026-05-08
**Branch base:** `feat/coleta-multi-agent-handoff` @ `d4662ce`
**Status:** `ready-to-execute`
**Predecessor:** [2026-05-07-coleta-multi-agent-prompt-tuning-h2-h3-design.md](./2026-05-07-coleta-multi-agent-prompt-tuning-h2-h3-design.md) — `done`, 9/10 PASS
**Eval baseline atual:** `/tmp/eval-iter3.log` — 9/10 PASS, TC-03 FAIL (max-turns)

---

## Como começar a sessão nova

Numa sessão fresca, abra o repo no diretório `inkflow-saas` e use o prompt abaixo:

```
/superpowers:using-superpowers

Vou rodar a sessão de validação do prompt do coleta multi-agent
seguindo o spec docs/superpowers/specs/2026-05-08-coleta-multi-agent-prompt-validation-design.md.

Start na Fase 0 (preparação). Trabalhe sequencialmente até a Fase 10.
Pause após cada Fase 1-9 com resumo de findings antes de seguir pra próxima.
Output final: spec do prompt v2 + plan + decisão go/no-go pra Sub-3.
```

---

## TL;DR

Sub-2 (prompt tuning H2/H3) fechou gate (9/10 PASS) mas TC-03 expôs **branch de decisão estrutural faltando** no prompt: estado "OBR parcial, sem trigger, sem conflito" não tem instrução explícita pra `proxima_acao='pergunta'`. 3 iters de tuning (rule line + few-shot contrastivo) movearam TC-03 de wrong-decision → indecision-loop sem resolver. Diagnóstico: bug é estrutural, não lexical. Continuar martelando wording é debugging por sintoma.

Esta sessão **audita o sistema multi-agent como SaaS profissional** (modelo, prompt, schema, tools, orquestração, eval coverage), identifica gaps estruturais, e produz **spec do prompt v2 + decisão go/no-go pra Sub-3 (cutover n8n)**.

NÃO escrever código nesta sessão. Output é análise + spec + plano. Implementação fica pra sessão dedicada posterior.

---

## Contexto e motivação

Estado pós-Sub-2 (3 iters de tuning):

| Iter | Mudança | TC-03 | Outros |
|------|---------|-------|--------|
| 1 (após prompt edits H2/H3) | feat batch | FAIL: handoff prematuro (~9s) | 8/9 originais + TC-10 PASS |
| 2 | rule line em §3.2 sobre `tamanho_cm` numérico | FAIL: handoff prematuro (~9s) — **rule sem efeito** | sem regressão |
| 3 | Exemplo 8 contrastivo em few-shot.js | FAIL: max-turns 20 (~43s) — **comportamento mudou** | sem regressão |

O shift iter 3 prova: o prompt é **não-monotônico** (adicionar bom conteúdo regride outros sinais), e o agent não tem instrução explícita pra "OBR parcial → pergunta próximo". Quando intuição via few-shots falha (input ambíguo), agent cai em loop interno tentando resolver entre §3.4b ("handoff é a saída") e §3.5 ("erro nos triggers") — sem terceira opção definida.

**Sub-3 é cutover n8n → produção.** Hotfix de prompt em produção custa: cliente real impactado + Marcelo escalando + sem feature flag pra rollback rápido. Custo de validar agora vs em produção é assimétrico — fazer agora.

---

## Escopo

### In-scope (10 fases de audit)

- Fase 1: comparação de modelos (gpt-4o-mini vs gpt-4o vs claude-haiku-4.5)
- Fase 2: arquitetura do prompt (4 camadas: regras + fluxo + few-shot + REFORCO_HANDOFF)
- Fase 3: matriz de cobertura de decisão (12 estados possíveis × ação esperada × onde no prompt)
- Fase 4: tools + schema (validation cross-field, fail-fast)
- Fase 5: lógica de orquestração (route.js, router.js, sdk-init.js, normalizeHistoryItem, maxTurns)
- Fase 6: few-shot coverage (8 exemplos × padrões da matriz)
- Fase 7: eval suite coverage (10 cenários × classes de input)
- Fase 8: production samples comparison (n8n logs reais, opcional)
- Fase 9: síntese + priorização
- Fase 10: spec prompt v2 + plano de implementação

### Out-of-scope

- Implementar prompt v2 (próxima sessão dedicada)
- Reescrever testes ou eval runner (próxima sessão)
- Cutover n8n (Sub-3, depende da decisão go/no-go desta sessão)
- Tocar prompts de Cadastro/Proposta (foco é fase tattoo)
- Mexer em arquitetura de routes além de inspeção
- Implementar tracing/observability (anota como gap se identificar)

---

## Constraints

- Tempo estimado: 2-4 horas focadas
- Custo OpenAI: ~$0.30 (apenas se Fase 1 rodar comparativo de 3 modelos × 1 cenário). Cap $1
- Branch: criar `audit/coleta-multi-agent-prompt-v2` a partir de `feat/coleta-multi-agent-handoff`. Toda escrita de docs commitada nessa branch
- Não modificar código de produção. Só ler + analisar + documentar
- Não rodar eval suite completo nesta sessão (custo desnecessário; a iter 3 já é baseline). Só rodar TC-03 isolado se Fase 1 exigir comparativo de modelo

---

## Inputs (artefatos a inspecionar)

### Files atuais (HEAD = `d4662ce`)

| Path | Camada |
|------|--------|
| `functions/api/agent/agents/tattoo.js` | Agent definition + REFORCO_HANDOFF + TattooOutputSchema |
| `functions/api/agent/route.js` | Entry point HTTP |
| `functions/api/agent/router.js` | Routing entre fases |
| `functions/api/agent/sdk-init.js` | SDK setup + retry config |
| `functions/_lib/prompts/coleta/tattoo/regras.js` | System rules (R1..R9 + T1..T4) |
| `functions/_lib/prompts/coleta/tattoo/fluxo.js` | Flow sequencing (§3.1..§3.5) |
| `functions/_lib/prompts/coleta/tattoo/few-shot.js` | 8 exemplos |
| `tests/agent/_fixtures/scenarios.json` | 10 cenários eval |
| `tests/agent/tattoo-agent.eval.mjs` | Eval runner |

### Logs de eval

- `/tmp/eval-iter1.log` — Sub-2 iter 1 (8/9, TC-03 FAIL handoff prematuro)
- `/tmp/eval-iter2.log` — iter 2 (9/10, TC-03 FAIL handoff prematuro)
- `/tmp/eval-iter3.log` — iter 3 (9/10, TC-03 FAIL max-turns 20) — **baseline atual**
- `/tmp/eval-final.log` — eval com TC-10 inicial (9/10)

### Externos (opcional)

- Logs n8n produção (Marcelo's tenant) — só se Fase 8 for executada
- OpenAI usage dashboard — token counts/latência da última semana

---

## Audit Phases

### Fase 0 — Preparação (10 min)

- [ ] Criar branch `audit/coleta-multi-agent-prompt-v2` a partir de `feat/coleta-multi-agent-handoff`
- [ ] Criar pasta `docs/superpowers/audit/` se não existir
- [ ] Confirmar `OPENAI_API_KEY` no env (necessário só se Fase 1 rodar)
- [ ] Confirmar TC-03 ainda FAIL no eval atual (sanity check sem rodar — só ler `/tmp/eval-iter3.log`)
- [ ] Abrir o spec atual (este arquivo) num split pra referência durante a sessão

### Fase 1 — Modelo (15-30 min, custo ~$0.30 se executar)

**Pergunta central:** gpt-4o-mini é o modelo certo, ou TC-03 max-turns é signal de incapacidade do modelo de raciocinar "OBR parcial → ask next"?

**Tarefas:**
1. Criar script ad-hoc (`/tmp/tc03-model-compare.mjs`) que roda APENAS TC-03 com 3 modelos: `gpt-4o-mini` (atual), `gpt-4o` (~25x mais caro), `claude-haiku-4-5` (Anthropic SDK separado, similar tier ao mini). Mesmo prompt, mesmo input.
2. Comparar: PASS/FAIL, latência, custo estimado por interação.
3. Calcular custo mensal pra cada modelo assumindo 100 conversas/mês × 5 turns × ~3k tokens/turn:
   - `gpt-4o-mini`: ~$0.X/mês
   - `gpt-4o`: ~$X/mês
   - `claude-haiku-4.5`: ~$X/mês

**Decisão:** modelo continua mini OU upgrade pra X com justificativa custo/qualidade. Se mini consegue passar TC-03 com prompt v2 melhor, decisão é "manter mini, melhorar prompt". Se nem gpt-4o passa TC-03 com prompt atual, é problema estrutural confirmado.

**Output:** `docs/superpowers/audit/2026-05-08-fase1-model-comparison.md` com tabela + decisão.

### Fase 2 — Arquitetura do prompt (30-45 min, sem custo)

**Pergunta central:** a estrutura em 4 camadas (regras + fluxo + few-shot + REFORCO_HANDOFF) é a certa, ou está fragmentada/redundante?

**Tarefas:**
1. Mapear ordem de injeção das camadas no agent (qual aparece primeiro/último → recency bias). Ler `tattoo.js` `buildTattooAgent` pra ver concatenação.
2. Contar tokens de cada camada (usar `tiktoken` ou estimativa por palavras × 1.3). Total atual? Espaço pra mais?
3. Identificar redundâncias:
   - R6/R6b vs §3.5 (gatilhos imediatos) — overlap?
   - §3.4b vs T4 (quando chamar handoff_to_cadastro) — duplicado?
   - REFORCO_HANDOFF §HANDOFF vs T4 — repetição?
4. Identificar conflitos: alguma instrução em uma camada contradiz outra?
5. Avaliar se vale consolidar (3 camadas: contexto + regras unificadas + few-shots) ao invés de 4.

**Output:** árvore das camadas + lista de redundâncias/conflitos + proposta de consolidação no audit doc.

### Fase 3 — Matriz de cobertura de decisão (60 min, sem custo) [CRÍTICO]

**Pergunta central:** todos os estados possíveis do agent têm `proxima_acao` definida explicitamente?

**Construir matriz preenchendo tabela:**

| OBR state | Conflito? | Trigger? | Acao esperada | Onde no prompt | Cobertura | TC que valida |
|-----------|-----------|----------|---------------|----------------|-----------|---------------|
| Vazio (1ª msg) | N | N | pergunta + saudação | §3.1 | ✅ | TC-?? |
| Vazio | N | Y | erro | §3.5 | ✅ | TC-04 (parcial) |
| Vazio | Y | N | impossível? | — | N/A | — |
| Vazio | Y | Y | erro? | gap? | ❌ | — |
| Parcial | N | N | **pergunta proximo OBR** | **GAP** | ❌ | TC-03 falha |
| Parcial | N | Y | erro | §3.5 | ? | — |
| Parcial | Y | N | pergunta (R9) | regras R9 | ✅ | TC-05 |
| Parcial | Y | Y | erro? pergunta? | gap? | ❌ | — |
| Completo | N | N | handoff | §3.4b | ✅ | TC-09/10 |
| Completo | N | Y | erro | §3.5 | ? | — |
| Completo | Y | N | pergunta (R9) | R9 | ? | — |
| Completo | Y | Y | erro? handoff? | gap? | ❌ | — |

**12 combinações.** Para cada gap (❌ ou ?), escrever §3.x explícita que cobre o caso.

**Tarefas:**
1. Ler regras.js + fluxo.js inteiros e marcar cada linha por (qual estado da matriz cobre).
2. Identificar branches sem cobertura → escrever texto §3.x novo (não commitar; só especificar pro v2).
3. Identificar branches com cobertura ambígua → reescrever pra ser mais explícito.
4. Validar contra os 10 TCs: cada TC bate em qual linha? Quais linhas não têm TC?

**Output:** matriz preenchida + bullet list de §3.x faltantes (texto pronto pra spec v2).

### Fase 4 — Tools + Schema (20 min, sem custo)

**Pergunta central:** tools e schema poderiam compensar ambiguidade do prompt forçando estados válidos via fail-fast?

**Tarefas:**
1. Inspecionar `TattooOutputSchema` em `tattoo.js`. `proxima_acao` enum bate com matriz Fase 3? Tem `pergunta`, `erro`, `handoff`?
2. Avaliar: schema rejeita `proxima_acao='handoff'` quando `dados_completos=false` ou `campos_faltando` não-vazio? Se sim, ajuda. Se não, agent pode emitir output inválido → retry → loop → max-turns. **TC-03 hipótese alternativa: agent tenta `handoff`, schema rejeita silenciosamente, agent retry, eventualmente max-turns.**
3. Ler `dados_coletados` tool definition. Valida tipo de cada campo? `tamanho_cm` deveria exigir number; "pequena" como string deveria ser rejeitado pela tool com mensagem clara que volta pro agent.
4. Inspecionar `handoff_to_cadastro`. Valida pré-condições server-side?

**Output:** lista de constraints schema/tool a adicionar pra "fail fast" antes do agent emitir output errado. Hipótese a validar: TC-03 max-turns é causado por schema retry silencioso, não por confusão de prompt.

### Fase 5 — Lógica de orquestração (15-20 min, sem custo)

**Pergunta central:** route.js / router.js / sdk-init.js têm guard rails? Pré/pós-processamento que poderia compensar ambiguidade do prompt?

**Tarefas:**
1. Ler `route.js` ponta a ponta. Anotar fluxo: input → router → agent → schema → response.
2. `normalizeHistoryItem` em route.js: por que assistant precisa de array `[{type, text}]`? Bug do SDK ou design? Se design, documentar; se bug, abrir issue.
3. `maxTurns` hardcoded em 20: faz sentido? Custo de aumentar pra 30/40? Latência impacto?
4. Há logging/tracing pra debugging post-mortem em produção? OpenTelemetry, sentry, console.log estruturado?
5. Há retry/timeout policy se OpenAI 5xx?

**Output:** diagrama do fluxo (mermaid em markdown) + bullet list de guard rails ausentes.

### Fase 6 — Few-shot coverage (30 min, sem custo)

**Pergunta central:** os 8 exemplos cobrem os padrões da matriz Fase 3?

**Tarefas:**
1. Categorizar cada exemplo (Ex 1-8) pela linha da matriz da Fase 3. Tabela:

| Exemplo | Estado coberto | Necessário? |
|---------|----------------|-------------|
| Ex 1 | ? | ? |
| ... | ... | ... |
| Ex 8 (novo) | Parcial sem trigger sem conflito | sim — TC-03 class |

2. Identificar exemplos faltantes (linhas da matriz × 0 examples).
3. Avaliar redundância: 2+ exemplos no mesmo padrão? Pode consolidar?
4. Avaliar ordem: recency bias — Ex 8 é o último, mais memorável. Está em ordem certa? Os exemplos "cliente colabora" devem vir antes ou depois dos "cliente confunde"?
5. Verificar formato consistente: meta-comments (como tentamos no Ex 8) atrapalham? Padrão CLIENTE/AGENTE puro é melhor?

**Output:** tabela exemplos × padrões + lista de exemplos a adicionar/remover/reordenar (texto pronto pra spec v2).

### Fase 7 — Eval suite coverage (30 min, sem custo)

**Pergunta central:** 10 cenários cobrem o que? Quais classes de falha estão sub-representadas?

**Tarefas:**
1. Categorizar TC-01..TC-10 pela matriz Fase 3 (mesma tabela).
2. Listar classes não testadas:
   - "OBR parcial" só tem TC-03 ("rosa pequena"). E "leão grande"? "frase pequena"? "sol médio sem local"? "tribal nas costas sem cm"? — cada um exercita um aspecto diferente
   - Cliente que muda de ideia mid-coleta
   - Cliente que dá info → agent pergunta → cliente NEGA ("não sei")
   - Cliente em outro idioma (§3.5 cobre, mas tem TC?)
   - Cliente brincalhão / testando o bot
3. Edge cases ainda não testados: idioma, audio (não suportado?), foto sem descrição, multi-OBR alternativo (descricao+estilo sem cm)
4. Listar TCs novos (TC-11..TC-2X) com input + expected oracle. Justificar cada um por classe coberta.

**Output:** lista de TCs novos com input/expected pronto pra adicionar em scenarios.json (pelo plan v2).

### Fase 8 — Production samples comparison (30-60 min, sem custo, OPCIONAL)

**Pergunta central:** o que cliente real digita VS o que os scenarios cobrem?

**Tarefas:** (executar se Leandro tiver acesso aos logs n8n produção)
1. Pegar 20-50 mensagens iniciais reais do n8n produção (Marcelo's tenant).
2. Categorizar pela matriz: que % cai em "OBR parcial sem trigger"? "vazio com saudação"? etc.
3. Variações de wording que os scenarios não cobrem ("queria fazer", "tô pensando em fazer", "quanto custa uma...").
4. Comportamentos surpreendentes do cliente (pergunta direto preço, manda áudio, manda foto sem texto, escreve em maiúsculo, emoji-heavy).

**Output:** lista de patterns produção + gap entre eval e produção. Alimenta Fase 7.

**Skip se:** acesso a logs requer config extra. Documentar como follow-up.

### Fase 9 — Síntese + priorização (30 min, sem custo)

Consolidar findings das fases 1-8.

**Tarefas:**
1. **Top 3 issues estruturais** identificadas (ranqueado por severidade × frequência):
   - Issue 1: ...
   - Issue 2: ...
   - Issue 3: ...
2. **Top 5 mudanças no prompt v2** com justificativa (cada uma referencia 1+ findings):
   - Mudança 1: nova §3.x cobrindo "OBR parcial → pergunta próximo"
   - Mudança 2: ...
   - ...
3. **Top N TCs novos** (com critério: cobre uma classe não testada) — lista vinda da Fase 7.
4. **Decisões pendentes** que precisam input do Leandro:
   - Modelo: manter mini ou upgrade?
   - Schema: adicionar validation cross-field?
   - Tools: rejeitar `tamanho_cm` não-numérico server-side?
   - Sub-3 vai antes ou depois do v2?

**Output:** seção "Síntese" no audit doc + lista priorizada de mudanças.

### Fase 10 — Spec do prompt v2 + plano (45-60 min, sem custo)

Escrever 2 documentos finais:

#### A. Spec — `docs/superpowers/specs/2026-05-08-coleta-multi-agent-prompt-v2-design.md`

Format igual aos specs existentes:
- Header (data/branch/status: ready-to-plan)
- TL;DR
- Por quê (resumo das fases 1-9)
- Hipóteses revalidadas
- Mudanças concretas (4 camadas + tools + schema, com texto exato onde aplicável)
- Cenários novos a adicionar (TC-11..TC-2X, da Fase 7)
- Acceptance criteria (gate: 10/10 dos originais + novos? Cobertura por linha da matriz?)
- Riscos
- Outcome (a preencher pós-implementação)

#### B. Plano — `docs/superpowers/plans/2026-05-08-coleta-multi-agent-prompt-v2.md`

Plan a executar em sessão dedicada posterior. Tasks granulares com `Edit` precisos, igual aos plans existentes.

#### C. Decisão Sub-3 (go/no-go)

Bloco no audit doc:
- **GO (Sub-3 antes de v2):** se gap atual (TC-03 falha em 1 input específico) é aceitável pra produção; v2 fica como follow-up paralelo
- **NO-GO (v2 antes de Sub-3):** se Fase 9 identifica gaps que vão estourar em produção (ex: idioma, cover-up, cliente menor); v2 é pré-requisito
- **GO PARCIAL:** Sub-3 com feature flag/tenant restrito (só Marcelo, não outros tatuadores) até v2 estabilizar

---

## Deliverables

No fim da sessão, ter na branch `audit/coleta-multi-agent-prompt-v2`:

1. ✅ `docs/superpowers/audit/2026-05-08-coleta-multi-agent-prompt-audit.md` — full audit findings (fases 0-9 consolidadas)
2. ✅ `docs/superpowers/audit/2026-05-08-fase1-model-comparison.md` — Fase 1 standalone (se executou comparativo)
3. ✅ `docs/superpowers/specs/2026-05-08-coleta-multi-agent-prompt-v2-design.md` — spec do v2 (status: ready-to-plan)
4. ✅ `docs/superpowers/plans/2026-05-08-coleta-multi-agent-prompt-v2.md` — plan executável (status: ready-to-execute)
5. ✅ Decisão go/no-go pra Sub-3 documentada com justificativa

Branch pode ser merged em main após Leandro aprovar — toda escrita de docs, sem código de produção tocado.

---

## Sucesso

Sessão considerada bem-sucedida quando:

- [x] Matriz da Fase 3 está 100% mapeada (12 estados × ação × cobertura)
- [x] Spec do v2 self-contained (alguém pode pegar e executar sem mais perguntas)
- [x] Plan do v2 tem `Edit` com `old_string`/`new_string` concretos (não placeholder)
- [x] Decisão Sub-3 documentada com justificativa
- [x] Cada gap identificado tem hipótese de causa + proposta de fix testável

Sessão considerada **inconclusiva** se:
- Saiu sem identificar a causa raiz de TC-03 max-turns (Fase 4 hipótese de schema-retry-silencioso fica em aberto)
- Spec v2 fica vago ("melhorar prompt") sem mudanças concretas

---

## Riscos

1. **Audit revela problema de modelo** (Fase 1): se gpt-4o também não passa TC-03 com prompt atual, a estratégia muda — é problema de design do prompt, não capacidade. Custo de mitigação: já está incluído no escopo da sessão (decisão informada vs decisão cega).
2. **Sessão estoura tempo:** 10 fases é ambicioso. Mitigação: cada fase tem pause natural. Pode pausar após Fase 5 ou 6 e continuar em sessão seguinte se necessário. Fases 8 (production samples) e parte da Fase 1 (modelos não-OpenAI) são opcionais.
3. **Decisão go/no-go Sub-3 fica cinza:** "GO PARCIAL com feature flag" pode parecer hedge. Mitigação: documentar critérios objetivos (qual % de inputs em produção a matriz cobre) pra reduzir ambiguidade.

---

## Outcome (preencher pós-sessão)

**Status:** done | inconclusivo | aborted

**Findings principais:**
- ...

**Decisão Sub-3:** GO | NO-GO | GO-PARCIAL

**Sessão de implementação v2 agendada:** SIM | NÃO | TBD

**Custo total:** $X.XX

**Lições:**
- ...
