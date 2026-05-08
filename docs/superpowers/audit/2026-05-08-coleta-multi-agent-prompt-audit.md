# Coleta Multi-Agent — Prompt Audit (consolidado fases 0-9)

**Data:** 2026-05-08
**Branch:** `audit/coleta-multi-agent-prompt-v2`
**Spec base:** [validation session design](../specs/2026-05-08-coleta-multi-agent-prompt-validation-design.md)
**Status:** in-progress

Este doc consolida findings das fases 0-9. Fase 1 (model comparison) tem doc standalone separado: [fase1-model-comparison.md](./2026-05-08-fase1-model-comparison.md).

---

## Sumario executivo (preencher na Fase 9)

_TBD_

---

## Fase 0 — Preparacao

- [x] Branch `audit/coleta-multi-agent-prompt-v2` criada (off `feat/coleta-multi-agent-handoff`)
- [x] Pasta `docs/superpowers/audit/` criada
- [x] `OPENAI_API_KEY` confirmado (164 chars)
- [x] Baseline TC-03 FAIL confirmado em `/tmp/eval-iter3.log` (max-turns 20)

---

## Fase 1 — Modelo

Ver [fase1-model-comparison.md](./2026-05-08-fase1-model-comparison.md) — doc standalone.

**Decisao:** manter `gpt-4o-mini` condicional a 3 fixes estruturais (Fases 3/4/5). Upgrade pra gpt-4o desbloqueia se fixes nao resolverem (~$10/mes diff irrelevante).

**Findings que alimentam fases seguintes:** F1 (tool sem fail-fast), F2 (eval check vs schema), F3 (branch parcial sem instrucao), F4 (mini incapaz sem validacao), F5 (maxTurns 20 custoso).

---

## Fase 2 — Arquitetura do prompt

### Composicao real do prompt (10 camadas, nao 4)

O spec usa "4 camadas" como simplificacao. A composicao real em `generatePromptColetaTattoo` (`functions/_lib/prompts/coleta/tattoo/generate.js`) e:

```
[1] identidade            (_shared)            — quem voce e
[2] checklistCritico      (_shared)            — §0 checklist 8 itens
[3] tom                   (_shared)            — §2 estilo de fala
[4] fluxo                 (tattoo)             — §3 fases 3.1..3.5
[5] regras                (tattoo)             — §4 R1..R9 + §4b T1..T4
[6] contexto              (_shared)            — §5 estudio + cliente + estado
[7] faqBlock              (_shared)            — §6 FAQ tenant
[8] fewShotTenant         (tattoo)             — exemplos custom
[9] fewShotBase           (tattoo)             — §7 8 exemplos
+ REFORCO_HANDOFF         (suffix em tattoo.js) — invariante + emit-once
```

Separadores `\n\n---\n\n` entre cada bloco.

### Tokens estimados (FAKE_TENANT vazio, sem custom)

| Bloco | Tokens estimados | % do total |
|-------|------------------|------------|
| identidade | 50 | 1% |
| checklistCritico | ~700 | 18% |
| tom | ~250 | 7% |
| fluxo | **966** | 25% |
| regras | **790** | 20% |
| contexto | ~200 | 5% |
| faqBlock | ~50 | 1% |
| fewShotTenant | 0 | 0% |
| fewShotBase | **775** | 20% |
| REFORCO_HANDOFF | ~80 | 2% |
| **TOTAL** | **~3860** | 100% |

Comentarios:
- 3.86k tokens de system prompt + ~50 tokens user msg + ~200 tokens output. Mini context 128k — folga gigante. Bottleneck NAO e tamanho.
- 3 blocos pesados consomem 65% do budget: fluxo + regras + few-shotBase.
- checklistCritico gasta 18% — vamos ver, sob a luz de Multi-Agent, esse gasto vale.

### Recency bias ordering

OpenAI Responses API: instrucoes mais ao FINAL do system prompt sao mais memoraveis. Ordem atual:

1. (start) identidade — peso baixo
2. checklist
3. tom
4. fluxo
5. regras
6. contexto (estado dinamico)
7. faq
8. fewShotTenant
9. fewShotBase (ultimos 8 exemplos) — peso medio-alto
10. REFORCO_HANDOFF (suffix) — peso MAIS alto

**Implicacao TC-03:** Exemplo 8 ("quero uma rosa pequena") esta em fewShotBase, posicao penultima — recency forte. Mini ainda assim falha (loop). Prova que recency dos few-shots NAO basta pra resolver bug de "persistir null".

REFORCO_HANDOFF (a posicao mais memoravel) foca em handoff invariante + "emit-once". NAO endereca o bug do `dados_coletados` em loop. **Gap:** o suffix mais memoravel nao cobre o bug observado.

### Redundancias identificadas (5)

#### R-1 — Cobertura aparece em 3 lugares

| Lugar | Conteudo | Branching tenant |
|-------|----------|------------------|
| §3.5 fluxo (gatilho) | "Cover-up (cliente menciona 'cobrir/tapar/disfarcar tattoo antiga' OU foto mostra pele tatuada)" | nao |
| R7 regras | "COBERTURA DE TATTOO ANTIGA" — keywords + branch `aceitaCobertura` | sim |
| Exemplo 3 fewshot | dialog completa com `aceitaCobertura=true` | nao |

**Diagnostico:** §3.5 e R7 dizem coisas levemente diferentes. §3.5 hardcoded, R7 com branch tenant. **Conflito leve:** se mini ler §3.5 primeiro pode emitir erro generico antes de chegar em R7 com tenant `aceitaCobertura=false` (recusa educada). Few-shot Exemplo 3 so cobre `aceitaCobertura=true`.

**Severidade:** medium — defesa em profundidade tem valor, mas branch tenant pode ser perdido.

#### R-2 — Handoff aparece em 4 lugares (CRITICO)

| Lugar | Conteudo |
|-------|----------|
| §3.4 fluxo | mensagem-ponte (tom da resposta) |
| §3.4b fluxo | SINAL DE FIM DA FASE (mecanica handoff_to_cadastro + output) |
| T4 regras | "handoff_to_cadastro APENAS quando 3 OBR completos E `campos_conflitantes=[]`" |
| REFORCO_HANDOFF | "NUNCA chame handoff_to_cadastro se: (a) qualquer dos 3 OBR faltando, OU (b) campos_conflitantes nao-vazio" |

**Diagnostico:** §3.4b + T4 + REFORCO_HANDOFF dizem A MESMA INVARIANTE com palavras diferentes. Triplicado. §3.4 cobre conteudo da resposta — separado.

**Hipotese pra mini:** repeticao 4x do "handoff" como conceito pode causar **viés** — mini interpreta "handoff e o objetivo principal" e tenta antecipar. Quando ambiguo (TC-03), mini tem 2 instintos: (a) tentar handoff prematuro, (b) loopar `dados_coletados` esperando que algum chamada destrave handoff.

**Severidade:** **CRITICAL** — pode contribuir pro bug do loop.

#### R-3 — "tamanho qualitativo nao satisfaz" aparece em 2 lugares

| Lugar | Conteudo |
|-------|----------|
| §3.2 fluxo | "IMPORTANTE: tamanho_cm exige NUMERO em cm... 'pequena', 'media', 'grande' NAO satisfazem — sempre pergunte o tamanho em cm. Sem numero em cm, tamanho_cm permanece em campos_faltando e voce NAO chama handoff_to_cadastro." |
| Exemplo 8 fewshot | "Bacana! 'Pequena' e relativo demais pra orcar — me passa em cm aproximado..." |

**Diagnostico:** §3.2 inserida no Sub-2 iter 2 (rule line) sem efeito. Exemplo 8 inserido no Sub-2 iter 3, mudou comportamento (handoff prematuro → max-turns) mas nao resolveu. Ambos cobrem a regra mas com framing diferente.

§3.2 nao diz EXPLICITAMENTE "se tamanho qualitativo: emita `proxima_acao='pergunta'` e NAO chame `dados_coletados` pra tamanho_cm". So diz "permanece em campos_faltando" — implica mas nao prescreve comportamento. **Lacuna estrutural.**

**Severidade:** **CRITICAL** — bate exatamente no TC-03.

#### R-4 — "PARE" aparece em 5 lugares

| Lugar | Frase |
|-------|-------|
| §3.4 | "Apos esta mensagem, PARE. Nao chame mais tools nesse turno" |
| §3.4b passo 3 | "PARE. Nao chame `dados_coletados` de novo nesse turno" |
| §3.5 | "PARE imediatamente, emita output com `proxima_acao='erro'`" |
| R6b | "PARE IMEDIATAMENTE" |
| REFORCO_HANDOFF | "NAO continue em loop apos emitir output" |

**Diagnostico:** 5x reforco de "PARE". Mini ainda loopa 22 vezes em TC-03. Reforco textual nao endereca o bug — mini chama `dados_coletados` (nao handoff e nao output final), e os "PARE" todos sao sobre handoff/output. Nao tem instrucao "PARE de chamar `dados_coletados`".

**Severidade:** medium — token bloat sem ganho proporcional.

#### R-5 — §4b T1-T4 vs §3 fluxo

| Lugar T# | Conteudo overlap com §3 |
|----------|------------------------|
| T1 ("tools NAO existem na conversa visivel") | unico — nao overlap |
| T2 ("dados_coletados — chame APOS cliente fornecer cada campo OBR") | overlap **forte** com §3.2 ("Persistencia: pra cada info coletada, chame dados_coletados") |
| T3 ("3 OBR completos → tool sinaliza transicao") | overlap **forte** com §3.4 + §3.4b |
| T4 ("handoff_to_cadastro APENAS quando 3 OBR completos E campos_conflitantes=[]") | overlap **forte** com §3.4b + REFORCO_HANDOFF |

**Diagnostico:** §4b TOOLS QUANDO INVOCAR e re-statement do mecanismo ja em §3. Adiciona ~150 tokens sem informacao nova. T2 ate fala em "encadear varias chamadas no MESMO turno" — pode estimular o loop observado em TC-03.

**Severidade:** medium — token bloat + repete handoff invariante.

### Conflitos identificados (3)

#### C-1 — "conflito grave" (R6) vs "conflito de dados" (R9)

R6: "Casos que voce NAO resolve nesta fase (gatilho do estudio: ${gatilhos}, cliente pede humano, cover-up, **conflito grave**): emita output com `proxima_acao='erro'`"

R9: "CONFLITO DE DADOS: quando cliente fornece valores contraditorios pro mesmo campo... `proxima_acao='pergunta'`"

**Conflito de wording:** "conflito grave" (R6) vs "conflito de dados" (R9). Para mini, sao a mesma palavra. R6 manda erro; R9 manda pergunta. **Mini precisa inferir qual e qual.** Em TC-05 ("rosa pequena de 25cm") cabe em R9 — mas se mini tropecar em R6, pode errar pra erro.

**Severidade:** medium — ambiguo. Reescrita: R6 deve listar exemplos especificos ("conflito grave" eh muito vago) ou remover esse termo.

#### C-2 — §3.3c #3 fallback (erro) vs persist obrigatoria pos-OBR

§3.3c #3: "Se mesmo assim nao souber [tamanho]: emita `proxima_acao='erro'` + 'Sem referencia de tamanho fica dificil orcar — o tatuador vai te ajudar com isso pessoalmente'. NAO chame handoff_to_cadastro."

Mas se cliente deu descricao + local mas NAO tamanho_cm apos 3 fallbacks: §3.4b diz handoff exige 3 OBR. §3.3c #3 abandona via erro.

**Conflito de framing:** quando o cliente nao sabe tamanho, e isso "erro" (R6 nivel) ou "esperar mais turns / pergunta" (TC-03 nivel)? §3.3c diz erro apos 3 tentativas. TC-03 espera pergunta. **Edge case borderline:** quanto agente "tenta" antes de desistir?

**Severidade:** medium — afeta TCs futuros (cliente recusa info repetidamente).

#### C-3 — REFORCO_HANDOFF foca em handoff_to_cadastro mas mini loopa em dados_coletados

REFORCO_HANDOFF cobre 2 invariantes:
- "NUNCA chame handoff_to_cadastro se OBR faltando OU conflitos nao-vazio" (handoff)
- "Apos chamar tools necessarias, emita output JSON UMA vez e PARE" (emit-once)

Mas TC-03 falha por loop em `dados_coletados(tamanho_cm, "null")` — nao por handoff prematuro. **REFORCO_HANDOFF nao cobre o bug observado.**

**Severidade:** **CRITICAL** — gap especifico. O reforco mais visivel (suffix) nao endereca o sintoma.

### checklistCritico — referencia tools FANTASMA (CRITICAL)

`checklistCritico(tenant)` foi escrito pra arquitetura **n8n single-agent** com 12+ tools. TattooAgent tem APENAS 2 tools (`dados_coletados`, `handoff_to_cadastro`). Mas o checklist referencia:

| Item | Tool referenciada | Existe no TattooAgent? |
|------|-------------------|-------------------------|
| #1 GATILHO | `acionar_handoff` | **NAO existe** |
| #4 LOOP DE PERGUNTA | `acionar_handoff` (motivo "cliente_evasivo_infos_incompletas") | **NAO existe** |
| #5 (modo coleta) ENVIAR PRO TATUADOR | `enviar_orcamento_tatuador` | **NAO existe** |
| #6 GATILHO HANDOFF DETECTADO | linguagem assume `acionar_handoff` ja foi chamada | **NAO existe** |
| #7 GATILHO vs ESTILO | nao referencia tool | OK |
| #8 EVITE LOOP DE RESPOSTA | nao referencia tool | OK |

**4 dos 8 itens do checklist referenciam tools que o TattooAgent nao tem.** Isso e ruido massivo — mini le instrucao tipo "chame `acionar_handoff` com motivo X", nao acha a tool, fica confuso.

Item #5 mode-aware: bloco `if (isColeta)` reescreveu apenas pra mencionar `enviar_orcamento_tatuador` — mas essa tool nao e do TattooAgent! E da PropostaAgent (Sub-3). E ainda menciona "5 dados destes: tamanho_cm, estilo, regiao, cor_bool, nivel_detalhe" no else de modo Exato — fields que o TattooAgent nem usa (regiao virou `local_corpo`, cor/nivel sao Proposta).

Item #6 fala em "modo handoff" via frases tipo "ja te direciono pra ele" — frases que aparecem em R6/R7 do TattooAgent. Mas o "modo handoff" do checklist instrui manter o estado via `acionar_handoff`. **Conflito de modelo mental:** R6/R7 usam `proxima_acao='erro'` (semantica diferente).

**Severidade:** **CRITICAL** — fonte massiva de ruido. Pode ser causa raiz do loop em TC-03 (mini tenta inferir o que `acionar_handoff` significa, nao acha, retry).

**Acao proposta:** TattooAgent precisa de uma versao SLIM do checklist sem referencias a tools fora da whitelist. Ou — melhor — re-escrever items 1, 4, 5, 6 pra usar `proxima_acao='erro'` (semantica do TattooAgent).

### Proposta de consolidacao (3 camadas)

Atualmente 4 conceitos espalhados em 4+ lugares. Consolidar:

**Camada 1 — §IDENTIDADE_E_TOM** (manter):
- Quem voce e (identidade)
- Como voce fala (tom)
- ~300 tokens

**Camada 2 — §DECISAO_E_REGRAS** (NOVO — substitui fluxo + regras + REFORCO_HANDOFF + parte do checklist):
- §A. Tabela explicita de "estado → acao" (12 linhas da matriz Fase 3)
- §B. Regras de conteudo (R1-R8 sobre o que voce DIZ — nao fala valor, nao pede cadastro, IMAGENS, COBERTURA com branch tenant)
- §C. Tools (so as 2 que voce tem — sem ruido de fantasmas)
- ~1500 tokens (vs 800+966+80 = 1846 atual; -350 tokens)

**Camada 3 — §CONTEXTO_DINAMICO** (manter):
- Estudio + cliente + estado conversa + dados ja coletados
- ~200 tokens

**Camada 4 — §EXEMPLOS** (manter, mas auditar Fase 6):
- 8 exemplos cobrindo as 12 linhas da matriz (Fase 6 vai mapear)
- ~775 tokens

**Total estimado pos-consolidacao:** ~2775 tokens (-1085 vs 3860 atual). 28% reducao. Mais limpo, menos redundancia, sem tools fantasma.

REFORCO_HANDOFF deixa de existir como suffix — vira parte da §DECISAO. emit-once invariante vira regra explicita na tabela de decisao.

checklistCritico deixa de ser usado pelo TattooAgent (ou ganha versao slim). FAQ block opcional (so se tenant tem FAQs).

### Output Fase 2

- [x] Mapa das 10 camadas reais (vs "4" do spec) ✅
- [x] Token estimate por camada ✅
- [x] 5 redundancias identificadas com severidade ✅
- [x] 3 conflitos identificados com severidade ✅
- [x] BOMBA: checklistCritico referencia 4 tools fantasma — fonte critica de ruido ✅
- [x] Proposta de consolidacao 3+1 camadas com -28% tokens ✅

### Findings novos

| Finding | Fase que aborda | Severidade |
|---------|-----------------|------------|
| F6 — checklistCritico referencia 4 tools que nao existem no TattooAgent | Fase 5 (consolidar) ou remover | **CRITICAL** |
| F7 — Handoff invariante triplicada (§3.4b + T4 + REFORCO) pode causar viés "handoff e o objetivo" no mini | Fase 3 (matriz unica) | high |
| F8 — REFORCO_HANDOFF foca em handoff prematuro, nao cobre bug de loop em dados_coletados | Fase 3 + Fase 4 | high |
| F9 — §3.2 instruction sobre "tamanho qualitativo" diz "permanece em campos_faltando" mas NAO prescreve comportamento ('pergunta', skip tool call) | Fase 3 | high |
| F10 — "conflito grave" (R6) vs "conflito de dados" (R9) — wording ambiguo pode confundir mini | Fase 3 (rewrite R6) | medium |
| F11 — token bloat: 5 menções de "PARE", §4b TOOLS é re-statement de §3 | Fase 9 (priorizar limpeza) | low |

---

## Fase 3 — Matriz de cobertura de decisao (CRITICA)

_TBD — proxima fase_

---

## Fase 4 — Tools + Schema

_TBD_

---

## Fase 5 — Logica de orquestracao

_TBD_

---

## Fase 6 — Few-shot coverage

_TBD_

---

## Fase 7 — Eval suite coverage

_TBD_

---

## Fase 8 — Production samples comparison (OPCIONAL)

_TBD_

---

## Fase 9 — Sintese + priorizacao

_TBD — escrita ao final, consolidando todas as fases anteriores_
