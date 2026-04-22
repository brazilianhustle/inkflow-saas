# Modo Coleta — Reorganização dos Prompts em 3 Cenários

**Data:** 2026-04-22
**Autor:** Leandro Marques
**Status:** Design finalizado — pronto pra revisão do user + geração do plano de implementação (`writing-plans`)

---

## Contexto

O InkFlow hoje tem 2 modos de precificação escolhidos pelo tatuador no onboarding:

- **Faixa** — agente responde com faixa de preço, tatuador fecha o valor final.
- **Exato** — agente passa valor fechado da calculadora InkFlow.

Ambos são gerados por um único arquivo monolítico: `functions/_lib/generate-prompt.js` (556 linhas) com branching interno `if valor_tipo === 'faixa' / 'exato'` (linhas 219-229) e few-shots em `fewShotBase` (423-520) que **todos** chamam `calcular_orcamento` e falam valores.

## Problema

Surgiu demanda por um **3º modo (Coleta)**: tatuador **NÃO** quer que o agente monte orçamento — agente só coleta infos necessárias (altura, tamanho, local do corpo, fotos, referências) e entrega pro tatuador orçar manualmente.

Adicionar esse modo no arquivo atual explodiria o `if/else` em N pontos e criaria contradições com few-shots que ensinam exatamente o contrário do que o novo modo precisa fazer.

## Decisão

1. **Refatorar em 3 modos + 2 sub-modos de Coleta = 4 geradores de prompt isolados.**
2. **Adicionar camada de Higiene & Observabilidade dos Prompts** pra evitar problemas residuais e contaminação cruzada.

---

## Modos e sub-modos

| Modo | Sub-modo | Comportamento |
|---|---|---|
| **Faixa** | — | Agente passa faixa, tatuador fecha. Fluxo atual preservado. |
| **Exato** | — | Agente passa valor fechado da calculadora. Fluxo atual preservado. |
| **Coleta** | **Puro** | Agente coleta infos → handoff → **sai e não volta**. Tatuador faz preço, agendamento, sinal — tudo manual via WhatsApp. |
| **Coleta** | **Reentrada** | Agente coleta infos → handoff → silêncio → tatuador manda trigger-phrase (ex: `Lina, assume 750`) → agente reentra pra fechar agendamento + cobrar sinal. |

## Os 4 prompts

1. `generatePromptFaixa(tenant, conversa, ctx)` — modo Faixa, fluxo completo.
2. `generatePromptExato(tenant, conversa, ctx)` — modo Exato, fluxo completo.
3. `generatePromptColetaInfo(tenant, conversa, ctx, { submode })` — fase 1 de Coleta, usada pelos 2 sub-modos. Única diferença entre Puro e Reentrada é a mensagem final de handoff.
4. `generatePromptColetaAgendamento(tenant, conversa, ctx)` — fase 2 de Coleta-Reentrada apenas. Ativa quando `estado_agente === 'agendamento'`.

---

## Arquitetura de arquivos

```
functions/_lib/prompts/
├── index.js                          ← dispatcher público (substitui generate-prompt.js atual)
├── _shared/
│   ├── identidade.js                 ← nome, personalidade
│   ├── checklist-critico.js          ← guardrails anti-alucinação
│   ├── tom.js                        ← estilo de escrita
│   ├── contexto.js                   ← estúdio, endereço, horários
│   └── faq.js                        ← FAQ do tenant
├── faixa/
│   ├── generate.js                   ← generatePromptFaixa()
│   ├── fluxo.js
│   ├── regras.js
│   ├── few-shot.js                   ← exemplos base (atuais linhas 448-520)
│   └── few-shot-tenant.js            ← lê tenant.fewshots_por_modo.faixa
├── exato/
│   ├── generate.js
│   ├── fluxo.js
│   ├── regras.js
│   ├── few-shot.js
│   └── few-shot-tenant.js
└── coleta/
    ├── info/
    │   ├── generate.js               ← aceita { submode: 'puro' | 'reentrada' }
    │   ├── fluxo.js                  ← checklist OBR, handoff
    │   ├── regras.js                 ← NÃO falar valor, NÃO perguntar cover-up do nada
    │   ├── few-shot.js
    │   └── few-shot-tenant.js        ← lê tenant.fewshots_por_modo.coleta_info
    └── agendamento/
        ├── generate.js
        ├── fluxo.js                  ← reentrada: agendamento + sinal
        ├── regras.js
        ├── few-shot.js
        └── few-shot-tenant.js        ← lê tenant.fewshots_por_modo.coleta_agendamento
```

## Dispatcher

```javascript
// functions/_lib/prompts/index.js
export function generateSystemPrompt(tenant, conversa, clientContext) {
  const modo = tenant.config_precificacao?.modo || 'faixa';
  const submode = tenant.config_precificacao?.coleta_submode || 'puro';
  const estado = conversa?.estado_agente || 'ativo';

  switch (modo) {
    case 'faixa':
      return generatePromptFaixa(tenant, conversa, clientContext);
    case 'exato':
      return generatePromptExato(tenant, conversa, clientContext);
    case 'coleta':
      if (submode === 'reentrada' && estado === 'agendamento') {
        return generatePromptColetaAgendamento(tenant, conversa, clientContext);
      }
      return generatePromptColetaInfo(tenant, conversa, clientContext, { submode });
  }
}
```

Ponto de importação público `generateSystemPrompt` continua igual — consumidores atuais (`functions/api/tools/prompt.js`, `functions/api/tools/simular-conversa.js`) **não mudam**.

## Estado da conversa

Campo novo: `conversa.estado_agente`

| Valor | Significado |
|---|---|
| `ativo` | Agente conversando normalmente |
| `aguardando_handoff` | Agente chamou `acionar_handoff`, aguarda tatuador |
| `silencioso` | Tatuador assumiu, agente não responde |
| `agendamento` | (Coleta-Reentrada) Trigger detectado, agente reentrou pra fechar agendamento |
| `fechado` | Sessão agendada e sinal pago — conversa concluída |

Transições (modo Coleta):
- `ativo` → `aguardando_handoff` quando agente chama `acionar_handoff`
- `aguardando_handoff` → `silencioso` na primeira mensagem do número do tatuador
- `silencioso` → `agendamento` quando trigger-phrase é detectada (Coleta-Reentrada apenas)
- `agendamento` → `fechado` após `marcar_agendamento` com sinal pago confirmado

**Faixa/Exato ignoram esse campo no MVP** — continuam funcionando como hoje (conversa linear sem máquina de estados explícita). Adotar os estados nesses modos é melhoria incremental futura (ex: marcar `fechado` após pagamento de sinal pra habilitar dashboards/métricas). Não faz parte deste design.

---

## Checklist de coleta (fase info)

| Campo | Status |
|---|---|
| Descrição/ideia da tattoo | **OBR** |
| Tamanho (cm) | **OBR** |
| Local do corpo | **OBR** |
| Estilo | OPC |
| Foto do local | OPC |
| Imagens de referência | OPC |
| Cover-up | **GATILHO DE HANDOFF** (não é campo do checklist): handoff instantâneo se cliente mencionar OU detectado em imagem de referência. Agente **nunca pergunta ativamente**. |
| Cor / P&C | NÃO coletar (inferido da ideia + referências) |
| Primeira tattoo | NÃO coletar |
| Disponibilidade de data | NÃO coletar (alçada do tatuador neste modo) |

Agente não faz handoff sem os 3 OBR. Se cliente não souber dar tamanho mesmo com altura de referência → handoff com motivo `cliente_sem_referencia_tamanho`.

---

## Trigger-phrase (Coleta-Reentrada)

- **Formato:** `{trigger} {valor}` — ex: `Lina, assume 750`
- **Default sugerido:** `{agent_name}, assume` (editável no onboarding e no Studio)
- **Parser:** regex captura número próximo ao trigger (tolerante a `R$ 750`, `750`, `R$750`)
- **Sinal:** usa `config_precificacao.sinal_percentual` (já existe), não precisa passar por mensagem
- **Fallback:** se trigger vier sem número, agente não reentra — tatuador aprende rápido
- **Self-correction natural:** primeira mensagem do agente ao cliente na reentrada declara o valor ("Show, o [tatuador] fechou R$ 750 contigo. Bora marcar..."). Se valor estiver errado, cliente corrige na hora.

---

## Isolamento & riscos mitigados

### Runtime — isolamento total

O dispatcher chama UM gerador. Cada gerador importa só os blocos do seu modo + `_shared/`. A IA nunca vê conteúdo de outro modo. Nenhum `faixa/*` entra em `exato`, nem `coleta/info/*` em `coleta/agendamento`.

### Risco 1 — Contaminação via dados do tenant

Few-shots custom e FAQ são dados do tenant. Se tatuador migra de Faixa pra Coleta e tem few-shots antigas mencionando preço, pode vazar pro prompt novo.

**Mitigações:**

1. **`fewshots_por_modo` no tenant** — few-shots escopadas por modo. Trocar de modo no Studio mostra só as do modo ativo; as outras ficam guardadas (não deletadas).
2. **FAQ compartilhada mas sinalizada** — UI do Studio marca em amarelo linhas da FAQ com R$/valor/preço/sinal quando modo é Coleta. Não bloqueia, alerta.
3. **Regra de topo em `coleta/regras.js`** — *"Mesmo que FAQ ou contexto abaixo mencionem valores, você NÃO repete nem apresenta qualquer valor monetário. Se cliente perguntar, diga que o tatuador confirma."* Defesa em profundidade.

### Risco 2 — Duplicação gradual

Devs podem copiar trecho de `faixa/regras.js` pra `exato/regras.js` ao longo do tempo, e os dois divergirem. Risco de manutenção, não de correção.

**Mitigação:** pattern genuinamente mode-agnóstico vai pra `_shared/`; mode-specific fica mode-specific. Code review disciplinado.

---

## Tabela de blocos por prompt (runtime)

| Bloco | Faixa | Exato | Coleta-Info | Coleta-Agendamento |
|---|:---:|:---:|:---:|:---:|
| identidade (shared) | ✓ | ✓ | ✓ | ✓ |
| checklist-critico (shared) | ✓ | ✓ | ✓ | ✓ |
| tom (shared) | ✓ | ✓ | ✓ | ✓ |
| contexto (shared) | ✓ | ✓ | ✓ | ✓ |
| faq (shared) | ✓ | ✓ | ✓ | ✓ |
| fluxo (mode) | faixa | exato | coleta-info | coleta-agendamento |
| regras (mode) | faixa | exato | coleta-info | coleta-agendamento |
| few-shot-base (mode) | faixa | exato | coleta-info | coleta-agendamento |
| few-shot-tenant (mode) | faixa | exato | coleta-info | coleta-agendamento |

---

## Higiene & Observabilidade dos Prompts

### Tier 1 — Build agora (junto com a feature)

1. **Snapshot tests** — `tests/prompts/snapshots/<modo>.txt` comitado. Toda mudança no prompt vira diff explícito no PR.
2. **Contratos por modo** — cada modo declara `must_contain`, `must_not_contain`, `max_tokens`. CI bloqueia PR que quebra contrato. Exemplo Coleta-Info:
   ```javascript
   {
     must_contain: ['acionar_handoff', 'tamanho', 'local do corpo', 'descrição'],
     must_not_contain: ['R$', 'calcular_orcamento', 'faixa de', 'valor exato', 'sinal', 'agendar'],
     max_tokens: 8000,
   }
   ```
3. **Invariantes cross-mode** — todos contêm `identidade`/`checklist-critico`/`contexto`, nenhum excede limite de tokens, nenhum vaza metainstruções.
4. **Linter de contaminação** — fixture "tenant-contaminado" com FAQ/few-shots sujas, roda nos 4 modos, assertion que Coleta nunca contém valores monetários mesmo com tenant sujo. Prova que a regra de topo segura o LLM.

```
tests/prompts/
├── snapshots/               ← 5 .txt comitados
├── contracts/               ← 4 .js com must_contain/must_not_contain
├── fixtures/
│   ├── tenant-canonico.js
│   └── tenant-contaminado.js
├── invariants.test.js
├── contamination.test.js
└── snapshot.test.js
```

### Tier 2 — Produção (fase 2, perto do lançamento)

1. **Log estruturado** de cada inferência: `{ tenant_id, modo, submode, prompt_version, tools_called, tokens_used, estado_agente }` — via Cloudflare Workers Logs.
2. **Alertas automáticos** (CF Observability ou n8n):
   - **Crítico**: modo Coleta chamou `calcular_orcamento` — investigar imediato.
   - **Warning**: taxa de handoff Coleta-Info < 70% — agente não conclui checklist.
   - **Info**: tokens médios por modo subiram >15% semana-a-semana — prompt inchando.
3. **Dashboard mínimo** no `admin.html`: métricas por modo.

### Tier 3 — Maturidade (quando houver volume)

1. Eval suite expandida em `evals/` com LLM-juíz.
2. A/B de prompts.
3. Auto-revisão mensal via LLM — cron que audita prompts procurando contradições/drift, gera issues no GitHub.

### Automação (Tier 1)

| Momento | Ação |
|---|---|
| Dev edita `<modo>/regras.js` | `npm test tests/prompts/` local |
| `git commit` | Pre-commit hook (Husky) roda os testes |
| `git push` | CI (GitHub Actions) roda bateria completa |
| Mudança intencional | `npm test -- -u` atualiza snapshot; PR mostra diff textual |

---

## Modelo de dados e migração

### Mudanças no schema

**1. `tenants.config_precificacao` (JSONB)** — campos novos (sem ALTER, só código):

| Campo | Tipo | Aplicável quando | Default |
|---|---|---|---|
| `modo` | `'faixa' \| 'exato' \| 'coleta'` | sempre | `'faixa'` |
| `coleta_submode` | `'puro' \| 'reentrada'` | `modo === 'coleta'` | `'puro'` |
| `trigger_handoff` | string (2-50 chars) | `coleta_submode === 'reentrada'` | `"{agent_name}, assume"` |

**2. Coluna nova `tenants.fewshots_por_modo`** (JSONB) — top-level, fora de `config_precificacao` (separação de responsabilidades: config é sobre regras de preço, fewshots é conteúdo de treino).

```json
{
  "faixa": [],
  "exato": [],
  "coleta_info": [],
  "coleta_agendamento": []
}
```

**3. Coluna nova `conversas.estado_agente`** (TEXT, default `'ativo'`). Index parcial nos estados não-ativos.

### Migração SQL

```sql
-- migrations/001_modo_coleta.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS fewshots_por_modo JSONB
  NOT NULL DEFAULT '{"faixa":[],"exato":[],"coleta_info":[],"coleta_agendamento":[]}'::jsonb;

ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS estado_agente TEXT
  NOT NULL DEFAULT 'ativo';

CREATE INDEX IF NOT EXISTS idx_conversas_estado_agente
  ON conversas(estado_agente)
  WHERE estado_agente != 'ativo';

-- Backfill: verificar se existe coluna tenants.fewshots antes de rodar
-- UPDATE tenants SET fewshots_por_modo = jsonb_set(
--   fewshots_por_modo,
--   ARRAY[config_precificacao->>'modo'],
--   COALESCE(fewshots, '[]'::jsonb)
-- ) WHERE fewshots IS NOT NULL;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS fewshots;
```

### Validações em `functions/api/update-tenant.js`

- Expandir `MODOS_VALIDOS = ['faixa', 'exato', 'coleta']`.
- Adicionar `SUBMODES_COLETA = ['puro', 'reentrada']`.
- `validarConfigPrecificacao(cfg, agentName)` — valida modo, submode obrigatório se modo=coleta, trigger_handoff entre 2-50 chars se submode=reentrada.
- Limpeza defensiva: se `modo !== 'coleta'`, remover `coleta_submode` e `trigger_handoff` do payload.
- `ALLOWED_FIELDS` ganha `fewshots_por_modo`, validado como objeto com as 4 chaves esperadas.

### Compatibilidade com tenants existentes

| Cenário | Comportamento |
|---|---|
| Tenant antigo `modo='faixa'/'exato'` | Funciona igual. `fewshots_por_modo` default vazio. `estado_agente` não usado. |
| Tenant migra pra Coleta no Studio | API seta `coleta_submode='puro'` (default seguro) e `trigger_handoff=null`. Warning no Studio revisar FAQ/few-shots. |
| Few-shots antigas (se `tenants.fewshots` existir) | Migradas via SQL pro slot do modo atual. |
| Conversas em andamento no deploy | `estado_agente='ativo'` default, comportamento idêntico. |

### Rollout seguro

1. Deploy da migração SQL (colunas novas com defaults, zero breaking).
2. Deploy do código (dispatcher + 4 geradores). Caminho de Coleta não exercido ainda em produção.
3. **Feature flag `ENABLE_COLETA_MODE`** no onboarding. 3º botão aparece só quando flag ativa. Testar com tenants-teste antes de abrir geral.
4. Tenants existentes não migram automaticamente — trocam pelo Studio se quiserem.

### Decisões adiadas

- **Tabela relacional `tenant_fewshots`** em vez de JSONB: fica pra quando precisar de search/versioning real. JSONB suficiente agora.
- **Versionamento de prompts** (`prompt_version_<modo>`): adiar pro Tier 2 de observabilidade.

---

## Onboarding — fluxo novo

### Sequência de steps

```
qa-video              ← existente (tutorial de precificação geral)
qa-modos-video        ← NOVO (explica os 3 modos do InkFlow)
qa-intro              ← seleção do modo (3 botões agora)
qa-coleta-submode     ← NOVO, só se modo=coleta (Puro vs Reentrada)
(demais steps)
```

**Routing condicional** do botão Continuar de `qa-intro`:
- `modo=coleta` → `qa-coleta-submode` → `qa-test` (pula pricing steps)
- `modo=faixa/exato` → `qa-sinal` (fluxo atual preservado)

### `qa-modos-video` (novo)

Vídeo que apresenta os 3 modos antes da escolha. Hosted em Cloudflare Stream (URL configurada via env). Botão "Continuar" leva a `qa-intro`. Botão "Pular explicação dos modos (Não recomendado)" no mesmo padrão visual do `qa-video` existente.

### `qa-intro` (modificado)

- 3º botão: **"Coleta de informações (sem valor)"**
- 3º preview de conversa WhatsApp mostrando o modo Coleta em ação (agente coletando tamanho, foto, referências, e fazendo handoff com a frase padrão do modo).
- Function `selectModo` aceita `'coleta'`.
- Lógica do Continuar roteia para `qa-coleta-submode` ou `qa-sinal` conforme selectedModo.

### `qa-coleta-submode` (novo, condicional)

Aparece só se `selectedModo === 'coleta'`. Layout idêntico ao `qa-intro` (consistência visual).

Título: *"Como o agente se comporta depois de coletar as informações?"*

**Card Puro** — preview de conversa mostrando o agente se despedindo após o handoff e tatuador assumindo manualmente toda negociação/agendamento.

**Card Reentrada** — preview completo: agente coleta → handoff → tatuador manda valor → tatuador digita trigger (`Lina, assume 750`) → agente reentra pra agendar.

**Campo trigger-phrase** (aparece só se submode=reentrada):
- Input text com default pré-preenchido `{agent_name}, assume`
- Validação client-side: não submeter vazio, 2-50 chars
- Helper text: "Ex: Lina, assume 750" + "Pode editar depois no Studio"

**Card de tutorial "Resposta Rápida" do WhatsApp Business** (aparece junto do campo trigger, submode=reentrada):
- Título: *"Facilita tua vida: configure uma Resposta Rápida no WhatsApp"*
- Texto curto explicando o benefício: *"Digite só `/agente 750` e o WhatsApp expande sozinho pra `{agent_name}, assume 750`."*
- Passos numerados com screenshots/GIFs:
  1. Abre WhatsApp Business → Configurações → Ferramentas comerciais → Respostas rápidas
  2. Toca em `+` pra criar uma nova
  3. Atalho: `/agente` (ou outro que preferir)
  4. Mensagem: `{agent_name}, assume ` (com espaço no final)
  5. Salva
- **Requisito** sinalizado claramente: *"Precisa do WhatsApp Business (gratuito). Se você usa WhatsApp normal, o atalho não funciona — você digita a frase completa manualmente."*
- Link "Pular por agora — configurar depois no Studio"

### Paginação dinâmica (`nav-dots`)

| Modo | Dots visíveis |
|---|---|
| Faixa / Exato | qa-modos-video → qa-intro → qa-sinal → qa-faixas → qa-ajustes → qa-limites → qa-test (**7 dots**) |
| Coleta | qa-modos-video → qa-intro → qa-coleta-submode → qa-test (**4 dots**) |

`qa-video` (tutorial de precificação geral) não entra nos dots, mantém o padrão atual. Função de `nav-dots` em `onboarding.html:2747` passa a reagir ao selectedModo em tempo real — trocar de modo no qa-intro reconfigura os dots.

### Payload no submit (qa-test → backend)

```javascript
// Caso modo=coleta:
{
  modo: 'coleta',
  coleta_submode: 'puro' | 'reentrada',
  trigger_handoff: 'Lina, assume',  // só se submode=reentrada
  sinal_percentual: null,
  tabela_tamanho: null,
  multiplicadores: null,
  // demais campos de calculadora null/ausentes
}

// Caso modo=faixa/exato: payload atual inalterado.
```

Backend (`update-tenant.js`) normaliza — limpa `coleta_submode`/`trigger_handoff` se `modo !== 'coleta'`.

### Limpeza de state ao voltar

Se usuário no `qa-coleta-submode` volta pro `qa-intro` e troca pra Faixa, o `selectedSubmode` e `triggerHandoffInput.value` são resetados. Evita phantom coleta fields no payload.

### Arquivos tocados

- `onboarding.html`:
  - Novo bloco `qa-modos-video` entre `qa-video` e `qa-intro`
  - `qa-intro` (657-700): 3º botão + 3º exemplo de conversa
  - Novo bloco `qa-coleta-submode` após `qa-intro`
  - `selectModo` (2159): aceitar `'coleta'`
  - Nova função `selectSubmode(sub, btn)`
  - Continuar de `qa-intro`: roteamento condicional
  - `nav-dots` (2747): paginação dinâmica

### Feature flag

`ENABLE_COLETA_MODE` controla visibilidade do 3º botão em `qa-intro` e do step `qa-modos-video` (se o vídeo ainda não tá gravado quando liga). Em produção: OFF inicial, ON em staging/dev, liga em prod com commit quando confortável.

---

## Studio — escopo deste PR e roadmap de redesign

> Esta seção consolida as mudanças do Studio. O escopo **deste PR** é limitado aos itens marcados como obrigatórios. As demais melhorias ficam registradas aqui como roadmap pra entrar em PRs incrementais ou num sprint de redesign dedicado, alimentando [[InkFlow — Pendências (backlog)]].

### Diagnóstico do Studio atual

- Tab "agente" (`studio.html:451-631`): 15+ campos em scroll único, botão único "Salvar configurações" (save-all).
- Campos JSON raw pra tabela de preços (`ag-precificacao`, linha 597) e horário (`ag-horario`, linha 582).
- Nav superior com 4 tabs (dashboard · agente · conversas · agendamentos).
- Sem: simulador, histórico de alterações, pause de emergência, CRM, análises, plano/faturamento visível, status de conexão em tempo real.

### Arquitetura de navegação proposta (visão completa)

Sidebar agrupando áreas (desktop) / drawer (mobile):

```
OPERAÇÃO
  Visão geral · Conversas · Agenda · Clientes (NOVO)

AGENTE
  Identidade · Modo & Precificação · Conhecimento
  · Exemplos (few-shots) · Simulador (NOVO) · Histórico (NOVO)

PLATAFORMA
  WhatsApp · Integrações (NOVO) · API & Webhooks (NOVO)

CONTA
  Plano & Faturamento (NOVO) · Equipe (NOVO) · Preferências · Ajuda
```

Top bar persistente: breadcrumb · notificações · menu do usuário.
Banner de status do agente sempre visível: status de conexão · **Pausar agente** (emergency stop) · **Modo Teste** (whitelist de números).

### Escopo obrigatório NESTE PR (Modo Coleta)

Todas as mudanças abaixo ficam dentro do tab "agente" atual — **não** exigem o redesign da sidebar. Permite mergear sem dependência do sprint maior.

1. **Reorganizar o tab "Agente" em sub-seções colapsáveis ou subtabs** — elimina scroll único. Agrupamento:
   - Identidade (nome, persona, tom, emojis, frases)
   - Modo & Precificação (nova)
   - Conhecimento (FAQ, estilos, gatilhos, portfolio)
   - Exemplos (few-shots — nova)

2. **Nova seção "Modo & Precificação":**
   - Badge do modo ativo no topo da seção.
   - Seletor com 3 botões: Faixa · Exato · Coleta.
   - Sub-seletor Puro / Reentrada (condicional a modo=coleta).
   - Input `trigger_handoff` (condicional a submode=reentrada), default `{agent_name}, assume`, validação 2-50 chars.
   - **Help card permanente "Resposta Rápida do WhatsApp"** (condicional a submode=reentrada): card colapsável ao lado do input trigger com os mesmos passos do onboarding (como configurar atalho `/agente` no WhatsApp Business). Permite o tatuador rever quando quiser sem voltar pro onboarding.
   - Calculadora/tabela de preços: overlay *"Não aplicável ao modo Coleta"* quando modo=coleta. Dados preservados (não deleta), expansível em read-only.
   - Botão "Salvar modo" → **modal de confirmação** com texto dinâmico descrevendo a transição (from → to) e impactos (tools afetadas, FAQ a revisar, few-shots que passam a ser usados).

3. **Nova seção "Exemplos (few-shots)" com 4 tabs:**
   - Tabs: Faixa · Exato · Coleta Info · Coleta Agendamento.
   - Badge "Ativo" na tab do modo em uso atual.
   - Tabs inativas editáveis (tatuador configura futuro modo sem mudar agora).
   - Editor: reutiliza o padrão visual do editor de few-shots atual do Studio. Se hoje for textarea raw, mantém raw no MVP — a melhoria pra editor estruturado (pares cliente/agente, drag-reorder) fica listada em "Incremental".
   - Cada tab tem seu próprio botão **"Salvar exemplos desta tab"** — evita salvar mudanças pendentes de outras tabs sem querer.

4. **FAQ com alerta visual de contaminação (condicional a modo=coleta):**
   - Client-side regex `\b(R\$|reais|valor|preço|sinal|pix)\b` (case-insensitive).
   - Linhas com match: fundo amarelo + ícone `?` com tooltip *"Esta linha menciona valores — modo Coleta não deve passar valores. Considere reformular."*
   - Não bloqueia salvar, só sinaliza.

### Incremental — próximos PRs (recomendados antes do lançamento geral)

| # | Melhoria | Motivo |
|---|---|---|
| 1 | Banner de status + botão "Pausar agente" | Emergency stop operacional. Crítico pra qualquer lançamento. |
| 2 | **Simulador** (chat fake usando o mesmo gerador de prompt) | Dá confiança ao tatuador pra mudar config sem quebrar produção. Alto valor pra modo Coleta porque o tatuador é ansioso com mudanças. |
| 3 | Editor visual da tabela de preços | Remove JSON raw do Studio, baixa barreira pra tatuadores não-técnicos. |
| 4 | Histórico de alterações (audit log + rollback) | Recovery rápido se uma mudança quebrar comportamento do agente. |

### Redesenho maior (sprint dedicado, prioridade futura)

- Sidebar nova com as 4 áreas agrupadas (Operação / Agente / Plataforma / Conta).
- **Clientes** (CRM lite automático baseado em conversas — histórico, tags, export CSV).
- **Análises** expandidas (funil de conversão, tempo médio, handoff rate por modo, top FAQs).
- Command palette `cmd+K` (busca e ações rápidas).
- **Integrações** dedicadas (MP, Google Calendar, webhooks).
- Padrões UX profissionais: save inline por card, optimistic UI, toasts, skeletons, empty states com CTA, inline help, dark mode tokens, bulk actions, export everywhere.

### Já coberto em outro spec

- **Plano & Faturamento**: `docs/superpowers/specs/2026-04-21-billing-lifecycle-v1-design.md`

### Arquivos tocados neste PR

- `studio.html` (tab agente, linhas 451-631):
  - Reorganizar campos existentes em sub-seções.
  - Adicionar seção "Modo & Precificação" com controles novos.
  - Adicionar seção "Exemplos (few-shots)" com 4 tabs.
  - FAQ: destaque visual de linhas com valores monetários quando modo=coleta.
  - Modal novo de confirmação ao trocar modo.
  - JS novo: `onModoChange`, `onSubmodeChange`, `onTriggerInput`, `onSaveModo`, `onFewshotsTabSwitch`, `onSaveFewshots`, `highlightFaqContamination`.
- `functions/api/update-tenant.js`: já tratado no Bloco 2.
- `functions/api/get-tenant.js`: retornar `fewshots_por_modo` (verificar se já retorna; se não, adicionar).

### Feature flag

`ENABLE_COLETA_MODE` também afeta o Studio:
- Botão "Coleta" no seletor de modo não aparece se flag OFF.
- Tabs `coleta_info` e `coleta_agendamento` em Exemplos ficam ocultas se flag OFF.
- Tenants pré-flag continuam funcionando sem mudança.

---

## Comportamento dos prompts Coleta

### generatePromptColetaInfo(tenant, conversa, ctx, { submode })

**Objetivo**: coletar 3 campos obrigatórios + opcionais úteis, tratar gatilhos de handoff imediato, encerrar com mensagem conforme submode.

**Composição (ordem):** identidade · checklist-crítico · tom · contexto · faq · regras (mode) · fluxo (mode) · handoff (por submode) · gatilhos imediatos · few-shot-base (mode) · few-shot-tenant.

**Regras críticas (`coleta/info/regras.js`):**

| ID | Regra |
|---|---|
| R1 | **NÃO fala valor. Nunca.** Se cliente insistir, resposta padrão que tatuador confirma pessoalmente + retorna ao checklist. |
| R2 | `calcular_orcamento` NÃO exposta na tool list deste modo. |
| R3 | **Supressão de valores da FAQ/contexto**: responde o factual, omite qualquer valor monetário. |
| R4 | **Cover-up**: handoff imediato. Gatilhos = menção (`cobrir`, `cover`, `tattoo antiga`, `tapar`, `disfarçar`) OU imagem de referência com tattoo existente na pele. Nunca pergunta ativamente. |
| R5 | **Cor vs P&C**: não pergunta. Infere da descrição + referências. Ambíguo → registra `estilo="a_definir"`. |
| R6 | **Primeira tattoo**: não pergunta. Se cliente mencionar, adapta tom. |
| R7 | **Data**: não pergunta. Agenda é com o tatuador neste modo. |

**Checklist de fluxo:**

```
OBRIGATÓRIOS (bloqueia handoff sem os 3):
  descricao_tattoo, tamanho_cm, local_corpo

OPCIONAIS (1 tentativa, não bloqueia):
  estilo, foto_local, refs_imagens

Persistência: tool dados_coletados(campo, valor)
```

**Estratégia de fallback pra tamanho:**
1. Cliente dá direto.
2. Agente oferece referências do corpo ("pulso-cotovelo ~25cm").
3. Agente pede altura + gesto de dedos.
4. Se 3 tentativas falharem: `acionar_handoff(motivo="cliente_sem_referencia_tamanho")`.

**Handoff por submode:**

- **Puro**: mensagem final com resumo dos campos coletados + *"Ele te retorna em breve com valor e pra marcar a sessão!"* → `acionar_handoff(motivo="coleta_completa")`.
- **Reentrada**: mesmo resumo + *"Ele vai te mandar o valor por aqui mesmo, e depois eu volto pra fechar o horário com você!"* → `acionar_handoff(motivo="coleta_completa_reentrada")`.

**Gatilhos de handoff imediato (antes de checklist):**

| Situação | Motivo |
|---|---|
| Cover-up (menção ou imagem) | `cover_up_detectado` |
| Menor de idade | `menor_idade` |
| Área restrita (pescoço, rosto, mãos, dedos, genital) | `area_restrita_{local}` |
| Retoque de tattoo antiga | `retoque` |
| Cliente agressivo | `cliente_agressivo` |
| Idioma não suportado | `idioma_nao_suportado` |
| Fora do escopo (produto médico etc.) | `fora_escopo` |
| 3x frustração em OBR | `cliente_evasivo_infos_incompletas` |

**Tools expostas:** `dados_coletados`, `acionar_handoff`. **NÃO expor:** `calcular_orcamento`, `consultar_agenda`, `gerar_pix`, `marcar_agendamento`.

---

### generatePromptColetaAgendamento(tenant, conversa, ctx)

**Objetivo**: após tatuador digitar trigger, agente reentra, declara valor (self-correction natural), marca horário, cobra sinal.

**Pré-condições:**
- `config_precificacao.modo === 'coleta'`
- `config_precificacao.coleta_submode === 'reentrada'`
- `conversa.estado_agente === 'agendamento'`

**Detecção do trigger** (lógica fora do prompt, no webhook Evolution):

```pseudo
function detectarTrigger(mensagem, triggerHandoff) {
  const msgNorm = normalizar(mensagem)       // lowercase, sem acentos
  const trigNorm = normalizar(triggerHandoff)
  const pattern = `${escapeRegex(trigNorm)}\\b[^\\d]{0,20}(\\d+(?:[.,]\\d+)?)`
  const match = msgNorm.match(new RegExp(pattern))
  if (!match) return null
  const valor = parseFloat(match[1].replace(',', '.'))
  if (valor < 10 || valor > 100000) return null
  return { valor }
}

// No webhook:
if (msgIsDoTatuador && tenant.modo === 'coleta' && tenant.coleta_submode === 'reentrada') {
  const trig = detectarTrigger(msg.body, tenant.trigger_handoff)
  if (trig) {
    conversa.estado_agente = 'agendamento'
    conversa.valor_fechado = trig.valor
    await salvarConversa(conversa)
    // dispara nova inferência do agente no próximo evento
  }
}
```

**Composição (ordem):** shared blocks (identidade, checklist-crítico, tom, contexto, faq) · regras (mode) · fluxo agendamento · fluxo sinal · gatilhos handoff · few-shot-base (mode) · few-shot-tenant.

**Regras críticas (`coleta/agendamento/regras.js`):**

| ID | Regra |
|---|---|
| R1 | **Primeira mensagem DECLARA o valor** (self-correction): *"Show! O {tatuador} fechou R$ {valor_fechado} contigo."* |
| R2 | **Source of truth é `conversa.valor_fechado`** (do trigger), NÃO valores mencionados antes. |
| R3 | **Não renegociar preço.** Cliente discorda → handoff. |
| R4 | **Sinal** = `valor_fechado * sinal_percentual / 100`, arredondado pra real cheio. |
| R5 | Cliente quer mudar design/local/tamanho → handoff (muda escopo, anula valor). |

**Fluxo de agendamento + sinal:**

```
1. Primeira msg: "Show! O {tatuador} fechou R$ {valor_fechado} contigo.
   Bora marcar teu horário — que dia e horário ficam bom pra ti?"
2. Cliente responde data/horário.
3. consultar_agenda(data, hora, duracao) → {disponivel, sugestoes?}
4a. Disponível: "Fechou, {data} às {hora}. Sinal de R$ {sinal}
    ({pct}% do valor). Mando o PIX?"
4b. Indisponível: oferece alternativas.
5. Cliente aceita sinal → gerar_pix(sinal)
   Envia: "Aqui o PIX: {copia_cola}. Assim que cair, confirmo a sessão."
6. Webhook MP confirma pagamento → marcar_agendamento(...)
   Envia: "Pagamento confirmado! Agendado pra {data} às {hora}. Valeu!"
   conversa.estado_agente = 'fechado'
```

**Tools expostas:** `consultar_agenda`, `gerar_pix`, `marcar_agendamento`, `acionar_handoff`. **NÃO expor:** `calcular_orcamento`, `dados_coletados`.

**Gatilhos de handoff:**

| Situação | Motivo |
|---|---|
| Cliente discorda do valor | `cliente_disputa_valor` |
| Cliente pede desconto | `cliente_pede_desconto` |
| Cliente quer mudar escopo | `cliente_quer_mudar_escopo` |
| Erro técnico (PIX falhou 2x, agenda quebrada) | `erro_tecnico` |

---

### Tools a verificar na implementação

| Tool | Status esperado |
|---|---|
| `acionar_handoff` | Provavelmente existe. Verificar assinatura aceita `motivo` livre. |
| `calcular_orcamento` | Existe. Excluir da tool list quando `modo=coleta`. |
| `dados_coletados` | **Verificar**. Se não existir, criar (persiste campos incrementalmente no `conversa.dados_coletados`). |
| `consultar_agenda` | **Verificar**. Pode depender de Google Calendar integration. |
| `gerar_pix` | Provavelmente existe (Faixa/Exato usa). |
| `marcar_agendamento` | Provavelmente existe. |

Tools faltantes viram dependências do Bloco 6.

---

## Ordem de implementação e escopo dos PRs

**Estratégia:** 4 PRs sequenciais, cada um reversível. Feature flag `ENABLE_COLETA_MODE` mantém modo Coleta invisível em prod até rollout final.

### PR 1 — Refactor-only (zero mudança de comportamento)

| Fase | Entrega |
|---|---|
| 1.1 | Migração SQL: `fewshots_por_modo`, `estado_agente` + índice parcial |
| 1.2 | Validações novas em `update-tenant.js` (aceitar `modo='coleta'`, `coleta_submode`, `trigger_handoff`, `fewshots_por_modo`) |
| 1.3 | Criar `functions/_lib/prompts/` com `_shared/`, `faixa/`, `exato/` — mover código atual |
| 1.4 | Dispatcher `prompts/index.js` — comportamento idêntico ao atual |
| 1.5 | Substituir imports em `prompt.js` e `simular-conversa.js` |
| 1.6 | **Testes Tier 1**: snapshots Faixa/Exato, contratos, invariantes, fixture canonico + contaminado, linter contaminação |
| 1.7 | Pre-commit hook (Husky) + CI rodando bateria completa |

**Critério de merge:** CI verde, 0 regressão em prod. **Tempo:** 1-2 dias.

### PR 2 — Modo Coleta backend (prompts + lógica)

| Fase | Entrega |
|---|---|
| 2.1 | Inventariar tools em `functions/api/tools/`. Criar faltantes: `dados_coletados` (nova), validar `consultar_agenda`/`gerar_pix`/`marcar_agendamento`/`acionar_handoff` |
| 2.2 | Criar `coleta/info/` (generate, fluxo, regras, few-shot, few-shot-tenant). Snapshot + contratos (`must_not_contain: ['R$', 'calcular_orcamento', ...]`) |
| 2.3 | Dispatcher: branch `modo='coleta'` + estado != agendamento → `generatePromptColetaInfo({ submode })` |
| 2.4 | Detector de trigger-phrase em `functions/api/webhooks/evo.js`: `detectarTrigger`, update de `estado_agente` + `valor_fechado` |
| 2.5 | Criar `coleta/agendamento/`. Snapshot + contratos |
| 2.6 | Dispatcher: branch `estado_agente='agendamento'` → `generatePromptColetaAgendamento` |
| 2.7 | Testes unitários: `detectarTrigger` (match, no-match, edge cases), transições de estado |
| 2.8 | Feature flag `ENABLE_COLETA_MODE`: se OFF, `modo='coleta'` rejeitado em `update-tenant.js` |

**Critério de merge:** CI verde. Flag OFF em prod = caminho novo nunca exercitado. **Tempo:** 3-4 dias.

### PR 3 — UI (Onboarding + Studio)

| Fase | Entrega |
|---|---|
| 3.1 | `onboarding.html`: `qa-modos-video` novo, `qa-intro` com 3º botão + 3º exemplo de conversa |
| 3.2 | `onboarding.html`: `qa-coleta-submode` com cards Puro/Reentrada + input trigger |
| 3.3 | `onboarding.html`: paginação dinâmica, routing condicional |
| 3.4 | `onboarding.html`: respeita feature flag (botão Coleta some se OFF) |
| 3.5 | `studio.html`: reorganizar tab "agente" em sub-seções |
| 3.6 | `studio.html`: seção **Modo & Precificação** (seletor + submode + trigger + overlay calculadora) |
| 3.7 | `studio.html`: seção **Exemplos (few-shots)** tabbed por modo |
| 3.8 | `studio.html`: FAQ com highlights de contaminação |
| 3.9 | `studio.html`: modal de confirmação ao trocar modo (copy dinâmico) |

**Critério de merge:** CI verde + visual review staging. Flag ainda OFF em prod. **Tempo:** 2-3 dias.

### PR 4 — Rollout (plano de ops, não de código)

| Fase | Ação |
|---|---|
| 4.1 | Deploy PR 3 em staging + `ENABLE_COLETA_MODE=true` em staging |
| 4.2 | **Dogfood**: conta de teste migra pra Coleta-Reentrada, roda ponta-a-ponta (coleta → handoff → valor → trigger → agendamento → sinal) |
| 4.3 | Gravar vídeo dos 3 modos, subir em Cloudflare Stream, preencher URL |
| 4.4 | Alerta crítico Tier 2 parcial: CF Observability detecta `modo=coleta + calcular_orcamento` |
| 4.5 | Flag ON pra subset (5 tatuadores beta convidados). Monitora 1 semana |
| 4.6 | GA: flag ON geral + comunicação no changelog/email |

### Tools a inventariar (Fase 2.1)

Antes de começar PR 2, checar `functions/api/tools/`:

| Tool | Ação se faltar |
|---|---|
| `acionar_handoff` | Verificar aceita `motivo` livre |
| `dados_coletados` | Criar — persiste em `conversa.dados_coletados.{campo}` |
| `consultar_agenda` | Criar se faltar (pode usar Google Calendar ou tabela local) |
| `gerar_pix` | Provável que exista |
| `marcar_agendamento` | Provável que exista |

Se faltarem 1-2 críticas, PR 2 vira 2a (tools) + 2b (prompts).

### Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Snapshots Faixa/Exato divergem sutilmente do atual | `npm test -- -u` gera baseline; revisor compara com gerador atual |
| Trigger pega falso positivo | Regex estrita (requer literal + número). Testes unitários. Monitorar staging |
| Tatuador esquece o trigger | Tutorial no onboarding ensina a criar **Resposta Rápida** no WhatsApp Business (configurar atalho `/agente` → auto-expande pra `Lina, assume`). Studio tem help card permanente com o mesmo tutorial. Tatuador digita `/agente 750` e WhatsApp expande antes do envio. |
| Contaminação escapa do linter | Fixture contaminado + regra R3 no prompt (defesa em profundidade) |
| Tool faltando trava PR 2 | Inventário em 2.1 antecipa; se faltar crítico, vira sub-PR |

### Entregável final (após PR 4)

- Tatuador escolhe entre 3 modos no onboarding (com vídeo explicativo).
- Coleta tem 2 sub-modos (Puro / Reentrada) configuráveis.
- Agente em Coleta-Info não fala valor, coleta os 3 OBR, faz handoff correto.
- Reentrada: trigger do tatuador reativa agente pra fechar agendamento + sinal.
- Studio edita modo/trigger/few-shots por modo, com confirmação ao trocar.
- Testes de higiene bloqueiam regressão em CI.
- Feature flag permite rollout gradual.

---

## Status do brainstorming

- [x] Bloco 1 — Arquitetura de prompts e dispatcher
- [x] Bloco 1.5 — Higiene & Observabilidade
- [x] Bloco 2 — Modelo de dados e migração Supabase
- [x] Bloco 3 — Onboarding
- [x] Bloco 4 — Studio (escopo do PR + roadmap de redesign)
- [x] Bloco 5 — Comportamento dos prompts Coleta
- [x] Bloco 6 — Ordem de implementação e escopo dos PRs

**Próximo passo:** self-review do spec → revisão tua → invocação do skill `writing-plans` em conversa nova pra gerar o plano executável passo-a-passo.

---

## Referências

- Código atual: `functions/_lib/generate-prompt.js` (556 linhas, monolítico)
- Onboarding atual: `onboarding.html` linhas 680-681 (seleção Faixa vs Exato)
- Config de tenant: `functions/api/update-tenant.js` linha 34 (`config_precificacao` JSONB)
- Memory hub: [[InkFlow — Mapa geral]], [[InkFlow — Pendências (backlog)]]
