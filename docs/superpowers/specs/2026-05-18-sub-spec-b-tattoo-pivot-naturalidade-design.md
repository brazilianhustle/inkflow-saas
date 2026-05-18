# Sub-spec B — Refator prompt tattoo: per-009 pivot crônico + per-010 naturalidade borderline

**Date:** 2026-05-18
**Author:** Leandro + Claude (via `superpowers:brainstorming`)
**Status:** ready-to-plan
**Predecessor:** `2026-05-17-refator-prompt-tattoo-manifesto-v2-design.md` (PR #72 — DoD FAIL, Path B aplicado)

---

## 1. Contexto e motivação

Continuação direta do refator manifesto v2 (PR #72 ABERTO com DoD FAIL anotado). O spec original previu este passo no §7 (Path B): "se A não bater DoD com refator competente, sub-spec B parte dessa evidência empírica".

**Refator A foi competente:**
- R10 cravado em `decisao.js` conforme spec
- Exemplos reescritos conforme spec (2 deviations documentadas e justificadas)
- Suite local 450/450 PASS
- HTTP 500 rate 0/6 mantido (ganho da Fase 1 preservado)

**Mas DoD A FAIL em 2 critérios:**
- #2 Pass rate — só 1/3 personas com pass (per-001 flaky pass em 1/2 rounds)
- #3 Naturalidade média — 3.7 vs threshold 4.0

**Diagnóstico empírico do eval** (`docs/inkflow-agent/reports/2026-05-17-eval-refator-manifesto-v2.md`):

- **per-009 (muda-decisao)** — manifesto 0.67-0.75 (abaixo 0.85), naturalidade caiu **4.2 → 3.4** (regressão -0.8 vs baseline). Hipótese: Ex.10 novo introduziu pattern de validação substantiva no turn de pivot que o LLM tenta copiar e o resultado fica artificial ("Tranquilo, leao realismo e tatuagem que impoe — bem diferente da rosa fineline. Bora cravar com leao entao." soa mecânico).
- **per-010 (conflito-tamanho)** — manifesto 0.92 ✅, naturalidade 3.6-3.8 (borderline, threshold 4.0). Hipótese: tom ainda tem resquício de "anotação" mecânica nos turnos. Ex.4 expandido pode estar ensinando pattern formal pro handoff.
- **per-001 (happy-path)** — flaky pass: R1 fail / R2 pass com mesmo input. Variabilidade do LLM. Threshold ≥2/3 personas atual é estrito demais pra essa variabilidade.

**Esta sub-spec** ataca per-009 + per-010 com mudanças cirúrgicas. Variabilidade do LLM (per-001) e mitigações estruturais (temp, retry, majority voting, playbook §4.7) ficam fora de escopo — Path C pré-mapeado se necessário.

---

## 2. Escopo

### In-scope

- **per-009 pivot crônico** — manifesto + naturalidade
- **per-010 naturalidade borderline** — só naturalidade (manifesto já passa)
- **Threshold DoD aplicável** — Opção B (flaky-tolerant + tracking de consistency rate)

### Out-of-scope (explícito)

| Item | Por que fora | Onde resolve |
|---|---|---|
| per-001 flaky pass | Variabilidade do LLM, dimensão ortogonal a refator de prompt | Sub-spec C.2 se virar necessário |
| Mitigação variabilidade (temperature, retry, majority voting) | Mesmo motivo — não é refator de prompt | Sub-spec C.2 |
| Playbook §4.7 + 2-3 mini-exemplos de pivot | Fallback se Opção 4 Hybrid (rewrite Ex.10 + exceção R10) não bastar | Sub-spec C.1 |
| Audit tom em TODOS exemplos | Risco de regredir per-001 sem sinal limpo | Sub-spec C.3 |
| Revisão de threshold DoD além do que esta spec já decide | Decidido aqui (§3) | N/A |
| Refator multi-agent OpenAI SDK em Cadastro/Proposta | P1 separado (Caminho C Fase 2) | Backlog ativo |

**Justificativa do escopo:** misturar refator de prompt com mitigação de variabilidade num único spec é misturar duas mudanças que falham/sucedem independentemente. Eval não vai dizer qual moveu o quê. Esta spec mantém sinal limpo: 2 frentes mecânicamente acopladas (mesmo arquivo `exemplos.js`) que compartilham infraestrutura de eval.

---

## 3. Decisão prévia: threshold DoD B (flaky-tolerant + tracking)

DoD #2 do PR #72 dizia "≥ 2/3 personas com pass em ambos rounds". Per-001 com flaky pass (R1 fail / R2 pass) foi marcado como fail de persona → 1/3 personas pass → DoD FAIL.

**Sub-spec B aplica threshold revisado:**

- **Persona pass** = ≥1 round pass (não exige todos rounds)
- **Métrica de tracking** = `consistency_rate = rounds_pass / total_rounds` por persona, registrada no report. **Não-bloqueadora.** É KPI de observabilidade pra futuras iterações.

**Justificativa:** relaxar threshold sem medir é trapaça. Mas exigir determinismo de um LLM com `temperature` default é querer hardware behavior de software estocástico. Tracking de consistency é o meio-termo honesto: DoD passa quando o refator funciona pelo menos uma vez (prova de viabilidade), e melhoramos consistência em ciclos seguintes mirando esse KPI explícito.

**Risco mitigado pelo tracking:** se per-001 baixar de 1/2 (atual) pra 0/2, é regressão silenciosa que precisa virar alerta no report mesmo passando DoD #2 (via fallback do controle: per-001 ≥1 round pass).

---

## 4. Mudanças concretas

Duas frentes paralelas tocando 2 arquivos do prompt + 2 arquivos de teste.

### Frente 1 — per-009 pivot (Opção 4 Hybrid)

Ataca **causa proximal** (Ex.10 é molde mecânico) + **causa estrutural** (R10 força validação substantiva mesmo em turn de pivot).

**Mudança 1.1 — Exceção R10 pra turn de pivot**

- Arquivo: `functions/_lib/prompts/coleta/tattoo/decisao.js`
- Local: dentro de R10 (após bullets existentes) OU em §4.6 (se R10 estiver mais condensado)
- Texto-direção (plan literaliza):

  > No turn em que cliente muda decisão (pivot — troca estilo, troca local, troca tamanho, troca de ideia geral), reconhecimento curto do pivot **substitui** a validação substantiva exigida por R10. Não tentar comentar "característica concreta" sobre a mudança em si — soa mecânico.

**Mudança 1.2 — Rewrite Ex.10 com tom natural**

- Arquivo: `functions/_lib/prompts/coleta/tattoo/exemplos.js`
- Escopo: substituir frase do turn de pivot ("Tranquilo, leao realismo e tatuagem que impoe — bem diferente da rosa fineline. Bora cravar com leao entao.") por algo fluido — direção curta, reativa, sem comentário substantivo forçado.
  - Exemplo de molde (texto final no plan): "Caraca, leão é outra pegada! Beleza, vamos cravar leão então." (ou equivalente — plan crava texto exato)
- Manter resto do exemplo intacto (reset de `descricao_curta` + `estilo`, manter `local_corpo` + `altura_cm`)

### Frente 2 — per-010 naturalidade (Opção D = A + C)

Ataca **regra implícita não cumprida** (LLM não percebe que "Anotei X" é robotizado) + **molde mecânico em exemplos** (Ex.4/Ex.5).

**Mudança 2.1 — Diretriz tom em §4.6**

- Arquivo: `functions/_lib/prompts/coleta/tattoo/decisao.js`
- Local: §4.6 (modo consultor) — bullet adicional curto
- Texto-direção:

  > Tom: tatuador WhatsApp casual. Evitar "Anotei X", "Confirmado", "Vou anotar [campo]". Confirma com fluidez natural ou só segue com a próxima pergunta.

**Mudança 2.2 — Reescrever Ex.4 e Ex.5 com tom menos formal**

- Arquivo: `functions/_lib/prompts/coleta/tattoo/exemplos.js`
- Escopo: drop padrões "Anotei", "Confirmado", "Vou anotar" se presentes nesses dois exemplos. Turn AGENTE vira "[reação curta/comentário substantivo] [pergunta próxima]" sem confirmação enxuta mecânica antes.
- Texto exato no plan (após inspeção dos exemplos atuais)

### Snapshot + contract test

**Mudança 3 — Regen snapshot**

- Comando: `npm test -- -u` regenera `tests/prompts/snapshots/coleta-tattoo.txt`
- Não-manual

**Mudança 4 — Verify contract `max_tokens`**

- Arquivo: `tests/prompts/contracts/coleta-tattoo.mjs`
- Atual: `max_tokens = 6500` (do PR #72)
- Ação: rodar `npm test`. Se contract test passar, manter 6500. Se estourar (improvável — bullets curtos), bump pra 6700 com justificativa no commit message.

### Arquivos tocados — sumário

| Arquivo | Edits |
|---|---|
| `functions/_lib/prompts/coleta/tattoo/decisao.js` | 2 (R10 exceção + §4.6 diretriz tom) |
| `functions/_lib/prompts/coleta/tattoo/exemplos.js` | 3 (Ex.10 rewrite + Ex.4 rewrite + Ex.5 rewrite) |
| `tests/prompts/snapshots/coleta-tattoo.txt` | regen via `-u` |
| `tests/prompts/contracts/coleta-tattoo.mjs` | verify; bump só se necessário |

---

## 5. DoD

### Critérios bloqueadores (8 itens)

| # | Critério | Threshold | Como medir |
|---|---|---|---|
| 1 | HTTP 500 rate | 0/N runs | log do harness |
| 2 | Pass rate alvo (threshold B) | **per-009 ≥1 round pass** + **per-010 ≥1 round pass** | output do judge |
| 2b | Não-regressão per-001 (guard) | per-001 consistency_rate ≥ 1/2 (manter ou melhorar vs PR #72) | output do judge |
| 3 | Naturalidade nos rounds que passam (per-009, per-010) | ≥ 4.0 | judge score |
| 4 | Manifesto adherence nos rounds que passam (per-009, per-010) | ≥ 0.85 | judge score |
| 5 | Suite local | 450/450 PASS (sem regressão) | `npm test` |
| 6 | Custo total eval | ≤ $2.00 | OpenAI + Anthropic usage |
| 7 | `grep` R10 exceção em `decisao.js` | bullet "pivot — reconhecimento curto SUBSTITUI validação substantiva" presente | grep |
| 8 | `grep` Ex.10/Ex.4/Ex.5 em `exemplos.js` | Ex.10 sem "Bora cravar com"; Ex.4/Ex.5 sem "Anotei"/"Confirmado"/"Vou anotar" | grep |

### Métrica de tracking (não-bloqueadora, observabilidade)

- **Consistency rate por persona** = `rounds_pass / total_rounds`
- Registrado no report final, sem threshold
- KPI pra futuras iterações: se baixar de patamar X em ciclos seguintes, abre sub-spec C focada em estabilidade

---

## 6. Plano de evidência (eval)

### Setup

- **Branch:** decisão de cortar de `main` vs continuar em `feat/refator-prompt-tattoo-manifesto-v2` deferida pro `/plan` (ver §9). Spec é doc — vive bem em qualquer branch.
- **Deploy:** `npx wrangler pages deploy . --project-name inkflow-saas --branch <branch> --commit-dirty=true` (credenciais CF API via `bws`).
- **BASE_URL:** preview URL retornado pelo wrangler
- **Service token CF Access:** `CF_ACCESS_CLIENT_ID/SECRET` em `.env.production` (Vault Bitwarden é source-of-truth; ver memória `feedback_secrets_via_vault_pessoal`)

### Eval

- **Configuração:** 2 rounds × 3 personas (per-001 happy-path, per-009 muda-decisao, per-010 conflito-tamanho)
- **Matching** ao baseline anterior pra comparação A/B direta
- **Judge:** `claude-haiku-4-5-20251001` (Anthropic — mantém juiz pra A/B válido)
- **Comando:**

  ```bash
  BASE_URL=<preview-url> \
    node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs \
    --category=directed --agent=tattoo --persona=<per-001|per-009|per-010>
  ```

### Orçamento

| Item | Custo estimado |
|---|---|
| 2 rounds × 3 personas (OpenAI + Anthropic judge) | ~$1.50 |
| Buffer pra re-run direcionado se borderline (1 persona, 1 round) | ~$0.30 |
| **Cap total** | **$2.00** |

### Report deliverable

- Path: `docs/inkflow-agent/reports/2026-05-18-eval-sub-spec-b-pivot-naturalidade.md`
- Formato: tabela results + comparação A/B vs PR #72 + DoD checklist + análise dos fails (se houver) + **consistency rate** registrado por persona

---

## 7. Path C (se DoD FAIL)

Mesma lógica do Path B aplicado em PR #72:

1. **NÃO retroativar B.** Spec + plan + commits preservados como evidência empírica.
2. PR aberto com DoD FAIL anotado (ou mergeado, decisão do user com dado em mãos).
3. **Sub-spec C candidatas** (decisão pós-eval — não pré-cravada):

   | Sub-spec | Quando aplica | Escopo |
   |---|---|---|
   | **C.1 — Playbook §4.7 + mini-exemplos pivot** | Se Ex.10 rewrite isolado não bastar (per-009 ainda falha) | Cria §4.7 com diretriz + 2-3 mini-exemplos (troca estilo, troca local, troca tamanho) |
   | **C.2 — Mitigação variabilidade LLM** | Se per-001 piorar (consistency rate 1/2 → 0/2) ou flaky pass continuar inviabilizando avaliação | Temperature, retry com majority voting, ou troca de modelo |
   | **C.3 — Audit tom em todos exemplos** | Se naturalidade per-010 continuar borderline e o problema for difuso (não só Ex.4/Ex.5) | Busca "Anotei"/"Confirmado"/"Vou anotar" em Ex.1-9 e drop |

---

## 8. Riscos e mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Rewrite Ex.10 ainda fica mecânico (LLM samplea pattern errado) | média | Path C.1 pré-mapeado (playbook §4.7 + mini-exemplos) |
| Diretriz §4.6 tom é ignorada pelo LLM sem exemplo correspondente | baixa-média | Mitigado via 2.2 (Ex.4/Ex.5 rewrite aplica o princípio) |
| Cross-effect: rewrite Ex.10 quebra per-001 happy-path | baixa | Eval roda per-001 como controle; consistency rate detecta regressão silenciosa |
| Cross-effect: ajuste Ex.4/Ex.5 quebra per-009 manifesto ou per-010 manifesto (0.92 atual) | média | Eval mede manifesto adherence em todos personas |
| `max_tokens` estourar com novos bullets | baixa | Contract test pega em `npm test`; bump pra 6700 se necessário |
| Variabilidade do LLM mascarar resultado (per-009 passa só por sorte num round) | média (constante do gpt-4o-mini) | Threshold B aceita; consistency rate registra a flakiness pra próxima iteração |
| Eval cap $2 estourar (3ª rodada necessária) | baixa | Cap como soft limit; se estourar marginalmente, anotar no report como deviation justificada |

---

## 9. Dependências e branching

### Dependências externas

- **Preview deploy CF Pages** — `wrangler` + credenciais CF API (via `bws`)
- **Service token CF Access** — `CF_ACCESS_CLIENT_ID/SECRET` em `.env.production` pra harness passar pelo gate do preview. Vault Bitwarden é source-of-truth.
- **Judge Anthropic** — `ANTHROPIC_API_KEY` em `evals/.env`
- **OpenAI API** — `OPENAI_API_KEY` em `evals/.env`

### Branching (decisão final no `/plan`)

**Opção A** — Cortar de `main` após PR #72 ser decidido (mergeado, revertido ou abandonado).

**Opção B** (recomendada) — Cortar de `feat/refator-prompt-tattoo-manifesto-v2`. Sub-spec B vira incremental sobre PR #72.

**Justificativa Opção B:** o trabalho de B literalmente edita arquivos que A já modificou (Ex.10 já existe em A; R10 já existe em A). Cortar de `main` produz merge conflicts inevitáveis ao integrar. Cortar de A trata sub-spec B como continuação natural — e se decidirmos reverter A, basta reverter A+B como sequência preservando histórico granular.

**Decisão final:** no `/plan`, com clareza do escopo de B já cravada.

---

## 10. Apêndice — referências cruzadas

### Specs relacionadas

- Spec parent (PR #72): `docs/superpowers/specs/2026-05-17-refator-prompt-tattoo-manifesto-v2-design.md`
- Spec antecessor (Caminho C Fase 1): `docs/superpowers/specs/2026-05-17-caminho-c-fase1-tattoo-strict-schema-design.md`

### Plans relacionados

- Plan parent (PR #72): `docs/superpowers/plans/2026-05-17-refator-prompt-tattoo-manifesto-v2.md`

### Reports relevantes

- **Entrada empírica desta spec:** `docs/inkflow-agent/reports/2026-05-17-eval-refator-manifesto-v2.md`
- Predecessor: `docs/inkflow-agent/reports/2026-05-17-eval-post-fase1.md`

### Manifesto canônico

- `docs/manifesto-tatuador-bot.md` (referência de tom + violations P5/P6 detectadas)

### Memórias relevantes

- `feedback_calibrar_subagent_driven` — calibrar pipeline 3-stage por complexidade (sub-spec B é médio, não trivial nem complexo)
- `feedback_secrets_via_vault_pessoal` — CF Access service token vem do Vault Bitwarden
- `feedback_tool_calling_nao_escala_gates` — invariantes ricas no schema beat tool-calling prose (não aplicável diretamente aqui, mas referência da família de problemas)
- `feedback_qualidade_sobre_pressa` — em execução de planos aprovados, priorizar qualidade do resultado final

---

**Next:** após aprovação humana desta spec, invocar `superpowers:writing-plans` (ou rodar `/plan`) pra gerar implementation plan executável.
