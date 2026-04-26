# Modo Coleta — PR 2 COMPLETO (backend: tools + prompts + testes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o modo Coleta ponta-a-ponta no backend: tools novas, 2 prompts novos (info + agendamento), dispatcher, Tier 1 de testes (snapshots + contracts + invariants + contamination linter). Feature flag `ENABLE_COLETA_MODE` permanece OFF em prod — modo só é exercitado via staging/testes.

**Architecture:** Plumbing (tools `dados_coletados` + `detectar-trigger` + coluna SQL `valor_fechado`) já existem no plano enxuto. Em cima disso: 2 prompts novos em `functions/_lib/prompts/coleta/{info,agendamento}/` compondo blocos `_shared/` com fluxo/regras/few-shot específicos; dispatcher ganha `case 'coleta'` com sub-switch por `submode + estado_agente`. Testes Tier 1 tratam coleta como terceiro modo: snapshots próprios, contracts próprios, invariants ampliados, contamination linter INVERTIDO (regra R3 garante supressão de valores).

**Tech Stack:** Idem PR 1 — JS ES modules, Node 20+, `node --test`, Supabase via MCP, CF Pages.

---

## Pre-conditions

Antes de começar este plano:

1. **PR 2 enxuto executado** — `docs/superpowers/plans/2026-04-23-modo-coleta-pr2-tools.md` Tasks 1-3 (migration + 2 tools + testes) concluídos. Se não, este plano embute as Tasks equivalentes (1-3).
2. **PR 1 mergeado em main** — `functions/_lib/prompts/{_shared,faixa,exato}/` existem; `conversas.estado_agente` e `tenants.fewshots_por_modo` aplicados.
3. **42 testes pré-existentes verdes** (snapshot, contracts, invariants, contamination, update-tenant-validations, telegram, trial-helpers).
4. Branch base: `feat/modo-coleta-pr2-backend` (se executando do zero) OU continuação de `feat/modo-coleta-pr2-tools` (se vem do enxuto).

---

## File Structure

**Novos arquivos:**

```
migrations/
└── 2026-04-23-conversas-valor-fechado.sql     ← (vem do enxuto)

functions/api/tools/
├── dados-coletados.js                          ← (vem do enxuto)
└── detectar-trigger.js                         ← (vem do enxuto)

functions/_lib/prompts/coleta/
├── info/
│   ├── fluxo.js                                ← §3 coleta-info — checklist OBR + handoff por submode
│   ├── regras.js                               ← §4 coleta-info — R1-R7 (não fala valor)
│   ├── few-shot.js                             ← §7 coleta-info — 4-5 exemplos
│   ├── few-shot-tenant.js                      ← §7b — lê tenant.fewshots_por_modo.coleta_info
│   └── generate.js                             ← compõe; aceita { submode: 'puro' | 'reentrada' }
└── agendamento/
    ├── fluxo.js                                ← §3 agendamento — declara valor + slots + sinal
    ├── regras.js                               ← §4 agendamento — R1-R5 (não renegocia)
    ├── few-shot.js                             ← §7 agendamento — 3-4 exemplos
    ├── few-shot-tenant.js                      ← §7b — lê fewshots_por_modo.coleta_agendamento
    └── generate.js

tests/prompts/
├── fixtures/
│   └── tenant-coleta.js                        ← 3 fixtures (info-puro, info-reentrada, agendamento)
├── snapshots/
│   ├── coleta-info-puro.txt                    ← gerado por UPDATE_SNAPSHOTS=1
│   ├── coleta-info-reentrada.txt
│   └── coleta-agendamento.txt
└── contracts/
    ├── coleta-info.js                          ← contrato próprio (must_not_contain valores)
    └── coleta-agendamento.js

tests/
├── dados-coletados.test.mjs                    ← (vem do enxuto)
└── detectar-trigger.test.mjs                   ← (vem do enxuto)
```

**Arquivos modificados:**

- `functions/_lib/prompts/index.js` — adiciona `case 'coleta'` com sub-switch
- `tests/prompts/snapshot.test.mjs` — adiciona 3 tests novos
- `tests/prompts/contracts.test.mjs` — adiciona 2 tests novos
- `tests/prompts/invariants.test.mjs` — amplia `MODOS_SUPORTADOS` e ajusta cross-mode
- `tests/prompts/contamination.test.mjs` — adiciona 2 tests (ativa PR-2 stub comentado)
- `.githooks/pre-commit` — trigger de case pattern ganha `functions/_lib/prompts/coleta/*`

---

## Task 1-3: Plumbing (referência ao plano enxuto)

Se o plano enxuto `docs/superpowers/plans/2026-04-23-modo-coleta-pr2-tools.md` JÁ foi executado, **pular** estas tasks e ir direto pra Task 4. Caso contrário, executar:

- **Task 1 (migration `conversas.valor_fechado`):** veja Task 1 do plano enxuto.
- **Task 2 (tool `dados_coletados`):** veja Task 2 do plano enxuto. Código completo + 12 testes.
- **Task 3 (tool `detectar-trigger`):** veja Task 3 do plano enxuto. Código completo + 18 testes.

Ao final, branch deve ter 3 commits (migration + 2 tools) e 72 tests verdes.

---

## Task 4: Fixtures `tenant-coleta.js`

**Files:**
- Create: `tests/prompts/fixtures/tenant-coleta.js`

- [ ] **Step 1: Criar fixtures**

Conteúdo:

```javascript
// Fixtures do modo Coleta — 3 cenários canônicos.
// Diferem do tenant-canonico só em config_precificacao e eventualmente conversa state.

import { tenantCanonicoFaixa } from './tenant-canonico.js';

export const tenantColetaPuro = {
  ...tenantCanonicoFaixa,
  id: '00000000-0000-0000-0000-000000000003',
  config_precificacao: {
    modo: 'coleta',
    coleta_submode: 'puro',
    sinal_percentual: 30,
    tamanho_maximo_sessao_cm: 35,
  },
};

export const tenantColetaReentrada = {
  ...tenantCanonicoFaixa,
  id: '00000000-0000-0000-0000-000000000004',
  config_precificacao: {
    modo: 'coleta',
    coleta_submode: 'reentrada',
    trigger_handoff: 'Lina, assume',
    sinal_percentual: 30,
    tamanho_maximo_sessao_cm: 35,
  },
};

// Conversa em estado 'agendamento' com valor_fechado setado.
// Usada pra testar o prompt coleta/agendamento (fase 2 da reentrada).
export const conversaAgendamento = {
  id: 'conv-agend-01',
  estado: 'escolhendo_horario',
  estado_agente: 'agendamento',
  valor_fechado: 750,
  dados_coletados: {
    descricao_tattoo: 'rosa fineline no antebraço',
    tamanho_cm: 10,
    local_corpo: 'antebraco',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add tests/prompts/fixtures/tenant-coleta.js
git commit -m "test(prompts): fixtures tenantColetaPuro/Reentrada + conversaAgendamento

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `prompts/coleta/info/fluxo.js`

**Files:**
- Create: `functions/_lib/prompts/coleta/info/fluxo.js`

**Purpose:** §3 do prompt Coleta-Info. Exporta `fluxo(tenant, clientContext, { submode })`. Checklist de 3 OBR + 3 OPC, estratégia de fallback pra tamanho, handoff por submode, gatilhos imediatos.

**Anchors (assertions que o texto DEVE satisfazer — servem de contrato com os testes):**
- Contém `"§3 FLUXO"` como header
- Contém todas as palavras: `descricao_tattoo`, `tamanho_cm`, `local_corpo` (nomes dos campos OBR)
- Contém `dados_coletados` (nome da tool)
- Contém `acionar_handoff`
- Se `submode === 'puro'`: inclui frase final *"Ele te retorna em breve com valor e pra marcar a sessão"*
- Se `submode === 'reentrada'`: inclui *"eu volto pra fechar o horário"*
- NÃO contém `calcular_orcamento`, `consultar_horarios_livres`, `gerar_link_sinal` (ferramentas proibidas)
- Lista gatilhos imediatos: `cover_up_detectado`, `menor_idade`, `area_restrita`, `retoque`, `cliente_agressivo`, `idioma_nao_suportado`, `fora_escopo`, `cliente_evasivo_infos_incompletas`

- [ ] **Step 1: Criar o arquivo seguindo os anchors acima**

Esqueleto:

```javascript
// ── §3 FLUXO — modo Coleta-Info ────────────────────────────────────────────
// Coleta de infos pro tatuador orçar manualmente. NÃO chama calcular_orcamento.
// submode='puro' → handoff + sai; submode='reentrada' → handoff + promete voltar.

export function fluxo(tenant, clientContext, { submode = 'puro' } = {}) {
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';
  const isEstudio = tenant.plano === 'estudio' || tenant.plano === 'premium';

  const linhas = ['# §3 FLUXO'];
  linhas.push('Sua missão: coletar os 3 dados obrigatórios (descricao_tattoo, tamanho_cm, local_corpo) e passar o bastão pro tatuador. Você NÃO orça, NÃO fala valor, NÃO agenda — isso é alçada do tatuador.');
  linhas.push('');

  // §3.1 Saudação (mesmo pattern de faixa/exato)
  linhas.push('## §3.1 Saudacao inicial (so no PRIMEIRO turno do PRIMEIRO contato)');
  linhas.push('Envie em 2 baloes separados por UMA LINHA EM BRANCO:');
  linhas.push(`- Balao 1: "Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst}"`);
  linhas.push('- Balao 2: "Me conta o que esta pensando em fazer?"');
  linhas.push('');

  // §3.2 Checklist de coleta
  linhas.push('## §3.2 Coleta (OBRIGATORIOS — bloqueia handoff sem os 3)');
  linhas.push('1. descricao_tattoo — o que o cliente quer tatuar (ideia/tema)');
  linhas.push('2. tamanho_cm — altura aproximada em cm');
  linhas.push('3. local_corpo — onde (antebraco, biceps, costela, etc)');
  linhas.push('');
  linhas.push('## §3.2b Coleta (OPCIONAIS — pergunte UMA vez, siga se cliente pular)');
  linhas.push('- estilo — se cliente souber');
  linhas.push('- foto_local — pra tatuador ver espaço disponível');
  linhas.push('- refs_imagens — qualquer referência visual que cliente tenha');
  linhas.push('');
  linhas.push('Persistência: use `dados_coletados(campo, valor)` pra gravar cada info conforme coletar.');
  linhas.push('');

  // §3.3 Fallback tamanho
  linhas.push('## §3.3 Fallback pra tamanho (cliente não sabe)');
  linhas.push('1. Ofereça referência do corpo: "tipo do pulso ao cotovelo são uns 25cm"');
  linhas.push('2. Se não souber, peça altura: "me manda sua altura (tipo 1.70m) que eu calculo a proporção"');
  linhas.push('3. Na 3a tentativa sem sucesso: `acionar_handoff(motivo="cliente_sem_referencia_tamanho")`');
  linhas.push('');

  // §3.4 Handoff por submode
  linhas.push('## §3.4 Handoff (fim da coleta)');
  linhas.push('Quando tiver os 3 OBR, envie resumo do que coletou e faça handoff.');
  linhas.push('');
  if (submode === 'reentrada') {
    linhas.push('Mensagem final: "Anotei tudo! Vou passar pro tatuador avaliar. Ele vai te mandar o valor por aqui mesmo, e depois eu volto pra fechar o horário com você!"');
    linhas.push('Chame `acionar_handoff(motivo="coleta_completa_reentrada")`.');
  } else {
    linhas.push('Mensagem final: "Anotei tudo! Vou passar pro tatuador avaliar. Ele te retorna em breve com valor e pra marcar a sessão!"');
    linhas.push('Chame `acionar_handoff(motivo="coleta_completa")`.');
  }
  linhas.push('');

  // §3.5 Gatilhos imediatos
  linhas.push('## §3.5 Gatilhos de handoff imediato (antes/durante checklist)');
  linhas.push('Se detectar QUALQUER um, PARE coleta e chame acionar_handoff:');
  linhas.push('- Cover-up (cliente menciona OU foto mostra pele tatuada) → `cover_up_detectado`');
  linhas.push('- Menor de idade → `menor_idade`');
  linhas.push('- Área restrita (rosto, pescoço, mãos, dedos, genital) → `area_restrita_{local}`');
  linhas.push('- Retoque de tattoo antiga → `retoque`');
  linhas.push('- Cliente agressivo → `cliente_agressivo`');
  linhas.push('- Idioma não suportado → `idioma_nao_suportado`');
  linhas.push('- Fora do escopo (produto médico, etc) → `fora_escopo`');
  linhas.push('- 3x frustração em OBR sem resposta → `cliente_evasivo_infos_incompletas`');

  return linhas.join('\n');
}
```

- [ ] **Step 2: Smoke test manual**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
node -e "
import('./functions/_lib/prompts/coleta/info/fluxo.js').then(m => {
  const puro = m.fluxo({ nome_agente: 'Lina', nome_estudio: 'X', plano: 'individual' }, {}, { submode: 'puro' });
  const reen = m.fluxo({ nome_agente: 'Lina', nome_estudio: 'X', plano: 'individual' }, {}, { submode: 'reentrada' });
  console.log('puro contém retorna:', puro.includes('retorna em breve'));
  console.log('reentrada contém volto:', reen.includes('eu volto pra fechar'));
  console.log('ambos banem calcular_orcamento:', !puro.includes('calcular_orcamento') && !reen.includes('calcular_orcamento'));
});
"
```

Expected: 3 `true`s.

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/coleta/info/fluxo.js
git commit -m "feat(prompts): coleta/info/fluxo — checklist OBR + handoff por submode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `prompts/coleta/info/regras.js`

**Files:**
- Create: `functions/_lib/prompts/coleta/info/regras.js`

**Purpose:** §4 do Coleta-Info. As 7 regras invioláveis: R1 (não fala valor), R2 (calcular_orcamento banida), R3 (supressão de valores da FAQ), R4 (cover-up handoff), R5 (cor inferida, não perguntada), R6 (primeira tattoo não perguntada), R7 (data não perguntada).

**Anchors:**
- Header `"§4 REGRAS INVIOLAVEIS"`
- Contém `"R1"` a `"R7"` literais como labels
- Contém `"NÃO fala valor"` ou variação clara
- Contém `"tatuador confirma"` (resposta padrão quando cliente pergunta preço)
- R3 contém frase literal: `"Mesmo que FAQ ou contexto abaixo mencionem valores, você NÃO repete nem apresenta qualquer valor monetário"`
- NÃO contém `calcular_orcamento` como ferramenta disponível (pode mencionar "não use")

- [ ] **Step 1: Criar arquivo**

```javascript
// ── §4 REGRAS INVIOLAVEIS — modo Coleta-Info ──────────────────────────────
// Regras específicas do modo coleta. Defesa em profundidade pra suprimir
// valores que possam vazar via FAQ/few-shots custom do tenant.

export function regras(tenant) {
  const linhas = ['# §4 REGRAS INVIOLAVEIS'];

  linhas.push('**R1.** NÃO fala valor. Nunca. Se cliente perguntar "quanto vai ficar?", responda: "sobre valor o tatuador confirma pessoalmente quando avaliar tua ideia — segue comigo que ele te retorna rapidinho".');
  linhas.push('');
  linhas.push('**R2.** A tool `calcular_orcamento` NÃO está disponível neste modo. Não tente chamar.');
  linhas.push('');
  linhas.push('**R3.** Mesmo que FAQ ou contexto abaixo mencionem valores, você NÃO repete nem apresenta qualquer valor monetário. Se cliente perguntar, diga que o tatuador confirma. Responda o fator factual (ex: "sim, trabalhamos com sinal") mas OMITA o número.');
  linhas.push('');
  linhas.push('**R4.** COVER-UP: handoff imediato. Detecte por (a) cliente mencionar "cobrir", "cover", "tapar", "disfarçar", "tattoo antiga"; OU (b) imagem de referência mostrar pele já tatuada. NUNCA pergunte sobre cobertura ativamente. Gatilho = `cover_up_detectado`.');
  linhas.push('');
  linhas.push('**R5.** COR vs P&C: NÃO pergunte. Infira da descrição + referências. Se ambíguo, registre `dados_coletados(campo="estilo", valor="a_definir")` e siga.');
  linhas.push('');
  linhas.push('**R6.** PRIMEIRA TATTOO: NÃO pergunte. Se cliente mencionar espontaneamente, adapte o tom (mais acolhedor) mas não colete essa info.');
  linhas.push('');
  linhas.push('**R7.** DATA/DISPONIBILIDADE: NÃO pergunte. Agenda é alçada do tatuador neste modo.');

  return linhas.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/_lib/prompts/coleta/info/regras.js
git commit -m "feat(prompts): coleta/info/regras — R1-R7 (não fala valor, cover-up handoff, cor inferida)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `prompts/coleta/info/few-shot*.js`

**Files:**
- Create: `functions/_lib/prompts/coleta/info/few-shot.js`
- Create: `functions/_lib/prompts/coleta/info/few-shot-tenant.js`

**Anchors pro `few-shot.js`:**
- Header `"§7 EXEMPLOS DE CONVERSAS IDEAIS"`
- 4-5 exemplos, todos terminam com `acionar_handoff` e NÃO contêm `R$` ou `valor`
- Exemplo 1: fluxo completo (cliente dá 3 OBR → handoff)
- Exemplo 2: cliente pergunta preço → agente deflete ("o tatuador confirma") → volta ao checklist
- Exemplo 3: cover-up detectado por foto → handoff imediato
- Exemplo 4: cliente não sabe tamanho → agente pede altura → cliente responde → handoff

- [ ] **Step 1: Criar `few-shot.js`**

```javascript
// ── §7 FEW-SHOT BASE — modo Coleta-Info ────────────────────────────────────

export function fewShotBase(tenant) {
  const nomeAg = tenant.nome_agente || 'atendente';
  const nomeEst = tenant.nome_estudio || 'estudio';

  return `# §7 EXEMPLOS DE CONVERSAS IDEAIS

## Exemplo 1 — Fluxo completo (puro)

Cliente: oi, quero uma tatuagem
Voce: Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst}

Me conta o que esta pensando em fazer?

Cliente: uma rosa no antebraco, uns 10cm
Voce: [chama dados_coletados(campo="descricao_tattoo", valor="rosa")]
[chama dados_coletados(campo="local_corpo", valor="antebraco")]
[chama dados_coletados(campo="tamanho_cm", valor=10)]
Massa! Anotei tudo.

Se tiver foto do local ou uma referencia visual manda tambem — ajuda o tatuador

Cliente: [manda foto de referencia]
Voce: [chama dados_coletados(campo="refs_imagens", valor=["url-da-foto"])]
Valeu! Vou passar pro tatuador avaliar. Ele te retorna em breve com valor e pra marcar a sessao!
[chama acionar_handoff(motivo="coleta_completa")]

## Exemplo 2 — Cliente pergunta preço

Cliente: quanto fica uma tatuagem de 15cm no braco?
Voce: Sobre valor o tatuador confirma pessoalmente quando avaliar tua ideia. Me conta primeiro o que voce quer tatuar?

Cliente: um leao realista
Voce: [chama dados_coletados(campo="descricao_tattoo", valor="leao realista")]
[chama dados_coletados(campo="local_corpo", valor="braco")]
[chama dados_coletados(campo="tamanho_cm", valor=15)]
Show, em qual parte do braco — antebraco, biceps ou ombro?

## Exemplo 3 — Cover-up detectado por foto

Cliente: quero uma tatuagem no antebraco
Voce: Massa! Manda uma foto do local pra gente ver o espaco

Cliente: [foto] [descricao injetada: "antebraco com tattoo existente"]
Voce: Vi que voce ja tem uma tatuagem nesse local — esse caso de cobertura o tatuador avalia pessoalmente, ja te direciono pra ele
[chama acionar_handoff(motivo="cover_up_detectado")]

## Exemplo 4 — Fallback tamanho

Cliente: quero uma rosa no antebraco
Voce: Massa! E qual o tamanho aproximado que voce imagina? Tipo 8cm, 12cm de altura

Cliente: sei la, voce que sabe
Voce: Tranquilo — me manda tua altura (tipo 1.70m) que com a foto do antebraco consigo calcular a proporcao certinha

Cliente: 1.75m, e [foto do antebraco]
Voce: [chama dados_coletados(campo="descricao_tattoo", valor="rosa")]
[chama dados_coletados(campo="local_corpo", valor="antebraco")]
[chama dados_coletados(campo="tamanho_cm", valor=12)]
Valeu! Com essa proporcao fica uns 12cm. Passo pro tatuador avaliar!
[chama acionar_handoff(motivo="coleta_completa")]`;
}
```

- [ ] **Step 2: Criar `few-shot-tenant.js`**

```javascript
// ── §7b FEW-SHOT TENANT — modo Coleta-Info ────────────────────────────────
// Lê tenant.fewshots_por_modo.coleta_info (coluna adicionada em PR 1).

export function fewShotTenant(tenant) {
  const ex = tenant.fewshots_por_modo?.coleta_info || [];
  if (!Array.isArray(ex) || ex.length === 0) return '';
  const formatado = ex.map((e, i) => {
    if (typeof e === 'string') return `### Exemplo customizado ${i + 1}\n${e}`;
    if (e && typeof e === 'object' && e.cliente && e.agente) {
      return `### Exemplo customizado ${i + 1}\nCliente: ${e.cliente}\nVoce: ${e.agente}`;
    }
    return '';
  }).filter(Boolean).join('\n\n');
  return formatado ? `# §7b EXEMPLOS CUSTOMIZADOS DO ESTUDIO\n${formatado}` : '';
}
```

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/coleta/info/few-shot.js functions/_lib/prompts/coleta/info/few-shot-tenant.js
git commit -m "feat(prompts): coleta/info few-shots (base + tenant)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: `prompts/coleta/info/generate.js`

**Files:**
- Create: `functions/_lib/prompts/coleta/info/generate.js`

**Anchors:**
- Assinatura: `generatePromptColetaInfo(tenant, conversa, clientContext, { submode } = {})`
- Ordem dos blocos: identidade → checklistCritico → tom → fluxo (com submode) → regras → contexto → faqBlock → fewShotTenant → fewShotBase
- Usa shared blocks: `_shared/identidade`, `_shared/checklist-critico`, `_shared/tom`, `_shared/contexto`, `_shared/faq`
- `submode` é passado pra `fluxo()` como 3º arg no shape `{ submode }`

- [ ] **Step 1: Criar arquivo**

```javascript
// ── Gerador do system prompt — modo Coleta-Info ────────────────────────────

import { identidade } from '../../_shared/identidade.js';
import { checklistCritico } from '../../_shared/checklist-critico.js';
import { tom } from '../../_shared/tom.js';
import { contexto } from '../../_shared/contexto.js';
import { faqBlock } from '../../_shared/faq.js';
import { fluxo } from './fluxo.js';
import { regras } from './regras.js';
import { fewShotBase } from './few-shot.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptColetaInfo(tenant, conversa, clientContext, { submode = 'puro' } = {}) {
  const ctx = clientContext || {};
  const blocks = [
    identidade(tenant),
    checklistCritico(tenant),
    tom(tenant),
    fluxo(tenant, ctx, { submode }),
    regras(tenant),
    contexto(tenant, conversa, ctx),
    faqBlock(tenant),
    fewShotTenant(tenant),
    fewShotBase(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
```

- [ ] **Step 2: Smoke test**

```bash
node -e "
import('./functions/_lib/prompts/coleta/info/generate.js').then(m => {
  const fx = await import('./tests/prompts/fixtures/tenant-coleta.js');
  const pPuro = m.generatePromptColetaInfo(fx.tenantColetaPuro, null, { is_first_contact: true }, { submode: 'puro' });
  const pReen = m.generatePromptColetaInfo(fx.tenantColetaReentrada, null, { is_first_contact: true }, { submode: 'reentrada' });
  console.log('puro len:', pPuro.length);
  console.log('reentrada len:', pReen.length);
  console.log('puro sem calcular_orcamento:', !pPuro.includes('calcular_orcamento'));
  console.log('puro tem dados_coletados:', pPuro.includes('dados_coletados'));
  console.log('reentrada tem volto:', pReen.includes('eu volto pra fechar'));
});
"
```

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/coleta/info/generate.js
git commit -m "feat(prompts): coleta/info/generate — dispatcher por submode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `prompts/coleta/agendamento/fluxo.js`

**Files:**
- Create: `functions/_lib/prompts/coleta/agendamento/fluxo.js`

**Anchors:**
- Header `"§3 FLUXO"`
- Referência literal a `conversa.valor_fechado` como source of truth
- Passos: (1) declarar valor, (2) perguntar disponibilidade, (3) consultar_horarios_livres, (4) reservar_horario, (5) gerar_link_sinal com cálculo do sinal
- Fórmula sinal: `Math.round(valor_fechado * sinal_percentual / 100)`
- Contém `consultar_horarios_livres`, `reservar_horario`, `gerar_link_sinal`, `acionar_handoff`
- NÃO contém `dados_coletados` (não expor)
- NÃO contém `calcular_orcamento` (valor já fechado)

- [ ] **Step 1: Criar arquivo**

```javascript
// ── §3 FLUXO — modo Coleta-Agendamento (reentrada fase 2) ──────────────────
// Ativa quando conversa.estado_agente='agendamento' após trigger-phrase do tatuador.
// Source of truth: conversa.valor_fechado (setado pelo detectar-trigger).

export function fluxo(tenant, clientContext) {
  const sinalPct = tenant?.config_precificacao?.sinal_percentual ?? tenant?.sinal_percentual ?? 30;

  const linhas = ['# §3 FLUXO'];
  linhas.push('Você voltou à conversa porque o tatuador fechou o valor. O valor-fonte-de-verdade está em `conversa.valor_fechado` (use como referência).');
  linhas.push('');
  linhas.push('## §3.1 Primeira mensagem — DECLARA o valor (self-correction)');
  linhas.push(`Formato obrigatório: "Show! O ${tenant?.nome_estudio || 'tatuador'} fechou R$ {valor_fechado} contigo. Bora marcar teu horário — que dia e horário ficam bom pra ti?"`);
  linhas.push('Isso permite que cliente corrija caso valor esteja errado. Se cliente corrigir, chame `acionar_handoff(motivo="cliente_disputa_valor")`.');
  linhas.push('');
  linhas.push('## §3.2 Agendamento');
  linhas.push('1. Cliente responde data/horário preferido');
  linhas.push('2. Chame `consultar_horarios_livres(tenant_id, data_preferida, duracao_h)`');
  linhas.push('3. Apresente até 3 slots usando campo "legenda" (já formatado em pt-BR)');
  linhas.push('4. Cliente escolhe 1 → `reservar_horario` com "inicio"/"fim" exatos do slot');
  linhas.push('5. Em sequência natural: `gerar_link_sinal(agendamento_id, valor_sinal)` onde:');
  linhas.push(`   valor_sinal = Math.round(conversa.valor_fechado * ${sinalPct} / 100)`);
  linhas.push('');
  linhas.push('## §3.3 Envio do link (formato obrigatório)');
  linhas.push(`a) Linha 1: "Pra agendar a gente trabalha com sinal de ${sinalPct}% do valor, em torno de R$ {valor_sinal}."`);
  linhas.push('b) Linha em branco, URL crua em linha própria');
  linhas.push('c) Linha em branco, "O link tem validade de {hold_horas} horas. Se expirar, só me chamar que envio outro."');
  linhas.push('');
  linhas.push('## §3.4 Handoff (quando for necessário)');
  linhas.push('- Cliente discorda do valor → `acionar_handoff(motivo="cliente_disputa_valor")`');
  linhas.push('- Cliente pede desconto → `acionar_handoff(motivo="cliente_pede_desconto")`');
  linhas.push('- Cliente quer mudar design/local/tamanho (muda escopo) → `acionar_handoff(motivo="cliente_quer_mudar_escopo")`');
  linhas.push('- Erro técnico (PIX falhou 2x, agenda quebrada) → `acionar_handoff(motivo="erro_tecnico")`');

  return linhas.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/_lib/prompts/coleta/agendamento/fluxo.js
git commit -m "feat(prompts): coleta/agendamento/fluxo — declara valor + agenda + sinal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `prompts/coleta/agendamento/regras.js`

**Files:**
- Create: `functions/_lib/prompts/coleta/agendamento/regras.js`

**Anchors:**
- Header `"§4 REGRAS INVIOLAVEIS"`
- R1-R5 literais
- R1: declara valor na 1ª mensagem
- R2: source of truth é `conversa.valor_fechado`
- R3: não renegociar preço
- R4: fórmula sinal
- R5: mudança de escopo = handoff

- [ ] **Step 1: Criar arquivo**

```javascript
// ── §4 REGRAS INVIOLAVEIS — modo Coleta-Agendamento ───────────────────────

export function regras(tenant) {
  const sinalPct = tenant?.config_precificacao?.sinal_percentual ?? tenant?.sinal_percentual ?? 30;

  const linhas = ['# §4 REGRAS INVIOLAVEIS'];

  linhas.push('**R1.** Primeira mensagem SEMPRE declara o valor explicitamente (formato "R$ {valor_fechado}") — serve de self-correction caso tatuador tenha digitado errado.');
  linhas.push('');
  linhas.push('**R2.** Source of truth é `conversa.valor_fechado` (veio do trigger-phrase do tatuador). NÃO use valores mencionados antes (no histórico do modo coleta-info, por exemplo).');
  linhas.push('');
  linhas.push('**R3.** NÃO renegocia preço. Se cliente discordar, insistir ou pedir desconto → handoff imediato. Responda: "Pra mexer no valor o tatuador precisa avaliar — ja te direciono pra ele" e chame `acionar_handoff`.');
  linhas.push('');
  linhas.push(`**R4.** SINAL = Math.round(valor_fechado * ${sinalPct} / 100). Arredondado pra real cheio. Usar esse valor em gerar_link_sinal.`);
  linhas.push('');
  linhas.push('**R5.** Mudança de escopo (cliente quer mudar design, local ou tamanho) invalida o valor fechado. Responda: "Se muda o escopo o tatuador precisa avaliar de novo, ja te direciono pra ele" e chame `acionar_handoff(motivo="cliente_quer_mudar_escopo")`.');

  return linhas.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add functions/_lib/prompts/coleta/agendamento/regras.js
git commit -m "feat(prompts): coleta/agendamento/regras — R1-R5 (declara valor, não renegocia)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: `prompts/coleta/agendamento/few-shot*.js`

**Files:**
- Create: `functions/_lib/prompts/coleta/agendamento/few-shot.js`
- Create: `functions/_lib/prompts/coleta/agendamento/few-shot-tenant.js`

**Anchors:**
- `few-shot.js`: 3-4 exemplos cobrindo (a) fluxo completo valor→data→slot→sinal, (b) cliente disputa valor → handoff, (c) cliente muda escopo → handoff
- `few-shot-tenant.js`: lê `tenant.fewshots_por_modo.coleta_agendamento`

- [ ] **Step 1: Criar `few-shot.js`**

```javascript
// ── §7 FEW-SHOT BASE — modo Coleta-Agendamento ────────────────────────────

export function fewShotBase(tenant) {
  const nomeEst = tenant.nome_estudio || 'estudio';

  return `# §7 EXEMPLOS DE CONVERSAS IDEAIS

## Exemplo 1 — Fluxo completo

(Conversa chegou aqui via trigger-phrase; conversa.valor_fechado=750)

Voce: Show! O ${nomeEst} fechou R$ 750 contigo. Bora marcar teu horario — que dia e horario ficam bom pra ti?

Cliente: quinta feira de manha
Voce: [chama consultar_horarios_livres] Tenho esses horarios:
- quinta-feira de 10:00 as 13:00
- quinta-feira de 13:00 as 16:00
Qual fica melhor?

Cliente: 10h
Voce: [chama reservar_horario + gerar_link_sinal] Fechou, reservei quinta 10:00

Pra agendar a gente trabalha com sinal de 30% do valor, em torno de R$ 225. Aqui o link:
https://mercadopago.com.br/checkout/v1/redirect?pref_id=XXXXX

O link tem validade de 48 horas. Se expirar so me chamar que envio outro

## Exemplo 2 — Cliente disputa valor

Voce: Show! O ${nomeEst} fechou R$ 750 contigo. Bora marcar teu horario?

Cliente: mas o tatuador tinha falado R$ 600
Voce: Pra mexer no valor o tatuador precisa avaliar — ja te direciono pra ele
[chama acionar_handoff(motivo="cliente_disputa_valor")]

## Exemplo 3 — Cliente muda escopo

Voce: Show! O ${nomeEst} fechou R$ 750 contigo. Bora marcar teu horario?

Cliente: pensando aqui, prefiro fazer no antebraco em vez do ombro
Voce: Se muda o escopo o tatuador precisa avaliar de novo, ja te direciono pra ele
[chama acionar_handoff(motivo="cliente_quer_mudar_escopo")]`;
}
```

- [ ] **Step 2: Criar `few-shot-tenant.js`** (mesmo pattern do coleta/info)

```javascript
// ── §7b FEW-SHOT TENANT — modo Coleta-Agendamento ─────────────────────────

export function fewShotTenant(tenant) {
  const ex = tenant.fewshots_por_modo?.coleta_agendamento || [];
  if (!Array.isArray(ex) || ex.length === 0) return '';
  const formatado = ex.map((e, i) => {
    if (typeof e === 'string') return `### Exemplo customizado ${i + 1}\n${e}`;
    if (e && typeof e === 'object' && e.cliente && e.agente) {
      return `### Exemplo customizado ${i + 1}\nCliente: ${e.cliente}\nVoce: ${e.agente}`;
    }
    return '';
  }).filter(Boolean).join('\n\n');
  return formatado ? `# §7b EXEMPLOS CUSTOMIZADOS DO ESTUDIO\n${formatado}` : '';
}
```

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/coleta/agendamento/few-shot.js functions/_lib/prompts/coleta/agendamento/few-shot-tenant.js
git commit -m "feat(prompts): coleta/agendamento few-shots (base + tenant)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: `prompts/coleta/agendamento/generate.js`

**Files:**
- Create: `functions/_lib/prompts/coleta/agendamento/generate.js`

```javascript
// ── Gerador do system prompt — modo Coleta-Agendamento (reentrada fase 2) ─

import { identidade } from '../../_shared/identidade.js';
import { checklistCritico } from '../../_shared/checklist-critico.js';
import { tom } from '../../_shared/tom.js';
import { contexto } from '../../_shared/contexto.js';
import { faqBlock } from '../../_shared/faq.js';
import { fluxo } from './fluxo.js';
import { regras } from './regras.js';
import { fewShotBase } from './few-shot.js';
import { fewShotTenant } from './few-shot-tenant.js';

export function generatePromptColetaAgendamento(tenant, conversa, clientContext) {
  const ctx = clientContext || {};
  const blocks = [
    identidade(tenant),
    checklistCritico(tenant),
    tom(tenant),
    fluxo(tenant, ctx),
    regras(tenant),
    contexto(tenant, conversa, ctx),
    faqBlock(tenant),
    fewShotTenant(tenant),
    fewShotBase(tenant),
  ].filter(b => b && b.trim().length > 0);
  return blocks.join('\n\n---\n\n');
}
```

- [ ] **Step 1: Commit**

```bash
git add functions/_lib/prompts/coleta/agendamento/generate.js
git commit -m "feat(prompts): coleta/agendamento/generate — compose blocks

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Dispatcher — branch `case 'coleta'`

**Files:**
- Modify: `functions/_lib/prompts/index.js`

- [ ] **Step 1: Substituir conteúdo completo por:**

```javascript
// ── Dispatcher público de prompts — InkFlow ────────────────────────────────
// API pública: generateSystemPrompt(tenant, conversa, clientContext) -> string
//
// Roteia por tenant.config_precificacao.modo.
// - modo='faixa' → generatePromptFaixa
// - modo='exato' → generatePromptExato
// - modo='coleta' + submode='reentrada' + estado_agente='agendamento' → generatePromptColetaAgendamento
// - modo='coleta' (demais casos) → generatePromptColetaInfo({ submode })

import { generatePromptFaixa } from './faixa/generate.js';
import { generatePromptExato } from './exato/generate.js';
import { generatePromptColetaInfo } from './coleta/info/generate.js';
import { generatePromptColetaAgendamento } from './coleta/agendamento/generate.js';

export function generateSystemPrompt(tenant, conversa, clientContext) {
  const cfg = tenant?.config_precificacao || {};
  const modo = cfg.modo || 'faixa';
  const submode = cfg.coleta_submode || 'puro';
  const estadoAgente = conversa?.estado_agente || 'ativo';

  switch (modo) {
    case 'exato':
      return generatePromptExato(tenant, conversa, clientContext);
    case 'coleta':
      if (submode === 'reentrada' && estadoAgente === 'agendamento') {
        return generatePromptColetaAgendamento(tenant, conversa, clientContext);
      }
      return generatePromptColetaInfo(tenant, conversa, clientContext, { submode });
    case 'faixa':
    default:
      return generatePromptFaixa(tenant, conversa, clientContext);
  }
}
```

- [ ] **Step 2: Smoke test dispatcher**

```bash
node -e "
(async () => {
  const d = await import('./functions/_lib/prompts/index.js');
  const fx = await import('./tests/prompts/fixtures/tenant-canonico.js');
  const fxC = await import('./tests/prompts/fixtures/tenant-coleta.js');

  const faixa = d.generateSystemPrompt(fx.tenantCanonicoFaixa, null, fx.clientContextPrimeiroContato);
  const exato = d.generateSystemPrompt(fx.tenantCanonicoExato, null, fx.clientContextPrimeiroContato);
  const coletaPuro = d.generateSystemPrompt(fxC.tenantColetaPuro, null, fx.clientContextPrimeiroContato);
  const coletaReen = d.generateSystemPrompt(fxC.tenantColetaReentrada, null, fx.clientContextPrimeiroContato);
  const coletaAgend = d.generateSystemPrompt(fxC.tenantColetaReentrada, fxC.conversaAgendamento, fx.clientContextPrimeiroContato);

  console.log('faixa===exato:', faixa === exato);
  console.log('faixa!==coletaPuro:', faixa !== coletaPuro);
  console.log('coletaPuro sem R$:', !/R\\$/.test(coletaPuro));
  console.log('coletaAgend tem declara valor:', coletaAgend.includes('fechou R\$'));
  console.log('coletaAgend !== coletaPuro:', coletaAgend !== coletaPuro);
})();
"
```

Expected: 5 `true`s.

- [ ] **Step 3: Commit**

```bash
git add functions/_lib/prompts/index.js
git commit -m "feat(prompts): dispatcher branch 'coleta' (info/agendamento)

Roteia:
- coleta + submode=reentrada + estado_agente=agendamento → coleta/agendamento
- coleta (demais casos) → coleta/info com { submode }

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Snapshots dos 3 modos coleta

**Files:**
- Modify: `tests/prompts/snapshot.test.mjs`
- Create: `tests/prompts/snapshots/coleta-info-puro.txt` (gerado)
- Create: `tests/prompts/snapshots/coleta-info-reentrada.txt`
- Create: `tests/prompts/snapshots/coleta-agendamento.txt`

- [ ] **Step 1: Adicionar 3 tests novos no `snapshot.test.mjs`**

Após os tests existentes, antes do invariante faixa==exato, adicione:

```javascript
import {
  tenantColetaPuro,
  tenantColetaReentrada,
  conversaAgendamento,
} from './fixtures/tenant-coleta.js';

test('snapshot: coleta-info submode=puro — primeiro contato', () => {
  const prompt = generateSystemPrompt(
    tenantColetaPuro,
    conversaVazia,
    clientContextPrimeiroContato,
  );
  compareOrWrite('coleta-info-puro', prompt);
});

test('snapshot: coleta-info submode=reentrada — primeiro contato', () => {
  const prompt = generateSystemPrompt(
    tenantColetaReentrada,
    conversaVazia,
    clientContextPrimeiroContato,
  );
  compareOrWrite('coleta-info-reentrada', prompt);
});

test('snapshot: coleta-agendamento — após trigger-phrase', () => {
  const prompt = generateSystemPrompt(
    tenantColetaReentrada,
    conversaAgendamento,
    clientContextPrimeiroContato,
  );
  compareOrWrite('coleta-agendamento', prompt);
});
```

**Nota:** o test existente "invariante inicial: faixa e exato têm mesmo prompt" continua válido (Coleta é 3º modo, não afeta Faixa/Exato).

- [ ] **Step 2: Gerar snapshots**

```bash
UPDATE_SNAPSHOTS=1 node --test tests/prompts/snapshot.test.mjs
```

- [ ] **Step 3: Verificar**

```bash
ls -la tests/prompts/snapshots/
# Expected: 5 arquivos (.gitkeep + faixa + exato + coleta-info-puro + coleta-info-reentrada + coleta-agendamento)
wc -l tests/prompts/snapshots/coleta-*.txt
```

- [ ] **Step 4: Rodar sem UPDATE pra confirmar que locka**

```bash
node --test tests/prompts/snapshot.test.mjs
# Expected: 6 pass
```

- [ ] **Step 5: Commit**

```bash
git add tests/prompts/snapshot.test.mjs tests/prompts/snapshots/coleta-*.txt
git commit -m "test(prompts): snapshots coleta (info-puro, info-reentrada, agendamento)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Contracts Coleta

**Files:**
- Create: `tests/prompts/contracts/coleta-info.js`
- Create: `tests/prompts/contracts/coleta-agendamento.js`
- Modify: `tests/prompts/contracts.test.mjs`

- [ ] **Step 1: Criar `coleta-info.js`**

```javascript
export const contratoColetaInfo = {
  modo: 'coleta',
  must_contain: [
    '§0 CHECKLIST',
    '§1 IDENTIDADE',
    '§2 TOM',
    '§3 FLUXO',
    '§4 REGRAS',
    '§5 CONTEXTO',
    '§7 EXEMPLOS',
    'dados_coletados',
    'acionar_handoff',
    'descricao_tattoo',
    'tamanho_cm',
    'local_corpo',
    'tatuador confirma',
  ],
  must_not_contain: [
    '{{', '}}', 'TODO', 'FIXME',
    // Ferramentas proibidas no modo coleta-info
    'calcular_orcamento',
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
  ],
  max_tokens: 8000,
};
```

- [ ] **Step 2: Criar `coleta-agendamento.js`**

```javascript
export const contratoColetaAgendamento = {
  modo: 'coleta',
  must_contain: [
    '§0 CHECKLIST',
    '§1 IDENTIDADE',
    '§2 TOM',
    '§3 FLUXO',
    '§4 REGRAS',
    '§5 CONTEXTO',
    'valor_fechado',
    'consultar_horarios_livres',
    'reservar_horario',
    'gerar_link_sinal',
    'acionar_handoff',
  ],
  must_not_contain: [
    '{{', '}}', 'TODO', 'FIXME',
    'calcular_orcamento',
    'dados_coletados',
  ],
  max_tokens: 8000,
};
```

- [ ] **Step 3: Adicionar tests em `contracts.test.mjs`**

```javascript
import { contratoColetaInfo } from './contracts/coleta-info.js';
import { contratoColetaAgendamento } from './contracts/coleta-agendamento.js';
import { tenantColetaPuro, tenantColetaReentrada, conversaAgendamento } from './fixtures/tenant-coleta.js';

test('contrato coleta-info submode=puro', () => {
  const prompt = generateSystemPrompt(tenantColetaPuro, conversaVazia, clientContextPrimeiroContato);
  validarContrato(prompt, contratoColetaInfo);
});

test('contrato coleta-info submode=reentrada', () => {
  const prompt = generateSystemPrompt(tenantColetaReentrada, conversaVazia, clientContextPrimeiroContato);
  validarContrato(prompt, contratoColetaInfo);
});

test('contrato coleta-agendamento — após trigger', () => {
  const prompt = generateSystemPrompt(tenantColetaReentrada, conversaAgendamento, clientContextPrimeiroContato);
  validarContrato(prompt, contratoColetaAgendamento);
});
```

- [ ] **Step 4: Rodar**

```bash
node --test tests/prompts/contracts.test.mjs
# Expected: 5 pass (2 anteriores + 3 novos)
```

- [ ] **Step 5: Commit**

```bash
git add tests/prompts/contracts/coleta-*.js tests/prompts/contracts.test.mjs
git commit -m "test(prompts): contracts coleta-info + coleta-agendamento

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Invariants ampliado

**Files:**
- Modify: `tests/prompts/invariants.test.mjs`

- [ ] **Step 1: Ampliar `MODOS_SUPORTADOS` + ajustar cross-mode**

Editar o array `MODOS_SUPORTADOS` pra incluir 2 entradas novas:

```javascript
import { tenantColetaPuro, tenantColetaReentrada } from './fixtures/tenant-coleta.js';

const MODOS_SUPORTADOS = [
  { nome: 'faixa', tenant: tenantCanonicoFaixa },
  { nome: 'exato', tenant: tenantCanonicoExato },
  { nome: 'coleta-puro', tenant: tenantColetaPuro },
  { nome: 'coleta-reentrada', tenant: tenantColetaReentrada },
];
```

O bloco dentro do `for` continua válido (só contém asserts genéricos: §0-§5, no placeholders, nome_agente/estudio, gatilhos). Todos os 4 modos devem passar.

**Cross-mode test faixa==exato** continua válido (não mudamos PR 2 pra diferenciar esses).

**Adicionar invariante NOVA de divergência** — Coleta deve diferir de Faixa:

```javascript
test('invariante cross-mode: Coleta-puro ≠ Faixa (divergência é o ponto do modo novo)', () => {
  const pFaixa = generateSystemPrompt(tenantCanonicoFaixa, conversaVazia, clientContextPrimeiroContato);
  const pColeta = generateSystemPrompt(tenantColetaPuro, conversaVazia, clientContextPrimeiroContato);
  assert.notEqual(pFaixa, pColeta, 'Coleta deve divergir de Faixa — senão o modo não está funcionando');
});
```

- [ ] **Step 2: Rodar**

```bash
node --test tests/prompts/invariants.test.mjs
# Expected: 4 modos × 4 invariants + 1 faixa==exato + 1 coleta!=faixa = 18 tests
```

- [ ] **Step 3: Commit**

```bash
git add tests/prompts/invariants.test.mjs
git commit -m "test(prompts): invariants ampliado pros 4 modos + cross-mode divergência coleta/faixa

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Contamination linter — assert invertido pra Coleta-Info

**Files:**
- Modify: `tests/prompts/contamination.test.mjs`

- [ ] **Step 1: Ativar PR-2 stub (descomentar + adaptar)**

Procurar o bloco comentado no fim do arquivo que começa com `// No PR 2, adicionar:` e substituir por tests reais:

```javascript
import { tenantColetaPuro } from './fixtures/tenant-coleta.js';

test('contaminação [coleta-info puro]: regra R3 aparece no prompt', () => {
  const tenant = {
    ...tenantContaminado,
    config_precificacao: { modo: 'coleta', coleta_submode: 'puro' },
  };
  const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
  // R3 deve aparecer LITERALMENTE — é a regra que instrui o LLM a suprimir.
  assert.ok(
    p.includes('NÃO repete nem apresenta qualquer valor monetário'),
    'R3 (supressão de valores) deveria aparecer no prompt coleta-info'
  );
});

test('contaminação [coleta-info]: prompt contém FAQ suja mas também contém a regra de supressão', () => {
  // NOTA: este teste não é equivalente a "LLM não vai falar R$".
  // É um smoke test de que (a) FAQ suja ainda chega no prompt (defesa em profundidade
  // não é censura no nível de string), E (b) a regra R3 instrui o LLM a ignorar.
  // Testar output do LLM é cargo das evals, não de testes unitários.
  const tenant = {
    ...tenantContaminado,
    config_precificacao: { modo: 'coleta', coleta_submode: 'puro' },
  };
  const p = generateSystemPrompt(tenant, conversaVazia, clientContextPrimeiroContato);
  assert.ok(p.includes('R$ 300'), 'FAQ contaminado aparece (como em qualquer modo) — regra R3 que suprime no output');
  assert.ok(p.includes('tatuador confirma'), 'resposta padrão pra deflete pergunta de preço deve estar presente');
});
```

- [ ] **Step 2: Rodar**

```bash
node --test tests/prompts/contamination.test.mjs
# Expected: 4 pass (2 anteriores de faixa/exato + 2 novos de coleta)
```

- [ ] **Step 3: Commit**

```bash
git add tests/prompts/contamination.test.mjs
git commit -m "test(prompts): contamination linter — asserts pra coleta (R3 visível)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: Atualizar pre-commit hook

**Files:**
- Modify: `.githooks/pre-commit`

- [ ] **Step 1: Adicionar `functions/_lib/prompts/coleta/*` no case pattern**

Substituir a linha do case-match existente por:

```bash
    functions/_lib/prompts/*|functions/_lib/prompts/coleta/*|functions/api/_validate-config-precificacao.js|functions/api/update-tenant.js|functions/api/tools/dados-coletados.js|functions/api/tools/detectar-trigger.js|tests/prompts/*|tests/update-tenant-validations.test.mjs|tests/dados-coletados.test.mjs|tests/detectar-trigger.test.mjs)
```

**Nota:** `functions/_lib/prompts/*` não pega subdiretórios em bash glob simples (só arquivos no próprio dir). Use `functions/_lib/prompts/**` se quiser recurse, ou explicitamente liste `functions/_lib/prompts/coleta/*`. Na prática o `find` do CI pega tudo via glob recursivo, e o hook local só precisa disparar em mudanças relevantes — case pattern explícito é OK.

- [ ] **Step 2: Testar hook**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
echo "" >> functions/_lib/prompts/coleta/info/fluxo.js
git add functions/_lib/prompts/coleta/info/fluxo.js
.githooks/pre-commit
# Expected: hook dispara, testes rodam, tudo verde
git reset HEAD functions/_lib/prompts/coleta/info/fluxo.js
git checkout -- functions/_lib/prompts/coleta/info/fluxo.js
```

- [ ] **Step 3: Commit**

```bash
git add .githooks/pre-commit
git commit -m "chore(hooks): pre-commit cobre paths de coleta + tools novas

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Verificação final + PR

- [ ] **Step 1: Rodar full suite**

```bash
find tests -name '*.test.mjs' -exec node --test {} +
# Expected: ~80 tests pass
# (42 anteriores + 12 dados_coletados + 18 detectar-trigger + 3 snapshots novos + 3 contracts novos + 10 invariants novos = ~88)
```

Se count não bate, ajustar e investigar.

- [ ] **Step 2: Grep validações**

```bash
# Imports de coleta fora de lugares esperados
grep -rn "coleta/info\|coleta/agendamento" --include="*.js" --include="*.mjs" functions/ tests/ 2>/dev/null
# Expected: refs só em prompts/index.js + testes internos
```

- [ ] **Step 3: Review de commits**

```bash
git log --oneline feat/modo-coleta-pr2-backend ^origin/main
# Expected: ~19 commits no PR
```

- [ ] **Step 4: Push**

```bash
git push -u origin feat/modo-coleta-pr2-backend
```

- [ ] **Step 5: Abrir PR**

```bash
gh pr create --base main --head feat/modo-coleta-pr2-backend --title "feat(prompts): Modo Coleta PR 2 — backend (tools + prompts + testes)" --body "$(cat <<'EOF'
## Summary

Modo Coleta funcional no backend — prompts + tools + testes. Feature flag `ENABLE_COLETA_MODE` OFF em prod (validador barra tenants de tentarem modo=coleta).

### Plumbing (Tasks 1-3)
- Migration: `conversas.valor_fechado NUMERIC(10,2)` nullable
- Tool `/api/tools/dados-coletados` — merge em conversa.dados_coletados
- Tool `/api/tools/detectar-trigger` — regex trigger-phrase + update estado_agente

### Prompts (Tasks 4-12)
- `functions/_lib/prompts/coleta/info/` — generate, fluxo, regras, few-shot, few-shot-tenant
- `functions/_lib/prompts/coleta/agendamento/` — idem
- Dispatcher atualizado: `case 'coleta'` com sub-switch por submode + estado_agente

### Testes Tier 1 (Tasks 14-17)
- 3 snapshots novos (coleta-info-puro, coleta-info-reentrada, coleta-agendamento)
- 3 contracts novos (coleta-info + coleta-agendamento)
- Invariants ampliados pros 4 modos (faixa, exato, coleta-puro, coleta-reentrada)
- Contamination linter — R3 (supressão de valores) visível no prompt coleta-info
- Pre-commit hook atualizado

Spec: `docs/superpowers/specs/2026-04-22-modo-coleta-design.md`
Plano: `docs/superpowers/plans/2026-04-23-modo-coleta-pr2-backend-full.md`

## Test plan

- [x] `find tests -name '*.test.mjs' -exec node --test {} +` — ~80 tests pass
- [x] Snapshots bit-identical ao rodar sem UPDATE_SNAPSHOTS
- [x] Tenant com modo=coleta gera prompt diferente de Faixa (invariante divergência)
- [x] Ferramentas proibidas em coleta-info (`calcular_orcamento`, etc) ausentes do prompt via contract
- [x] Fewshots_por_modo.coleta_info/coleta_agendamento lidos corretamente
- [x] Feature flag ENABLE_COLETA_MODE=false rejeita criação (validador do PR 1)

## Post-PR

PR 3 (UI): onboarding/studio.html recebe controles de modo Coleta + configuração de trigger-phrase. Só depois disso + PR 4 (rollout) o modo é ativado em prod.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

**Spec coverage (Bloco 6.2):**
- [x] Fase 2.1 — inventário tools + `dados_coletados` → Tasks 1-2
- [x] Fase 2.2 — prompts coleta/info → Tasks 5-8
- [x] Fase 2.3 — dispatcher branch → Task 13
- [x] Fase 2.4 — detector trigger (como tool HTTP, não webhook) → Task 3
- [x] Fase 2.5 — prompts coleta/agendamento → Tasks 9-12
- [x] Fase 2.6 — dispatcher sub-branch estado_agente → Task 13
- [x] Fase 2.7 — testes unitários (parseTrigger + transições) → Tasks 3, 14-17
- [x] Fase 2.8 — feature flag → herdada do PR 1 (`ENABLE_COLETA_MODE`)

**Não cobertos (ficam pra PR 3):**
- UI de onboarding
- UI de studio
- `config_precificacao.trigger_handoff` UI (input do Studio)
- Tutorial Resposta Rápida WhatsApp Business

**Risks:**
- Se prompts coleta saírem muito grandes e excederem max_tokens=8000 → ajustar contract ou enxugar few-shots. Capturado pelo contract test.
- Se fixture tenantContaminado expandir com mais tokens monetários, testes de contamination podem pegar false-positives em prompts Faixa/Exato. Mitigação: fixture é frozen data.
- Dispatcher sub-switch tem 4 branches — cobertura por snapshot de todos os caminhos feita em Task 14.

**Placeholder scan:** nenhum TODO/TBD em código funcional. Há notas `// NOTA:` (explicativas) que são aceitáveis.

**Type consistency:**
- `generatePromptColetaInfo(tenant, conversa, clientContext, { submode })` — assinatura consistente entre generate.js e dispatcher.
- `generatePromptColetaAgendamento(tenant, conversa, clientContext)` — sem submode (só reentrada chega aqui).
- Tools exportam `handler` (puro) + `onRequest` (wrapped) — consistente com convenção adotada no enxuto.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-23-modo-coleta-pr2-backend-full.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task + two-stage review.

**2. Inline Execution** — checkpoints manuais.

**Recomendação:** começar pelo plano ENXUTO (`2026-04-23-modo-coleta-pr2-tools.md`), e SÓ DEPOIS que tools + migration estiverem mergeadas/estáveis, voltar a este plano completo pulando Tasks 1-3 e executando Tasks 4-19.
