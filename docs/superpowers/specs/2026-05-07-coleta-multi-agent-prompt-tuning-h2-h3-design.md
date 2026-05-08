# Coleta Multi-Agent — Prompt Tuning H2/H3 (design)

**Data:** 2026-05-07
**Branch:** `feat/coleta-multi-agent-handoff`
**Status:** `done`
**Predecessor:** [2026-05-07-coleta-multi-agent-sub1-design.md](./2026-05-07-coleta-multi-agent-sub1-design.md)
**Eval baseline:** [2026-05-07-sub1-eval-results.md](../../auditoria/2026-05-07-sub1-eval-results.md) — 2/9 PASS

## TL;DR

Sub-1 validou H1 (whitelist hard) e H4 (SDK + Zod em CF Pages), mas H2 (structured-output-elimina-inventar) e H3 (handoff-condicional) ficaram PARCIAIS — o gpt-4o-mini ignora regras do prompt em cenários de conflito (TC-05) e não dispara `handoff_to_cadastro` de forma confiável (TC-09). Além disso, 4 dos 9 cenários falham por max-turns (TC-01/02/04/06), indicando que o agent não converge no output final.

Esta feature é **prompt tuning cirúrgico** sobre o prompt da fase tattoo + reescrita do `REFORCO_HANDOFF` pra atingir ≥7/9 PASS no eval, unblockando Sub-3 (cutover n8n). **Não muda arquitetura**. Mantém `gpt-4o-mini` (paridade n8n).

## Contexto e motivação

O eval suite Sub-1 capturou três famílias de problema:

1. **Falhas de lógica em H2/H3 (2 cenários):** TC-05 ("rosa pequena de 25cm") chamou `handoff_to_cadastro` apesar do conflito. TC-09 ("fineline rosa 7cm pulso direito, podes já agendar") coletou 3 OBR via `dados_coletados` mas não chamou `handoff_to_cadastro`. Os dois indicam que **a disciplina de prompt é o gargalo, não tecnologia**.
2. **Max-turns em 4 cenários (TC-01/02/04/06):** agent fica em loop de `dados_coletados` em vez de emitir output final. Causa hipotética: o prompt menciona uma tool `acionar_handoff(motivo=...)` em 6 lugares (R6/R6b/R7/§3.3c/§3.5/T4) que **não existe** no whitelist do Sub-1 — agent fica perdido tentando "completar" via tool inexistente. (TC-05 também já caiu em max-turns em runs anteriores; no run final 5dc6ee6 falhou por handoff indevido em vez de max-turns.)
3. **Confusão entre fases (TC-03):** agent retornou `campos_faltando=["nome", "data_nascimento"]` (campos de cadastro) em vez de `tamanho_cm` — sinaliza que o limite entre fase tattoo e fase cadastro não está nítido no prompt.

Sub-1 já decidiu: PROCEED pra Sub-2 **com brainstorm prévio focado em H2/H3** (prompt tuning, não arquitetura). Esta spec é esse brainstorm aprovado.

## Escopo

### In-scope
- Reescrever blocos do prompt da fase tattoo: `regras.js`, `fluxo.js`, `few-shot.js`
- Reescrever `REFORCO_HANDOFF` em `functions/api/agent/agents/tattoo.js`
- Eliminar duplicação `REFORCO_HANDOFF` no eval (importar de `tattoo.js`)
- Iterar até ≥7/9 PASS no eval contra `gpt-4o-mini`
- Atualizar `docs/auditoria/2026-05-07-sub1-eval-results.md` com novo run final

### Out-of-scope
- Mudar modelo (continua `gpt-4o-mini`)
- Mexer em arquitetura: `route.js`, `router.js`, `sdk-init.js`, `tattoo.js` (só o `REFORCO_HANDOFF` literal muda)
- Mudar schema `TattooOutputSchema` (validado por H4)
- Mudar cenários `tests/agent/_fixtures/scenarios.json` (são oraculares — mexer seria batota)
- Tocar prompts da fase Cadastro/Proposta (Sub-2)
- Reescrita do prompt v2 do zero (escala de Abordagem B — só se Abordagem A não atingir 7/9 em 5 iterações)

## Hipóteses revalidadas e success criteria

| # | Hipótese | Cenários | Status alvo |
|---|----------|----------|-------------|
| H1 | Tools restritas eliminam "pula fase" | TC-04, TC-08 | PASS (já PASS em TC-08, garantir não regredir) |
| H2 | Structured output JSON elimina "inventa dados" | TC-03, TC-05 | **PASS** (TC-05 obrigatório) |
| H3 | Handoff em código (não LLM-decidido) funciona limpo | TC-09 | **PASS** (TC-09 obrigatório) |
| H4 | OpenAI Agents SDK + Zod em CF Pages | TC-07 | PASS (já PASS, garantir não regredir) |

**Gate de aprovação da feature:**
- Total ≥7/9 PASS
- TC-05 PASS (H2 obrigatório)
- TC-09 PASS (H3 obrigatório)
- TC-07 PASS (sem regressão schema)
- TC-08 PASS (sem regressão whitelist)

**Stop conditions:**
- ✅ Gate atingido → spec done, Sub-2 unblocked.
- ⚠️ <7/9 após 5 iterações (~$2 spend cumulativo) → PAUSAR e decidir entre escalar pra Abordagem B (reescrita do prompt), reavaliar modelo (gpt-4o), ou aceitar gap documentado.
- ⛔ Regressão em TC-07 ou TC-08 → rollback do último commit, investigar antes de prosseguir.

## Mudanças concretas

### Arquivos a tocar

| Arquivo | Tipo de mudança |
|---------|-----------------|
| `functions/_lib/prompts/coleta/tattoo/regras.js` | (a) substituir 4 referências a `acionar_handoff` (R6/R6b/R7/T4) por `proxima_acao='erro'`; (b) adicionar nova **R9** sobre conflitos |
| `functions/_lib/prompts/coleta/tattoo/fluxo.js` | (a) §3.3c.3, §3.5: trocar `acionar_handoff(motivo=...)` por `proxima_acao='erro'`; (b) §3.4: adicionar §3.4b explícita sobre disparar `handoff_to_cadastro` + emitir output `proxima_acao='handoff'` no mesmo turno |
| `functions/_lib/prompts/coleta/tattoo/few-shot.js` | Adicionar Exemplo 6 (conflito/R9) e Exemplo 7 (one-shot até handoff) |
| `functions/api/agent/agents/tattoo.js` | Reescrever `REFORCO_HANDOFF`: foco em "uma chamada por campo + emitir output e parar" |
| `tests/agent/tattoo-agent.eval.mjs` | Trocar cópia local de `REFORCO_HANDOFF` por import de `tattoo.js` (eliminar duplicação) |
| `docs/auditoria/2026-05-07-sub1-eval-results.md` | Atualizar com novo run final + decisão Sub-2 unblocked |

### Texto exato — Nova R9 (em `regras.js`, após R8)

```
**R9. CONFLITO DE DADOS:** quando cliente fornece valores contraditorios pro mesmo campo na mesma mensagem (ex: "rosa pequena de 25cm" — pequena vs 25cm sao incompativeis), voce DEVE:
- (a) NAO chamar `dados_coletados` pra esse campo (nao persiste valor inferido)
- (b) popular `campos_conflitantes` no output com o nome do campo (ex: ["tamanho_cm"])
- (c) usar `proxima_acao='pergunta'`
- (d) NUNCA chamar `handoff_to_cadastro` enquanto houver conflito
Devolva a contradicao ao cliente em 1 frase e deixe ELE decidir. Ex: "tu disse pequena mas 25cm ja e tatuagem grande — me confirma se e 25cm mesmo ou tu quer algo bem menor (uns 5-8cm)?". JAMAIS escolha pelo cliente.
```

### Texto exato — Substituições `acionar_handoff` em `regras.js`

| Localização | Antes | Depois |
|-------------|-------|--------|
| R6 | `chame \`acionar_handoff\` APENAS quando: (a) gatilho... (d) tamanho impossivel...` | `Casos que voce NAO resolve nesta fase (gatilho do estudio, cliente pede humano, cover-up, conflito grave): emita output com \`proxima_acao='erro'\` e \`resposta_cliente\` reconhecendo "Pra esse caso o tatuador avalia pessoalmente — ja sinalizei pra ele". NUNCA chame \`handoff_to_cadastro\` nesses casos.` |
| R6b | `Ao DETECTAR gatilho... chame \`acionar_handoff\`` | `Ao DETECTAR gatilho, PARE IMEDIATAMENTE. Resposta de 1 frase + \`proxima_acao='erro'\`.` |
| R7 (cobertura, se `aceita_cobertura=true`) | `chame \`acionar_handoff(motivo="cover_up_detectado")\`` | `emita \`proxima_acao='erro'\` + resposta "Pra cobertura o tatuador avalia pessoalmente — ja sinalizei pra ele"` |
| T4 (bloco inteiro) | `\`acionar_handoff\` — conforme R6/R7. Nunca por "caso complexo"...` | `**T4.** \`handoff_to_cadastro\` — chame APENAS quando os 3 OBR estao completos E \`campos_conflitantes=[]\`. Use \`proxima_acao='handoff'\` no output.` |

### Texto exato — Substituições em `fluxo.js`

| § | Antes | Depois |
|---|-------|--------|
| §3.3c.3 | `chame \`acionar_handoff(motivo="cliente_sem_referencia_tamanho")\`` | `emita \`proxima_acao='erro'\` + resposta "Sem referencia de tamanho fica dificil orcar — o tatuador vai te ajudar com isso pessoalmente"` |
| §3.4b (novo, após §3.4) | — | `## §3.4b SINAL DE FIM DA FASE\nQuando os 3 OBR estao completos E sem conflitos: (1) chame \`handoff_to_cadastro({dados_completos:true, campos_conflitantes:[]})\` UMA vez; (2) emita output com \`proxima_acao='handoff'\` + \`dados_completos=true\` + \`resposta_cliente\` contendo a mensagem-ponte de §3.4. ESSA E A UNICA FORMA DE TERMINAR A FASE. Sem isso, voce continua na fase tattoo.` |
| §3.5 | Lista 8 gatilhos com `acionar_handoff(motivo=<motivo>)` | Mesma lista de gatilhos, mas substituir ação: `Se detectar QUALQUER um, emita \`proxima_acao='erro'\` + \`resposta_cliente\` apropriada. NAO chame \`handoff_to_cadastro\`.` |

### Texto exato — Novo `REFORCO_HANDOFF` em `tattoo.js`

```js
const REFORCO_HANDOFF = `

# §HANDOFF — INVARIANTE
NUNCA chame \`handoff_to_cadastro\` se: (a) qualquer dos 3 OBR (descricao_tattoo, tamanho_cm, local_corpo) esta faltando, OU (b) \`campos_conflitantes\` nao-vazio. Resolva conflitos primeiro (R9).

# §OUTPUT FINAL — UMA VEZ POR TURNO
Apos chamar tools necessarias, emita o output JSON estruturado UMA vez e PARE. NAO chame \`dados_coletados\` mais de uma vez pro mesmo campo no mesmo turno. NAO continue em loop apos emitir output.`;
```

### Texto exato — Novos few-shots em `few-shot.js`

```
## Exemplo 6 — Conflito de dados (R9)
CLIENTE: queria uma rosa pequena de 25cm no antebraco
AGENTE: Tu disse pequena mas 25cm ja e tatuagem bem grande — me confirma se e 25cm mesmo ou tu quer algo bem menor (uns 5-8cm)?

## Exemplo 7 — Cliente da tudo de uma vez (one-shot ate handoff)
CLIENTE: fineline rosa 7cm pulso direito, podes ja agendar
AGENTE: Rosa fineline de 7cm no pulso fica delicada e bem visivel — combinacao top

AGENTE: Sobre agendar, o tatuador confirma quando avaliar tua ideia — ja te passo pra ele. Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve
```

Ex.7 demonstra que: 3 OBR detectados em 1 mensagem → validação substantiva + ponte de cadastro **no mesmo turno**, sem voltar a perguntar nada.

### Eliminação de duplicação no eval

`tests/agent/tattoo-agent.eval.mjs:39-42` mantém uma cópia local de `REFORCO_HANDOFF`. Substituir por:

```js
import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo.js';
// REFORCO_HANDOFF deve ser exportado de tattoo.js e re-importado aqui.
```

Isso requer adicionar `export` ao `REFORCO_HANDOFF` em `tattoo.js`. Eval e prod **devem** rodar o mesmo prompt — caso contrário valida a coisa errada.

## Plano de iteração

| Iter | Foco | Custo aprox |
|------|------|-------------|
| 1 | Aplicar todas as mudanças (interdependentes) e rodar suite | $0.40 |
| 2 | Ajustar few-shots ou texto baseado nos cenários que falharam | $0.40 |
| 3 | Refinamento fino (ordem dos blocos, tom de R9) se 1-2 cenários ainda falham | $0.40 |
| 4-5 | Reservas | $0.80 |

**Orçamento total: até $2.** Justifica porque é tuning iterativo. (Sub-1 inteiro custou $0.40.)

### Procedimento de eval

```bash
# Run completo
OPENAI_API_KEY=sk-... node --test tests/agent/tattoo-agent.eval.mjs

# Run cenário único (debug)
OPENAI_API_KEY=sk-... node --test --test-name-pattern="TC-05" tests/agent/tattoo-agent.eval.mjs
```

### Validação cruzada anti-regressão

Antes de fechar, rodar TC-09 com **histórico simulado** (2 turnos prévios) em vez de one-shot, conferir se agent ainda fecha handoff. Custo extra: ~$0.05.

## Riscos e mitigação

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Mudanças no prompt não convergem em 5 iterações | Média | Stop condition explícito: pausar e decidir Abordagem B / mudar modelo / aceitar gap |
| Few-shots novos induzem viés que quebra cenários atualmente PASS | Média | Eval roda suite completa após cada iteração; rollback se regressão em TC-07/TC-08 |
| `gpt-4o-mini` é simplesmente incapaz desse nível de disciplina | Baixa-média | Stop condition cobre. Decisão de subir pra `gpt-4o` fica documentada no outcome |
| Cópia local do `REFORCO_HANDOFF` no eval não foi a única duplicação | Baixa | Auditar grep `REFORCO_HANDOFF` em todo o repo durante a implementação |
| `validateTattooOutputInvariant` rejeita output novo válido | Baixa | Função permanece intocada; apenas `proxima_acao='erro'` é caminho novo, e a invariante atual cobre só `'handoff'` |
| Mudança em §3.5 (gatilhos) faz agent emitir `'erro'` quando deveria `'pergunta'` | Média | Cenários TC-04/TC-08 capturam regressão; Exemplo 6/7 ensina disciplina de quando emitir erro |

## Outcome

**Status:** done

**Resultado por cenário:**
- TC-01: PASS
- TC-02: PASS
- TC-03: FAIL (gap residual — cliente vago, agent dispara handoff sem tamanho_cm)
- TC-04: PASS
- TC-05: PASS
- TC-06: PASS
- TC-07: PASS
- TC-08: PASS
- TC-09: PASS
- TC-10 (multi-turn, novo): PASS

**Originais TC-01..TC-09:** 8/9
**TC-10 (multi-turn):** PASS
**Custo total:** ~$0.10–0.15
**Iterações:** 1 (gate atingido na primeira run, sem iter 2-5)
**Sub-2 unblocked?** SIM

**Lições:**
- H2 (R9 — devolver contradição ao cliente): convergiu na primeira iteração; conflito 25cm vs "pequena" detectado e devolvido em 1 frase como esperado.
- H3 (handoff_to_cadastro disciplina + emit-and-stop): convergiu pra TC-09 (one-shot) E TC-10 (multi-turn 2 turnos prévios), eliminando os max-turns de TC-01/02/04/06 do baseline.
- Trade-off observado: o H3 reforçado tornou o agent mais agressivo em fechar handoff. TC-03 (rosa pequena) regrediu de "campos errados" pra "handoff indevido com tamanho_cm faltando" — o gate de R6/R6b/R7/T4 reforçando "só chame handoff_to_cadastro com 3 OBR completos" ainda perdeu pra hipótese implícita de que descricao+local sem tamanho seria suficiente. Solução para Sub-3+ se ressurgir como dor: explicitar em §3.2 que `campos_faltando=['tamanho_cm']` impede handoff, OU adicionar exemplo few-shot do caso vago.
