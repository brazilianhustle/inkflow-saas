# Fix Eval Instrumentation — Spec/Design

**Data:** 2026-05-18
**Autor:** Leandro (via brainstorm com Claude)
**Tipo:** Reforma cirúrgica de instrumentação (não-feature)
**Predecessor:** `docs/inkflow-agent/reports/2026-05-18-eval-sub-spec-b-pivot-naturalidade.md` (sub-spec B DoD FAIL — 3/6 fails identificados como bug do judge ou variância)
**Branch alvo:** `feat/fix-eval-instrumentation` cortada de **main** (PR final → main)
**Status:** Approved design — ready para `/plan`

---

## 1. Contexto e motivação

Três sub-specs consecutivas de prompt-tuning (Sub 1.C / PR #70, sub-spec A / PR #72, sub-spec B) terminaram em DoD FAIL. A leitura do eval da sub-spec B revelou que **3 dos 6 fails são bug do judge ou variância**, não problemas do prompt:

| Fail | Causa real |
|---|---|
| per-001 R1 nat 3.6 (vs R2 nat 4.8 mesmo prompt) | Variância LLM gigante (Δ +1.2 entre rounds idênticos) |
| per-001 R2 state_transition=0 ("faltou tamanho_cm") | Judge bug — `tamanho_cm` é OPCIONAL, não deve bloquear handoff |
| per-010 R1+R2 P2 manifesto fail ("faltou tamanho_cm") | Mesmo judge bug recorrente |

Continuar iterando prompt em cima de instrumento que tem **(a) bug sistêmico de interpretação** e **(b) variância da mesma ordem das mudanças que queremos detectar** = decidir em cima de ruído.

**Estratégia:** parar e consertar a medição antes da próxima rodada de prompt-tuning. Se essa reforma cirúrgica não bastar pra cravar DoD desta sub-spec, escala pra reforma metodológica completa (test cases ouro labeled manualmente, dashboards de tracking, review de todos 3 judge prompts) — regra de escalation explicitada pelo Leandro durante o brainstorm.

---

## 2. Goal + non-goals

**Goal:** entregar um eval harness onde duas rodadas com prompt cravado dão nat dentro de ±0.3 e zero falso-positivo `tamanho_cm` em 15 runs, pra que sub-specs C futuras tenham instrumento confiável.

**Non-goals (YAGNI):**
- NÃO escrever testes ouro labeled manualmente (Opção 3 escopo — reforma completa)
- NÃO criar dashboards de tracking (Opção 3 escopo)
- NÃO mudar default `JUDGE_MODEL` pra sonnet (decisão pra sub-spec futura baseada em spike informativo desta)
- NÃO pinar seed do prompt (próximo nível se temp=0 não bastar)
- NÃO re-avaliar branches sub-spec A ou B com novo instrumento aqui (esse é trabalho de sub-spec C separada após esta)

---

## 3. Arquitetura

### Branch strategy

- Cut `feat/fix-eval-instrumentation` de **main** (NÃO de sub-spec A ou B — ambos são experimentos preservados como evidência mas com prompt experimental que poderia confundir o baseline)
- Baseline N=5 roda contra preview deploy de **main + os fixes desta sub-spec**, que vira o novo "current state" mensurável
- PR final mira `main`

### Pontos de mudança

| Camada | Arquivo | Mudança |
|---|---|---|
| Judge prompt | `evals/inkflow-agent/_harness/judge-prompts/manifesto-adherence.txt` | Hardener P2 contra `tamanho_cm` — emphasis explícito + 2 exemplos contra-factuais |
| Judge runtime | `evals/inkflow-agent/_harness/run.mjs` | Pin `temperature: 0` na chamada Anthropic; env var `JUDGE_MODEL` pra trocar modelo (haiku/sonnet) |
| Bot runtime | `functions/_lib/agent-runtime/runtime.js` | Pin `temperature: 0` na chamada OpenAI Responses, gated por `EVAL_MODE` env |
| Harness loop | novo `evals/inkflow-agent/_harness/run-baseline.sh` | Wrapper que roda N×3 personas, salva reports individuais |
| Variance helper | novo `evals/inkflow-agent/_harness/compute-variance.mjs` | Agrega 15 reports → per-persona min/max/range/média/violations |
| Report | `docs/inkflow-agent/reports/2026-05-18-eval-instrumentation-baseline.md` | Output baseline + DoD validation |

### Por que pinar temperature em DOIS lugares

- Bot side (OpenAI Responses via `runtime.js`): bot gera respostas que variam per turn. Diferenças de geração propagam pra eval.
- Judge side (Anthropic via `run.mjs`): judge avalia a conversa gerada. Mesmo input pode receber scores diferentes entre rodadas.

Ambos contribuem pra ±1.2 vista no per-001. Pinar só um lado não resolve. Custo: zero (parâmetro de API, sem cost increase).

### Gate `EVAL_MODE` no bot runtime

`runtime.js` lê `EVAL_MODE` env var:
- Se `'true'` → `temperature: 0` no payload OpenAI Responses
- Se ausente/qualquer outro valor → `temperature: undefined` (deixa OpenAI usar default atual, comportamento de produção preservado)

Preview deploy desta sub-spec terá `EVAL_MODE=true` setado via `wrangler secret put` ou `.dev.vars`. Prod NUNCA recebe essa secret — comportamento de produção fica intocado.

---

## 4. Deliverables detalhados

### D1: Hardener judge-prompt manifesto

Edit `evals/inkflow-agent/_harness/judge-prompts/manifesto-adherence.txt` linhas 6-7.

**Old:**
```
P2 — Coletar 4 OBR: descricao_curta, local_corpo, altura_cm, estilo. tamanho_cm opcional.
Bot que pede tamanho_cm como obrigatório ou ignora um dos 4 OBR VIOLA P2.
```

**New:**
```
P2 — Coletar 4 OBR: descricao_curta, local_corpo, altura_cm, estilo. tamanho_cm OPCIONAL.

**ATENÇÃO CRÍTICA:** tamanho_cm NUNCA reduz score P2. Bot pode fazer handoff sem
tamanho_cm — é comportamento CORRETO. Só conte P2 violation se:
(a) faltar um dos 4 OBR REAIS (descricao_curta, local_corpo, altura_cm, estilo) ao
fazer handoff, OU
(b) bot PEDIR tamanho_cm proativamente como obrigatório.

Exemplo P2=1.0 (correto): bot coletou descrição + local + altura + estilo, fez handoff
sem mencionar tamanho_cm. ✅
Exemplo P2=0.5 (parcial): bot pulou pergunta de estilo e fez handoff. ❌
Exemplo P2=0.0 (violação): bot perguntou "qual o tamanho exato em cm?" sem foto. ❌

NÃO conte como P2 violation: "bot fez handoff sem tamanho_cm" — esse é fluxo válido.
```

### D2: Pin temperature judge + env var modelo

Em `evals/inkflow-agent/_harness/run.mjs`, na chamada Anthropic atual:
- Adicionar `temperature: 0`
- Trocar `model: 'claude-haiku-4-5-20251001'` por `model: process.env.JUDGE_MODEL || 'claude-haiku-4-5-20251001'`

Compatível: sem env var explícita, mantém comportamento atual.

### D3: Pin bot temperature via EVAL_MODE

Em `functions/_lib/agent-runtime/runtime.js`, no call `client.responses.parse()`:
```js
temperature: process.env.EVAL_MODE === 'true' ? 0 : undefined
```

`undefined` deixa OpenAI usar default. Em preview deploy, setar `EVAL_MODE = "true"` como secret. Prod não tem essa env → comportamento intocado.

### D4: Baseline script + variance computation

Novo `evals/inkflow-agent/_harness/run-baseline.sh`:
```bash
#!/usr/bin/env bash
# Roda N rounds × 3 personas (per-001/per-009/per-010), salva cada report
# individualmente em /tmp/eval-baseline/ + computa variance.
# Uso: ./run-baseline.sh <BASE_URL> [N=5]
set -euo pipefail
BASE_URL="$1"; N="${2:-5}"
OUT_DIR="${OUT_DIR:-/tmp/eval-baseline}"
mkdir -p "$OUT_DIR"
for persona in per-001 per-009 per-010; do
  for i in $(seq 1 "$N"); do
    echo "==> $persona round $i/$N"
    BASE_URL="$BASE_URL" node --env-file=evals/.env \
      evals/inkflow-agent/_harness/run.mjs \
      --category=directed --agent=tattoo --persona="$persona"
    cp evals/inkflow-agent/report.json "$OUT_DIR/${persona}-r${i}.json"
  done
done
node evals/inkflow-agent/_harness/compute-variance.mjs "$OUT_DIR"
```

Novo `evals/inkflow-agent/_harness/compute-variance.mjs`:
- Lê todos `.json` do diretório passado
- Agrupa por persona
- Per persona computa: nat (min/max/range/média/std), manifesto (min/max/range/média/std), state_pass_rate, lista de violations citando "tamanho_cm"
- Output JSON estruturado em stdout + grava `<dir>/aggregate.json`

### D5 (spike informativo): Sonnet judge experiment

Reusa `run-baseline.sh` com `JUDGE_MODEL=claude-sonnet-4-6-20251001` e N=3, só per-001:
```bash
JUDGE_MODEL=claude-sonnet-4-6-20251001 OUT_DIR=/tmp/eval-baseline-sonnet \
  ./evals/inkflow-agent/_harness/run-baseline.sh "$PREVIEW_URL" 3
```

Compara range nat sonnet (3 rounds) vs range nat haiku (5 rounds) no mesmo persona. Informativo: se sonnet range ≤ 50% do haiku range → forte indicação de upgrade pra sub-specs futuras. Senão, datapoint registrado pra decisão posterior.

---

## 5. DoD — 5 critérios

| # | Critério | Como medir | Threshold |
|---|---|---|---|
| 1 | **Variância nat per-persona limitada** | `max(nat) - min(nat)` em 5 rounds, por persona | ≤ 0.6 (= ±0.3 da média) em todas as 3 personas |
| 2 | **Zero falso-positivo tamanho_cm** | grep "tamanho_cm" nas `violations` dos 15 reports onde os 4 OBR foram coletados | 0 matches |
| 3 | **Bot temperature pin não quebra prod** | grep `EVAL_MODE` em runtime.js confirma gate; 1 call manual ao preview sem EVAL_MODE responde 200 igual a prod | manual smoke OK |
| 4 | **Suite local mantém 450/450** | `npm test` | 450/450 PASS |
| 5 | **Spike sonnet documentado** | range nat sonnet (3 rounds per-001) vs range nat haiku (5 rounds per-001) | datapoint pro report, NÃO bloqueia DoD |

### Path se falhar

- **#1 FAIL (variância > 0.6 mesmo com temp=0):** documentar como evidência de que prompt-tuning precisa N maior pra detectar efeitos pequenos. Próxima sub-spec vira "Reforma metodológica completa" (Opção 3 do trigger de escalation).
- **#2 FAIL:** hardener foi insuficiente. Adicionar mais exemplos OU subir judge pra sonnet por default (decisão informada pelo spike #5).
- **#3 FAIL:** revisar gate `EVAL_MODE` — provavelmente env var não está sendo lida no edge runtime CF Workers. Pode precisar feature flag via `wrangler.toml` build vars em vez de env runtime.
- **#4 FAIL:** bug introduzido por mudança no runtime.js. Bissecting commit por commit.

### Custo previsto

- D1+D2+D3: zero custo (edits)
- D4 baseline N=5 × 3 personas = 15 runs × ~$0.05 = **~$0.75**
- D5 spike sonnet N=3 per-001 = 3 runs × ~$0.10 (sonnet 5x mais caro) = **~$0.30**
- **Total: ~$1.05.** Bem dentro do cap $2.

---

## 6. Riscos + mitigações

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `temperature: 0` no edge runtime (CF Workers) não suportado/bug específico | Baixa | Spike rápido pre-baseline: deploy preview com EVAL_MODE=true, 1 call manual, ver response. Se quebrar, fallback `temperature: 0.1` |
| Pin temp=0 muda bot suficiente pra invalidar comparações futuras sem pin | Média | Aceitar: baseline EVAL_MODE define o "ponto de comparação". Sub-specs futuros DEVEM rodar com EVAL_MODE=true também. Documentar no runbook |
| Sonnet judge em 3 rounds não dá amostra suficiente pra conclusão estatística | Alta (esperada) | Tratar como sinal direcional, não decisivo. Se sonnet range ≤ 50% do haiku range → forte indicação de upgrade. Senão, dado registrado pra sub-spec futura |
| Hardener P2 anti-tamanho_cm reduz sensibilidade do judge a P2 violations reais | Baixa | Os 2 exemplos contra-factuais explicitam casos válidos. Per-009 tem P2 fail real (bot pula `estilo`) — se per-009 P2 violation sumir nos baselines = sinal de over-correction |
| Variância inerente da simulação (personas geram inputs diferentes round a round) | Média | Persona file é fixo (cada round usa mesma sequência de mensagens). Variância vem só da geração LLM. Se isso ainda não basta, sub-spec futura pode pinar seed também |

---

## 7. Integração + ordem dos commits

1. Branch cut + plan commit
2. Edit judge-prompt (D1) → snapshot test passa local
3. Edit run.mjs (D2) + runtime.js (D3) → suite local 450/450
4. Add run-baseline.sh + compute-variance.mjs (D4 infra)
5. Deploy preview com EVAL_MODE=true secret
6. Spike pré-baseline: 1 call manual ao preview pra confirmar EVAL_MODE não quebrou (Risco #1)
7. Rodar baseline N=5 × 3 personas → 15 reports
8. Rodar spike sonnet N=3 per-001 → 3 reports
9. Compute variance + write report
10. Validar DoD #1-#5
11. Se PASS: PR pra main. Se FAIL: documentar + escalation pra Opção 3

### Dependências externas

- Wrangler secret `EVAL_MODE` setado no preview deploy (não em prod) — via `wrangler pages secret put EVAL_MODE --project-name inkflow-saas` ou dashboard CF (verificar mecanismo correto pra preview-specific secret)
- `JUDGE_MODEL` env var no .env do harness ou inline na chamada do spike sonnet
- Credenciais CF API via `feedback_secrets_via_vault_pessoal` (Vault pessoal Bitwarden, fluxo Vault → .env.production → sync-secrets.sh)

---

## 8. Próxima sub-spec após esta

Se DoD PASS: a próxima sub-spec C (escolha entre C.1 playbook §4.7 pós-pivot, C.3 audit tom per-010, ou outra) roda contra o instrumento novo. Pode incluir:
- Re-avaliar branches sub-spec A (PR #72) e sub-spec B com instrumento novo pra ter leitura real de quanto a regressão observada era ruído
- Aplicar próxima frente de prompt-tuning (provavelmente C.1)

Se DoD FAIL: escala pra Opção 3 — reforma metodológica completa (test cases ouro, dashboards, review dos 3 judge prompts).

---

## 9. Cross-references

- Spec sub-spec B: `docs/superpowers/specs/2026-05-18-sub-spec-b-tattoo-pivot-naturalidade-design.md`
- Report sub-spec B (origem deste fix): `docs/inkflow-agent/reports/2026-05-18-eval-sub-spec-b-pivot-naturalidade.md`
- Spec sub-spec A (PR #72): `docs/superpowers/specs/2026-05-17-refator-prompt-tattoo-manifesto-v2-design.md`
- Memory: `[[feedback_secrets_via_vault_pessoal]]`, `[[feedback_qualidade_sobre_pressa]]`, `[[bws_setup]]`
