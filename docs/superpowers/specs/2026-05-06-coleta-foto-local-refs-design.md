---
title: Coleta foto_local + altura_cliente + estilo + princípio "devolver contradições" — Modo Coleta v2 (refator fase tattoo)
date: 2026-05-06
status: design
branch: feat/coleta-foto-local-refs
related_prs:
  - "#28 (refator prompts Coleta v2 — 3 camadas Anthropic Tool Use)"
  - "#29 (hotfix race condition merge_conversa_jsonb)"
follow_up_backlog:
  - "P0 — coleta-fotos-no-telegram-storage (escopo B: anexar foto real no Telegram, exige Storage Supabase + signed URL)"
  - "P1 — review contradições prompt pós-implementação (procurar divergências entre metodologia nova e antiga)"
---

# Spec — Coleta foto_local + altura_cliente + estilo + princípio "devolver contradições"

## Sumário executivo

Refator da fase **TATTOO** do Modo Coleta v2 pra cobrir gaps descobertos no smoke E2E pós-PR #29 (orçamento R$ 650 fechado sem foto, sem altura, sem estilo — tatuador real não consegue cravar valor justo só com descrição/tamanho/local).

**3 mudanças estruturais:**

1. **Promove `foto_local` + `altura_cm` + `estilo`** de OPC pra OBR_RECOMENDADO — bot pergunta single shot 1× cada, pula se cliente recusa, NÃO bloqueia transição pra cadastro.
2. **Cria campo novo `altura_cm`** (altura do cliente, persistido em `dados_coletados`). Hoje altura era apenas fallback de `tamanho_cm` no §3.3c (não persistia).
3. **Crava princípio R9 + T7: "devolver contradições, nunca decidir pelo cliente"** como regra global. Bot identifica contradições (estilo declarado ≠ estilo da foto, local declarado ≠ local da foto, descrição vs foto, dado implausível) e devolve UMA pergunta soft. Se cliente continuar sem resolver → handoff `contradicao_nao_resolvida`.

**Mudanças adjacentes:**

- `refs_imagens` deixa de ser perguntada ativamente — vira **passive only** (R8 mantém aceitar quando cliente manda espontâneo).
- Soft re-ask explícito pros 3 OBR técnicos (descrição/tamanho/local) — 1 reformulação → handoff `cliente_evasivo_infos_incompletas`.
- `tamanho_cm` ganha estimativa via referência visual ("do pulso ao cotovelo são uns 25cm") — bot estima e confirma com cliente.
- §3.3c (fallback altura→tamanho) **removida** — altura migrou pra OBR_RECOMENDADO próprio.
- §3.4 mensagem-ponte cadastro **estrutura intacta** — Balão 1 (validação substantiva) fica condicional aos campos coletados.
- Payload Telegram do tatuador ganha 1 linha nova (`altura cliente: 170cm`) e mantém linha de estilo já existente.

**Fora do escopo desta sessão (B):** anexar foto REAL no Telegram do tatuador (exige Storage Supabase + signed URL + retenção LGPD + custo). Vira entry P0 no backlog.

---

## Contexto e motivação

### Smoke E2E pós-PR #29 revelou 3 achados de produto

(Detalhes em [[InkFlow — Painel]] estado anterior 06/05 noite + daily note 2026-05-06.md parte 2.)

| Achado | Decisão Leandro (cravada no smoke) |
|---|---|
| Bot só coleta descrição/tamanho/local — tatuador real não consegue orçar com confiança sem foto/altura/estilo | foto_local **DEVE ser solicitada** (importantíssimo); refs visuais NUNCA pedir ativamente |
| `refs_imagens` solicitada ativamente pode parecer indecisão / falta de confiança no tatuador | NÃO pedir refs ativamente — apenas armazenar quando cliente mandar espontâneo |
| Altura do cliente é info crítica pra proporção que hoje não é coletada como campo próprio (só fallback) | Altura vira campo OBR_RECOMENDADO próprio + persistido |

### Decisão estrutural: foto/altura/estilo entram na fase TATTOO, NÃO mistura com cadastro

Princípio cravado por Leandro: **nome/data/email são FINALIZAÇÃO**, pedidos APÓS coleta da tattoo (incluindo info pro tatuador). Mensagem-ponte §3.4 NÃO mistura "manda foto" com "me passa nome/data". Mantém pureza:

- Fase TATTOO = info pra orçar (descrição, tamanho, local, foto, altura, estilo)
- Fase CADASTRO = finalização (nome, data nascimento, email opcional)

### Princípio "nunca decidir pelo cliente" (cravado nesta sessão)

Tatuador usa o output do bot pra cravar valor, agendar e operar — bot **decidindo silenciosamente** em ambiguidades quebra confiança. Precisa devolver contradições de forma soft, sem julgamento, e como última opção acionar tatuador via handoff.

---

## Escopo

### Dentro do escopo (este PR)

- Refator do prompt da fase TATTOO (`functions/_lib/prompts/coleta/tattoo/*.js`)
- Adição de `altura_cm` ao tool `dados-coletados.js` (persistência + validação)
- Atualização do payload Telegram em `enviar-orcamento-tatuador.js` (texto, não imagem)
- Few-shots novos cobrindo cenários novos (incluindo contradições)
- Invariants tests novos
- Snapshots regenerados (apenas tattoo)

### Fora do escopo (vira backlog)

- **B — Storage Supabase + foto real no Telegram** (P0, próxima sessão dedicada)
- **Review contradições do prompt pós-implementação** (P1, procurar divergências entre metodologia nova e antiga, especialmente em few-shots e tom — adicionado a pedido do Leandro)
- Mudanças no n8n workflow (tool description já cobre `altura_cm` indiretamente — `valor` é string genérica)
- Mudanças na fase CADASTRO (já tem soft re-ask próprio em §3.7 e T4)

---

## Arquitetura geral

### Fluxo conversacional novo (fase TATTOO)

```
┌─────────────────────────────────────────────────────────────────┐
│ §3.1  Saudação (apenas no PRIMEIRO turn do PRIMEIRO contato)   │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ §3.2  Coleta dos 3 OBR técnicos                                 │
│  descricao_tattoo + tamanho_cm + local_corpo                    │
│                                                                 │
│  Multi-turn dependendo do que cliente mandou.                   │
│  Em CADA turn que recebe info: chama dados_coletados(campo).    │
│                                                                 │
│  Soft re-ask: 1 reformulação se cliente evade. Se evade de     │
│  novo → acionar_handoff(motivo='cliente_evasivo_infos_incompletas')│
│                                                                 │
│  Tamanho via referência visual: bot estima de "pulso ao         │
│  cotovelo" e similar, confirma com cliente, persiste.           │
└─────────────────────────────────────────────────────────────────┘
                           ↓ (3 OBR completos)
                           ↓ Auto-transição pra coletando_cadastro
                           ↓ disparada pelo RPC, MAS bot continua
                           ↓ percorrendo single shots ANTES de
                           ↓ enviar a §3.4 mensagem-ponte
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ §3.3-foto  Single shot foto_local                              │
│  Pré-condição: foto_local ainda não preenchido                  │
│  Pergunta 1×, sem soft re-ask. Pula se cliente recusa.          │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ §3.3-altura  Single shot altura_cm                              │
│  Pré-condição: altura_cm ainda não preenchido                   │
│  Pergunta 1×, sem soft re-ask. Pula se cliente recusa/não sabe. │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ §3.3-estilo  Single shot CONDICIONAL                            │
│  Pré-condição: estilo ainda não inferido do contexto            │
│  (descrição já cita estilo / refs já têm estilo claro)          │
│  Pergunta 1×, sem soft re-ask. Pula se cliente "não sei".       │
└─────────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│ §3.4  Mensagem-ponte cadastro (estrutura INTACTA)              │
│  Balão 1: validação substantiva (CONDICIONAL aos campos        │
│           coletados — cita altura/estilo/foto se preenchidos)   │
│  Balão 2: pede nome + data_nasc + email (texto corrido,        │
│           lista bullet PROIBIDA — fix PR #29 mantido)           │
└─────────────────────────────────────────────────────────────────┘
```

### Decisões importantes implícitas

1. **Auto-transição vs. ordem de mensagens:** RPC dispara `coletando_cadastro` quando 3 OBR técnicos completos. Mas o BOT NÃO emite a mensagem-ponte §3.4 imediatamente — primeiro percorre os single shots de foto → altura → estilo, depois envia a mensagem-ponte. Estado interno = `coletando_cadastro` durante os single shots, mas isso não muda nada externamente (cliente nem percebe).

2. **Pré-condições com pulagem inteligente.** Cada single shot tem pré-condição. Bot pula se já satisfeita:
   - `foto_local` já preenchido (R8 populou via foto espontânea) → pula §3.3-foto
   - `altura_cm` já preenchido (cliente disse na 1ª msg "1.70m") → pula §3.3-altura
   - `estilo` já preenchido OU inferível do contexto (descrição "rosa fineline") → pula §3.3-estilo

3. **Sem soft re-ask nos OBR_RECOMENDADO.** Cliente recusa foto/altura/estilo = bot segue. Não insiste. Diferente dos 3 OBR técnicos.

4. **Multi-info na 1ª msg.** Se cliente manda "rosa fineline 10cm antebraço, 1.70m de altura [foto]" tudo de uma vez, bot persiste 6 campos em sequência (descrição, estilo, tamanho, local, foto, altura) e vai DIRETO pra mensagem-ponte cadastro, pulando todos os single shots.

5. **§3.3b precisa verificar contradições ANTES de pular.** Antes de pular um single shot pulável, verifica se há contradição entre os campos coletados (R9 aplica). Se há, devolve a contradição ANTES de pular ou transicionar.

---

## Files alterados

### `functions/_lib/prompts/coleta/tattoo/fluxo.js` — REESCRITA

Estrutura nova (mantém numeração §3 mas reorganiza):

| Seção | Conteúdo |
|---|---|
| **§3.1** | Saudação inicial (igual hoje) |
| **§3.2** | 3 OBR técnicos (descrição, tamanho, local) **+ soft re-ask explícito + estimativa via referência visual pra tamanho** |
| **§3.3** | OBR_RECOMENDADO (foto, altura, estilo) — 3 single shots em sequência, com pulagem inteligente |
| **§3.3b** | Multi-info na 1ª msg + verificação de contradição antes de pular |
| ~~§3.3c~~ | **REMOVIDA** — altura migrou pra §3.3 como OBR_RECOMENDADO próprio |
| **§3.4** | Mensagem-ponte cadastro (Balão 1 condicional aos campos coletados; Balão 2 intacto) |
| **§3.5** | Gatilhos imediatos de handoff (igual hoje + adiciona `contradicao_nao_resolvida`) |

### `functions/_lib/prompts/coleta/tattoo/regras.js` — ADIÇÕES

#### R9 (NOVA) — princípio "devolver contradições"

```
**R9.** DEVOLVER CONTRADIÇÕES, NUNCA DECIDIR PELO CLIENTE.
Sempre que detectar contradição entre o que o cliente disse, mandou em
foto, ou implícito no contexto, devolva a contradição em UMA pergunta
soft sem julgamento. Não escolha por ele. Não ignore um lado da
contradição. Exemplos típicos:
- estilo declarado ≠ estilo inferido da foto/ref
- local declarado ≠ local mostrado na foto
- descrição "simples" + foto detalhada (ou vice-versa)
- altura/tamanho fora de range comum (ex: cliente diz 3.50m de altura)
- cliente diz tamanho impossível pra local (ex: 50cm no pulso)

Após UMA devolução, se cliente continuar evasivo ou contraditório,
chame `acionar_handoff(motivo='contradicao_nao_resolvida')`.
```

#### T7 (NOVA) — tracking de contradições

```
**T7.** Tracking via histórico: leia se você JÁ devolveu uma contradição
sobre o mesmo assunto nesta conversa. Se sim, NÃO devolva de novo —
chame `acionar_handoff(motivo='contradicao_nao_resolvida')`. Mesmo
tracking aplica pro soft re-ask dos 3 OBR técnicos: 1 reformulação +
evasão = handoff `cliente_evasivo_infos_incompletas`.
```

#### T2 (REESCRITA) — sequência completa

```
**T2.** dados_coletados:
- T2.1 — chame APÓS cliente fornecer cada campo OBR técnico
  (descricao_tattoo, tamanho_cm, local_corpo). Uma chamada por campo.
  Pode encadear no MESMO turno se cliente mandou multi-info.
- T2.2 — quando 3 OBR técnicos completos, percorra os 3 OBR_RECOMENDADO
  em ordem: foto_local → altura_cm → estilo. Cada single shot tem
  pré-condição (campo ainda não preenchido / inferido). Pula se já
  satisfeita.
- T2.3 — só APÓS percorrer (ou pular) os 3 single shots, envie a §3.4
  mensagem-ponte de cadastro.
```

#### T3 (REESCRITA) — mensagem-ponte condicional

```
**T3.** §3.4 Mensagem-ponte: Balão 1 (validação substantiva) cita os
campos OBR_RECOMENDADO que foram coletados. Exemplos:
- Mínimo (só 3 OBR técnicos): "Rosa de 10cm no antebraço fica top — bem
  visível, dá pra trabalhar bons detalhes."
- Com altura: "Rosa de 10cm no antebraço, considerando tua altura
  1.70m, fica numa proporção bem equilibrada."
- Com estilo+altura: "Rosa fineline de 10cm no antebraço, com tua
  altura 1.70m, fica delicada e bem proporcional."

Balão 2 INTACTO: "Pra eu liberar teu orçamento personalizado, me passa
nome completo e data de nascimento (e-mail é opcional). Aí o tatuador
olha e te retorna em breve". JAMAIS lista bullet (PR #29 fix mantido).
```

#### R8 — INTACTA

Interpretação visual de imagens (sujeito principal pele vazia → foto_local; pele tatuada → refs_imagens; marcação de caneta → não-tattoo). Sem mudança.

#### Outras regras existentes (R1-R7) — INTACTAS

### `functions/_lib/prompts/coleta/tattoo/few-shot.js` — ADIÇÕES + ALTERAÇÕES

7 novos cenários cobertos via exemplos:

1. **Cliente abre completo** ("rosa fineline 10cm antebraço [foto]") — bot persiste tudo na 1ª msg, pula single shots foto/estilo, só pergunta altura
2. **Cliente goteja info** — bot percorre 3 single shots normalmente
3. **Cliente recusa foto** ("não tenho como tirar agora") — bot segue
4. **Cliente recusa altura** ("não sei minha altura exata") — bot pula
5. **Cliente já citou estilo na descrição** — bot pula single shot estilo
6. **Cliente evade tamanho 1×, dá referência visual no soft re-ask** — bot estima 25cm e confirma
7. **Cliente evade tamanho 2×** — bot aciona handoff `cliente_evasivo_infos_incompletas`

E 3 cenários novos pro princípio R9:

8. **Estilo conflitante** (declarou "realismo" + foto fineline) — bot devolve: "Vi que tu falou em realismo e mandou foto de uma rosa fineline delicada. Tu queria tipo essa da foto, ou um estilo mais realista mesmo?". Persiste só após cliente confirmar.
9. **Local conflitante** (declarou antebraço + foto da perna) — bot devolve: "Vi que mandou foto da perna — confirma que é na perna mesmo, não no antebraço?". Atualiza `local_corpo` se cliente confirma novo.
10. **Altura implausível** (cliente diz 3.50m) — bot devolve soft 1×: "3.50m é uma altura bem fora do comum, foi erro de digitação?". Se cliente CORRIGE → bot persiste novo. Se cliente CONFIRMA "não, é isso mesmo" → handoff `dado_implausivel`.

### `functions/_lib/prompts/coleta/tattoo/few-shot-tenant.js` — REVIEW

Auditar — não deve haver pseudo-código (PR #28 já limpou). Confirmar que não introduz contradição com R9.

### `functions/api/tools/dados-coletados.js` — ADICIONAR `altura_cm`

```js
const CAMPOS_TATTOO = [
  'descricao_tattoo', 'tamanho_cm', 'local_corpo',
  'estilo', 'foto_local', 'refs_imagens',
  'altura_cm',  // ⚡ NOVO
];
```

Adicionar bloco de validação pra `altura_cm`:

```js
} else if (campo === 'altura_cm') {
  const cm = normalizarAltura(valor);
  if (cm === null) {
    return { status: 400, body: { ok: false, error: `altura_cm formato invalido: ${valor}` } };
  }
  if (cm < 50 || cm > 250) {
    return { status: 400, body: { ok: false, error: `altura_cm fora do range esperado (50-250cm): ${cm}` } };
  }
  patch = { altura_cm: cm };
}
```

Helper `normalizarAltura()`:

```js
// Aceita: 170, "170", "1.70", "1,70", "1.70m", "170cm", "1m70" (informal pt-BR)
function normalizarAltura(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input < 3 ? Math.round(input * 100) : Math.round(input);
  }
  const s = String(input).toLowerCase().trim()
    .replace(/cm/g, '').replace(/\s/g, '')
    .replace(',', '.');
  // "1m70" → "1.70"
  const mMatch = s.match(/^(\d+)m(\d+)$/);
  if (mMatch) {
    return Number(mMatch[1]) * 100 + Number(mMatch[2].padEnd(2, '0').slice(0, 2));
  }
  const cleaned = s.replace(/m$/, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 3 ? Math.round(n * 100) : Math.round(n);
}
```

Auto-transição NÃO depende de `altura_cm` — RPC continua disparando em `OBR_TATTOO = ['descricao_tattoo', 'tamanho_cm', 'local_corpo']`.

### `functions/_lib/guardrails.js` — adicionar detecção altura

Linha 64 (atual: hint pra `foto_local`). Adicionar hint pra altura:

```js
if (/\baltura\b|\bquanto.*alto\b|\bm de altura\b/.test(t)) keys.push('altura_cm');
```

### `functions/api/tools/enviar-orcamento-tatuador.js` — ENRIQUECER PAYLOAD

`montarTextoOrcamento()` ganha 1 linha condicional pra altura, mantém estilo (já existia):

```js
linhas.push('🎨 *Tattoo*');
linhas.push(`   • ${desc}`);
linhas.push(`   • ${dat.tamanho_cm}cm`);
linhas.push(`   • ${local}`);
if (estilo) linhas.push(`   • estilo: ${estilo}`);
if (dat.altura_cm) linhas.push(`   • altura cliente: ${dat.altura_cm}cm`);  // ⚡ NOVO
linhas.push('');
linhas.push(`📸 Fotos: ${fotos} do local, ${refs} referência${refs === 1 ? '' : 's'}`);
```

Sem mudança em `inline_keyboard`. Sem mudança em `sendMessage` (foto real continua não anexada — é escopo B).

### `tests/snapshot/coleta-tattoo.snap.txt` — REGEN

Re-snapshot via `node tests/snapshot/coleta-tattoo.snap.regen.mjs` (script existente do PR #28).

Snapshots de cadastro e proposta — INTACTOS.

### `tests/invariants.test.mjs` — ADIÇÕES

3 invariants novos (cobre L1, L2, L5 da review):

```js
test('§3.3 OBR_RECOMENDADO menciona apenas foto_local, altura_cm, estilo', () => {
  const prompt = generate({...mockTenant, modo: 'coleta'}).prompt;
  const sec = extractSection(prompt, '§3.3');
  assert.match(sec, /foto_local/);
  assert.match(sec, /altura_cm/);
  assert.match(sec, /estilo/);
  assert.doesNotMatch(sec, /refs_imagens/);  // refs passive only
});

test('§3.3c (fallback altura→tamanho) foi removida', () => {
  const prompt = generate({...mockTenant, modo: 'coleta'}).prompt;
  assert.doesNotMatch(prompt, /§3\.3c/);
});

test('R9 (devolver contradições) explícito em regras', () => {
  const prompt = generate({...mockTenant, modo: 'coleta'}).prompt;
  assert.match(prompt, /R9/);
  assert.match(prompt, /devolv.*contradi/i);
  assert.match(prompt, /contradicao_nao_resolvida/);
});

test('§4b T2.1/T2.2/T2.3 sequência foto→altura→estilo', () => {
  const prompt = generate({...mockTenant, modo: 'coleta'}).prompt;
  const sec = extractSection(prompt, '§4b');
  assert.match(sec, /foto_local.*altura_cm.*estilo/s);
});

test('soft re-ask explicit nos 3 OBR técnicos', () => {
  const prompt = generate({...mockTenant, modo: 'coleta'}).prompt;
  assert.match(prompt, /soft re-ask|reformul/i);
  assert.match(prompt, /cliente_evasivo_infos_incompletas/);
});
```

### `tests/tools/dados-coletados.test.mjs` — ADIÇÕES

5 tests novos (cobrindo `altura_cm`):

- aceita `170` (cm direto)
- aceita `"1.70"` (m com ponto)
- aceita `"1,70"` (m com vírgula pt-BR)
- aceita `"1m70"` (informal pt-BR)
- rejeita range fora 50-250
- NÃO bloqueia auto_transition_to_cadastro (3 OBR técnicos sem `altura_cm` ainda transiciona)

### `tests/tools/enviar-orcamento-tatuador.test.mjs` — ADIÇÕES

2 tests novos:

- `montarTextoOrcamento()` inclui linha "altura cliente: 170cm" quando preenchida
- `montarTextoOrcamento()` omite linha de altura quando NÃO preenchida (não quebra layout)

---

## Edge cases (todos sob princípio R9)

| # | Edge case | Comportamento |
|---|---|---|
| 1 | Cliente manda foto antes do bot pedir | R8 cobre — `dados_coletados(foto_local)` chamado. Single shot foto pulado. |
| 2 | Cliente manda selfie do rosto quando bot pede foto | Bot devolve: "Essa parece ser foto sua! Manda só do antebraço pra mim". 1 devolução. Se cliente persiste OU manda outra foto que não bate, segue sem foto (RECOMENDADO, não bloqueia). |
| 3 | Cliente manda foto da perna mas declarou antebraço (contradição local) | Bot devolve (R9): "Vi que mandou foto da perna — confirma que é na perna mesmo, não no antebraço?". Atualiza `local_corpo` se cliente confirma novo. Se evade → handoff `contradicao_nao_resolvida`. |
| 4 | Múltiplas fotos do local em turns diferentes | Última sobrescreve `foto_local` (string). Comportamento atual mantido. |
| 5 | Cliente manda altura formato exótico ("1m70", "tô com 1,7", "altura média") | `normalizarAltura()` parseia "1m70" e "1,7"; "altura média" não parseia → bot soft re-ask: "Manda em cm ou m, tipo 1.70m ou 170cm". Se ainda evade → segue sem (RECOMENDADO). |
| 6 | Cliente diz altura implausível ("3.50m") | Validação 50-250cm rejeita no backend. Bot devolve (R9): "3.50m é uma altura bem fora do comum, foi erro de digitação?". Se cliente CONFIRMA "é isso mesmo" → handoff `dado_implausivel`. Se CORRIGE → persiste novo. Se EVADE → handoff. |
| 7 | Cliente já mandou altura na fase Saudação ("oi sou Maria, 1.70m, quero rosa") | Multi-info: bot persiste tudo na 1ª msg; pula single shot altura na §3.3. |
| 8 | Estilo: cliente manda ref + texto contraditório ("realismo" + foto fineline) | Bot devolve (R9): "Vi que tu falou em realismo e me mandou foto de uma rosa fineline delicada. Tu queria tipo essa da foto, ou um estilo mais realista mesmo?". Persiste só após cliente confirmar. Se evade → handoff. |
| 9 | Cliente declara descrição "simples" + foto detalhada (ou vice-versa) | Bot devolve (R9): "Vi que tu mandou foto de uma rosa bem detalhada — tu queria uma assim, ou algo mais simples?". Idem #8. |
| 10 | Cliente recusa foto MAS engaja altura+estilo | Bot vai pra mensagem-ponte cadastro normalmente. Tatuador recebe orçamento sem foto, com altura+estilo. |
| 11 | Cliente evade tamanho 1×, dá referência visual no soft re-ask | Bot estima ("do pulso ao cotovelo são uns 25cm") → confirma com cliente → persiste se confirmado. |
| 12 | Cliente evade tamanho 2× | Bot chama `acionar_handoff(motivo='cliente_evasivo_infos_incompletas')`. |
| 13 | Cliente <18 (data nascimento) | Fluxo handoff atual (`menor_idade`) — sem mudança. Esse é gatilho da fase cadastro, não tattoo. |

---

## Testes

### 5.1 Test layers

- **Snapshot**: regen `coleta-tattoo.snap.txt` (1 dos 3). Cadastro/proposta — intactos.
- **Invariants**: 5 novos (cobrindo §3.3 OBR_RECOMENDADO, §3.3c removida, R9 explícita, T2 sequência, soft re-ask explícito).
- **Tool tests** (`dados-coletados`): 5 novos pra `altura_cm`.
- **Tool tests** (`enviar-orcamento-tatuador`): 2 novos pra payload com altura.
- **Não há novo test de integração end-to-end** — smoke E2E manual cobre.

### 5.2 Smoke E2E manual (após deploy, obrigatório)

13 cenários a validar via WhatsApp real (matching tabela edge cases acima).

Cenários críticos:
- #1 (cliente completo + foto espontânea) — pula single shots foto/estilo, só pergunta altura
- #2 (cliente goteja, recusa todos OBR_RECOMENDADO) — percorre 3 single shots, segue
- #3 (foto da perna ≠ antebraço declarado) — devolução R9 funciona
- #6 (altura 3.50m) — handoff `dado_implausivel` quando cliente confirma
- #8 (estilo conflitante) — devolução R9 com texto + foto
- #11 (tamanho via referência) — bot estima 25cm e confirma
- #12 (cliente evasivo 2×) — handoff funciona

### 5.3 Tests baseline (pré-merge)

Suite atual: 315/315 PASS. Após mudanças, esperado: 315 + ~12 novos (~327/327 PASS). Pré-condição de merge.

---

## Rollout

- **Branch**: `feat/coleta-foto-local-refs` (já criada)
- **PR único, squash merge.** Commit history limpo na main (igual padrão dos PRs #28/#29).
- **Sem feature flag.** Mudança contida no prompt + 1 campo JSONB novo (sem migration). Rollback = revert do PR.
- **Smoke E2E manual obrigatório pós-deploy** ANTES de declarar DONE.
- **Backlog updates**: ao final, criar 2 entries:
  1. **P0 — coleta-fotos-no-telegram-storage** (escopo B) em `InkFlow — Pendências (backlog).md`
  2. **P1 — review contradições prompt pós-implementação** (procurar divergências metodologia nova × antiga)
- **Memory anchors**: atualizar [[InkFlow — Modo Coleta v2 principal (2026-05-02)]] com decisões cravadas (R9 + T7 + altura como campo próprio + foto_local OBR_RECOMENDADO).

---

## Riscos

| Risco | Mitigação |
|---|---|
| LLM "esquece" pré-condição e pede foto/altura/estilo mesmo já tendo coletado | Few-shot exemplo dedicado (cenário 1 multi-info) + invariant test que valida pré-condições escritas no prompt |
| LLM faz soft re-ask repetindo a mesma frase (não reformula) | Few-shot exemplo dedicado (cenário 6/7) com 2 versões de pergunta + reformulação clara |
| LLM conta tentativas errado (3+ ao invés de 2) e perde momento de handoff | T7 explicit + few-shot cenário 7 e 12 mostrando exatamente quando dispara handoff |
| LLM ignora R9 e decide pelo cliente em contradição | Invariant test que valida R9 explícita + 3 few-shots novos (cenários 8/9/3) cobrindo contradições típicas |
| Cliente brasileiro digita altura em formato exótico que `normalizarAltura()` não cobre | Soft re-ask na fase tattoo cobre; aceita "não sei" e segue |
| Vision continua dando descrição textual genérica (sem novidade real) | Fora do escopo desta sessão — feature B (Storage) destrava foto real no Telegram |
| Tatuador real reagindo: "preciso da foto pra cravar valor, descrição textual não basta" | É o motivo da feature B no backlog. Validar empiricamente após smoke. |

---

## Backlog follow-ups (criar AO FINAL deste PR)

### P0 — coleta-fotos-no-telegram-storage (escopo B)

Anexar foto REAL no Telegram do tatuador junto com orçamento. Requer:
- Storage Supabase bucket dedicado (signed URL TTL ≥ 30 dias pro tatuador abrir Telegram dias depois)
- n8n upload base64 → Storage signed URL → backend persiste URL em `dados_coletados.foto_local_url` (ou similar — schema decision)
- `enviar-orcamento-tatuador.js` Telegram `sendPhoto` ou `sendMediaGroup` com URLs
- Retenção LGPD: política de apagar fotos após cliente cancelar / orçamento expirar
- Custo Storage Supabase pra projetar com volume esperado
- Brainstorm dedicado via `/nova-feature` na próxima sessão livre

Estimativa: 5-7h.

### P1 — review contradições prompt pós-implementação

(Adicionado a pedido do Leandro nesta sessão.)

Após este PR mergeado e em prod, fazer review meticulosa do prompt completo (todas as 3 fases: tattoo + cadastro + proposta) procurando:
- Contradições entre R9 e regras antigas (R1-R8, T1-T6) que possam ter sobrevivido sem update
- Few-shots antigos com tom inconsistente com o novo princípio "devolver contradições"
- Inconsistências entre o que o prompt diz vs. o que o tool aceita (ex: prompt menciona campo X mas tool não suporta)
- Divergências metodologia nova × antiga em few-shot-tenant (auditoria já feita por sample, não exhaustiva)
- Validação que R8 (interpretação visual) e R9 (devolver contradições) são complementares e não conflitantes

Trigger: 1-2 dias após merge, se possível com 1 smoke real adicional pra validar.

Estimativa: 2-3h.

---

## Cross-references

- [[InkFlow — Pendências (backlog)]] — entry P0 atual `coleta-foto-local-e-refs-tatuador` (descreve esta feature)
- [[InkFlow — Modo Coleta v2 principal (2026-05-02)]] — anchor da sub-feature, atualizar pós-merge
- [[InkFlow — Painel]] — estado anterior 06/05 noite (smoke E2E que originou os 3 achados)
- `inkflow-saas/docs/superpowers/specs/2026-05-06-refator-prompts-coleta-v2-design.md` — spec PR #28 (3 camadas Anthropic Tool Use)
- `inkflow-saas/supabase/migrations/2026-05-06-merge-conversa-jsonb-rpc.sql` — RPC merge atômico (PR #29)
- `functions/_lib/prompts/coleta/tattoo/{fluxo,regras,few-shot}.js` — files alvo do refator
- `functions/api/tools/{dados-coletados,enviar-orcamento-tatuador}.js` — tools afetadas

---

## Status

- [x] Brainstorm completo (Q1-Q4 + correções de Leandro + review meticulosa)
- [x] Spec escrita
- [ ] Spec self-review (próximo passo)
- [ ] User review gate
- [ ] `/plan` → writing-plans
- [ ] Implementação
- [ ] Smoke E2E
- [ ] Merge
- [ ] Backlog entries criadas (B + review contradições)
- [ ] Memory anchors atualizadas
