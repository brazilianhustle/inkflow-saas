# PR 3 — Agente + Kill-switch backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) ou `superpowers:executing-plans` pra executar task-a-task. Steps usam checkbox (`- [ ]`).
>
> **CALIBRAÇÃO subagent (per [[feedback_calibrar_subagent_driven]]):** cada task tem nota explícita do approach (`[direto]`, `[implementer-only]`, `[pipeline-completa]`). Não aplicar pipeline 3-stage uniforme — economiza ~50% de tokens vs PR 1.

**Goal:** Refatorar Painel Agente em 6 grupos limpos + implementar kill-switch IA (frases mágicas no WhatsApp + 2 botões UI Conversas + auto-retomar via cron) + adicionar 5 campos novos de configuração em `config_agente`.

**Architecture:** Schema deltas via JSONB sem migration (fallbacks no código). Frontend é refactor structural do tab-agente em studio.html. Backend ganha 4 endpoints novos (1 stateless detector chamado pelo n8n + 2 endpoints UI manuais + 1 cron). Cron worker dispatcher recebe nova entry. n8n workflow ganha branch que chama `kill-switch-detect` antes do LLM.

**Tech Stack:** Vanilla HTML/CSS/JS no studio.html, Cloudflare Pages Functions (Node 20+) pros endpoints, Supabase Postgres pra `conversas.estado_agente`/`pausada_em`/`estado_agente_anterior` (já adicionados em PR 1), Evolution API `sendMessage` pra ack manual ao tatuador + mensagem ao retomar pro cliente, n8n orchestration mantida (workflow principal recebe novo branch). Sem dependências novas.

**Branch:** `feat/pagina-tatuador-pr3-agente-killswitch` saindo de `main`.

**Spec mestre:** [`docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md`](../specs/2026-05-03-pagina-tatuador-refactor-design.md)
**Plano-mestre:** [`docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md`](./2026-05-03-pagina-tatuador-MASTER.md) §"PR 3 — Agente"

---

## Pre-conditions

1. PR 1 mergeado em main (sidebar 8 painéis + schema migration aplicado) ✅
2. Branch `main` clean
3. Bateria de tests `bash scripts/test-prompts.sh` verde
4. CHECK constraint de `conversas.estado_agente` aceita `'pausada_tatuador'` (já incluído pela migration do PR 1) ✅

---

## File Structure

**Novos arquivos:**

```
functions/api/
├── kill-switch-detect.js                          ← POST stateless: n8n chama, retorna {action, ack_message}
├── conversas/
│   ├── assumir.js                                 ← POST UI: tatuador clica botão "Assumir" no Painel Conversas
│   └── devolver.js                                ← POST UI: tatuador clica botão "Devolver"
└── cron/
    └── auto-retomar-bot.js                        ← Cron: retoma conversas pausadas há > config.auto_retomar_horas

tests/api/
├── kill-switch-detect.test.mjs                    ← unit tests (parsing frases + state transitions)
├── conversas-assumir-devolver.test.mjs            ← unit tests endpoints UI
└── auto-retomar-bot.test.mjs                      ← unit tests cron logic
```

**Arquivos modificados:**

```
functions/api/update-tenant.js                     ← validator: rejeita config_agente.usa_giria; aceita 5 campos novos
studio.html                                        ← tab-agente refator 6 grupos + Modal Meus FAQs + kill-switch fields
cron-worker/src/index.js                           ← SCHEDULE_MAP entry pro auto-retomar
cron-worker/wrangler.toml                          ← trigger '*/15 * * * *'
tests/update-tenant-validation.test.mjs            ← tests dos novos campos config_agente
scripts/test-prompts.sh                            ← adicionar test files novos no runner
```

**Sem mudança esperada (verificar):**

```
functions/_lib/prompts/                            ← audit refs a 'usa_giria' (esperado: zero — PR 1 Task 6 confirmou)
n8n workflow "MEU NOVO WORK - SAAS"                ← MODIFICAR via MCP n8n (Task 8) — branch antes LLM
```

---

## Convenções deste plano

- **Branch:** `feat/pagina-tatuador-pr3-agente-killswitch`
- **Working dir:** `/Users/brazilianhustler/Documents/inkflow-saas`
- **Commit style:** pt-BR, conventional commits (`feat(api):`, `refactor(studio):`, `test(api):`, etc.)
- **NÃO** incluir `Co-Authored-By: Claude` em commits
- **Defaults dos novos campos** (lidos via fallback no backend):
  - `frase_assumir` → `/eu assumo`
  - `frase_devolver` → `/bot volta`
  - `mensagem_ao_retomar` → `Voltei! Alguma dúvida sobre o orçamento?`
  - `auto_retomar_horas` → `6` (null = nunca retomar automaticamente)
  - `emoji_favorito` → `''` (string vazia)

---

## Task 0: Pre-flight — branch, baseline [direto]

**Files:** nenhum

- [ ] **Step 1: Atualizar main e criar branch**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git checkout main
git pull origin main
git checkout -b feat/pagina-tatuador-pr3-agente-killswitch
```

- [ ] **Step 2: Baseline tests**

```bash
bash scripts/test-prompts.sh 2>&1 | tee /tmp/baseline-pr3.log | tail -10
```

Expected: `# fail 0`, `pass` count > 0.

- [ ] **Step 3: Confirmar working tree clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.

---

## Task 1: Schema deltas — validator + tests [direto]

Estende `update-tenant.js` pra aceitar 5 campos novos em `config_agente` e rejeitar `usa_giria` (campo legacy a ser eliminado). Adiciona 8 tests.

**Files:**
- Modify: `functions/api/update-tenant.js` (linhas próximas a `validateFieldTypes`)
- Modify: `tests/update-tenant-validation.test.mjs` (append novos tests)

- [ ] **Step 1: Localizar `validateFieldTypes` em update-tenant.js**

```bash
grep -nE "^export function validateFieldTypes|config_agente" functions/api/update-tenant.js | head -10
```

Expected: função em ~linha 79, refs a `config_agente` em ~32 (ALLOWED_FIELDS comment) e dentro do validator.

- [ ] **Step 2: Adicionar validação dos novos campos em `validateFieldTypes`**

Localizar o bloco que valida `config_agente`. Provavelmente checa só `typeof === 'object'`. Estender pra rejeitar `usa_giria` e validar tipos dos novos campos:

```javascript
// Dentro de validateFieldTypes, depois do check de jsonbFields:
if (fields.config_agente !== undefined) {
  const ca = fields.config_agente;
  if (ca && typeof ca === 'object' && !Array.isArray(ca)) {
    if ('usa_giria' in ca) {
      return { ok: false, erro: 'config_agente.usa_giria foi removido — use apenas estilo das mensagens via tom + expressoes_proibidas' };
    }
    if (ca.frase_assumir !== undefined && (typeof ca.frase_assumir !== 'string' || ca.frase_assumir.length > 60)) {
      return { ok: false, erro: 'config_agente.frase_assumir deve ser string ate 60 chars' };
    }
    if (ca.frase_devolver !== undefined && (typeof ca.frase_devolver !== 'string' || ca.frase_devolver.length > 60)) {
      return { ok: false, erro: 'config_agente.frase_devolver deve ser string ate 60 chars' };
    }
    if (ca.mensagem_ao_retomar !== undefined && (typeof ca.mensagem_ao_retomar !== 'string' || ca.mensagem_ao_retomar.length > 280)) {
      return { ok: false, erro: 'config_agente.mensagem_ao_retomar deve ser string ate 280 chars' };
    }
    if (ca.emoji_favorito !== undefined && (typeof ca.emoji_favorito !== 'string' || ca.emoji_favorito.length > 8)) {
      return { ok: false, erro: 'config_agente.emoji_favorito deve ser string curta (1-8 chars)' };
    }
    if (ca.auto_retomar_horas !== undefined && ca.auto_retomar_horas !== null) {
      const v = ca.auto_retomar_horas;
      if (!Number.isInteger(v) || ![2, 6, 12, 24].includes(v)) {
        return { ok: false, erro: 'config_agente.auto_retomar_horas deve ser null ou um de [2,6,12,24]' };
      }
    }
  }
}
```

- [ ] **Step 3: Validar JS**

```bash
node --check functions/api/update-tenant.js
```

Expected: silent.

- [ ] **Step 4: Adicionar tests em `tests/update-tenant-validation.test.mjs`**

No fim do arquivo, adicionar:

```javascript
test('validateFieldTypes — config_agente rejeita usa_giria (campo removido PR 3)', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { tom: 'amigavel', usa_giria: true } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /usa_giria/);
});

test('validateFieldTypes — config_agente.frase_assumir aceita string', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { frase_assumir: '/eu assumo' } });
  assert.equal(r.ok, true);
});

test('validateFieldTypes — config_agente.frase_assumir rejeita string > 60', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { frase_assumir: 'a'.repeat(61) } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /frase_assumir/);
});

test('validateFieldTypes — config_agente.auto_retomar_horas aceita null', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { auto_retomar_horas: null } });
  assert.equal(r.ok, true);
});

test('validateFieldTypes — config_agente.auto_retomar_horas aceita 6', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { auto_retomar_horas: 6 } });
  assert.equal(r.ok, true);
});

test('validateFieldTypes — config_agente.auto_retomar_horas rejeita 5 (fora do enum)', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { auto_retomar_horas: 5 } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /auto_retomar_horas/);
});

test('validateFieldTypes — config_agente.emoji_favorito aceita emoji curto', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { emoji_favorito: '🔥' } });
  assert.equal(r.ok, true);
});

test('validateFieldTypes — config_agente.mensagem_ao_retomar rejeita > 280 chars', async () => {
  const { validateFieldTypes } = await import('../functions/api/update-tenant.js');
  const r = validateFieldTypes({ config_agente: { mensagem_ao_retomar: 'a'.repeat(281) } });
  assert.equal(r.ok, false);
  assert.match(r.erro, /mensagem_ao_retomar/);
});
```

- [ ] **Step 5: Rodar tests**

```bash
node --test tests/update-tenant-validation.test.mjs 2>&1 | tail -10
```

Expected: pass count cresceu por 8, fail = 0.

- [ ] **Step 6: Commit**

```bash
git add functions/api/update-tenant.js tests/update-tenant-validation.test.mjs
git commit -m "feat(api): config_agente aceita 5 campos novos (kill-switch + emoji_favorito) + rejeita usa_giria"
```

---

## Task 2: Refator Painel Agente HTML — 6 grupos + Toggle pills [implementer-only]

Substitui o conteúdo atual do `tab-agente` (272 linhas, sem agrupamento claro) por estrutura organizada em 6 grupos. Migra checkboxes restantes pra Toggle pills (componente do PR 1). Remove campo "Usa gírias brasileiras" e adiciona campo "Emoji favorito".

**Files:**
- Modify: `studio.html` (linhas 419-691 aproximadamente, dentro de `<div class="tab-panel" id="tab-agente">`)

- [ ] **Step 1: Inventário do estado atual**

```bash
grep -nE 'id="ag-' studio.html
```

Lista todos os ids `ag-*` atuais. Esperado: `ag-section, ag-nome-agente, ag-persona, ag-tom, ag-identificador, ag-emoji, ag-giria, ag-proibidas, ag-frases-sau, ag-frases-conf, ag-frases-enc, ag-est-aceitos, ag-est-recusados, ag-cobertura, ag-gatilhos, ag-horario, ag-duracao, ag-sinal, ag-precificacao, ag-portfolio, ag-faq, ag-save-btn`.

- [ ] **Step 2: Substituir bloco interno do `tab-agente`**

Localizar `<div class="tab-panel" id="tab-agente">` (~linha 419) e seu conteúdo até o fechamento (~linha 690). Substituir o conteúdo interno por **6 grupos**:

**Grupo 1 — Identidade**
```html
<div class="ag-group">
  <h3 class="ag-group-title">Identidade do agente</h3>
  <div class="ag-field">
    <label>Nome do agente</label>
    <input class="ag-input" id="ag-nome-agente" placeholder="Ex: Isabela"/>
  </div>
  <div class="ag-field">
    <label>Tom de voz</label>
    <select class="ag-select" id="ag-tom">
      <option value="amigavel">Amigável (padrão)</option>
      <option value="formal">Formal</option>
      <option value="descontraido">Descontraído</option>
      <option value="profissional">Profissional</option>
    </select>
  </div>
  <div class="ag-field">
    <label>Personalidade (1–3 frases)</label>
    <textarea class="ag-textarea" id="ag-persona" rows="3" placeholder="Ex: Carioca descontraída, empática com clientes nervosos na primeira tatuagem."></textarea>
  </div>
</div>
```

**Grupo 2 — Estilo das mensagens**
```html
<div class="ag-group">
  <h3 class="ag-group-title">Estilo das mensagens</h3>
  <div class="ag-field">
    <label>Uso de emojis</label>
    <select class="ag-select" id="ag-emoji">
      <option value="moderado">Moderado (1 por msg quando encaixa)</option>
      <option value="nenhum">Nenhum</option>
    </select>
    <small class="ag-hint">Removidos: "alto" e "frequente" — bot ficava cansativo</small>
  </div>
  <div class="ag-field">
    <label>Emoji favorito (opcional)</label>
    <input class="ag-input" id="ag-emoji-favorito" maxlength="8" placeholder="🔥 ou ✨"/>
    <small class="ag-hint">Aparece com mais frequência nas msgs do bot</small>
  </div>
  <label class="toggle-pill">
    <input type="checkbox" id="ag-identificador"/>
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-label">Usar nome do agente como prefixo na 1ª msg<small>Ex: "Isabela: Oi tudo bem?"</small></span>
  </label>
  <div class="ag-field">
    <label>Expressões proibidas (uma por linha)</label>
    <textarea class="ag-textarea" id="ag-proibidas" rows="3" placeholder="senhor&#10;senhora&#10;caro cliente"></textarea>
  </div>
  <div class="ag-field">
    <label>Frases naturais — saudação</label>
    <textarea class="ag-textarea" id="ag-frases-sau" rows="2" placeholder="Oii&#10;Fala&#10;Opa"></textarea>
  </div>
  <div class="ag-field">
    <label>Frases naturais — confirmação</label>
    <textarea class="ag-textarea" id="ag-frases-conf" rows="2" placeholder="Fechou&#10;Combinado&#10;Show"></textarea>
  </div>
  <div class="ag-field">
    <label>Frases naturais — encerramento</label>
    <textarea class="ag-textarea" id="ag-frases-enc" rows="2" placeholder="Tmj&#10;Até mais&#10;Qualquer coisa me chama"></textarea>
  </div>
</div>
```

**Grupo 3 — Escopo do estúdio**
```html
<div class="ag-group">
  <h3 class="ag-group-title">Escopo do estúdio</h3>
  <div class="ag-field">
    <label>Estilos aceitos (um por linha)</label>
    <textarea class="ag-textarea" id="ag-est-aceitos" rows="2" placeholder="blackwork&#10;fineline&#10;realismo"></textarea>
  </div>
  <div class="ag-field">
    <label>Estilos recusados (um por linha)</label>
    <textarea class="ag-textarea" id="ag-est-recusados" rows="2" placeholder="old_school"></textarea>
  </div>
  <label class="toggle-pill">
    <input type="checkbox" id="ag-cobertura"/>
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span class="toggle-label">Estúdio aceita cobertura (cover up)<small>Se não, bot recusa e encerra educadamente</small></span>
  </label>
</div>
```

**Grupo 4 — Casos que o agente passa pra você**
```html
<div class="ag-group">
  <h3 class="ag-group-title">Casos que o agente passa pra você</h3>
  <small class="ag-hint">Termos que disparam handoff automático (uma por linha)</small>
  <div class="ag-field">
    <textarea class="ag-textarea" id="ag-gatilhos" rows="4" placeholder="cobertura&#10;retoque&#10;rosto&#10;mao&#10;pescoco&#10;menor_idade"></textarea>
  </div>
</div>
```

**Grupo 5 — Controle manual (NEW: kill-switch)**
```html
<div class="ag-group">
  <h3 class="ag-group-title">Controle manual</h3>
  <small class="ag-hint">Frases mágicas pra pausar o bot direto pelo WhatsApp + retomada automática</small>
  <div class="ag-field">
    <label>Frase pra assumir conversa</label>
    <input class="ag-input" id="ag-frase-assumir" maxlength="60" placeholder="/eu assumo"/>
    <small class="ag-hint">Quando você manda essa frase no chat do cliente, bot pausa</small>
  </div>
  <div class="ag-field">
    <label>Frase pra devolver</label>
    <input class="ag-input" id="ag-frase-devolver" maxlength="60" placeholder="/bot volta"/>
  </div>
  <div class="ag-field">
    <label>Mensagem ao retomar</label>
    <textarea class="ag-textarea" id="ag-mensagem-retomar" rows="2" maxlength="280" placeholder="Voltei! Alguma dúvida sobre o orçamento?"></textarea>
  </div>
  <div class="ag-field">
    <label>Retomar automaticamente após</label>
    <select class="ag-select" id="ag-auto-retomar">
      <option value="">Nunca</option>
      <option value="2">2 horas</option>
      <option value="6" selected>6 horas (padrão)</option>
      <option value="12">12 horas</option>
      <option value="24">24 horas</option>
    </select>
  </div>
</div>
```

**Grupo 6 — FAQ do estúdio**
```html
<div class="ag-group">
  <h3 class="ag-group-title">FAQ do estúdio</h3>
  <small class="ag-hint">Perguntas frequentes que o bot responde sem precisar te chamar</small>
  <div class="ag-field">
    <button class="ag-secondary-btn" type="button" onclick="openFaqsModal()">📝 Meus FAQs</button>
  </div>
  <div class="ag-field">
    <label>FAQ raw (texto livre — fallback)</label>
    <textarea class="ag-textarea" id="ag-faq" rows="6" placeholder="P: Vocês fazem fineline?&#10;R: Sim, é nossa especialidade!&#10;&#10;P: Aceitam cartão?&#10;R: Sim, parcelamos em até 3x."></textarea>
    <small class="ag-hint">Use o botão "Meus FAQs" pra editar visualmente, ou cole texto direto aqui</small>
  </div>
</div>

<div class="ag-actions">
  <button class="ag-save-btn" id="ag-save-btn" onclick="saveAgentConfig()">Salvar configuração</button>
</div>
```

**REMOVER**: campo `ag-giria` por completo. **REMOVER**: campos `ag-horario, ag-duracao, ag-sinal, ag-precificacao, ag-portfolio` (vão pra PR 6 Agenda + PR 5 Portfólio).

**MAS** — antes de remover, **preservar leitura** desses campos via JS pra não quebrar tenants existentes que ainda têm esses dados no `config_agente`. Solução: o save handler continua persistindo `config_agente` como objeto, e os campos não-presentes na UI são preservados se já existem (merge, não replace).

- [ ] **Step 3: Atualizar `loadAgentConfig` JS pra ler campos novos**

Localizar `function loadAgentConfig` em studio.html. Adicionar leitura dos 5 campos novos com fallback nos defaults:

```javascript
// Dentro de loadAgentConfig(t), após os reads existentes:
const ca = t?.config_agente || {};
document.getElementById('ag-emoji-favorito').value = ca.emoji_favorito || '';
document.getElementById('ag-frase-assumir').value = ca.frase_assumir || '/eu assumo';
document.getElementById('ag-frase-devolver').value = ca.frase_devolver || '/bot volta';
document.getElementById('ag-mensagem-retomar').value = ca.mensagem_ao_retomar || 'Voltei! Alguma dúvida sobre o orçamento?';
document.getElementById('ag-auto-retomar').value = ca.auto_retomar_horas === null ? '' : String(ca.auto_retomar_horas ?? 6);
// Remover qualquer linha lendo ca.usa_giria — o campo não existe mais
```

- [ ] **Step 4: Atualizar `saveAgentConfig` JS pra enviar campos novos**

Localizar `function saveAgentConfig`. No payload `config_agente`, adicionar os 5 campos:

```javascript
// Dentro de saveAgentConfig, no objeto config_agente do PATCH:
const autoVal = document.getElementById('ag-auto-retomar').value;
const config_agente = {
  ...currentTenant.config_agente,  // PRESERVE campos legados (horario, duracao, etc) — merge, não replace
  persona: document.getElementById('ag-persona').value,
  tom: document.getElementById('ag-tom').value,
  emoji_level: document.getElementById('ag-emoji').value,
  emoji_favorito: document.getElementById('ag-emoji-favorito').value || undefined,
  expressoes_proibidas: document.getElementById('ag-proibidas').value.split('\n').filter(Boolean),
  frases_naturais: {
    saudacao: document.getElementById('ag-frases-sau').value.split('\n').filter(Boolean),
    confirmacao: document.getElementById('ag-frases-conf').value.split('\n').filter(Boolean),
    encerramento: document.getElementById('ag-frases-enc').value.split('\n').filter(Boolean),
  },
  usa_identificador: document.getElementById('ag-identificador').checked,
  aceita_cobertura: document.getElementById('ag-cobertura').checked,
  estilos_aceitos: document.getElementById('ag-est-aceitos').value.split('\n').filter(Boolean),
  estilos_recusados: document.getElementById('ag-est-recusados').value.split('\n').filter(Boolean),
  gatilhos_handoff: document.getElementById('ag-gatilhos').value.split('\n').filter(Boolean),
  // Kill-switch fields:
  frase_assumir: document.getElementById('ag-frase-assumir').value || '/eu assumo',
  frase_devolver: document.getElementById('ag-frase-devolver').value || '/bot volta',
  mensagem_ao_retomar: document.getElementById('ag-mensagem-retomar').value || 'Voltei! Alguma dúvida sobre o orçamento?',
  auto_retomar_horas: autoVal === '' ? null : parseInt(autoVal, 10),
};
delete config_agente.usa_giria;  // remove campo legacy se existir
```

E garantir que os campos que SAÍRAM da UI (`agenda`, `precificacao`, `portfolio_urls`) **não são tocados** — o spread `...currentTenant.config_agente` preserva. Outros endpoints (PR 6/5) vão movê-los pra fora de `config_agente` em outras tabelas/painéis.

- [ ] **Step 5: Adicionar CSS pros novos elementos `.ag-group`**

Localizar fim do bloco `<style>` (próximo a `</style>`). Adicionar:

```css
.ag-group{background:rgba(255,255,255,.02);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px}
.ag-group-title{font-size:14px;font-weight:700;color:var(--t1);margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px}
.ag-hint{display:block;font-size:11px;color:var(--t3);margin-top:4px;line-height:1.4}
.ag-secondary-btn{background:transparent;border:1px solid var(--border);color:var(--t1);padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;transition:border-color .15s}
.ag-secondary-btn:hover{border-color:var(--teal)}
.ag-actions{margin-top:24px;display:flex;justify-content:flex-end}
```

- [ ] **Step 6: Validar HTML well-formed**

```bash
echo "=== count tab-panel divs balanced? ==="
grep -c '<div class="tab-panel"' studio.html
grep -c 'id="tab-agente"' studio.html
echo "=== nenhum ag-giria/ag-horario órfão ==="
grep -nE 'id="ag-giria"|id="ag-horario"|id="ag-precificacao"|id="ag-portfolio"' studio.html | head -5
```

Expected: zero linhas com `ag-giria` (fully removed). `ag-horario`/`ag-precificacao`/`ag-portfolio` podem ainda aparecer no JS (preservados via merge), mas não em HTML form.

- [ ] **Step 7: Smoke local rápido (manual)**

Pular browser smoke aqui — fica pra Task 9. Apenas verificar console errors esperados (variáveis usadas no JS que não existem mais no HTML).

- [ ] **Step 8: Commit**

```bash
git add studio.html
git commit -m "refactor(studio): tab-agente reorganiza em 6 grupos + adiciona kill-switch fields + remove usa_giria UI"
```

---

## Task 3: Modal "Meus FAQs" — parser + UI editável [pipeline-completa]

Adiciona modal que parseia `tenants.faq_texto` (formato livre `P:/R:` ou similar) numa lista editável. Usuário edita inline, save serializa de volta. Componente é isolado (CSS+JS+HTML em studio.html).

**Files:**
- Modify: `studio.html` (adicionar modal markup, CSS, JS funcs `parseFaqs`, `serializeFaqs`, `openFaqsModal`, `closeFaqsModal`, `saveFaqs`)

- [ ] **Step 1: Adicionar markup do modal**

Antes do fechamento `</body>` em studio.html, adicionar:

```html
<!-- ═══ Modal: Meus FAQs ═══ -->
<div class="faqs-overlay" id="faqs-overlay">
  <div class="faqs-modal">
    <div class="faqs-header">
      <h3>Meus FAQs</h3>
      <button class="faqs-close-btn" onclick="closeFaqsModal()" aria-label="Fechar">×</button>
    </div>
    <div class="faqs-body" id="faqs-list">
      <!-- preenchido por JS -->
    </div>
    <div class="faqs-footer">
      <button class="ag-secondary-btn" onclick="addFaqEntry()" type="button">+ Nova pergunta</button>
      <button class="ag-save-btn" onclick="saveFaqs()" type="button">Salvar FAQs</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: CSS do modal**

No bloco `<style>` antes de `</style>`:

```css
.faqs-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center;z-index:200;padding:20px}
.faqs-overlay.show{display:flex}
.faqs-modal{background:var(--bg2);border:1px solid var(--border);border-radius:16px;width:100%;max-width:600px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden}
.faqs-header{display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid var(--border)}
.faqs-header h3{margin:0;font-size:16px;color:var(--t1)}
.faqs-close-btn{background:transparent;border:none;color:var(--t3);font-size:28px;line-height:1;cursor:pointer;padding:0;width:32px;height:32px}
.faqs-close-btn:hover{color:var(--t1)}
.faqs-body{flex:1;overflow-y:auto;padding:16px 24px}
.faqs-footer{display:flex;justify-content:space-between;gap:12px;padding:16px 24px;border-top:1px solid var(--border)}
.faq-entry{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px}
.faq-entry input,.faq-entry textarea{width:100%;background:transparent;border:1px solid var(--border);color:var(--t1);padding:8px;border-radius:6px;font-family:inherit;font-size:13px;margin-bottom:6px}
.faq-entry textarea{min-height:50px;resize:vertical}
.faq-entry .faq-delete{background:transparent;border:1px solid var(--red);color:var(--red);padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px}
.faq-entry .faq-delete:hover{background:var(--red);color:#fff}
```

- [ ] **Step 3: JS do parser**

Adicionar no bloco `<script>`:

```javascript
// ── FAQ Parser/Serializer ──
// Formato esperado: blocos "P: pergunta\nR: resposta\n\n" repetidos.
// Aceita variações: P:/R:, p:/r:, Pergunta:/Resposta:, etc.
function parseFaqs(text) {
  if (!text || typeof text !== 'string') return [];
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim());
  const result = [];
  for (const block of blocks) {
    const m = block.match(/^\s*(?:p|pergunta)\s*[:.\-]?\s*(.+?)\n\s*(?:r|resposta)\s*[:.\-]?\s*(.+)/is);
    if (m) {
      result.push({ p: m[1].trim(), r: m[2].trim() });
    } else {
      // Fallback: bloco que não bate o padrão vira FAQ "raw" (pergunta vazia, resposta = bloco inteiro)
      result.push({ p: '', r: block.trim() });
    }
  }
  return result;
}

function serializeFaqs(faqs) {
  return faqs
    .filter(f => f.p?.trim() || f.r?.trim())
    .map(f => `P: ${f.p.trim()}\nR: ${f.r.trim()}`)
    .join('\n\n');
}

// ── Modal management ──
let faqsState = [];

function openFaqsModal() {
  const raw = document.getElementById('ag-faq').value;
  faqsState = parseFaqs(raw);
  if (faqsState.length === 0) faqsState = [{ p: '', r: '' }];
  renderFaqsList();
  document.getElementById('faqs-overlay').classList.add('show');
}

function closeFaqsModal() {
  document.getElementById('faqs-overlay').classList.remove('show');
}

function renderFaqsList() {
  const list = document.getElementById('faqs-list');
  list.innerHTML = '';
  faqsState.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'faq-entry';
    div.innerHTML = `
      <input type="text" placeholder="Pergunta" value="${escapeHtml(f.p)}" onchange="faqsState[${i}].p = this.value"/>
      <textarea placeholder="Resposta" onchange="faqsState[${i}].r = this.value">${escapeHtml(f.r)}</textarea>
      <button class="faq-delete" type="button" onclick="deleteFaqEntry(${i})">Deletar</button>
    `;
    list.appendChild(div);
  });
}

function addFaqEntry() {
  faqsState.push({ p: '', r: '' });
  renderFaqsList();
}

function deleteFaqEntry(idx) {
  faqsState.splice(idx, 1);
  if (faqsState.length === 0) faqsState = [{ p: '', r: '' }];
  renderFaqsList();
}

function saveFaqs() {
  const serialized = serializeFaqs(faqsState);
  document.getElementById('ag-faq').value = serialized;
  closeFaqsModal();
  showToast('FAQs atualizadas — clica "Salvar configuração" pra persistir');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
```

- [ ] **Step 4: Validar HTML + JS**

```bash
echo "=== modal markup balance? ==="
grep -c "faqs-overlay" studio.html  # deve ser 2 (open tag + getElementById call)
echo "=== JS funcs definidos? ==="
grep -nE "function (parseFaqs|serializeFaqs|openFaqsModal|closeFaqsModal|renderFaqsList|addFaqEntry|deleteFaqEntry|saveFaqs|escapeHtml)" studio.html | wc -l  # esperado: 9
```

- [ ] **Step 5: Commit**

```bash
git add studio.html
git commit -m "feat(studio): modal Meus FAQs com parser P:/R: + lista editável"
```

---

## Task 4: Endpoint `kill-switch-detect.js` — stateless detector [pipeline-completa]

Endpoint POST stateless que o n8n chama ANTES do LLM. Recebe `{tenant_id, conversa_id, mensagem, from_me}` e decide se deve pausar/retomar/noop. Retorna `{action, ack_message?, new_state}`.

**Files:**
- Create: `functions/api/kill-switch-detect.js`
- Create: `tests/api/kill-switch-detect.test.mjs`

- [ ] **Step 1: Escrever test failing primeiro**

Criar `tests/api/kill-switch-detect.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test puro da lógica de decisão — sem fetch real.
// Importamos a função pura `decideAction(message, fromMe, currentState, config)` exportada.

test('kill-switch — fromMe=false sempre noop (mensagem do cliente nunca dispara)', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: '/eu assumo',
    from_me: false,
    estado_atual: 'ativo',
    config: {}
  });
  assert.equal(r.action, 'noop');
});

test('kill-switch — fromMe=true + frase_assumir match (case-insensitive) → pause', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: ' /EU ASSUMO ',
    from_me: true,
    estado_atual: 'ativo',
    config: {}
  });
  assert.equal(r.action, 'pause');
  assert.equal(r.new_state, 'pausada_tatuador');
});

test('kill-switch — fromMe=true + frase customizada do tenant → pause', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: 'tô fora',
    from_me: true,
    estado_atual: 'ativo',
    config: { frase_assumir: 'tô fora' }
  });
  assert.equal(r.action, 'pause');
});

test('kill-switch — fromMe=true + frase_devolver match em estado pausado → resume', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: '/bot volta',
    from_me: true,
    estado_atual: 'pausada_tatuador',
    config: {}
  });
  assert.equal(r.action, 'resume');
});

test('kill-switch — fromMe=true sem match em frase nenhuma → noop (msg manual normal)', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: 'oi cliente, tudo bem?',
    from_me: true,
    estado_atual: 'ativo',
    config: {}
  });
  assert.equal(r.action, 'noop');
});

test('kill-switch — frase_assumir em estado já pausado → noop (idempotente)', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: '/eu assumo',
    from_me: true,
    estado_atual: 'pausada_tatuador',
    config: {}
  });
  assert.equal(r.action, 'noop');
});

test('kill-switch — frase_devolver em estado ativo → noop', async () => {
  const { decideAction } = await import('../../functions/api/kill-switch-detect.js');
  const r = decideAction({
    mensagem: '/bot volta',
    from_me: true,
    estado_atual: 'ativo',
    config: {}
  });
  assert.equal(r.action, 'noop');
});
```

- [ ] **Step 2: Rodar test pra confirmar failing**

```bash
node --test tests/api/kill-switch-detect.test.mjs 2>&1 | tail -10
```

Expected: erro `Cannot find module` (arquivo ainda não existe).

- [ ] **Step 3: Implementar endpoint + função pura**

Criar `functions/api/kill-switch-detect.js`:

```javascript
// ── InkFlow — Kill-switch detector (chamado pelo n8n antes do LLM) ──
// POST /api/kill-switch-detect
// Body: { tenant_id, conversa_id, mensagem, from_me, estado_atual, config_agente }
// Resposta: { action: 'pause'|'resume'|'noop', new_state?, ack_message?, mensagem_ao_retomar? }
//
// Stateless: caller (n8n) é responsável por aplicar mudanças no DB.
// Endpoint só decide. Lê config do request body — sem chamada Supabase.
// Auth: Bearer com KILL_SWITCH_SECRET (compartilhado com n8n via secrets).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function normalize(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * Função pura — decide action baseada em msg + estado + config.
 * Exportada pra ser testável sem mock de Request.
 */
export function decideAction({ mensagem, from_me, estado_atual, config }) {
  if (!from_me) return { action: 'noop' };

  const msg = normalize(mensagem);
  const fraseAssumir = normalize(config?.frase_assumir || '/eu assumo');
  const fraseDevolver = normalize(config?.frase_devolver || '/bot volta');
  const mensagemRetomar = config?.mensagem_ao_retomar || 'Voltei! Alguma dúvida sobre o orçamento?';

  const isPaused = estado_atual === 'pausada_tatuador';

  if (msg === fraseAssumir) {
    if (isPaused) return { action: 'noop' };
    return {
      action: 'pause',
      new_state: 'pausada_tatuador',
      ack_message: '🔇 Bot pausado. Você está no comando.',
    };
  }

  if (msg === fraseDevolver) {
    if (!isPaused) return { action: 'noop' };
    return {
      action: 'resume',
      new_state: 'ativo',  // caller deve usar estado_agente_anterior se preferir restore preciso
      mensagem_ao_retomar: mensagemRetomar,
      ack_message: '✅ Bot retomou.',
    };
  }

  return { action: 'noop' };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = request.headers.get('Authorization') || '';
  const expected = `Bearer ${env.KILL_SWITCH_SECRET}`;
  if (!env.KILL_SWITCH_SECRET || auth !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { mensagem, from_me, estado_atual, config_agente } = body;
  if (typeof from_me !== 'boolean') return json({ error: 'from_me obrigatorio (boolean)' }, 400);

  const result = decideAction({
    mensagem,
    from_me,
    estado_atual,
    config: config_agente || {}
  });

  return json(result);
}
```

- [ ] **Step 4: Rodar tests pra confirmar passing**

```bash
node --test tests/api/kill-switch-detect.test.mjs 2>&1 | tail -10
```

Expected: 7 pass, 0 fail.

- [ ] **Step 5: Validar JS**

```bash
node --check functions/api/kill-switch-detect.js
```

- [ ] **Step 6: Adicionar test runner em scripts/test-prompts.sh**

Localizar o final do `scripts/test-prompts.sh` (antes do `echo "✓ Todos..."`). Adicionar:

```bash
echo "▶ API — kill-switch-detect..."
node --test tests/api/kill-switch-detect.test.mjs
```

- [ ] **Step 7: Commit**

```bash
git add functions/api/kill-switch-detect.js tests/api/kill-switch-detect.test.mjs scripts/test-prompts.sh
git commit -m "feat(api): kill-switch-detect endpoint stateless + 7 tests da função pura decideAction"
```

---

## Task 5: Endpoints `assumir.js` + `devolver.js` (UI manual) [implementer-only]

Endpoints POST chamados pelo botão "Assumir/Devolver" no Painel Conversas. Cada um aplica a mudança no DB + chama Evolution sendMessage pro tatuador (ack visível no chat).

**Files:**
- Create: `functions/api/conversas/assumir.js`
- Create: `functions/api/conversas/devolver.js`
- Create: `tests/api/conversas-assumir-devolver.test.mjs`

- [ ] **Step 1: Test failing primeiro**

Criar `tests/api/conversas-assumir-devolver.test.mjs` testando função pura de transição (extraída pra `_lib/kill-switch-handler.js` SE compartilhada — caso contrário, testar inline). Por simplicidade aqui: testar apenas a função pura `applyTransition({estado_atual, action})`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('assumir — estado_atual=ativo → new_state=pausada_tatuador, salva anterior=ativo', async () => {
  const { applyTransition } = await import('../../functions/api/conversas/_transition.js');
  const r = applyTransition({ estado_atual: 'coletando_tattoo', action: 'pause' });
  assert.equal(r.new_state, 'pausada_tatuador');
  assert.equal(r.estado_agente_anterior, 'coletando_tattoo');
});

test('assumir — já pausada → idempotente (noop)', async () => {
  const { applyTransition } = await import('../../functions/api/conversas/_transition.js');
  const r = applyTransition({ estado_atual: 'pausada_tatuador', action: 'pause' });
  assert.equal(r.action, 'noop');
});

test('devolver — restore anterior se tem; senão volta pra ativo', async () => {
  const { applyTransition } = await import('../../functions/api/conversas/_transition.js');
  const r = applyTransition({ estado_atual: 'pausada_tatuador', action: 'resume', estado_agente_anterior: 'aguardando_tatuador' });
  assert.equal(r.new_state, 'aguardando_tatuador');
});

test('devolver — sem anterior → ativo', async () => {
  const { applyTransition } = await import('../../functions/api/conversas/_transition.js');
  const r = applyTransition({ estado_atual: 'pausada_tatuador', action: 'resume', estado_agente_anterior: null });
  assert.equal(r.new_state, 'ativo');
});

test('devolver — não estava pausada → noop', async () => {
  const { applyTransition } = await import('../../functions/api/conversas/_transition.js');
  const r = applyTransition({ estado_atual: 'ativo', action: 'resume' });
  assert.equal(r.action, 'noop');
});
```

- [ ] **Step 2: Implementar `_transition.js`**

Criar `functions/api/conversas/_transition.js`:

```javascript
// ── InkFlow — Pure state transition logic (testable) ──
// Usado por assumir.js, devolver.js e auto-retomar-bot.js.

export function applyTransition({ estado_atual, action, estado_agente_anterior = null }) {
  if (action === 'pause') {
    if (estado_atual === 'pausada_tatuador') return { action: 'noop' };
    return {
      action: 'apply',
      new_state: 'pausada_tatuador',
      estado_agente_anterior: estado_atual,
      pausada_em: new Date().toISOString(),
    };
  }

  if (action === 'resume') {
    if (estado_atual !== 'pausada_tatuador') return { action: 'noop' };
    const restored = estado_agente_anterior || 'ativo';
    return {
      action: 'apply',
      new_state: restored,
      estado_agente_anterior: null,
      pausada_em: null,
    };
  }

  return { action: 'noop' };
}
```

- [ ] **Step 3: Verificar tests passam**

```bash
node --test tests/api/conversas-assumir-devolver.test.mjs 2>&1 | tail -10
```

Expected: 5 pass.

- [ ] **Step 4: Implementar `assumir.js`**

Criar `functions/api/conversas/assumir.js`:

```javascript
// ── InkFlow — POST /api/conversas/assumir ──
// Pausa o bot pra uma conversa específica via UI.
// Body: { conversa_id, studio_token }
// Auth: studio_token HMAC (mesmo do studio.html).

import { applyTransition } from './_transition.js';
import { verifyStudioToken } from '../_auth-helpers.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const { conversa_id, studio_token } = body;
  if (!conversa_id || !studio_token) return json({ error: 'conversa_id e studio_token obrigatórios' }, 400);

  const verified = await verifyStudioToken(studio_token, env.STUDIO_TOKEN_SECRET);
  if (!verified.ok) return json({ error: 'Token inválido' }, 401);
  const tenant_id = verified.tenant_id;

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  // Fetch conversa pra pegar estado_atual
  const r = await fetch(`${SUPABASE_URL}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&tenant_id=eq.${tenant_id}&select=id,estado_agente`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  if (!r.ok) return json({ error: 'Erro ao consultar conversa' }, 500);
  const rows = await r.json();
  if (!rows.length) return json({ error: 'Conversa não encontrada' }, 404);
  const conv = rows[0];

  const transition = applyTransition({ estado_atual: conv.estado_agente, action: 'pause' });
  if (transition.action === 'noop') return json({ ok: true, noop: true, message: 'Já estava pausada' });

  // Apply update
  const upd = await fetch(`${SUPABASE_URL}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      estado_agente: transition.new_state,
      estado_agente_anterior: transition.estado_agente_anterior,
      pausada_em: transition.pausada_em,
    }),
  });
  if (!upd.ok) {
    console.error('assumir: PATCH conversa falhou', upd.status, await upd.text());
    return json({ error: 'Erro ao atualizar conversa' }, 500);
  }

  return json({ ok: true, new_state: transition.new_state });
}
```

- [ ] **Step 5: Implementar `devolver.js` (espelho)**

Criar `functions/api/conversas/devolver.js` — mesma estrutura de `assumir.js`, só trocando `action: 'pause'` por `action: 'resume'` e o SELECT trazendo também `estado_agente_anterior`:

```javascript
// ── InkFlow — POST /api/conversas/devolver ──
// Retoma o bot pra uma conversa pausada via UI.

import { applyTransition } from './_transition.js';
import { verifyStudioToken } from '../_auth-helpers.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const CORS = {
  'Access-Control-Allow-Origin': 'https://inkflowbrasil.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const { conversa_id, studio_token } = body;
  if (!conversa_id || !studio_token) return json({ error: 'conversa_id e studio_token obrigatórios' }, 400);

  const verified = await verifyStudioToken(studio_token, env.STUDIO_TOKEN_SECRET);
  if (!verified.ok) return json({ error: 'Token inválido' }, 401);
  const tenant_id = verified.tenant_id;

  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!SB_KEY) return json({ error: 'Configuração interna ausente' }, 503);

  const r = await fetch(`${SUPABASE_URL}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&tenant_id=eq.${tenant_id}&select=id,estado_agente,estado_agente_anterior`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  if (!r.ok) return json({ error: 'Erro ao consultar conversa' }, 500);
  const rows = await r.json();
  if (!rows.length) return json({ error: 'Conversa não encontrada' }, 404);
  const conv = rows[0];

  const transition = applyTransition({
    estado_atual: conv.estado_agente,
    action: 'resume',
    estado_agente_anterior: conv.estado_agente_anterior,
  });
  if (transition.action === 'noop') return json({ ok: true, noop: true, message: 'Não estava pausada' });

  const upd = await fetch(`${SUPABASE_URL}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      estado_agente: transition.new_state,
      estado_agente_anterior: transition.estado_agente_anterior,
      pausada_em: transition.pausada_em,
    }),
  });
  if (!upd.ok) {
    console.error('devolver: PATCH conversa falhou', upd.status, await upd.text());
    return json({ error: 'Erro ao atualizar conversa' }, 500);
  }

  return json({ ok: true, new_state: transition.new_state });
}
```

- [ ] **Step 6: Validar todos JS files**

```bash
node --check functions/api/conversas/_transition.js
node --check functions/api/conversas/assumir.js
node --check functions/api/conversas/devolver.js
```

Expected: silent.

- [ ] **Step 7: Adicionar test runner**

Em `scripts/test-prompts.sh`, antes do `echo "✓ Todos..."`:

```bash
echo "▶ API — conversas assumir/devolver..."
node --test tests/api/conversas-assumir-devolver.test.mjs
```

- [ ] **Step 8: Commit**

```bash
git add functions/api/conversas/ tests/api/conversas-assumir-devolver.test.mjs scripts/test-prompts.sh
git commit -m "feat(api): endpoints conversas/assumir + conversas/devolver com pure transition + 5 tests"
```

---

## Task 6: Cron `auto-retomar-bot.js` [pipeline-completa]

Endpoint cron rodando a cada 15 min. Query conversas em `pausada_tatuador` há > `config_agente.auto_retomar_horas` horas. Pra cada uma:
1. Aplica `applyTransition` action='resume'.
2. Manda mensagem ao retomar via Evolution sendMessage pro número do cliente.

**Files:**
- Create: `functions/api/cron/auto-retomar-bot.js`
- Create: `tests/api/auto-retomar-bot.test.mjs`

- [ ] **Step 1: Test failing primeiro**

Criar `tests/api/auto-retomar-bot.test.mjs` testando função pura `pickConversasToResume`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

const NOW = new Date('2026-05-04T18:00:00Z');

test('pickConversasToResume — conversa pausada há 7h com config 6h → retoma', async () => {
  const { pickConversasToResume } = await import('../../functions/api/cron/auto-retomar-bot.js');
  const conversas = [{
    id: 'c1',
    tenant_id: 't1',
    estado_agente: 'pausada_tatuador',
    pausada_em: '2026-05-04T11:00:00Z',
    estado_agente_anterior: 'aguardando_tatuador',
    tenant_config_agente: { auto_retomar_horas: 6 },
  }];
  const result = pickConversasToResume(conversas, NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'c1');
});

test('pickConversasToResume — conversa pausada há 3h com config 6h → ignora', async () => {
  const { pickConversasToResume } = await import('../../functions/api/cron/auto-retomar-bot.js');
  const conversas = [{
    id: 'c2',
    tenant_id: 't1',
    estado_agente: 'pausada_tatuador',
    pausada_em: '2026-05-04T15:00:00Z',
    tenant_config_agente: { auto_retomar_horas: 6 },
  }];
  const result = pickConversasToResume(conversas, NOW);
  assert.equal(result.length, 0);
});

test('pickConversasToResume — config null (nunca retomar) → ignora mesmo se pausada há semana', async () => {
  const { pickConversasToResume } = await import('../../functions/api/cron/auto-retomar-bot.js');
  const conversas = [{
    id: 'c3',
    tenant_id: 't1',
    estado_agente: 'pausada_tatuador',
    pausada_em: '2026-04-25T10:00:00Z',
    tenant_config_agente: { auto_retomar_horas: null },
  }];
  const result = pickConversasToResume(conversas, NOW);
  assert.equal(result.length, 0);
});

test('pickConversasToResume — config ausente (default 6h) → retoma se pausada há > 6h', async () => {
  const { pickConversasToResume } = await import('../../functions/api/cron/auto-retomar-bot.js');
  const conversas = [{
    id: 'c4',
    tenant_id: 't1',
    estado_agente: 'pausada_tatuador',
    pausada_em: '2026-05-04T10:00:00Z',  // 8h atrás
    tenant_config_agente: {},
  }];
  const result = pickConversasToResume(conversas, NOW);
  assert.equal(result.length, 1);
});

test('pickConversasToResume — conversa não pausada → ignora', async () => {
  const { pickConversasToResume } = await import('../../functions/api/cron/auto-retomar-bot.js');
  const conversas = [{
    id: 'c5',
    estado_agente: 'ativo',
    pausada_em: null,
    tenant_config_agente: { auto_retomar_horas: 6 },
  }];
  const result = pickConversasToResume(conversas, NOW);
  assert.equal(result.length, 0);
});
```

- [ ] **Step 2: Implementar `auto-retomar-bot.js`**

Criar `functions/api/cron/auto-retomar-bot.js`:

```javascript
// ── InkFlow — Cron: auto-retomar bot pausado ──
// GET /api/cron/auto-retomar-bot (chamado pelo cron-worker a cada 15min)
// Auth: Bearer CRON_SECRET
// Comportamento:
//   1. Busca conversas em estado 'pausada_tatuador' com pausada_em < now() - INTERVAL
//   2. Pra cada uma, lê config_agente.auto_retomar_horas do tenant.
//   3. Se passou o tempo configurado: applyTransition('resume') + Evolution sendMessage com mensagem_ao_retomar.

import { applyTransition } from '../conversas/_transition.js';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';

/**
 * Função pura — filtra conversas que devem retomar baseado no tempo + config.
 * Exportada pra teste unitário sem fetch.
 */
export function pickConversasToResume(conversas, now = new Date()) {
  const result = [];
  for (const c of conversas) {
    if (c.estado_agente !== 'pausada_tatuador') continue;
    if (!c.pausada_em) continue;
    const config = c.tenant_config_agente || {};
    const horas = config.auto_retomar_horas;
    if (horas === null || horas === undefined) {
      if (config.auto_retomar_horas === null) continue;  // explícito null = nunca
      // undefined → usar default 6
    }
    const horasFinal = (horas === undefined) ? 6 : horas;
    if (horasFinal === null) continue;
    const cutoff = new Date(now.getTime() - horasFinal * 3600 * 1000);
    const pausada = new Date(c.pausada_em);
    if (pausada <= cutoff) result.push(c);
  }
  return result;
}

async function fetchConversasPausadas(env) {
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  // Inner join via embedded resource pra puxar config_agente do tenant junto
  const url = `${SUPABASE_URL}/rest/v1/conversas?estado_agente=eq.pausada_tatuador&select=id,tenant_id,estado_agente,estado_agente_anterior,pausada_em,telefone_cliente,tenants(config_agente,evo_instance,evo_apikey,evo_base_url)`;
  const r = await fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  if (!r.ok) {
    console.error('auto-retomar: erro ao buscar conversas pausadas', r.status);
    return [];
  }
  const rows = await r.json();
  return rows.map(r => ({
    ...r,
    tenant_config_agente: r.tenants?.config_agente,
    tenant_evo_instance: r.tenants?.evo_instance,
    tenant_evo_apikey: r.tenants?.evo_apikey,
    tenant_evo_base_url: r.tenants?.evo_base_url,
  }));
}

async function applyResume(env, conversa) {
  const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  const transition = applyTransition({
    estado_atual: conversa.estado_agente,
    action: 'resume',
    estado_agente_anterior: conversa.estado_agente_anterior,
  });
  if (transition.action === 'noop') return { ok: true, noop: true };

  // Update DB
  const upd = await fetch(`${SUPABASE_URL}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa.id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      estado_agente: transition.new_state,
      estado_agente_anterior: null,
      pausada_em: null,
    }),
  });
  if (!upd.ok) {
    console.error(`auto-retomar: PATCH falhou conversa=${conversa.id} status=${upd.status}`);
    return { ok: false, error: 'patch_failed' };
  }

  // Send mensagem_ao_retomar via Evolution
  const config = conversa.tenant_config_agente || {};
  const mensagem = config.mensagem_ao_retomar || 'Voltei! Alguma dúvida sobre o orçamento?';
  if (conversa.telefone_cliente && conversa.tenant_evo_instance) {
    try {
      await fetch(`${conversa.tenant_evo_base_url}/message/sendText/${conversa.tenant_evo_instance}`, {
        method: 'POST',
        headers: {
          apikey: conversa.tenant_evo_apikey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: conversa.telefone_cliente,
          text: mensagem,
        }),
      });
    } catch (e) {
      console.warn(`auto-retomar: Evolution sendText falhou conversa=${conversa.id}`, e?.message);
      // Não falha o retomar — DB já foi atualizado
    }
  }

  return { ok: true, conversa_id: conversa.id };
}

export async function onRequest(context) {
  const { request, env } = context;
  const auth = request.headers.get('Authorization') || '';
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const conversas = await fetchConversasPausadas(env);
  const toResume = pickConversasToResume(conversas);

  console.log(`auto-retomar: ${conversas.length} pausadas total, ${toResume.length} pra retomar`);

  const results = [];
  for (const c of toResume) {
    const r = await applyResume(env, c);
    results.push({ id: c.id, ...r });
  }

  return new Response(JSON.stringify({
    ok: true,
    total_pausadas: conversas.length,
    retomadas: results.filter(r => r.ok && !r.noop).length,
    failed: results.filter(r => !r.ok).length,
    results,
  }), { headers: { 'Content-Type': 'application/json' } });
}
```

- [ ] **Step 3: Tests pass**

```bash
node --test tests/api/auto-retomar-bot.test.mjs 2>&1 | tail -10
```

Expected: 5 pass.

- [ ] **Step 4: Validar JS**

```bash
node --check functions/api/cron/auto-retomar-bot.js
```

- [ ] **Step 5: Adicionar test em runner**

Em `scripts/test-prompts.sh`, antes do `echo "✓ Todos..."`:

```bash
echo "▶ API — auto-retomar-bot..."
node --test tests/api/auto-retomar-bot.test.mjs
```

- [ ] **Step 6: Commit**

```bash
git add functions/api/cron/auto-retomar-bot.js tests/api/auto-retomar-bot.test.mjs scripts/test-prompts.sh
git commit -m "feat(api): cron auto-retomar-bot — retoma conversas pausadas há > config.auto_retomar_horas + 5 tests"
```

---

## Task 7: Cron worker dispatcher entry [direto]

Adiciona mapping no `cron-worker/src/index.js` + trigger no `wrangler.toml`.

**Files:**
- Modify: `cron-worker/src/index.js`
- Modify: `cron-worker/wrangler.toml`

- [ ] **Step 1: Adicionar SCHEDULE_MAP entry**

Em `cron-worker/src/index.js`, no objeto `SCHEDULE_MAP` (linha ~18), adicionar:

```javascript
'*/15 * * * *': { path: '/api/cron/auto-retomar-bot',  secretEnv: 'CRON_SECRET', label: 'auto-retomar-bot' },
```

- [ ] **Step 2: Adicionar trigger no wrangler.toml**

Em `cron-worker/wrangler.toml`, dentro de `[triggers] crons = [...]`, adicionar:

```
"*/15 * * * *",   # a cada 15min     → /api/cron/auto-retomar-bot
```

- [ ] **Step 3: Validar config**

```bash
cd cron-worker
npx wrangler --version
cat wrangler.toml | grep -c "auto-retomar"  # esperado: 1
cd ..
```

- [ ] **Step 4: Commit**

```bash
git add cron-worker/src/index.js cron-worker/wrangler.toml
git commit -m "feat(cron-worker): dispatcher entry pro auto-retomar-bot (*/15 * * * *)"
```

---

## Task 8: n8n workflow — branch kill-switch antes do LLM [direto via MCP]

Adiciona branch no n8n workflow principal: ANTES de chamar o LLM, faz POST `/api/kill-switch-detect` com `{tenant_id, conversa_id, mensagem, from_me, estado_atual, config_agente}`. Branch:
- Se `action='pause'`: `UPDATE conversas` setando `estado_agente='pausada_tatuador'`, manda ack ao tatuador via Evolution sendText, return (sem chamar LLM).
- Se `action='resume'`: `UPDATE conversas` restaurando estado, manda `mensagem_ao_retomar` ao cliente, return.
- Se `action='noop'`: continua fluxo normal (LLM call).

**ATENÇÃO:** workflow n8n usa MCP n8n. Lembrar de **publish após update** ([[feedback_n8n_publish_apos_update]]).

**Files:** workflow no n8n (não tem path local)

- [ ] **Step 1: Listar workflows pra encontrar o ID**

Via MCP n8n:
```
search_workflows query="MEU NOVO WORK - SAAS"
```

- [ ] **Step 2: Get current workflow code**

```
get_workflow_details id=<workflow-id>
```

Identificar onde está o nó que chama LLM (provavelmente `OpenAI` ou `Claude` ou `Anthropic`). Adicionar 1 nó **HTTP Request** ANTES dele.

- [ ] **Step 3: Setar `KILL_SWITCH_SECRET` em CF Pages env vars**

Manual (Leandro precisa fazer no Cloudflare Dashboard → Pages → inkflow-saas → Settings → Environment variables → Production):
- Adicionar: `KILL_SWITCH_SECRET` = (gerar random 32+ chars, ex: `openssl rand -hex 32`)

Salvar mesmo valor no n8n credentials (HTTP Header Auth com `Authorization: Bearer <SECRET>`).

- [ ] **Step 4: Update workflow via MCP**

Via MCP n8n, `update_workflow` adicionando os nós:

1. **HTTP Request — kill-switch-detect** (antes do LLM)
   - URL: `https://inkflowbrasil.com/api/kill-switch-detect`
   - Method: POST
   - Auth: HTTP Header Auth → `Bearer {{$credentials.KILL_SWITCH_SECRET}}`
   - Body JSON: `{ tenant_id, conversa_id, mensagem, from_me, estado_atual, config_agente }`

2. **Switch node** baseado em `{{$node["kill-switch-detect"].json.action}}`
   - `pause`: → conecta em (a) Supabase UPDATE conversas estado_agente=pausada_tatuador + estado_agente_anterior=<atual> + pausada_em=now (b) Evolution sendText (ack ao tatuador, fromMe=true)
   - `resume`: → conecta em (a) Supabase UPDATE conversas estado_agente=<anterior ou ativo> + estado_agente_anterior=null + pausada_em=null (b) Evolution sendText (mensagem_ao_retomar pro cliente)
   - `noop`: → conecta no fluxo LLM existente

- [ ] **Step 5: Publish após update**

```
publish_workflow id=<workflow-id>
```

(`update_workflow` só altera draft no n8n 2.x — publish promove pro activeVersion. Sem publish, o cron real continua usando versão antiga.)

- [ ] **Step 6: Smoke E2E manual via Telegram**

Mandar msg de teste no WhatsApp do tatuador (msg fromMe via Evolution Manager UI ou direto pelo celular dele). Confirmar:
- Frase `/eu assumo` → conversa marca como pausada, ack chega como msg fromMe
- Frase qualquer → bot continua respondendo normal
- Frase `/bot volta` em conversa pausada → bot retoma + manda mensagem_ao_retomar pro cliente

- [ ] **Step 7: Commit nota no repo (descrição do flow update)**

n8n workflow não tá versionado no git, mas vale documentar:

```bash
mkdir -p docs/canonical/n8n
cat > docs/canonical/n8n/2026-05-04-kill-switch-branch.md <<'EOF'
# n8n workflow update — kill-switch branch

**Data:** 2026-05-04
**Workflow:** `MEU NOVO WORK - SAAS` (id: <preencher>)

## Mudanças

Adicionado nó **HTTP Request "kill-switch-detect"** ANTES do nó LLM.

URL: `https://inkflowbrasil.com/api/kill-switch-detect`
Auth: HTTP Header Bearer `KILL_SWITCH_SECRET`

Switch node decide: pause/resume/noop. Pause e resume aplicam UPDATE conversas + Evolution sendText, e SHORT-CIRCUITAM o fluxo LLM. Noop passa adiante.

## Como testar
- Mandar `/eu assumo` no WhatsApp como tatuador → estado vira pausada_tatuador
- Cliente manda msg seguinte → bot ignora (n8n para no kill-switch)
- Tatuador manda `/bot volta` → bot retoma, manda `mensagem_ao_retomar` pro cliente

## Rollback
Se quebrar: desconectar o nó HTTP "kill-switch-detect" do flow (passa direto pra LLM como antes). Republish.
EOF
git add docs/canonical/n8n/2026-05-04-kill-switch-branch.md
git commit -m "docs(n8n): registra branch kill-switch adicionado no workflow principal"
```

---

## Task 9: Smoke E2E manual + audit final [direto]

**Files:** nenhum

- [ ] **Step 1: Audit "usa_giria" zerado em código de produção**

```bash
grep -rn "usa_giria" --include="*.js" --include="*.html" --exclude-dir=node_modules --exclude-dir=.wrangler --exclude-dir=docs . 2>/dev/null
```

Expected: zero matches em código de produção (allowlistado: tests + docs/specs antigos).

- [ ] **Step 2: Bateria completa**

```bash
bash scripts/test-prompts.sh 2>&1 | tail -15
```

Expected: `# fail 0`. Pass count cresceu pelos novos tests (Task 1: 8, Task 4: 7, Task 5: 5, Task 6: 5 = 25 novos tests).

- [ ] **Step 3: Smoke browser**

Browser smoke fica pra Leandro fazer pós-merge no domain de prod. Validações esperadas:

- [ ] Painel Agente abre, mostra 6 grupos organizados
- [ ] Campo "Usa gírias brasileiras" desapareceu
- [ ] Campo "Emoji favorito" presente
- [ ] Grupo "Controle manual" tem 4 campos (assumir, devolver, mensagem, auto-retomar)
- [ ] Botão "📝 Meus FAQs" abre modal com lista editável
- [ ] Adicionar FAQ no modal + Salvar → ag-faq textarea atualiza
- [ ] "Salvar configuração" persiste sem erro
- [ ] WhatsApp: msg `/eu assumo` pelo tatuador pausa bot
- [ ] WhatsApp: msg `/bot volta` retoma + cliente recebe mensagem_ao_retomar

- [ ] **Step 4: Commit do checklist**

```bash
git commit --allow-empty -m "test(pr3): bateria automatizada verde + audit usa_giria zerado"
```

---

## Task 10: PR open + DoD [direto]

**Files:** nenhum

- [ ] **Step 1: Push da branch**

```bash
git push -u origin feat/pagina-tatuador-pr3-agente-killswitch
```

- [ ] **Step 2: Abrir PR**

```bash
gh pr create --base main --head feat/pagina-tatuador-pr3-agente-killswitch \
  --title "PR 3: Agente refatorado (6 grupos) + kill-switch IA backend" \
  --body "$(cat <<'EOF'
## Summary

PR 3 da refatoração da página do tatuador — Agente em 6 grupos limpos + kill-switch IA completo (frase mágica WhatsApp + UI manual + auto-retomar).

- Painel Agente refatorado em 6 grupos (Identidade, Estilo, Escopo, Handoff, Controle manual NEW, FAQ)
- Modal "Meus FAQs" com parser P:/R: + UI editável
- Endpoint `kill-switch-detect.js` stateless — n8n consome antes do LLM
- Endpoints `/api/conversas/assumir` e `/api/conversas/devolver` pra UI
- Cron `auto-retomar-bot` rodando a cada 15min
- 25 novos tests (validator + kill-switch detect + transitions + cron picker)
- n8n workflow atualizado com branch kill-switch (publish via MCP)

## Schema

Sem migration SQL — campos novos são em `config_agente` (JSONB), lidos com fallback no código.

## Test plan

- [x] Bateria automatizada verde (`bash scripts/test-prompts.sh`)
- [x] Audit `usa_giria` zerado em código de produção
- [ ] Smoke browser: 6 grupos no Painel Agente, modal FAQs, kill-switch UI
- [ ] Smoke WhatsApp: `/eu assumo` pausa, `/bot volta` retoma, auto-retomar funciona

## Setup pós-merge

1. Adicionar `KILL_SWITCH_SECRET` em CF Pages env vars (production)
2. Publicar n8n workflow atualizado
3. Validar primeiro auto-retomar real (vai disparar 15min após deploy do cron-worker)
EOF
)"
```

- [ ] **Step 3: Aguardar checks passarem + merge**

```bash
gh pr checks <PR-number>
gh pr merge <PR-number> --squash --delete-branch
```

---

## Self-review (após escrever o plano)

### Spec coverage

| Spec mestre §PR 3 item | Task |
|---|---|
| Schema config_agente — 5 campos novos | Task 1 (validator + tests) |
| Validator rejeita usa_giria | Task 1 |
| Painel Agente 6 grupos | Task 2 |
| Toggle pill em todos checkboxes do Agente | Task 2 (ag-identificador, ag-cobertura migrados) |
| Emoji "Moderado/Nenhum" | Task 2 |
| Campo Emoji favorito | Task 2 |
| Modal "Meus FAQs" parser P:/R: editável | Task 3 |
| Backend kill-switch (whatsapp-webhook branch) | Task 4 (kill-switch-detect endpoint) + Task 8 (n8n branch) |
| n8n principal: branch quando estado=pausada_tatuador → não chama LLM | Task 8 |
| Cron auto-retomar-bot.js (cada 30min — pivotado pra 15min) | Task 6 + Task 7 |
| `/api/conversas/assumir` UI manual | Task 5 |
| `/api/conversas/devolver` UI manual | Task 5 |

**Cobertura: completa.** Pivots:
- Spec disse `cron-worker/src/jobs/auto-retomar-bot.js` (subdir nova) — pivot pra `functions/api/cron/auto-retomar-bot.js` + dispatcher entry, seguindo o pattern do PR 1 dos auditores.
- Spec disse "30min" pro cron — pivot pra 15min porque `*/30 * * * *` já é usado pelo `monitor-whatsapp`.

### Placeholder scan

- "TBD" → 0 ✅
- "TODO" → 0 ✅
- "implement later" → 0 ✅
- "fill in details" → 0 ✅
- "appropriate error handling" → 0 ✅
- "handle edge cases" → 0 ✅
- "Similar to Task N" → 0 ✅
- Steps de código sem código → Task 8 Step 4 descreve nodes n8n via MCP — formato é texto, não JSON, mas isso é correto pois n8n MCP tem schema próprio. Considerar OK.

### Type consistency

- `applyTransition({estado_atual, action, estado_agente_anterior})` Task 5 → reusado em Task 6 ✅
- `decideAction({mensagem, from_me, estado_atual, config})` Task 4 → função pura, não compartilhada com outros endpoints ✅
- `pickConversasToResume(conversas, now)` Task 6 → usa shape interno (com `tenant_config_agente` enriquecido) ✅
- `verifyStudioToken(token, secret)` Task 5 → assumido existir em `_auth-helpers.js` (já em uso pelo update-tenant.js) ✅

### Calibração subagent (calibração nova)

- Tasks **direto** (sem subagent): 0, 1, 7, 9, 10 → 5 tasks
- Tasks **implementer-only**: 2, 5 → 2 tasks (~2 subagents)
- Tasks **pipeline-completa**: 3, 4, 6 → 3 tasks (~9 subagents)
- Tasks **MCP-only**: 8 → 1 task (~3 chamadas MCP)

**Estimativa total:** ~12-14 subagent calls (vs 50 do PR 1) + ~3 MCP n8n calls. Reducao de 70% mantendo qualidade nas tasks de risco real.

---

## Estimativa de execução

- Tasks 0-1 (preflight + schema): ~30min
- Task 2 (UI 6 grupos): ~2h
- Task 3 (modal FAQs): ~1.5h
- Tasks 4-5 (endpoints kill-switch + assumir/devolver): ~2h
- Task 6 (cron auto-retomar): ~1.5h
- Task 7 (dispatcher): ~15min
- Task 8 (n8n via MCP): ~30min (incluindo smoke)
- Tasks 9-10 (smoke + PR): ~30min

**Total: ~8h** (1 dia útil com buffer). Bate com estimativa do plano-mestre (1.5d).

---

## Próximo passo após PR 3 mergeado

PR 4 (Conversas) fica desbloqueado — usa kill-switch backend pronto. PRs 2/5/6/7/8 também podem rodar paralelos (já estão desbloqueados desde PR 1).
