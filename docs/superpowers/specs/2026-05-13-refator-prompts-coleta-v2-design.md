# Refator Prompts Coleta v2 (Design)

**Data:** 2026-05-13
**Branch alvo:** `feat/refator-prompts-coleta-v2` (criada, working tree clean)
**Status:** ready-to-plan
**Sub-projeto pai:** qualidade conversacional pós-cutover Sub-4.1 (pré-onboarding cliente pagante)
**Documento âncora:** `docs/manifesto-tatuador-bot.md` (manifesto canônico cravado nesta sessão)

---

## Contexto

Smoke prod do cutover Sub-4.1 (2026-05-13 parte 4) revelou 9 observações em tráfego WhatsApp real, das quais 7 são de prompt/UX. Sessão de brainstorm com o Leandro (tatuador profissional) trouxe princípios estruturais que vão além dos OBS pontuais:

- Bot atual opera como **formulário rígido** — coleta `descricao_curta` + `tamanho_cm` + `local_corpo` (3 OBR) como se fossem campos obrigatórios técnicos.
- **Realidade do tatuador real:** cliente não sabe tamanho exato; tatuador decide proporção no dia; o que importa é **ideia + local + altura corporal + estilo + foto do local**. Tamanho em cm é detalhe técnico opcional.
- Bot atual também **sugere tamanho** ao cliente em vários few-shots e regras (ex: "leão 18cm fica encaixado", "uns 5-8cm?"). Isso viola o princípio "tatuador decide no dia".
- Bot atual não tem **modo consultor** pra cliente indeciso ("não sei o que tatuar"). Bot fica preso pedindo `descricao_curta` sem ajudar a destilar.
- Bot atual envia **textão monolítico** em 1 mensagem WhatsApp — parece formulário, não conversa natural. Pipeline não tem suporte a multi-balão real (split por `\n\n` é só visual dentro da mesma mensagem).
- **CadastroAgent** rejeita data formato BR `DD/MM/AAAA` (OBS-7) e responde seco sem comunicar próximo passo após `enviar_orcamento_tatuador` (OBS-3).

Este refator é a **primeira aplicação do Manifesto do Tatuador-Bot** ao código. Manifesto vira fundação canônica de todos os refators futuros.

## Goals

1. **TattooAgent re-fundamentado** sobre Manifesto: 4 OBR redesenhados (`descricao_curta + local_corpo + altura_cm + estilo`), tamanho_cm vira opcional, foto_local pedida até 2× proativamente.
2. **Princípio "bot nunca sugere tamanho"** cravado em prompt + few-shots + flow de conflito.
3. **Modo consultor** (cliente indeciso) detectado e operado via funil de descoberta.
4. **Conversa simpática multi-balão** — pipeline split por `\n\n` + typing delay por balão, prompt instruído a emitir 2-3 balões naturais.
5. **CadastroAgent** robusto a data BR + comunicação pós-handoff.
6. **Defesa em profundidade** — invariante atualizada exige 4 OBR pra handoff. Pattern Sub-2/3/4.1.
7. **Eval direcionado** valida princípios antes de merge.

## Non-Goals

- Cliente recorrente / remarcação (P1 separado no backlog, agents novos)
- Áudios profundos (input_type metadata, prosódia) — spec futuro
- Imagens com marcação (Vision detection) — spec futuro
- Refator tom-vendedor / cross-sell — spec futuro
- Pipeline resilience (OBS-5 runAgent failure / OBS-6 invariant transient) — spec separado
- Botão Telegram "Fechar valor" (OBS-9) — P1 separado no backlog
- Rename `tamanho_cm` → outro nome (mantém pra retro-compat)
- PropostaAgent / PortfolioAgent (este refator é só Tattoo + Cadastro)

---

## Princípios cravados (do Manifesto)

Resumo dos 6 princípios canônicos. Detalhes completos em `docs/manifesto-tatuador-bot.md`.

- **P1** — Tamanho exato é relativo. Bot nunca sugere, corrige ou confronta tamanho.
- **P2** — 4 OBR pro orçamento: ideia + local + altura + estilo. Tamanho_cm opcional. Foto valiosa.
- **P3** — Foto + altura > centímetros exatos. Foto pedida até 2×.
- **P4** — Cliente é leigo. Bot trata com leveza, educa quando vago.
- **P5** — Conversa simpática, sem objeção robotizada. Validação substantiva ANTES de pedir info.
- **P6** — Dois modos: coletor (cliente com ideia) vs consultor (cliente indeciso). Bot detecta cedo.

---

## Arquitetura — Mapeamento por arquivo

### Prompts TattooAgent

| Arquivo | Mudança |
|---|---|
| `functions/_lib/prompts/coleta/tattoo/objetivo.js` | Reescrever §2 OBR list — 4 OBR (descricao_curta, local_corpo, altura_cm, estilo). Notar tamanho_cm opcional + foto pedida até 2×. |
| `functions/_lib/prompts/coleta/tattoo/contexto.js` | Atualizar "Dados já coletados" — exibir `altura_cm`, `estilo`. Indicar status foto (perguntada/não-perguntada/recusada-2×). |
| `functions/_lib/prompts/coleta/tattoo/decisao.js` | (a) §4.1 tabela: OBR muda de "3/3" pra "4/4". (b) §4.3 nova R8 "Bot NUNCA sugere tamanho". (c) §4.3 R6 (conflito): refatorar — pede foto referência, não confronta. (d) §4.4 (handoff): foto_local pedida 1× antes do handoff (insistência), aceita "não tenho" e segue. (e) §4.X NOVO: detector de modo coletor/consultor. (f) §4.X NOVO modo consultor: funil descoberta (local + estilo → Pinterest → cliente volta → coletor). |
| `functions/_lib/prompts/coleta/tattoo/regras.js` | Refatorar R9 (conflito): pede foto, sem range. Drift cleanup `descricao_tattoo→descricao_curta` linha 55. |
| `functions/_lib/prompts/coleta/tattoo/few-shot.js` | Reescrever ~5 exemplos: (a) Exemplo 4 — cliente "não sei tamanho" → bot SEM sugerir 18cm; (b) Exemplo 6 — conflito → pede foto ref; (c) NOVO modo consultor: cliente "não sei o que tatuar" → bot pergunta local+estilo+Pinterest; (d) NOVO foto pedida 2× → cliente "não tenho" → handoff segue; (e) NOVO 4 OBR completos → mensagem-ponte com validação substantiva + multi-balão. |

### Schema TattooAgent

`functions/api/agent/agents/tattoo.js`:

- Zod `dados_persistidos.altura_cm` mantém `.nullable().optional()` mas invariante exige preenchido pra handoff.
- Zod `dados_persistidos.estilo` mantém `.default('')` mas invariante rejeita string vazia em handoff.
- Zod `dados_persistidos.tamanho_cm` mantém `.nullable().optional()` (sem mudança).
- Zod `dados_persistidos.altura_cm.max(250)` — max razoável pra altura corporal humana em cm.

`validateTattooOutputInvariant` — substituir bloco de handoff por:

```js
if (out.proxima_acao === 'handoff') {
  const dat = out.dados_persistidos || {};
  const obrFaltando = [];
  if (!dat.descricao_curta?.trim()) obrFaltando.push('descricao_curta');
  if (!dat.local_corpo?.trim())     obrFaltando.push('local_corpo');
  if (!dat.estilo?.trim())          obrFaltando.push('estilo');
  if (dat.altura_cm == null)        obrFaltando.push('altura_cm');
  if (obrFaltando.length > 0) {
    return {
      valid: false,
      reason: 'handoff-sem-OBR-completos',
      details: `handoff bloqueado: OBR faltando=${obrFaltando.join(',')}`,
    };
  }
}
```

Manter os outros 2 blocos da invariante (pergunta sem `?`; tools fora-whitelist).

### Tool downstream

`functions/api/tools/enviar-orcamento-tatuador.js`:

- Validação `faltando` (linhas ~150-151 atuais): trocar `tamanho_cm` por 3 campos novos:
  ```js
  if (!dat.descricao_tattoo && !dat.descricao_curta) faltando.push('descricao_tattoo');
  if (!dat.local_corpo) faltando.push('local_corpo');
  if (dat.altura_cm == null) faltando.push('altura_cm');
  if (!dat.estilo) faltando.push('estilo');
  // tamanho_cm sai da validação (opcional)
  ```
- Template Telegram (linha ~73): render `altura: Xcm, estilo: Y`. Linha de `tamanho_cm` vira opcional condicional:
  ```js
  linhas.push(`   • altura: ${dat.altura_cm}cm`);
  if (dat.tamanho_cm) linhas.push(`   • tamanho aproximado: ${dat.tamanho_cm}cm`);
  linhas.push(`   • estilo: ${dat.estilo}`);
  ```

### Pipeline multi-message

`functions/_lib/whatsapp-pipeline.js` — Etapa 7 (~linhas 190-200):

Substituir envio único por loop de balões:

```js
const baloes = respostaCliente
  .split(/\n\s*\n/)
  .map(b => b.trim())
  .filter(Boolean);

if (baloes.length === 0) {
  throw new Error(`resposta_cliente vazia após split (tenant=${tenant.id})`);
}

for (let i = 0; i < baloes.length; i++) {
  await deps.sleep(TYPING_DELAY_MS);
  const sendRes = await deps.evoSend(tenant, {
    type: 'text', to: telefone, text: baloes[i],
  });
  if (!sendRes.ok) {
    throw new Error(`evo sendText falhou balão ${i+1}/${baloes.length}: ${sendRes.error || 'unknown'} (tenant=${tenant.id})`);
  }
}
```

Comportamento:
- Mensagem única sem `\n\n` → 1 balão → comportamento idêntico ao atual
- 2 balões = ~3.4s latência total (1.5s typing × 2 + envios)
- 3 balões = ~5s latência total (limite pragmático)

Prompt instrui máx 2 balões por turno (3+ vira excepcional).

### Prompts CadastroAgent

| Arquivo | Mudança |
|---|---|
| `functions/_lib/prompts/coleta/cadastro/decisao.js` | (a) Reforçar R7 (data ISO): aceitar DD/MM/AAAA, DD-MM-AAAA, YYYY-MM-DD; normalizar SEMPRE pra ISO antes de persistir. (b) §4.X nova: "Após `enviar_orcamento_tatuador` retornar `ok:true`, comunique: nome do cliente + `vou repassar pro <tatuador>` + 'em breve te retorno com valor'". |
| `functions/_lib/prompts/coleta/cadastro/few-shot.js` | +2 exemplos: (a) data BR `20/05/1995` normalizada pra ISO; (b) resposta pós-handoff com próximo passo + tempo esperado. |

### Documentação

`docs/manifesto-tatuador-bot.md` — manifesto canônico. **Já criado nesta sessão**, antes do spec. Spec referencia.

Linkagem nos prompts: cada agent recebe comentário no topo apontando pro manifesto.

---

## Eval direcionado

`docs/superpowers/evals/2026-05-13-refator-prompts-coleta-v2.mjs` (NOVO) — ~18 cenários contra `gpt-4o-mini`:

| TC | Princípio | Trigger | Expected |
|---|---|---|---|
| MAN-1 | P1 | "leão fineline 15cm" | bot NÃO sugere reduzir |
| MAN-2 | P1 | "rosa pequena 25cm" (conflito) | bot pede foto referência |
| MAN-3 | P1 | "rosa pequena 25cm" → "não tenho foto" | bot segue normal sem confrontar |
| MAN-4 | P2 | "leão antebraço fineline, 1.78m altura" | 4 OBR + handoff |
| MAN-5 | P2 | "leão antebraço fineline" (sem altura) | bot pergunta altura |
| MAN-6 | P3 | flow com 4 OBR + bot pede foto 1× | bot pede foto leve |
| MAN-7 | P3 | bot pede foto 2× → "não tenho" | handoff segue sem foto |
| MAN-8 | P3 | bot pede foto 1× → cliente manda foto | bot persiste foto + segue |
| MAN-9 | P5 | "leão realismo" | bot valida ("massa, realismo fica top") ANTES de pedir info |
| MAN-10 | P6 | "queria fazer uma tatuagem mas não sei o que" | modo consultor: pergunta local + estilo, sugere Pinterest |
| MAN-11 | P6 | modo consultor → cliente volta com referência | bot transiciona pra modo coletor |
| MAN-12 | multi-msg | mensagem-ponte handoff (4 OBR completos) | LLM emite `resposta_cliente` contendo `\n\n` separando 2 balões (validação + pedido cadastro). Validação pipeline split fica em unit test. |
| OBS3-1 | OBS-3 | cadastro completo + tool ok | resposta inclui nome + tatuador + "em breve" |
| OBS7-1 | OBS-7 | "Maria Souza, 20/05/1995" | persiste `'1995-05-20'` |
| OBS7-2 | OBS-7 | "João, 15-03-1990" | persiste `'1990-03-15'` |
| OBS7-3 | OBS-7 | "Pedro, 1992-08-22" | persiste `'1992-08-22'` (já ISO) |
| REGR-1 | — | "fineline rosa 7cm pulso direito, altura 1.65m, estilo fineline" | handoff direto (4 OBR completos) |
| REGR-2 | — | conflito sem foto + "não tenho" | handoff segue |

**Gate:** todos MAN-* + OBS-* + REGR-* passam. Custo: ~$0.15-0.25.

---

## Testing strategy

### Camada 1 — Unit tests

- `tests/integration/agents/tattoo.test.mjs` (+4):
  1. Invariante rejeita handoff sem `altura_cm`
  2. Invariante rejeita handoff sem `estilo` (string vazia)
  3. Invariante aceita handoff com 4 OBR completos
  4. Invariante aceita handoff sem `tamanho_cm` (opcional)
- `tests/integration/whatsapp-pipeline.test.mjs` (+3):
  5. Split por `\n\n` → 2 balões → 2 chamadas `evoSend` com typing delay entre cada
  6. Mensagem única sem `\n\n` → 1 chamada (comportamento atual preservado)
  7. `\n\n\n` (3+ newlines) → trata como 1 separador
- `tests/integration/tools/enviar-orcamento-tatuador.test.mjs` (+2):
  8. Aceita payload com `altura_cm` + `estilo`
  9. Rejeita payload sem `altura_cm` (campos-faltando=`['altura_cm']`)

**Suite atual:** 409/409. **Pós-refator:** ~418/418.

### Camada 2 — Snapshot tests

Regenerate:
- `tests/prompts/contracts/coleta-tattoo.mjs`
- `tests/prompts/contracts/coleta-cadastro.mjs`

### Camada 3 — Eval direcionado

Ver tabela acima.

### Camada 4 — Smoke prod manual

Tenant fixture `inkflow_test_sub4` (mesmo do cutover 13/05). 6 cenários:
1. Modo coletor com 4 OBR + multi-balão visual
2. Modo consultor (cliente vago)
3. Conflito tamanho → bot pede foto
4. Foto pedida 2× negada → handoff segue
5. Cadastro com data BR + resposta pós-handoff
6. Validação Telegram tatuador (altura + estilo + tamanho opcional renderizados)

Evidências em `.smoke-evidence/2026-05-13-refator-prompts-coleta-v2/`.

---

## Definition of Done

- [ ] Manifesto `docs/manifesto-tatuador-bot.md` linkado nos 4 prompts (tattoo decisao+regras, cadastro decisao+regras)
- [ ] Schema TattooAgent atualizado (4 OBR pra handoff via invariante)
- [ ] Invariante `validateTattooOutputInvariant` exige 4 OBR
- [ ] Tool `enviar-orcamento-tatuador.js` valida 4 OBR + template Telegram render altura+estilo
- [ ] Pipeline split por `\n\n` + typing delay por balão
- [ ] Prompts TattooAgent: decisao + few-shot + regras + objetivo + contexto refletem P1-P6
- [ ] Prompts CadastroAgent: R7 reforçado + comunicação pós-handoff
- [ ] Snapshot tests regenerados, 100% pass
- [ ] Unit tests novos passam (9 testes)
- [ ] Suite total ~418/418 pass, zero regressão
- [ ] Eval direcionado 18/18 pass (custo ≤$0.30)
- [ ] Smoke prod manual 6/6 cenários OK
- [ ] PR aberto + reviewed + mergeado
- [ ] Evidências do smoke arquivadas em `.smoke-evidence/`

---

## Risks + mitigations

| Risk | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| LLM ignora "modo consultor" (não detecta cliente vago) | Média | Médio | Few-shot explícito + invariante secundária se eval indicar regressão. Iterar prompt se eval cair. |
| Multi-message quebra mensagem-ponte do handoff (2 envios em vez de 1) | Baixa | Baixo | Comportamento esperado — alinha com manifesto P5. Smoke valida UX. |
| Latência total >5s cliente sente "mudo" | Baixa | Médio | Prompt instrui máx 2 balões por turno. Typing delay 1.5s validado pela parte 4 do cutover. |
| Tatuador recebe orçamento sem `tamanho_cm` e fica confuso | Baixa | Baixo | Template Telegram explicita "altura: Xcm, estilo: Y" — claro. Tamanho opcional sai como linha extra se presente. |
| Eval custo >$0.30 (com retries) | Média | Baixo | Cap eval em 2 rounds. Pausa e refina se passar. |
| Drift em CadastroAgent quando refatora TattooAgent (interdependência) | Baixa | Médio | Snapshot tests pegam. Regression suite atual (409) precisa passar. |
| Cliente em prod afetado durante implementação | Baixa | Médio | Trabalho na branch `feat/refator-prompts-coleta-v2`. n8n container ainda vivo no VPS como rollback (descomissionamento T+7d = 2026-05-20). |

---

## Estimativa

- Impl: ~8-10h (13 arquivos editados + 3 novos)
- Eval: ~1h ($0.15-0.25)
- Smoke prod: ~30min
- **Total:** ~10-12h

---

## Files afetados (resumo)

**Editados (13):**
- `functions/_lib/prompts/coleta/tattoo/{objetivo,contexto,decisao,regras,few-shot}.js`
- `functions/_lib/prompts/coleta/cadastro/{decisao,few-shot}.js`
- `functions/api/agent/agents/tattoo.js`
- `functions/api/tools/enviar-orcamento-tatuador.js`
- `functions/_lib/whatsapp-pipeline.js`
- `tests/integration/agents/tattoo.test.mjs`
- `tests/integration/whatsapp-pipeline.test.mjs`
- `tests/integration/tools/enviar-orcamento-tatuador.test.mjs`

**Snapshot regenerados (2):**
- `tests/prompts/contracts/coleta-tattoo.mjs`
- `tests/prompts/contracts/coleta-cadastro.mjs`

**Novos (3):**
- `docs/manifesto-tatuador-bot.md` (já criado nesta sessão)
- `docs/superpowers/specs/2026-05-13-refator-prompts-coleta-v2-design.md` (este arquivo)
- `docs/superpowers/evals/2026-05-13-refator-prompts-coleta-v2.mjs` (a criar durante exec)

---

## Próximos passos

1. **Review humano deste spec** (Leandro).
2. **`/plan`** ou direto `/superpowers:writing-plans` pra gerar implementation plan granular.
3. Execução via `/superpowers:subagent-driven-development` ou direta, conforme calibração (memory `[[feedback_calibrar_subagent_driven]]`).
4. PR + smoke + merge.

---

## Origem

- Brainstorm Pilar 1: 2026-05-13 sessão 5
- 7 OBS prompt/UX: `~/Documents/inkflow-saas/.smoke-evidence/2026-05-13-smoke-prod-cutover/observations.md`
- Manifesto canônico: `docs/manifesto-tatuador-bot.md`
- Memory abandono (anterior, pré-multi-agent): `[[InkFlow — Brainstorm prep refator-prompts-coleta-v2]]` (não-aplicável, mantido como referência histórica)
