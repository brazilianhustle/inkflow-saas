# TattooAgent — Sub 1.B FM Selection 2026-05-16

**Contexto**: Sub 1.B Fase C. Gate B→C fechado em `18a48a9` (R9 + Exemplo 9). Esta task cruza reprodução empírica (baseline pós-fix) × audit Sub 1.A × cobertura prompt × persona pra escolher até 3 FMs em escopo + 0-2 evals novos. Próximo gate (C→D) é aprovação humana explícita.

**Inputs:**
- `docs/inkflow-agent/reports/2026-05-15-tattoo-audit-baseline.md` (audit Sub 1.A)
- `docs/inkflow-agent/reports/2026-05-15-tattoo-baseline.md` (regenerado 2026-05-16 contra preview com R9 ativo)
- `docs/inkflow-agent/failures/INDEX.md` (12 FMs, 9 open / 2 mitigated / 1 fixed)
- Resultados das re-rodadas Task 3a (1 run cada PER-001/009/010 + 1 baseline + 1 re-run PER-010)

**Baseline pós-R9 — número canônico** (1 run, 2026-05-16T05:24Z):

| Persona | Status | Nat | Manif | State | Notas |
|---|---|---|---|---|---|
| PER-001 happy-path | FAIL | 3.8 | 0.83 | 1 | Repete pergunta idêntica msg 5; confunde 1.65m com altura sem clarificar |
| PER-009 muda-decisao | FAIL | 3.6 | 0.67 | **0** | P2/P5/P6 violados; não entra em modo consultor; não valida mudança rosa→leão |
| PER-010 conflito-tamanho | ERROR (500) | — | — | — | Flake — re-run imediato completou (nat 3.8 / manif 0.67). 500 reduziu de ~33% (Task 2) pra ~33% (mais runs precisam pra confirmar) |

**Comparação vs baseline Sub 1.A (2026-05-15):**

| Persona | Sub 1.A | Sub 1.B (pós-R9) | Δ |
|---|---|---|---|
| PER-001 | nat 4.0 / pass | nat 3.8 / fail | Regressão leve em nat. Novo violation (FM-0005) detectado pelo juiz Haiku 4.5 — pode ser ruído de calibração entre dias |
| PER-009 | ERROR 500 | nat 3.6 / manif 0.67 / state=0 | Eliminou 500 ✅. Scores baixos esperados — FMs cravados |
| PER-010 | ERROR 500 | ERROR 500 (1 ocorrência) / nat 3.8 (re-run) | 500 ainda aparece em flake. R9 reduziu mas não eliminou. Discussão no §FMs em escopo |

---

## §1 Tabela cruzada: candidatos pra Sub 1.B

| FM | Audit Sub 1.A | Baseline pós-R9 | Persona coberta? | Audit priority | Status atual | Reprodução? |
|---|---|---|---|---|---|---|
| FM-0001 modo-consultor | TOP 3 (parcial) | ✅ PER-009 msg 6-7 (P6 violado) | PER-009 (parcial) / PER-002 (dedicada — não existe) | Alta | open | **Empírica** |
| FM-0004 coverup-foto | Gap de produto | NÃO testável (sem PER-004) | PER-004 ausente | Média | open | Não testado |
| FM-0005 repergunta | NÃO no top-3 | ✅ PER-001 msg 5 — descoberta NOVA | PER-001 ✅ | Re-priorizada | open | **Empírica** |
| FM-0008 cliente vago | Médio | NÃO testável (sem PER-008) | PER-008 ausente | Média | open | Não testado |
| FM-0009 muda-decisao | "pode estar OK" | ✅ PER-009 msg 7 (P5 violado) | PER-009 ✅ | Alta | open | **Empírica** |
| FM-0011 frio emocional | TOP 3 | NÃO testável (sem PER-012) | PER-012 ausente | Alta | open | Não testado |
| FM-0012 estilo indisp | TOP 3 | NÃO testável (sem PER-014 + injeção schema) | PER-014 ausente | Alta | open | Não testado |

**FMs já fechados (mitigated/fixed) — NÃO entram:** FM-0003, FM-0007, FM-0010.
**FMs de outros agents:** FM-0002, FM-0006 (PropostaAgent).

---

## §2 FMs em escopo final (3)

### #1 — FM-0005 (repergunta info já dada) — **NOVO no top-3**

- **Por quê:** descoberta empírica do baseline pós-R9. Reproduz em PER-001 (happy path) — afeta o caminho mais comum. Audit Sub 1.A subestimou (não estava no top-3) porque sugeria cobertura indireta via §2 CONTEXTO ser suficiente — baseline mostra que NÃO é.
- **Evidência:** PER-001 msg 5 — bot repete pergunta idêntica de msg 3 sobre local após cliente já ter respondido "no antebraço" em msg 4. Score nat 3.8, manif 0.83.
- **Persona usada:** PER-001 (já existe — `evals/inkflow-agent/directed/tattoo/per-001/01-happy-path.json`).
- **Plano de fix (Task 5):** regra positiva em `decisao.js` "antes de perguntar campo X, verifique `dados_persistidos.X` — se preenchido E não-vazio, NÃO repergunte; passe pro próximo campo faltando" + few-shot novo em `exemplos.js` mostrando bot recebendo info parcial em msg cliente e reconhecendo na confirmação ("já anotei antebraço, agora qual estilo?"). Cap 3 iterações.

### #2 — FM-0009 (muda decisão) — confirmado contra previsão do audit

- **Por quê:** audit Sub 1.A predisse "pode estar OK no prompt atual — eval real em Phase 1 valida". **Não estava OK** — baseline mostrou bot lidando mal com mudança radical (rosa → leão). Reproduz determinístico em PER-009.
- **Evidência:** PER-009 msg 7 — cliente troca tema (rosa → leão) e bot responde "Anotei a mudança" genérico sem validar a ideia em 1 frase substantiva. Manifesto P5 violado (não valida ideia ao receber input). Score state=0 (transição inconsistente).
- **Persona usada:** PER-009 (já existe — `evals/inkflow-agent/directed/tattoo/per-009/01-muda-decisao.json`).
- **Plano de fix (Task 5):** regra em `decisao.js` cobrindo overwrite em `dados_persistidos` quando cliente sinaliza substituição ("esquece X, é Y" / "ah não, prefiro Y") + few-shot em `exemplos.js` mostrando bot validando substantivamente a nova ideia ("leão realismo no antebraço fica imponente — bom espaço pra detalhe") antes de re-coletar OBRs. Cap 3 iterações.

### #3 — FM-0001 (modo consultor não acionado em turn 3+) — confirma audit top-3

- **Por quê:** audit Sub 1.A predisse top-3 com gap "janela 1-2 turnos cravada não cobre indecisão tardia". Baseline confirmou — PER-009 sinaliza indecisão emergente no msg 6-7 (mudança radical = sinal de indecisão) e bot continua em modo COLETOR rígido.
- **Evidência:** PER-009 msg 6-7 — P6 violado (bot não reconhece indecisão emergente). Compartilha persona com FM-0009 mas dimensão diferente (FM-0009 = como lidar com substituição; FM-0001 = quando mudar de modo).
- **Persona usada:** PER-009 (cobertura parcial — ideal seria PER-002 dedicada, mas cap de evals novos = 2 e priorizando outros FMs).
- **Plano de fix (Task 5):** ampliar §4.6 em `decisao.js` — remover âncora "primeiros 1-2 turnos", adicionar gatilhos de indecisão emergente (mudança radical de decisão como sinal, frases tipo "to em dúvida", "na real não sei"). Possivelmente few-shot pra reforçar. Cap 3 iterações.

---

## §3 FMs fora de escopo nesta sub

### Excluídos por falta de eval (cap 2 evals novos consumido = 0)

- **FM-0011 (bot frio emocional)** — audit top-3 mas requer PER-012 nova. Defer pra Sub 1.C.
- **FM-0012 (estilo indisponível)** — audit top-3 mas requer (a) PER-014 nova, (b) injeção de `tenant.config_agente.estilos_oferecidos` em §2 CONTEXTO (`functions/_lib/prompts/coleta/tattoo/contexto.js`) — mudança de contrato/schema fora do "só prompt" da Sub 1.B. Defer pra Sub 1.C/1.D.
- **FM-0008 (cliente vago)** — sem evidência empírica + sem PER-008. Defer.
- **FM-0004 (coverup foto)** — gap de produto (decisão se erro seco é OK ou exige foto). Não é puro fix de prompt. Defer.

### Justificativa de NÃO criar eval novo nesta sub

Cap do plano é 2 evals novos. Os 3 FMs escolhidos (FM-0005, FM-0009, FM-0001) **todos** reproduzem nas personas já existentes (PER-001, PER-009). Criar PER-012/PER-014 só faz sentido se um dos FMs deles entrar em escopo — não é o caso aqui (audit top-3 + ausência de eval + ausência de cobertura prompt sugere que esses FMs precisam de mais infraestrutura, não só prompt edit).

---

## §4 Issue residual: PER-010 ainda dá HTTP 500 (~33% flake)

R9 reduziu 500s materialmente (PER-001 e PER-009 100% completos pós-fix nas re-rodadas) mas **PER-010 ainda apresenta 500 em ~1 de cada 3 runs** (baseline 1 desta sessão deu 500, re-run completou). Padrão observado no smoke (Task 1.4): `campos_faltando=[foto_local]` com resposta sendo mensagem-ponte handoff truncada — sinaliza que o modelo está colocando `foto_local` em `campos_faltando` mesmo quando deveria emitir handoff (linha 8 da tabela §4.1) com 4 OBRs completos.

**Decisão:** NÃO criar FM separado. Tratar como variação da mesma causa raiz da R9 — uma das 3 iterações no Task 5 (FM-0009 ou outro que cair em PER-010-like) pode aproveitar pra endurecer R9 com sub-cláusula sobre `foto_local` opcional ou tornar a §4.4 mais clara sobre quando entrar no caminho de handoff vs pergunta.

Se na Task 6 (re-baseline final) PER-010 ainda der 500 em ≥1 de 2 runs, **vira blocker pro DoD** — decisão explícita com Leandro em §6.4 (estender prazo / reduzir escopo / Sub 1.B.2).

---

## §5 Plano de execução (Task 5)

Cada FM = 1 iteração no loop da Fase D, cada iteração = 1 commit isolado (revert-friendly).

**Ordem sugerida** (por evidência empírica + impacto):
1. **FM-0005** (repergunta) — afeta happy path PER-001, fix relativamente cravado (regra positiva anti-repergunta + few-shot).
2. **FM-0009** (muda decisão) — fix prompt + few-shot novo cobrindo substituição.
3. **FM-0001** (modo consultor turn 3+) — fix de cobertura em §4.6, ampliar janela.

Ordem ajustável conforme dependências encontradas durante implementação. Cap 3 iterações por FM. Se não converge, marca `intratável-via-prompt` e segue (não bloqueia outros).

**Snapshot regen + regression suite verde + 0 regressão em PER-001 happy path** continuam sendo gates de qualidade por commit.

---

## §6 Gate C→D — aprovação humana pendente

⏸️ **PAUSA PRA REVIEW DO LEANDRO.**

Aprovar essa lista de 3 FMs (FM-0005, FM-0009, FM-0001) + 0 evals novos + tratamento residual de PER-010 dentro do loop?

Se sim → Task 5 dispara (loop de 3 iterações).
Se quer reordenar / trocar 1 FM / forçar criar PER-012 ou PER-014 / outro → ajusto e re-peço approval.
