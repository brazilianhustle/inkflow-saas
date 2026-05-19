# Baseline pré Caminho C Fase 2A — Cadastro

**Timestamp:** 2026-05-19T04:22:54Z (primeiro run; corrida total ~11 min, último em 01:33 local)
**Sha base:** 10873b2392cd23d0e43542f8ed25293998eb06d0 (branch `feat/caminho-c-fase2a-cadastro-strict`)
**Cmd:** `node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=cadastro --persona=per-cad-NN` (rodado N=2 pra cada uma das 17 personas)
**Cmd Tattoo regression:** mesmo harness com `--agent=tattoo --persona=per-NNN` para PER-001, PER-009, PER-010.

## Resultados Cadastro (17 personas × N=2 = 34 runs)

| Persona | Run 1 status | Run 2 status | Naturalidade média | Falha (motivo) |
|---|---|---|---|---|
| PER-CAD-01 happy path | FAIL | FAIL | 4.60 | manifesto (P5) / manifesto (P5) |
| PER-CAD-02 recusa email | FAIL | FAIL | 4.50 | manifesto (P2) / manifesto (P2) |
| PER-CAD-03 data DD/MM | FAIL | FAIL | 4.10 | manifesto, state_transition (P2) / naturalidade, manifesto (P2) |
| PER-CAD-04 tudo junto | FAIL | FAIL | 4.60 | manifesto (P2) / manifesto (P2) |
| PER-CAD-05 corrige nome | FAIL | FAIL | 4.80 | manifesto, state_transition (P2) / manifesto, state_transition (P2) |
| PER-CAD-06 muda ideia | FAIL | FAIL | 3.10 | naturalidade, manifesto, state_transition (P2) / naturalidade, manifesto, state_transition |
| PER-CAD-07 pede portfolio | FAIL | FAIL | 5.00 | manifesto (P2) / manifesto (P2) |
| PER-CAD-08 menor idade | FAIL | FAIL | 4.80 | manifesto (P2) / manifesto (P2) |
| PER-CAD-09 data ano-só | FAIL | FAIL | 4.10 | manifesto (P2) / manifesto (P2) |
| PER-CAD-10 data mês extenso | FAIL | FAIL | 4.20 | manifesto, state_transition (P2) / naturalidade, manifesto, state_transition (P2) |
| PER-CAD-11 data ano 2 dígitos | FAIL | FAIL | 3.80 | naturalidade, manifesto (P2) / naturalidade, manifesto (P2) |
| PER-CAD-12 data idade-só | FAIL | FAIL | 5.00 | manifesto (P2) / manifesto, state_transition (P2) |
| PER-CAD-13 pede valor meio | FAIL | FAIL | 4.40 | manifesto, state_transition (P2) / manifesto, state_transition (P2) |
| PER-CAD-14 mãe pela filha | FAIL | FAIL | 4.60 | manifesto, state_transition (P2) / manifesto (P5) |
| PER-CAD-15 indeciso pivoteia | FAIL | FAIL | 3.80 | manifesto (P2) / naturalidade, manifesto, state_transition (P5) |
| PER-CAD-16 ortografia caótica | FAIL | FAIL | 4.30 | manifesto, state_transition (P2) / manifesto (P2) |
| PER-CAD-17 mal-humorado seco | FAIL | FAIL | 4.00 | manifesto, state_transition (P2) / naturalidade, manifesto (P2) |

**HTTP 500 total Cadastro:** 0/34
**Pass total Cadastro (ambos runs):** 0/17

### Distribuição de gates que reprovaram (Cadastro)

- `manifesto`: 34/34 runs
- `state_transition`: 14/34 runs
- `naturalidade`: 8/34 runs

## Regression Tattoo (3 personas × N=2 = 6 runs)

| Persona | Run 1 | Run 2 | HTTP 500 |
|---|---|---|---|
| PER-001 | PASS | FAIL | 0/2 |
| PER-009 | FAIL | FAIL | 0/2 |
| PER-010 | PASS | FAIL | 0/2 |

**Pass Tattoo (ambos runs):** 0/3
**HTTP 500 total Tattoo:** 0/6

## Custo baseline

n/d — harness atual (`evals/inkflow-agent/_harness/run.mjs`) não emite `costUsd`/`tokens` nem no `*.log` nem no `*.json`. Limite alvo: ≤ $0.80 (40 runs × 2 modelos: agent OpenAI + judge Claude Haiku 4.5). Estimativa de ordem-de-grandeza ≈ $0.30-$0.60 dado tamanho médio dos transcripts (~5-9 turnos) e judge Haiku barato; instrumentação de custo fica como follow-up.

## Notas / Padrões observados

### O insight central: 34/34 runs Cadastro falharam o gate `manifesto`

Diferente do esperado (personas base 1-8 passariam e 9-15 falhariam), **TODAS** as 17 personas Cadastro reprovaram nos dois runs. A causa-raiz é estrutural, não de borda:

- **Padrão dominante: P2 violation** — em ~30/34 runs o juiz acusou o CadastroAgent de "fazer handoff sem coletar os 4 OBR obrigatórios (descricao_curta, local_corpo, altura_cm, estilo)". O Manifesto exige que esses 4 dados de tatuagem sejam coletados antes do handoff, mas o CadastroAgent atual coleta apenas dados administrativos (nome, data_nascimento, e-mail) e despacha pro tatuador.
- Isso aparece como discrepância de escopo entre Cadastro e Tattoo: o juiz aplica o mesmo Manifesto aos dois agentes, e o agente de Cadastro literalmente não foi desenhado pra coletar os 4 OBR de tatuagem — eles ficam pro fluxo do Tattoo. Resultado: 100% de falha por gate cruzado.
- **Padrão secundário: P5 (validação antes de coletar)** — ~5 runs (per-cad-01 r2, 06 r1/r2, 14 r2, 10 r2) violam P5: bot pede dado pessoal "sem validar a ideia da tatuagem em 1 frase antes". Reforça o ponto anterior — o Cadastro pula a etapa criativa do Manifesto.
- **Padrão terciário: `state_transition`** — ~14/34 runs falharam também esse gate (handoff pra estado errado, ou handoff prematuro). Correlaciona com P2 porque sem os 4 OBR o handoff é "incompleto" estruturalmente.

### Personas base (1-8): FALHA também (não esperado)

A premissa do brainstorm 18/05 era que personas 1-8 passariam e 9-17 falhariam. Realidade: **todas falham**. Isso indica que o problema não é "decisões 5/6/7 não-aplicadas" nem "regras de data faltando" — o problema é mais profundo: **o juiz/Manifesto trata Cadastro e Tattoo como mesmo escopo de OBR**, e a refatoração precisa ou (a) separar Manifesto por agente, ou (b) fazer o CadastroAgent realmente coletar os 4 OBR, ou (c) ajustar o juiz pra reconhecer escopo Cadastro vs Tattoo.

### Personas 9-15 (data e meio): falha confirmada, mas pelo motivo "errado"

Falharam, mas a violação predominante é P2 (mesma da base) — não a regra de data ou as decisões #5/#6/#7. Significa que o gate principal está mascarando os problemas específicos esperados. Pós-refator, esses motivos secundários devem aflorar.

### Personas 16-17 (estresse linguístico/tonal): falha por P2 também

Mesmo padrão. Naturalidade média baixa (3.6-4.4) em alguns runs mas não foi gate decisivo — manifesto reprova antes.

### Regression Tattoo: 0/3 personas passam ambos runs

- PER-001: r1 PASS / r2 FAIL (naturalidade caiu de 4.0 → 3.8, abaixo de 4.0)
- PER-009: r1 FAIL / r2 FAIL — P2 (não coletou estilo após cliente mudar de ideia)
- PER-010: r1 PASS / r2 FAIL — P1 (msg 9: bot confrontou contradição "rosa pequena vs 25cm" sem pedir confirmação)

Isso é um **regression** vs PR #33 (smoke E2E PASS). Indica que ou (a) baseline tem flakiness N=2 já visível, ou (b) algo regredeu entre PR #33 e o SHA atual. Vale verificar no relatório pós-refator se Tattoo volta pra rebaseline pós-Sub1c (`2026-05-17-tattoo-rebaseline-post-sub1c.md`).

### HTTP 500: 0/34 Cadastro, 0/6 Tattoo

Zero HTTP 500 detectado em todos os 40 runs. Sistema estável em produção (`inkflowbrasil.com`) durante a janela de teste. Sem necessidade de re-execução por instabilidade.

### Custo

Harness não emite custo. Follow-up: instrumentar `evals/inkflow-agent/_harness/run.mjs` para capturar `response.usage` do OpenAI agent + Anthropic judge e emitir `costUsd` no `report.json` (issue separada — fora do escopo desta task).
