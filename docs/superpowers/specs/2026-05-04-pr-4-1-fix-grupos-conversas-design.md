---
title: PR 4.1 — Fix Grupos Conversas (cross-column query + lifecycle helper)
data: 2026-05-04
autor: Leandro + Claude (sessão pós-smoke PR #24)
status: design aprovado, aguardando review escrito
referencia_spec_pai: docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md
tags: [inkflow, conversas, refator-pagina-tatuador, fix, schema]
---

# PR 4.1 — Fix Grupos Conversas

## Sumário

Smoke do PR #24 (Painel Conversas merged em 2026-05-04 noite) revelou **3 bugs** que tornam 3 dos 4 painéis ("Hoje", "Aguardando", "Histórico") sempre vazios em prod. Causa raiz: helper `_grupos.js` mistura estados de duas colunas distintas (`estado` workflow do bot vs `estado_agente` máquina de estados de negociação) num único filtro single-column; e o estado terminal `fechado` nunca é gravado por nenhum caller hoje.

Esse PR aplica **2 movimentos coordenados**:

1. **Cross-column query** no endpoint `list.js` — filtrar simultaneamente em `estado_agente` E `estado` via PostgREST `or=`.
2. **Lifecycle helper** `markConversaFechada(supabase, conversa_id, motivo)` em `_lib/conversas-lifecycle.js`, com 2 callers automáticos: `mp-sinal-handler` (motivo `sinal_pago`) + `cron/expira-holds` (motivo `hold_expirado`). Motivo `tatuador_descartou` fica enum-ready sem caller (YAGNI até demanda real).

Diff esperado: ~150 linhas, 5 arquivos novos/editados, **9 unit tests novos + 14 atualizados** (23 total). Estimativa: 1-2h via subagent-driven (pipeline-completa porque cruza schema + endpoint + lifecycle).

## Contexto

PR #24 entregou Painel Conversas com 4 abas (Hoje / Aguardando / Em negociação / 📁 Histórico). Smoke browser empírico (com tenant Hustle Ink + conversa de teste setando `estado_agente='pausada_tatuador'`) confirmou:

- Tab "Em negociação" funciona — pega conversa de teste corretamente.
- Tabs "Hoje", "Aguardando", "Histórico" sempre vazias mesmo com conversas reais em estados que **deveriam** classificar nelas.
- Botões Assumir/Devolver funcionam, thread WhatsApp Web renderiza corretamente.
- Console JavaScript limpo (zero erros).

Bug é **invisível em testes unitários** porque eles mockam fetch (não cruzam helper × schema real).

## Decisões cravadas (do brainstorm 04/05 noite parte 5)

### Decisão 1: Filosofia das duas colunas

`conversas` tem dois enums coexistentes, com responsabilidades complementares (não duplicadas):

| Coluna | Responsabilidade | Quando preenche | Valores em prod |
|---|---|---|---|
| `estado` | Workflow de agendamento do bot | Pós-cadastro: cliente escolhe horário, paga sinal, sucesso/expira/handoff | `qualificando, orcando, escolhendo_horario, aguardando_sinal, confirmado, handoff, expirado` |
| `estado_agente` | Fase de negociação humana / atendimento | Coleta inicial + proposta + handoff manual | `ativo, coletando_tattoo, coletando_cadastro, aguardando_tatuador, propondo_valor, aguardando_decisao_desconto, lead_frio, pausada_tatuador, fechado` |

**Decisão arquitetural:** manter as 2 colunas com responsabilidades separadas. Painel Conversas precisa filtrar em ambas via OR.

**Rejeitado:** sync nos tools pra duplicar valores — escopo gigante, risco de drift, viola separação de responsabilidades.

### Decisão 2: Helper único pra estado terminal `fechado`

`fechado` é estado terminal legítimo da state machine de `estado_agente` (CHECK constraint já permite desde PR #21 Foundation). Hoje nenhum código grava — gap arquitetural.

**Solução:** helper único `markConversaFechada(supabase, conversa_id, motivo)` em `functions/_lib/conversas-lifecycle.js`. Callers chamam o mesmo helper — sem drift, com rastreabilidade do "por que".

Helper grava:
- `estado_agente='fechado'`
- `dados_coletados.fechado_motivo` (enum: `sinal_pago | hold_expirado | tatuador_descartou`)
- `dados_coletados.fechado_em` (ISO timestamp)
- `updated_at = now()`

Idempotência via `WHERE estado_agente != 'fechado'` no PATCH.

**Rejeitado (F2):** redefinir "Histórico" pra usar `estado IN ('confirmado','expirado','handoff')`. Esconde o gap usando outro campo. State machine fica conceitualmente quebrada (constraint permite valor que ninguém grava = lixo arquitetural).

### Decisão 3: Callers do helper

| Caller | Motivo | Trigger |
|---|---|---|
| `mp-sinal-handler.js` | `sinal_pago` | Sinal Mercado Pago confirmado (após `estado='confirmado'` ser gravado) |
| `cron/expira-holds.js` | `hold_expirado` | Hold de slot expirou (após `estado='expirado'` ser gravado) |
| ~~`tatuador_descartou`~~ | enum-ready, sem caller | YAGNI — adicionar quando tatuador real reclamar de "lixo no painel" (PR futuro) |

**Rejeitado (C2):** botão "Descartar" no thread agora. Não tem demanda no spec original. C2 vira PR follow-up se preciso.

### Decisão 4: Ambos movimentos num único PR

Separar em 2 PRs (cross-column query + lifecycle helper) tira possibilidade de validar smoke fim-a-fim. Diff total pequeno (~150 linhas), risco baixo, complexidade gerenciável.

### Decisão 5: Bug UX re-fetch após Assumir/Devolver fica fora

Bug #3 menor descoberto no smoke (lista lateral não re-fetcha após Assumir/Devolver). Resolve trocando de tab. Vira **follow-up P3** no backlog. Não entra nesse PR pra manter foco backend/lifecycle.

## Arquitetura

```
┌─ Movimento A: Cross-column query no list endpoint ──┐
│  _grupos.js     → retorna { estados_agente, estados }│
│  list.js        → PostgREST or=(in.X, in.Y) ou       │
│                   forma simples se uma lista vazia    │
│  _grupos.test   → 6 tests atualizados                 │
│  list.test      → 8 tests atualizados + 3 novos       │
└──────────────────────────────────────────────────────┘

┌─ Movimento B: Lifecycle helper pra estado fechado ──┐
│  _lib/conversas-lifecycle.js  ← NOVO                 │
│    └─ markConversaFechada(supabase, id, motivo)      │
│  callers (2):                                        │
│    mp-sinal-handler.js   → motivo='sinal_pago'       │
│    cron/expira-holds.js  → motivo='hold_expirado'    │
│  conversas-lifecycle.test.js  ← NOVO (5 tests)       │
└──────────────────────────────────────────────────────┘
```

**Fora do escopo (deliberadamente):**
- Refator de tools que gravam `estado_agente` (filosofia das 2 colunas é intencional)
- UX re-fetch após Assumir/Devolver (Bug #3 menor — vira backlog P3)
- Caller `tatuador_descartou` (C3 — enum-ready sem implementação)
- Modo Coleta v2 PR 2 (independente, gravará `coletando_tattoo` quando sair)

## Componentes detalhados

### Movimento A — `functions/api/conversas/_grupos.js` (refator)

Helper retorna 2 listas separadas em vez de 1:

```js
const GRUPOS = {
  hoje: {
    estados_agente: ['coletando_tattoo', 'coletando_cadastro'],
    estados: ['escolhendo_horario', 'aguardando_sinal'],
    inclui_filtro_hoje: true,
  },
  aguardando: {
    estados_agente: ['aguardando_tatuador', 'aguardando_decisao_desconto'],
    estados: [],
    inclui_filtro_hoje: false,
  },
  negociacao: {
    estados_agente: ['propondo_valor', 'lead_frio', 'pausada_tatuador'],
    estados: [],
    inclui_filtro_hoje: false,
  },
  historico: {
    estados_agente: ['fechado'],
    estados: [],
    inclui_filtro_hoje: false,
  },
};

export function getGrupoFilter(grupo) {
  if (typeof grupo !== 'string' || !GRUPOS[grupo]) return null;
  const cfg = GRUPOS[grupo];
  // Defensive: ambas listas vazias é estado inválido — não deveria ocorrer com mapping atual
  if (!cfg.estados_agente.length && !cfg.estados.length) return null;
  const result = { estados_agente: cfg.estados_agente, estados: cfg.estados };
  if (cfg.inclui_filtro_hoje) result.last_msg_at_gte = isoHojeBrtUtc();
  return result;
}
```

`isoHojeBrtUtc()` permanece igual.

### Movimento A — `functions/api/conversas/list.js` (modificações)

Substituir trecho linhas 73-87 (build query string) por:

```js
const { estados_agente, estados } = grupoFilter;
const params = [
  `tenant_id=eq.${tenant_id}`,
  'select=id,telefone,estado,estado_agente,last_msg_at,valor_proposto,dados_coletados,dados_cadastro,estado_agente_anterior,pausada_em',
  'order=last_msg_at.desc',
  `limit=${limit}`,
];

// Build column filter: ambas listas → or=(...,...). Só uma lista → forma direta.
if (estados_agente.length && estados.length) {
  const ea = estados_agente.map(encodeURIComponent).join(',');
  const es = estados.map(encodeURIComponent).join(',');
  params.push(`or=(estado_agente.in.(${ea}),estado.in.(${es}))`);
} else if (estados_agente.length) {
  const ea = estados_agente.map(encodeURIComponent).join(',');
  params.push(`estado_agente=in.(${ea})`);
} else {
  // estados.length truthy (validado em getGrupoFilter)
  const es = estados.map(encodeURIComponent).join(',');
  params.push(`estado=in.(${es})`);
}

if (grupoFilter.last_msg_at_gte) {
  params.push(`last_msg_at=gte.${encodeURIComponent(grupoFilter.last_msg_at_gte)}`);
}
if (before_ts) {
  params.push(`last_msg_at=lt.${encodeURIComponent(before_ts)}`);
}
```

**Mudança no select:** adicionar `estado` (workflow column) ao retorno — frontend pode mostrar "fase do bot" como info auxiliar futura. Hoje não usa, mas custo zero.

### Movimento B — `functions/_lib/conversas-lifecycle.js` (NOVO)

```js
// ── InkFlow — Lifecycle helper pra transições terminais de conversas ──
// Centraliza a lógica de "marcar conversa como fechada" pra evitar drift entre callers.
// Callers: mp-sinal-handler.js (sinal_pago), cron/expira-holds.js (hold_expirado).
// Motivo tatuador_descartou enum-ready sem caller atual (YAGNI).

export const MOTIVOS_FECHAR_VALIDOS = Object.freeze([
  'sinal_pago',
  'hold_expirado',
  'tatuador_descartou',
]);

/**
 * Marca conversa como fechada (estado_agente='fechado' + motivo + timestamp).
 * Idempotente: chamadas repetidas retornam ja_estava_fechada=true sem efeito.
 *
 * @param {object} args
 * @param {string} args.supabaseUrl
 * @param {string} args.supabaseKey - service role key
 * @param {string} args.conversa_id - UUID
 * @param {string} args.motivo - um de MOTIVOS_FECHAR_VALIDOS
 * @returns {Promise<{fechada: boolean, ja_estava_fechada: boolean}>}
 * @throws {Error} se motivo inválido, conversa não encontrada, ou rede/PostgREST falhar
 */
export async function markConversaFechada({ supabaseUrl, supabaseKey, conversa_id, motivo }) {
  if (!MOTIVOS_FECHAR_VALIDOS.includes(motivo)) {
    throw new Error(`motivo inválido: ${motivo}. Válidos: ${MOTIVOS_FECHAR_VALIDOS.join(', ')}`);
  }
  if (typeof conversa_id !== 'string' || !conversa_id) {
    throw new Error('conversa_id obrigatório');
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  // 1) Read current dados_coletados (preserva keys existentes)
  const r1 = await fetch(
    `${supabaseUrl}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&select=dados_coletados,estado_agente`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
  );
  if (!r1.ok) throw new Error(`fetch conversa falhou: ${r1.status}`);
  const rows = await r1.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`conversa ${conversa_id} não encontrada`);
  }
  const conv = rows[0];

  if (conv.estado_agente === 'fechado') {
    return { fechada: false, ja_estava_fechada: true };
  }

  const dadosAtualizados = {
    ...(conv.dados_coletados || {}),
    fechado_motivo: motivo,
    fechado_em: new Date().toISOString(),
  };

  // 2) PATCH com idempotência via filtro estado_agente=neq.fechado.
  // Se outro processo fechou nessa janela, PATCH afeta 0 rows → ja_estava_fechada.
  const r2 = await fetch(
    `${supabaseUrl}/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&estado_agente=neq.fechado`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        estado_agente: 'fechado',
        dados_coletados: dadosAtualizados,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!r2.ok) {
    const errText = await r2.text().catch(() => '');
    throw new Error(`PATCH conversa falhou: ${r2.status} ${errText}`);
  }
  const updated = await r2.json();
  return {
    fechada: Array.isArray(updated) && updated.length > 0,
    ja_estava_fechada: Array.isArray(updated) && updated.length === 0,
  };
}
```

### Movimento B — Caller `functions/_lib/mp-sinal-handler.js` (modificação ~linha 78)

Após o `estado='confirmado'` PATCH atual, adicionar:

```js
import { markConversaFechada } from './conversas-lifecycle.js';
// ... lógica existente que marca estado='confirmado' ...
try {
  await markConversaFechada({
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SB_KEY,
    conversa_id: conversa.id,
    motivo: 'sinal_pago',
  });
} catch (e) {
  console.warn('mp-sinal-handler: markConversaFechada falhou (não-bloqueante):', e?.message);
}
```

### Movimento B — Caller `functions/api/cron/expira-holds.js` (modificação ~linha 78)

No loop por conversa expirada, após o `estado='expirado'` PATCH:

```js
import { markConversaFechada } from '../../_lib/conversas-lifecycle.js';
// ... loop existente ...
for (const conv of conversasExpiradas) {
  // ... PATCH estado='expirado' existente ...
  try {
    await markConversaFechada({
      supabaseUrl: SUPABASE_URL,
      supabaseKey: SB_KEY,
      conversa_id: conv.id,
      motivo: 'hold_expirado',
    });
  } catch (e) {
    console.warn(`expira-holds: markConversaFechada falhou pra ${conv.id} (não-bloqueante):`, e?.message);
    // continua o batch — uma falha não derruba o resto
  }
}
```

## Fluxo de dados

### Fluxo 1: Tab "Em negociação" no painel (caso single-column)

1. Frontend monta querystring `?token=<X>&grupo=negociacao&limit=30`.
2. `list.js` valida token via `verifyStudioTokenOrLegacy` → resolve `tenant_id`.
3. `getGrupoFilter('negociacao')` retorna `{estados_agente:['propondo_valor','lead_frio','pausada_tatuador'], estados:[], inclui_filtro_hoje:false}`.
4. list.js detecta `estados.length === 0` → query simples `estado_agente=in.(propondo_valor,lead_frio,pausada_tatuador)`.
5. PostgREST roda + filtro tenant + order by `last_msg_at desc` + limit.
6. `Promise.all` busca `last_msg_preview` de cada conversa (lógica existente).
7. JSON retorna `{ok:true, conversas:[...], next_cursor:...}` → frontend renderiza cards.

### Fluxo 2: Tab "Hoje" (caso cross-column real)

1-2. Igual.
3. Helper retorna `{estados_agente:['coletando_tattoo','coletando_cadastro'], estados:['escolhendo_horario','aguardando_sinal'], inclui_filtro_hoje:true}`.
4. list.js detecta ambas listas com itens → query cross-column:
   ```
   tenant_id=eq.<X>
   &or=(estado_agente.in.(coletando_tattoo,coletando_cadastro),estado.in.(escolhendo_horario,aguardando_sinal))
   &last_msg_at=gte.<today_brt_utc>
   &order=last_msg_at.desc&limit=30
   ```
5-7. Mesmo.

### Fluxo 3: Cliente paga sinal (lifecycle)

1. Mercado Pago dispara webhook IPN → `/api/mp-ipn` → `mp-sinal-handler.js`.
2. Handler valida HMAC, marca `conversas.estado='confirmado'` (lógica existente).
3. **NOVO:** Handler chama `markConversaFechada({conversa_id, motivo:'sinal_pago'})`.
4. Helper lê `dados_coletados` atual, mescla com `{fechado_motivo, fechado_em}`, PATCH com filtro idempotência.
5. Se ok: conversa aparece em "📁 Histórico" no próximo polling do painel (8s).
6. Se erro: `console.warn` + sinal segue confirmado (não-bloqueante — billing/agenda intactos).

### Fluxo 4: Hold de slot expira (cron)

1. CF Worker `inkflow-cron` chama `/api/cron/expira-holds` (cron `0 */6 * * *`).
2. Handler lista `conversas` com `slot_expira_em < NOW()`.
3. Pra cada uma: PATCH `estado='expirado'` + **NOVO:** `markConversaFechada(motivo:'hold_expirado')` em try/catch isolado.
4. Uma falha de helper não derruba batch — continua próxima conversa.

## Cobertura de testes

### Existentes — atualizar 14 tests

**`tests/conversas/_grupos.test.js`** (6 tests existentes):
- Asserts mudam de `result.estados` pra `result.estados_agente` + `result.estados`.
- Adicionar 1 test novo: grupo retorna lista vazia + lista cheia (caso "aguardando").

**`tests/conversas/list.test.js`** (8 tests existentes):
- Asserts de URL atualizar pra refletir nova estrutura de query.
- Tests de tenant_id leak permanecem (validação não muda).

### Novos — `tests/conversas/conversas-lifecycle.test.js` (5 tests)

1. ✅ motivo válido `sinal_pago` → grava `estado_agente=fechado` + dados_coletados merged corretamente.
2. ✅ motivo `hold_expirado` → mesmo, com motivo correto no body do PATCH.
3. ✅ chamado 2x na mesma conversa → 1ª retorna `{fechada:true,ja_estava_fechada:false}`, 2ª retorna `{fechada:false,ja_estava_fechada:true}`.
4. ✅ motivo inválido (ex.: `'foo'`) → throw `Error` com lista de motivos válidos na mensagem.
5. ✅ conversa inexistente (UUID válido mas sem row) → throw `Error` informativo (não silencioso).

### Novos — `tests/conversas/list.test.js` adições (3 tests)

6. ✅ grupo=hoje → URL contém `or=(estado_agente.in.(...),estado.in.(...))` + `last_msg_at=gte`.
7. ✅ grupo=negociacao → URL contém `estado_agente=in.(...)` direto (sem `or=`).
8. ✅ grupo=hoje + before_ts → URL contém `or=(...)` + `last_msg_at=lt.<ts>`.

**Total: 23 tests (14 atualizados + 9 novos: 1 em `_grupos` + 5 em `conversas-lifecycle` + 3 em `list`).** Bateria roda em <3s.

## Riscos remanescentes

| Risco | Severidade | Mitigação |
|---|---|---|
| PostgREST `or=` parser quebra com vírgulas em valores | baixo | Nossos enums são `[a-z_]+` puro, sem vírgulas. Tests cobrem ambas formas (com/sem `or=`). |
| Race read-then-patch no helper (entre fetch e PATCH dados_coletados) | baixo | Janela ms; tools n8n não paralelizam na mesma conversa. Aceito. |
| `coletando_tattoo` zero em prod hoje | médio | Documentado — feature gap dependente de Modo Coleta v2 PR 2. Painel "Hoje" funciona com 3 dos 4 estados até PR 2 sair. |
| Helper falha silenciosa em cron expira-holds | baixo | Log warn + continua batch. Painel Histórico degrada mas billing/cron core intactos. |
| Frontend não re-fetcha após Assumir/Devolver | baixo (UX) | Bug #3 menor — vira P3 backlog separado. Resolve trocando de tab. |

## Critérios de aceitação

- [ ] `_grupos.js` retorna `{estados_agente, estados, last_msg_at_gte?}` em vez de `{estados, last_msg_at_gte?}`.
- [ ] `list.js` constrói query corretamente: `or=` quando ambas listas, forma simples quando só uma.
- [ ] `markConversaFechada` é idempotente (chamadas repetidas não corrompem dados).
- [ ] `mp-sinal-handler.js` chama helper após `estado='confirmado'` em try/catch.
- [ ] `cron/expira-holds.js` chama helper em try/catch isolado por conversa.
- [ ] 22 tests verde (14 atualizados + 8 novos).
- [ ] Smoke browser pós-deploy:
  - Tab "Hoje" mostra conversa em estado `escolhendo_horario` ou `aguardando_sinal` (cliente vivo).
  - Tab "Aguardando" mostra conversa em estado `aguardando_tatuador` ou `aguardando_decisao_desconto`.
  - Tab "Em negociação" continua funcionando (regressão zero).
  - Tab "📁 Histórico" passa a mostrar conversas após sinal pago ou hold expirado.

## Próximos passos

1. **`/plan`** sobre esse spec — gera plano de implementação granular com calibração subagent por task.
2. **Executar plano** via `superpowers:subagent-driven-development` em modo autônomo.
3. **Smoke browser pós-deploy** — Leandro valida em prod com mesmo método do smoke 04/05 (criar conversa de teste em estado `escolhendo_horario` em vez de `pausada_tatuador`).
4. **Cleanup** — apagar conversa de teste; deixar `studio_token` do tenant Hustle Ink ativo (criado durante smoke 04/05) salvo no Bitwarden.
5. **Atualizar Painel + plano-mestre refator página tatuador** marcando PR 4.1 done; restam PRs 2/5/6/7/8/9.

## Cross-references

- Spec pai: `docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md`
- PR #24 (Painel Conversas merged): `90a8c2e` — https://github.com/brazilianhustle/inkflow-saas/pull/24
- PR #21 (Foundation, criou constraint estado_agente): `0dcecd3`
- PR #23 (Agente + kill-switch backend, estado `pausada_tatuador`): `a4d5cd6`
- Smoke 04/05 noite parte 5: ver Painel `last_session_focus`
