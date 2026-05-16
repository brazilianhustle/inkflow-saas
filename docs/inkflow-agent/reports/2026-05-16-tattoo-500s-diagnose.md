# TattooAgent — Diagnose 500s 2026-05-16

**Contexto**: Sub 1.B Fase A. Baseline 2026-05-15 reportou ERROR HTTP 500 em PER-009 e PER-010. Captura via flag `--capture-500-body` introduzida no Task 1 (commit `96096d9`).

**Runs**: 3 por persona × 3 personas = 9 runs. Artefatos crus em `./2026-05-16-tattoo-500s-diagnose/`.

**Eval harness:** `evals/inkflow-agent/_harness/run.mjs`
**Base URL:** `https://inkflowbrasil.com`
**Tenant:** InkFlow Sub4 Test (`plano=individual`)
**Rodado em:** 2026-05-16 ~01:21-01:25 BRT (208s total)

---

## Reprodução

| Persona | Run 1 | Run 2 | Run 3 | Determinismo |
|---|---|---|---|---|
| PER-001 (happy path) | **HTTP 500** | **HTTP 500** | fail (nat 3.4 / manif 0.83) | 2/3 erram → **NÃO-DETERMINÍSTICO** |
| PER-009 (muda decisão) | **HTTP 500** | fail (nat 3.6 / manif 0.58) | fail (nat 3.8 / manif 0.67) | 1/3 erra → **NÃO-DETERMINÍSTICO** |
| PER-010 (conflito tamanho) | fail (nat 4.0 / manif 0.58) | fail (nat 3.6 / manif 0.67) | fail (nat 3.6 / manif 0.83) | 0/3 erra **nesta rodada** — mas reproduziu 500 no smoke (Task 1 step 1.4, ~01:08 BRT) |

**Total**: 3/9 runs deram HTTP 500 (33%). Mais 1 caso no smoke (PER-010 step 1.4) que não conta na tabela acima.

**Conclusão sobre determinismo**: 500s são **flaky**, não determinísticos. Reaparecem em personas diferentes (incluindo PER-001 happy path, que NÃO tinha 500 no baseline 2026-05-15). Mesma persona pode dar 500 num run e completar no próximo.

---

## Causa raiz — TODAS as 500s na MESMA invariante

**Todos os 3 500s capturados** (+ o smoke) caem na **branch 3** do `validateTattooOutputInvariant` (`functions/api/agent/agents/tattoo.js:101-108`):

```javascript
if (out.proxima_acao === 'pergunta') {
  const faltando = Array.isArray(out.campos_faltando) ? out.campos_faltando : [];
  if (faltando.length > 0 && typeof out.resposta_cliente === 'string' && !out.resposta_cliente.includes('?')) {
    return {
      valid: false,
      reason: `pergunta com campos_faltando=[${faltando.join(',')}] mas resposta sem '?' — fragment="${out.resposta_cliente.slice(0, 80)}"`,
    };
  }
}
```

### Bodies capturados

| Run | Turn | Cliente disse | `campos_faltando` | `resposta_cliente` (fragmento) |
|---|---|---|---|---|
| PER-001 run1 | 2 | "no antebraço" | `[altura_cm]` | `"No antebraço"` |
| PER-001 run2 | 3 | "1.65m" | `[estilo]` | `"Anotei: rosinha fineline no antebraço, altura 165cm"` |
| PER-009 run1 | 2 | "no antebraço" | `[altura_cm]` | `"Top! Rosa fineline no antebraço."` |
| PER-010 smoke (step 1.4) | 4 | "1.65m" | `[foto_local]` | `"Rosa fineline no antebraço fica delicada e bem visível\n\nPra liberar teu orcament"` |

### Padrão

**NÃO é truncamento de `max_tokens`** — as respostas estão semanticamente completas em 3 dos 4 casos (`"No antebraço"`, `"Anotei: rosinha fineline no antebraço, altura 165cm"`, `"Top! Rosa fineline no antebraço."`). O único que parece truncado é o do smoke (`"Pra liberar teu orcament"`), mas mesmo nele a parte declarativa que veio antes já estava completa.

**É erro de coordenação entre decisão estrutural e geração de texto**:
- O modelo (gpt-4o-mini) emite no JSON: `proxima_acao=pergunta`, `campos_faltando=[X]` (decisão correta — sabe que precisa perguntar X)
- Mas o `resposta_cliente` gerado **só confirma/parafraseia o que o cliente acabou de dizer** (frase declarativa sem `?`)
- A pergunta pelo próximo campo (`altura_cm`, `estilo`, `foto_local`) **some**

A invariante detecta a incoerência e rejeita com 500 antes de mandar resposta meia-boca pro cliente.

---

## Categorização final

- [x] **tattoo-only** — vai pra Task 3a
- [ ] cross-cutting — vai pra Task 3b (escape hatch)

**Justificativa:**
1. Validator é específico do TattooAgent (`functions/api/agent/agents/tattoo.js`), não de camada compartilhada (`route.js`).
2. Invariante está semanticamente correta — se proxima_acao diz "pergunta" e o texto não pergunta, é bug do modelo, não da regra. Não há motivo pra relaxar a invariante.
3. Causa raiz é prompt-shaped: o modelo precisa ser disciplinado em fazer a pergunta no texto quando decide perguntar estruturalmente.
4. Os campos envolvidos (`altura_cm`, `estilo`, `foto_local`) são todos OBRs do TattooAgent — escopo 100% do agente.
5. Outros agents (Cadastro, Proposta, Portfolio) não têm essa invariante específica, então não há vetor cross-cutting.

---

## Plano da Fase B (Task 3a)

**Arquivo principal alvo**: `functions/_lib/prompts/coleta/tattoo/decisao.js` (regras R1-R8, §4.x)
**Arquivo secundário**: `functions/_lib/prompts/coleta/tattoo/exemplos.js` (few-shots)
**NÃO mexer em**: `functions/api/agent/agents/tattoo.js` (validator está correto)

**Mudança proposta** (mínima viável):
1. **Em `decisao.js`** — adicionar regra explícita do tipo:
   > **R-X (acoplamento decisão↔texto):** Se `proxima_acao = "pergunta"` E `campos_faltando.length > 0`, então `resposta_cliente` DEVE conter a pergunta direta pelo PRIMEIRO campo de `campos_faltando` (forma interrogativa terminando em `?`). Confirmar/parafrasear o input do cliente sozinho NÃO satisfaz a regra — a pergunta de follow-up precisa estar lá.

2. **Em `exemplos.js`** — adicionar few-shot novo cobrindo o cenário "cliente acabou de responder UM campo, bot confirma + pergunta o próximo":
   - Cliente: "1.65m"
   - Bot deve responder: "Anotei, 165cm. E qual estilo você curte mais — fineline, blackwork, realismo?" (NÃO só "Anotei, 165cm.")

**Cap rígido**: 3 iterações no Task 3a. Se na 3ª ainda há 500 em re-rodada (PER-001/009/010 × 1), escala pra Task 3b.

---

## Observações colaterais (não bloqueiam Gate A→B mas merecem nota)

### Regressão de qualidade global

Mesmo nos runs que completam (sem 500), há regressão clara vs baseline 2026-05-15:

| Persona | Baseline 2026-05-15 (nat / manif) | Agora 2026-05-16 (média dos completes) |
|---|---|---|
| PER-001 | 4.0 / alto (3.4 nat por outro)¹ | 3.4 / 0.83 |
| PER-009 | n/d (era 500) | 3.7 / 0.625 |
| PER-010 | n/d (era 500) | 3.7 / 0.69 |

¹ memory cita `feedback_workflow` baseline; ver `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md` pra números canônicos.

Sem código mudou entre 2026-05-15 e 2026-05-16 (só adicionei flag de captura no Task 1, que não altera prompt nem lógica). Hipóteses:
- Flake estocástico do gpt-4o-mini (modelo varia entre runs)
- Algum deploy/config-change no ambiente prod entre os dias (a confirmar com `gh run list`)
- Drift de prompt cumulativo se baseline Sub 1.A foi medida com `temperature` diferente

**Isso é input pra Task 4 (FM selection)** — quando rodar o `npm run inkflow-agent:baseline` pós-fix-reliability, os scores reais vão decidir quais FMs ainda doem empiricamente. Não trata aqui.

### state=None nos scores antigos vs s1 agora

Inspeção inicial dos JSONs mostrou `state=None`, mas o objeto real do score state usa `s1` (não `s1_consistencia_estado` como achei). Score state estava OK em todos os runs completos (`s1: 1`). Falso alarme do parsing — vale ajustar futuros scripts de inspeção.

---

## Artefatos

- `./2026-05-16-tattoo-500s-diagnose/per-001-run1.json` — HTTP 500
- `./2026-05-16-tattoo-500s-diagnose/per-001-run2.json` — HTTP 500
- `./2026-05-16-tattoo-500s-diagnose/per-001-run3.json` — fail (nat 3.4 / manif 0.83)
- `./2026-05-16-tattoo-500s-diagnose/per-009-run1.json` — HTTP 500
- `./2026-05-16-tattoo-500s-diagnose/per-009-run2.json` — fail (nat 3.6 / manif 0.58)
- `./2026-05-16-tattoo-500s-diagnose/per-009-run3.json` — fail (nat 3.8 / manif 0.67)
- `./2026-05-16-tattoo-500s-diagnose/per-010-run1.json` — fail (nat 4.0 / manif 0.58)
- `./2026-05-16-tattoo-500s-diagnose/per-010-run2.json` — fail (nat 3.6 / manif 0.67)
- `./2026-05-16-tattoo-500s-diagnose/per-010-run3.json` — fail (nat 3.6 / manif 0.83)

---

## Gate A→B

✅ Hipótese de causa raiz documentada
✅ Categorização: **tattoo-only**
✅ Próxima task: **Task 3a** (Reliability fix tattoo-only)

NÃO executar Task 3b (cross-cutting escape hatch).
