# Modo Coleta v2 — Modo principal do InkFlow

**Data:** 2026-05-02
**Autor:** Leandro Marques (com Claude)
**Status:** Spec finalizado — pronto pra `/plan` e execução
**Supersede:** [`2026-04-22-modo-coleta-design.md`](./2026-04-22-modo-coleta-design.md) (design antigo, escrito quando Coleta era opcional e tinha 3 modos coexistindo)

---

## Contexto

Após análise estratégica (conselho LLM, 2026-05-02), a estrutura de modos do InkFlow muda radicalmente:

- **Modo Coleta vira o modo principal/default do SaaS.** Tatuador não confia em IA com dinheiro — IA coleta info, tatuador analisa, IA continua. Esse comportamento descreve o que a maioria dos tatuadores realmente quer.
- **Modo Faixa é eliminado por completo.** Não há tenants pagantes hoje, então sem migração — o código é deletado.
- **Modo Exato vira secundário em fase beta.** Mantido pra tatuadores com tabela rígida que confiam em fechar valor pelo bot.

Outras decisões do conselho que entram aqui:
- Tatuador **nunca** participa da conversa do cliente. Comunicação tatuador↔IA é canal paralelo.
- Canal único do tatuador na v1: **Telegram**. WhatsApp do tatuador como roadmap futuro (custo 10-20× maior pelo Evolution/CloudAPI).
- Fase de cadastro do cliente entra antes do handoff (nome completo + data nascimento + e-mail opcional).
- Vocabulário de objeção sem palavra "contraproposta" — IA fala em tom natural sobre o tatuador analisar.

---

## Modos após este PR

| Modo | Status | Default? | Bot fecha valor? | Tatuador participa do chat? |
|---|---|:---:|:---:|:---:|
| **Coleta** | Principal — produção | **✓ default** | Não. Tatuador analisa e devolve via Telegram, IA aplica. | Não. Canal paralelo (Telegram). |
| **Exato** | Beta — secundário | — | Sim, calculadora InkFlow. | Não. |
| ~~Faixa~~ | **Removido** | — | — | — |

---

## Fluxo do Modo Coleta (narrativa completa)

```
[CLIENTE]                                  [BOT]                                    [TATUADOR]
  │                                          │                                          │
  ├─"oi, queria orçar uma rosa"─────────────▶│                                          │
  │                                          │                                          │
  │                  ┌──── FASE 1: COLETA TATTOO ────┐                                  │
  │                                          │                                          │
  │  ◀── "show, conta mais. tamanho? local?"─┤                                          │
  ├─"10cm antebraço fineline"───────────────▶│                                          │
  │                                          │                                          │
  │                  ┌──── FASE 2: CADASTRO ────┐                                       │
  │                                          │                                          │
  │  ◀── "pra fechar o orçamento, preciso de uns dados rapidinho:                       │
  │       – Nome completo                    │                                          │
  │       – Data de nascimento               │                                          │
  │       – E-mail (opcional)" ──────────────┤                                          │
  ├─"Maria Silva, 12/03/1995"───────────────▶│                                          │
  │                                          │                                          │
  │                  ┌──── HANDOFF ────┐                                                │
  │                                          │                                          │
  │  ◀── "anotei tudo! vou passar pro tatuador avaliar.                                 │
  │       em breve te volto com o valor"─────┤                                          │
  │                                          │                                          │
  │                                          ├──── envia orçamento ─────────────────▶  │
  │                                          │   📋 Maria Silva (1995-03-12)            │
  │                                          │   Tattoo: rosa fineline 10cm antebraço   │
  │                                          │   [✅ Fechar valor]                      │
  │                                          │   [💰 Avaliar desconto]                  │
  │                                          │   [❌ Recusar]                           │
  │                                          │                                          │
  │                                          │                                          ├──"Fechar 750"
  │                                          │  ◀──── tatuador devolve trigger ────────┤
  │                                          │                                          │
  │                  ┌──── FASE 3: PROPOSTA ────┐                                       │
  │                                          │                                          │
  │  ◀── "show! pelo trabalho ficou em R$ 750. bora marcar?" ─┤                         │
  │                                          │                                          │
  │       ┌────── 3 caminhos do cliente ──────┐                                         │
  │       │                                                                             │
  ├──A "fechado, quero" ────────────────────▶│                                          │
  │                                          │                                          │
  │                  ┌──── AGENDAMENTO ────┐                                            │
  │                                          │                                          │
  │  ◀── "tenho ter 14h ou qui 10h, qual prefere?"─┤                                    │
  ├─"qui"───────────────────────────────────▶│                                          │
  │  ◀── "fechei qui 10h. envio o link de sinal" + URL ─┤                               │
  │                                          │                                          │
  │       OU                                                                            │
  │                                          │                                          │
  ├──B "consegue 600?" ─────────────────────▶│                                          │
  │  ◀── "vou levar pro tatuador analisar essa proposta. ele te volta rapidinho"───┤    │
  │                                          ├──── envia objeção ──────────────────▶   │
  │                                          │   🧾 Maria pediu R$ 600 (era R$ 750)    │
  │                                          │   [✅ Aceitar 600] [❌ Manter 750]       │
  │                                          │                                          │
  │                                          │                                          ├──"Aceitar 600"
  │                                          │  ◀──── tatuador decide ─────────────────┤
  │  ◀── "show! ele topou em R$ 600. bora marcar?" ─┤                                  │
  │       (continua agendamento)                                                       │
  │                                          │                                          │
  │       OU                                                                            │
  │                                          │                                          │
  ├──C "deixa eu pensar" ───────────────────▶│                                          │
  │  ◀── "tranquilo! qualquer coisa é só me chamar"─┤                                  │
  │       [estado: lead_frio — follow-up no roadmap futuro]                            │
```

---

## Estados da conversa

Campo `conversas.estado_agente` (existe — usado no MVP):

| Estado | Significado | Bot responde? |
|---|---|---|
| `coletando_tattoo` | Fase 1 — pedindo descrição/tamanho/local | Sim |
| `coletando_cadastro` | Fase 2 — pedindo nome/data nasc/email | Sim |
| `aguardando_tatuador` | Handoff feito — esperando tatuador analisar no Telegram | **Não** (timeout/follow-up futuro) |
| `propondo_valor` | Tatuador devolveu valor — bot apresentou pro cliente, esperando reação | Sim |
| `aguardando_decisao_desconto` | Cliente pediu desconto — esperando tatuador decidir | **Não** |
| `escolhendo_horario` | Cliente aceitou valor — coletando data/horário | Sim |
| `aguardando_sinal` | Link de sinal enviado — esperando pagamento MP | Sim (handlers MP) |
| `lead_frio` | Cliente disse "vou ver e te volto" e sumiu | **Não** (follow-up futuro) |
| `fechado` | Sessão agendada e sinal pago | — |

**Modo Exato ignora a maioria desses estados** (continua linear como hoje).

---

## Canal Telegram do tatuador (novo)

### Fluxo de conexão (no onboarding)

1. Tatuador completa onboarding até step "Conectar tatuador no Telegram".
2. UI mostra QR code com `https://t.me/<INKFLOW_BOT_USERNAME>?start=<onboarding_key>`.
3. Tatuador scaneia ou clica → abre Telegram → bot manda "/start" automaticamente com payload `<onboarding_key>`.
4. Backend pega o `chat_id` do tatuador via webhook do Telegram, valida pela `onboarding_key`, salva em `tenants.tatuador_telegram_chat_id`.
5. Bot Telegram responde: "✅ Conectado! Você vai receber orçamentos do InkFlow aqui."
6. UI do onboarding faz polling em `/api/check-telegram-connected?onboarding_key=...` e avança quando confirmar.

### Mensagem de orçamento pro tatuador

Quando coleta+cadastro completos, bot envia ao `tatuador_telegram_chat_id`:

```
📋 Novo orçamento

👤 Maria Silva (29 anos)
📧 maria@email.com
🆔 inkflow_orcid: orc_abc123

🎨 Tattoo
   • rosa fineline
   • 10cm
   • antebraço esquerdo
   • estilo: fineline (deduzido)

📸 Fotos: 1 do local, 0 referências

[✅ Fechar valor]  [❌ Recusar]
```

Inline keyboard 2 botões. "Fechar valor" abre prompt "Qual valor? (ex: 750)" → tatuador digita → bot capture.
"Recusar" abre prompt opcional "Motivo? (opcional)" → bot informa cliente "infelizmente não vai dar pra fazer essa peça".

### Mensagem de objeção pro tatuador

Quando cliente pede desconto:

```
🧾 Cliente pediu desconto

👤 Maria Silva — orc_abc123
💰 Valor original: R$ 750
🙏 Cliente pediu: R$ 600

[✅ Aceitar 600]  [❌ Manter 750]
```

"Aceitar X" → bot informa cliente novo valor.
"Manter X" → bot informa cliente que tatuador segue no valor original.

### Eventos n8n

- **Outbound:** novo workflow n8n `INKFLOW — Telegram tatuador` ou tool nativa `enviar_orcamento_tatuador` chamada pelo agente.
- **Inbound:** webhook Telegram → workflow n8n parsea mensagem → atualiza `conversas.estado_agente` + `conversas.dados_coletados.proposta_tatuador` → dispara reentrada do agente no chat do cliente.

---

## Schema (mudanças)

### `tenants` — colunas novas

```sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tatuador_telegram_chat_id TEXT;
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tatuador_telegram_username TEXT;  -- nice-to-have pra logs
```

`config_precificacao` (JSONB) ganha:
- `modo`: `'coleta'` (default novo) | `'exato'`
- Valores `'faixa'` ficam **rejeitados** pela validação de update-tenant.

`config_precificacao.coleta_submode` foi descontinuado — sem `puro` vs `reentrada`. **Reentrada é o único modo de Coleta.** Tatuador devolvendo valor é parte essencial; sem isso o bot não fecha. Quem quer "Puro" usa Exato com valores zero ou desliga o bot.

### `conversas` — colunas novas

```sql
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS valor_proposto NUMERIC(10,2);  -- valor que o tatuador devolveu
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS valor_pedido_cliente NUMERIC(10,2);  -- desconto que cliente pediu
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS orcid TEXT UNIQUE;  -- identificador curto pro tatuador
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS dados_cadastro JSONB;  -- {nome, data_nascimento, email}
```

`estado_agente` (TEXT, já existe pelo PR1) ganha valores novos: `coletando_tattoo`, `coletando_cadastro`, `aguardando_tatuador`, `propondo_valor`, `aguardando_decisao_desconto`, `escolhendo_horario`, `aguardando_sinal`, `lead_frio`, `fechado`.

### Limpeza Faixa

- DROP de qualquer coluna/JSONB key específica de Faixa (`tabela_faixas`, `multiplicadores_faixa`, etc — verificar no `update-tenant.js`).
- Tabela `tenants.fewshots_por_modo` perde a chave `faixa`.

---

## Arquitetura de arquivos

### Deletar

```
functions/_lib/prompts/faixa/                       ← inteira
tests/prompts/snapshots/faixa-*.txt
tests/prompts/contracts/faixa.js                    ← se existir
tests/prompts/fixtures/tenant-canonico-faixa.js     ← renomear/limpar
```

### Criar

```
functions/_lib/prompts/coleta/
├── tattoo/
│   ├── generate.js
│   ├── fluxo.js                ← §3 fase 1: coleta tattoo
│   ├── regras.js               ← §4 R1-R7 (não fala valor, etc)
│   ├── few-shot.js
│   └── few-shot-tenant.js
├── cadastro/
│   ├── generate.js
│   ├── fluxo.js                ← §3 fase 2: pede nome/data/email
│   ├── regras.js               ← §4 (data nasc valida menor de idade, email opcional)
│   ├── few-shot.js
│   └── few-shot-tenant.js
└── proposta/
    ├── generate.js
    ├── fluxo.js                ← §3 fase 3: apresenta valor + agendamento
    ├── regras.js               ← §4 (objeção sem contraproposta)
    ├── few-shot.js
    └── few-shot-tenant.js

functions/api/tools/
├── dados-coletados.js                ← grava estado em conversas.dados_coletados
├── enviar-orcamento-tatuador.js      ← envia mensagem Telegram tatuador
├── enviar-objecao-tatuador.js        ← envia objeção Telegram
└── consultar-proposta-tatuador.js    ← lê conversas.valor_proposto pro agente

functions/api/telegram/
├── webhook.js                        ← Telegram bot webhook
└── connect.js                        ← endpoint usado pelo onboarding (start payload)

migrations/
└── 2026-05-02-modo-coleta-v2.sql

tests/prompts/
├── fixtures/tenant-coleta.js
├── snapshots/coleta-tattoo.txt
├── snapshots/coleta-cadastro.txt
├── snapshots/coleta-proposta.txt
├── contracts/coleta-tattoo.js
├── contracts/coleta-cadastro.js
└── contracts/coleta-proposta.js

tests/
├── tools/dados-coletados.test.mjs
├── tools/enviar-orcamento-tatuador.test.mjs
├── tools/enviar-objecao-tatuador.test.mjs
└── telegram/webhook.test.mjs
```

### Modificar

```
functions/_lib/prompts/index.js          ← dispatcher: case 'coleta' por estado_agente
functions/api/tools/prompt.js            ← carrega estado_agente da conversa
functions/api/update-tenant.js           ← MODOS_VALIDOS = ['coleta', 'exato']; default 'coleta'
onboarding.html                          ← step Telegram, default Coleta
studio.html                              ← config_precificacao só com Coleta+Exato
docs/canonical/stack.md                  ← remover Faixa, adicionar Telegram canal
docs/canonical/flows.md                  ← novo fluxo Coleta v2
docs/canonical/ids.md                    ← endpoints novos /api/telegram/*
docs/canonical/index.md                  ← apontar pros docs atualizados
```

---

## Dispatcher

```javascript
// functions/_lib/prompts/index.js
import { generatePromptColetaTattoo } from './coleta/tattoo/generate.js';
import { generatePromptColetaCadastro } from './coleta/cadastro/generate.js';
import { generatePromptColetaProposta } from './coleta/proposta/generate.js';
import { generatePromptExato } from './exato/generate.js';

export function generateSystemPrompt(tenant, conversa, clientContext) {
  const modo = tenant?.config_precificacao?.modo || 'coleta';  // default novo
  const estado = conversa?.estado_agente || 'coletando_tattoo';

  if (modo === 'exato') {
    return generatePromptExato(tenant, conversa, clientContext);
  }

  // modo === 'coleta'
  switch (estado) {
    case 'coletando_cadastro':
      return generatePromptColetaCadastro(tenant, conversa, clientContext);
    case 'propondo_valor':
    case 'aguardando_decisao_desconto':
    case 'escolhendo_horario':
    case 'aguardando_sinal':
      return generatePromptColetaProposta(tenant, conversa, clientContext);
    case 'aguardando_tatuador':
    case 'lead_frio':
    case 'fechado':
      return null;  // bot não responde nesses estados
    case 'coletando_tattoo':
    default:
      return generatePromptColetaTattoo(tenant, conversa, clientContext);
  }
}
```

---

## Vocabulário de objeção (sem contraproposta)

Quando cliente pede desconto, IA responde **uma vez**, em variação natural:

> "Vou levar pra ele analisar essa proposta — quem fecha o valor é o tatuador. Em breve te dou um retorno."

Variações aceitáveis (few-shot rotaciona):
- "Anotado! Primeiro preciso passar pro tatuador avaliar e te retorno com a resposta"
- "Deixa eu falar com ele e já te respondo."
- "Sobre desconto quem decide é o tatuador. Vou consultar com ele e assim que ele mandar te retorno.s"

**Proibido:**
- "Posso te oferecer X" / "fica X pra você" (sem aval do tatuador)
- "Contraproposta" / "contra-oferta"
- Negociar valor sem ter o trigger de retorno do tatuador

---

## Onboarding — fluxo novo

### Sequência de steps (modo Coleta — default)

```
qa-video                 ← existente
qa-intro                 ← simplificado: 1 modo principal (Coleta) + link "modo avançado: Exato (beta)"
qa-tatuador-telegram     ← NOVO: conecta Telegram do tatuador
qa-handoff-triggers      ← NOVO: configura gatilhos de handoff (lista padrão + custom)
qa-cadastro-cliente      ← NOVO: confirma quais dados pedir do cliente (default: nome, data nasc, email opcional)
qa-test                  ← existente
```

Se tatuador clicar "modo avançado: Exato (beta)":
- Marca como beta visualmente (badge "BETA")
- Adiciona steps de tabela de preços (existentes)
- Pula `qa-cadastro-cliente` (não usado no Exato)

### `qa-tatuador-telegram` (novo)

Layout:
- Título: *"Conecta seu Telegram pra receber os orçamentos"*
- Texto: *"O InkFlow vai te mandar os pedidos no Telegram. Você analisa, fecha o valor, e o bot continua a conversa com o cliente automaticamente."*
- QR code grande + link clicável `https://t.me/inkflow_bot?start=<onboarding_key>`
- Loading spinner: *"Aguardando conexão..."* → vira *"✅ Conectado!"* quando webhook confirmar
- Botão "Continuar" só ativa quando conectado

### `qa-handoff-triggers` (novo)

Layout:
- Lista de gatilhos default (cada um checkbox marcado, editáveis):
  - ☑ Cliente quer cobertura (cover-up)
  - ☑ Menor de idade
  - ☑ Tatuagem em rosto/pescoço/mãos
  - ☑ Retoque de tatuagem antiga
  - ☑ Cliente agressivo
  - ☑ Idioma diferente
- Campo "+ adicionar gatilho custom"
- Salva em `tenants.gatilhos_handoff` (já existe).

---

## Studio — mudanças

### Tab "Agente"

- Bloco "Modo de precificação" mostra:
  - **Coleta** (selecionado, badge "Recomendado")
  - **Exato** (badge "Beta")
  - Faixa **removido** da UI
- Se modo for Coleta, esconder campos de tabela de preços.
- Se modo for Exato, esconder bloco "Triggers handoff" da Coleta? **Não** — handoff continua relevante no Exato.

### Tab "Telegram tatuador" (nova)

- Mostra status da conexão (conectado/desconectado)
- Botão "Reconectar Telegram" (gera novo QR)
- Botão "Trocar telefone do Telegram" (idem)
- Histórico das últimas 10 mensagens enviadas pro tatuador (debug)

---

## Higiene & Observabilidade

### Tier 1 (build agora)

1. **Snapshot tests** dos 3 prompts Coleta + 1 Exato (4 snapshots).
2. **Contratos por modo:**
   - `coleta-tattoo`: must_contain `dados_coletados`, `tamanho`, `local`, `descrição`; must_not_contain `R$`, `calcular_orcamento`, `nome completo`, `data de nascimento` (esses só na fase cadastro).
   - `coleta-cadastro`: must_contain `nome completo`, `data de nascimento`, `email`; must_not_contain `R$`.
   - `coleta-proposta`: must_contain `valor_proposto`, `consultar_horarios`, `gerar_link_sinal`; must_not_contain `calcular_orcamento`.
   - `exato`: existente, sem mudança.
3. **Linter de contaminação:** fixture com FAQ suja roda nos 3 prompts Coleta — assertion que valor monetário nunca aparece em Coleta-tattoo nem Coleta-cadastro.
4. **Invariantes cross-mode:** todos contêm identidade/checklist/contexto, nenhum vaza meta-instruções.

### Tier 2 (perto do lançamento)

1. **Logs estruturados** Cloudflare Workers Logs:
   ```json
   { tenant_id, modo, estado_agente, prompt_version, tools_called, tokens, telegram_msg_id, orcid }
   ```
2. **Alertas:**
   - **Crítico:** Coleta chamou `calcular_orcamento` (não devia existir nesse modo).
   - **Crítico:** Tatuador não respondeu Telegram em 24h pra orçamento ativo.
   - **Warning:** Taxa de `lead_frio` > 40% por tenant — sinal de proposta cara/lenta.
3. **Dashboard mínimo** em `admin.html`:
   - Orçamentos por status (aguardando_tatuador / propondo_valor / fechado / lead_frio)
   - Tempo médio tatuador responder
   - Taxa de conversão por estado

### Tier 3 (volume)

- Eval suite com LLM-juíz simulando objeções variadas
- A/B test do tom da mensagem de cadastro (impacto na taxa de drop)
- Auto-revisão mensal de prompts via cron

---

## Tools novas

### `dados_coletados`

Mesmo do plano antigo. Persiste campos coletados em `conversas.dados_coletados` (JSONB).

```typescript
type DadosColetadosInput = {
  conversa_id: string;
  campo: 'descricao_tattoo' | 'tamanho_cm' | 'local_corpo' | 'estilo' | 'foto_local' | 'refs_imagens' | 'nome' | 'data_nascimento' | 'email';
  valor: string | number;
};
```

### `enviar_orcamento_tatuador`

Envia mensagem formatada pro Telegram do tatuador. Retorna `orcid` único.

```typescript
type EnviarOrcamentoInput = {
  conversa_id: string;
  // resto puxado de dados_coletados + dados_cadastro
};
type EnviarOrcamentoOutput = {
  orcid: string;
  telegram_message_id: number;
  enviado_em: string;  // ISO
};
```

### `enviar_objecao_tatuador`

Quando cliente pede desconto, dispara mensagem de objeção pro Telegram do tatuador.

```typescript
type EnviarObjecaoInput = {
  conversa_id: string;
  valor_pedido_cliente: number;
};
```

### `consultar_proposta_tatuador`

Lê estado atual da conversa pra saber se tatuador já respondeu. Usado pelo agente em estados de espera.

```typescript
type ConsultarPropostaInput = { conversa_id: string };
type ConsultarPropostaOutput = {
  valor_proposto: number | null;
  decisao_desconto: 'aceito' | 'recusado' | null;
  recusou_pedido: boolean;
  mensagem_tatuador: string | null;
};
```

---

## Webhook Telegram

Endpoint `/api/telegram/webhook` recebe updates do Telegram bot. Fluxo:

1. Valida `X-Telegram-Bot-Api-Secret-Token` (env var).
2. Extrai `chat_id` + `message`.
3. Se mensagem é `/start <onboarding_key>`: lookup em `onboarding_links`, salva `chat_id` em `tenants.tatuador_telegram_chat_id`.
4. Se mensagem é callback de inline keyboard (`Fechar valor` / `Aceitar X` / etc):
   - Lookup orçamento por `orcid` no callback_data
   - Atualiza `conversas.valor_proposto` ou `conversas.estado_agente`
   - Dispara workflow n8n pra reentrar bot na conversa do cliente
5. Se mensagem é texto livre depois de "Fechar valor" (passo 2 do flow): parseia número, completa o orçamento.

---

## Out of scope (futuro)

Itens deliberadamente não implementados nesta v2:

- **Follow-up frio:** `lead_frio` é apenas estado terminal por enquanto. Cron de follow-up (24h depois mandando "ainda quer aquela tattoo?") fica pra v3.
- **WhatsApp tatuador:** B1 via WA pessoal do tatuador — roadmap, depende de demanda + custo Evolution/CloudAPI.
- **Modo Exato com cadastro:** v2 mantém Exato sem fase cadastro. Se virar dor, adiciona depois.
- **Aprovação assíncrona com timeout automático:** se tatuador não responder em 24h, o bot mantém estado mas não auto-cancela. Cron + alerta = v3.
- **Multi-tatuador por estúdio:** v2 assume 1 tatuador = 1 tenant = 1 chat_id Telegram. Múltiplos tatuadores no mesmo estúdio é roadmap distante.

---

## Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Tatuador não tem Telegram | Onboarding força conexão; sem isso modo Coleta não ativa. Quem não quer usa Exato. |
| Tatuador não responde no Telegram | Estado `aguardando_tatuador` permanente; cliente fica esperando. **Mitigação v2:** painel admin mostra orçamentos abertos; tatuador vê. **Mitigação v3:** alerta automático em 24h + follow-up cliente. |
| Cliente desiste durante coleta | Estado `lead_frio` capturado. Follow-up frio fica pra v3. |
| Cliente engana data nasc (declara maior sendo menor) | Limite legal — checagem real é alçada do tatuador no atendimento. Bot não tem como provar idade. Documentar como risco aceito. |
| Telegram bot ban (Telegram baniu o bot por flood/spam) | Volume baixo; risco baixo. Monitorar via dashboard. |
| Tatuador troca de número Telegram | Studio tem botão "Reconectar Telegram" → gera novo QR. |
| FAQ legacy menciona "faixa" ou valores | Linter de contaminação suprime. Tatuador vê warning no Studio. |

---

## Critérios de aceitação

PR fecha quando:

- [ ] Modo Coleta default funciona ponta-a-ponta em fluxo simulado (cliente → coleta → cadastro → handoff Telegram → tatuador responde → bot continua → agendamento → sinal)
- [ ] Modo Exato (beta) continua funcionando como hoje
- [ ] Modo Faixa não existe mais (código deletado, validação rejeita)
- [ ] Onboarding default cria tenant com `modo='coleta'` e exige conexão Telegram
- [ ] Tier 1 de testes verde (snapshots + contracts + invariants + contamination)
- [ ] Dashboard admin mostra estado dos orçamentos
- [ ] `docs/canonical/{stack,flows,ids}.md` atualizados
- [ ] Smoke E2E manual: 1 conversa completa em Coleta + 1 em Exato

---

## Próximos passos

1. **Plano detalhado de implementação** em `docs/superpowers/plans/2026-05-02-modo-coleta-v2-principal.md` (geração via skill `writing-plans` ou execução direta)
2. **Aprovação do Leandro** no spec
3. **Execução task-by-task** seguindo o plano
