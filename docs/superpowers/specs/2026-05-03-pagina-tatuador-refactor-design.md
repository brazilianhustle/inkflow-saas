# Página do Tatuador — Refatoração estrutural (Modo Coleta principal)

**Data:** 2026-05-03
**Autor:** Leandro Marques (com Claude)
**Status:** Spec finalizado — pronto pra `/plan` e execução
**Depende de:** [`2026-05-02-modo-coleta-v2-principal.md`](./2026-05-02-modo-coleta-v2-principal.md) (Coleta v2 backend) — esta spec é a UI sobre essa fundação

---

## Contexto

Modo Coleta virou modo principal do InkFlow em 02/05/2026 (spec v2). A página do tatuador (`studio.html`) ainda reflete a arquitetura anterior:

- 4 abas (Dashboard, Agente, Conversas placeholder, Agendamentos placeholder)
- Painel "Agente & Preços" como monolito (identidade + estilo + escopo + handoff + agenda + preços + portfólio + FAQ + Telegram)
- "Artistas do estúdio" como feature primária (slots, convidar, gestão)
- Sem integração de agenda real, sem painel próprio de portfólio, sem settings administrativo, sem canal de feedback

Esta refatoração reorganiza a página em **8 painéis temáticos** (9 no Modo Exato) com responsabilidades isoladas, conecta o onboarding ao painel via modelo "formulário-vira-página", e elimina "Artistas do estúdio" do SaaS por completo.

---

## Princípios de design

1. **Híbrido onboarding ↔ painel:** dados de identidade administrativa (nome estúdio, endereço, conta, plano, billing) editáveis em **Settings**. Dados de comportamento do bot (persona, tom, gatilhos, FAQ, escopo, agenda, portfólio) editáveis nos painéis temáticos.
2. **Linguagem leiga em toda UI:** sem jargão técnico ("tag", "metadata", "JSON", "endpoint"). Tatuador é solo founder, não dev.
3. **Toggles em vez de checkboxes:** todo `<input type=checkbox>` da página vira toggle pill (ON/OFF visual). Padrão consistente em todo o site.
4. **Visibilidade discreta de status críticos:** WhatsApp e Telegram conectados/desconectados aparecem como bolinhas no header (não slots ocupando espaço prime).
5. **Cancelamento financeiro à prova de bugs:** qualquer fluxo que pare cobrança chama API do Mercado Pago **antes** de marcar mudança no DB. Falha externa = aborta.
6. **Eliminação de "Artistas do estúdio":** a feature sai por completo do SaaS — schema, prompts, planos, UI. Cada plano = 1 número de WhatsApp, varia em conversas/mês e features incluídas.

---

## Sidebar — 9 painéis (8 Coleta + 1 Exato extra)

| # | Painel | Disponibilidade | Origem do conteúdo |
|---|---|---|---|
| 1 | 🏠 **Dashboard** | Coleta + Exato | Reformulado |
| 2 | 🤖 **Agente** | Coleta + Exato | Refatorado (sem agenda, sem portfólio) |
| 3 | 💬 **Conversas** | Coleta + Exato | Novo (era placeholder) |
| 4 | 📅 **Agenda** | Coleta + Exato | Novo (era placeholder) |
| 5 | 🎨 **Portfólio** | Coleta + Exato | **NEW** (era textarea no Agente) |
| 6 | 💡 **Ideias & Sugestões** | Coleta + Exato | **NEW** |
| 7 | ❔ **Suporte e dúvidas** | Coleta + Exato | Promovido a painel próprio (era botão na bottom) |
| 8 | ⚙️ **Settings** | Coleta + Exato | **NEW** |
| 9 | 🧮 **Calculadora InkFlow** | **Só Exato** | Refatoração futura — placeholder nesta v1 |

**Comportamento da sidebar:**
- Desktop: lateral esquerda 60px, ícones com tooltip que expande no `:hover` revelando título.
- Mobile: bottom tab bar fixa (já existe, mantém estrutura). Painéis 7 e 8 acessíveis via overflow `…` se faltar espaço.
- Modo Exato adiciona o painel 9 como última posição (acima ou abaixo de Settings — confirmar no protótipo).

---

## Painel 1 — Dashboard

### KPIs (5 cards, ordem fixa)

| # | KPI | Cálculo | Fonte |
|---|---|---|---|
| 1 | Conversas hoje | `count(conversas WHERE last_msg_at >= today_start AND tenant_id = X)` | DB |
| 2 | Orçamentos esta semana | `count(orcamentos WHERE created_at >= week_start AND tenant_id = X)` | DB |
| 3 | **Aguardando sinal** (NEW) | `count(conversas WHERE estado_agente='aguardando_sinal' AND tenant_id = X)` | DB |
| 4 | Taxa de conversão | `count(orcamentos.status='fechado' / count(orcamentos)) * 100` últimos 30d | DB |
| 5 | Sinal recebido (R$) | `sum(orcamentos.valor_sinal_pago WHERE pago_em >= week_start)` | DB |

### Slot — Atividade recente

Lista das **últimas 3 conversas** (`ORDER BY last_msg_at DESC LIMIT 3`), mostrando:
- Avatar com inicial do cliente
- Nome (ou número formatado se sem nome)
- Última mensagem (preview 50 chars)
- Badge do estado_agente colorido
- Timestamp relativo ("há 12 min")

Click → navega pra Conversas → abre thread daquela conversa.

### Slot — Resumo semanal IA (NEW)

**Geração:**
- Cron Cloudflare Worker, segunda-feira 9h BRT.
- Prompt LLM (gpt-4o-mini ou claude-haiku-4-5) recebe métricas da semana anterior + métricas de comparação da semana retrasada.
- Output: 1 parágrafo (máx 600 chars) em pt-BR casual.
- Salva em `tenants.resumo_semanal_atual` (JSONB: `{texto, gerado_em, periodo_inicio, periodo_fim}`).

**Escopo do conteúdo (escopo ii — métricas + insight comparativo, sem sugestão acionável):**
- Quantidade de conversas, orçamentos enviados, orçamentos fechados, sinal recebido.
- Comparação vs semana anterior ("3 conversas, 50% a mais que semana passada").
- **NÃO inclui sugestão acionável** (decisão de design — relatório observacional, não diretivo; tatuador tira conclusão sozinho).
- Tom positivo e compreensível mesmo em semana ruim ("foi semana mais quieta — boas pra preparar próximos trabalhos").

**Botão "Atualizar resumo":**
- Rate-limit 1x/dia por tenant, validado por `tenants.resumo_semanal_ultima_geracao_manual`.
- Click chama endpoint POST que regenera o resumo on-demand e atualiza o slot.
- Botão desabilitado com tooltip "Já atualizado hoje, volta amanhã" se rate-limit atingido.

**Custo estimado:** ~$0.0006/chamada com gpt-4o-mini (2k input + 500 output). 100 tenants × 1 chamada/dia = ~$1.80/mês total. Irrelevante.

### Slot — Conectar Telegram (Coleta v2)

- Visível **apenas quando** `tenants.tatuador_telegram_chat_id IS NULL`.
- Card grande chamativo: "Conecte seu Telegram pra receber orçamentos" + QR code apontando pra `https://t.me/<INKFLOW_BOT_USERNAME>?start=<onboarding_key>`.
- Polling em `/api/check-telegram-connected?tenant_id=X` a cada 3s.
- Quando conecta → slot some do Dashboard (libera espaço); status passa pro header.

### Slot — Info do estúdio (último)

Mostra:
- Nome do estúdio
- Plano atual (badge)
- Responsável (nome do tatuador)
- WhatsApp conectado (número/instance)

Read-only. Click → navega pra Settings → Estúdio.

### Header (top da página, sticky)

- Nome do estúdio (já existe)
- Badge do plano (já existe)
- **2 indicadores discretos lado-a-lado:**
  - 🟢 WhatsApp · status `online | offline | pending`
  - 🟢 Telegram · status `connected | disconnected | unknown` (Coleta v2 only — esconde no Modo Exato)
- Cor verde se OK, amarelo se desconhecido, vermelho se desconectado.
- Click no indicador → atalho pra Settings → Notificações (Telegram) ou Settings → Integrações (WhatsApp).

---

## Painel 2 — Agente

Refatorado em **6 grupos** (era 7). Removidos: "Agenda e preços" (vai pra Agenda), "Portfólio" (vai pra Portfólio).

### Grupo 1 — Identidade do agente

| Campo | Tipo | Default | Origem |
|---|---|---|---|
| Nome do agente | input | — | Onboarding `nome_agente` |
| Tom de voz | select (5 opções) | `amigavel` | Onboarding `config_agente.tom` |
| Usar nome como prefixo na 1ª msg | **toggle** | OFF | Onboarding `config_agente.usa_identificador` |
| Personalidade (descrição livre) | textarea (3 linhas) | — | Onboarding `config_agente.persona_livre` — **última posição do grupo** |

### Grupo 2 — Estilo das mensagens

| Campo | Tipo | Default | Mudanças vs hoje |
|---|---|---|---|
| Uso de emojis | select (**só 2 opções**: `Moderado` · `Nenhum`) | `Moderado` | Removidas opções `raro` e `muitos` |
| Emoji favorito | input (1 emoji) | (vem do onboarding) | **NOVO campo editável aqui** — input com seletor de emoji |
| Expressões proibidas | textarea (uma por linha) | (presets já bloqueados) | Mantém |
| Saudações variadas | textarea | — | Mantém |
| Confirmações variadas | textarea | — | Mantém |
| Encerramentos variados | textarea | — | Mantém |

**REMOVIDO:** "Usa gírias brasileiras" (toggle) — sai completamente. Schema: `tenants.config_agente.usa_giria` deletado.

### Grupo 3 — Escopo do estúdio

Mantém igual ao atual:
- Estilos em que o estúdio é especializado (textarea)
- Estilos que NÃO faz (textarea)
- Aceita cobertura (cover up) — vira **toggle**

### Grupo 4 — Casos que o agente passa pra você

(Era "Gatilhos de handoff" — renomeado pra leigo.)

Campo único: textarea "Palavras/situações que fazem o bot chamar você". Chips de sugestão mantidos (cobertura, retoque, rosto, mão, pescoço, menor de idade, cicatriz, gestante).

### Grupo 5 — Controle manual (NEW)

| Campo | Tipo | Default | Função |
|---|---|---|---|
| Frase pra eu assumir | input | `/eu assumo` | Tatuador digita essa frase no WhatsApp do cliente → bot pausa naquela conversa |
| Frase pra devolver pro bot | input | `/bot volta` | Tatuador digita → bot retoma e manda mensagem configurável |
| Mensagem ao retomar | input | `Voltei! Alguma dúvida sobre o orçamento?` | Bot manda essa msg ao cliente quando retoma |
| Bot retoma sozinho após | select (2h, 6h, 12h, 24h, nunca) | `6h` | Auto-retomar se cliente ficar sem resposta tempo X |

**Backend behavior:**
- Webhook Evolution detecta `fromMe: true` (msg do tatuador no WhatsApp do cliente).
- Se mensagem == `frase_assumir` → atualiza `conversas.estado_agente = 'pausada_tatuador'`.
- Se mensagem == `frase_devolver` → atualiza `conversas.estado_agente` pro estado anterior + bot manda `mensagem_ao_retomar` ao cliente.
- Cron a cada 30min checa conversas pausadas há > `auto_retomar_horas` sem msg do cliente → retoma automaticamente.
- Mensagens `fromMe` que **não** sejam frase_assumir/devolver passam normal (não pausam, não retomam).

### Grupo 6 — FAQ do estúdio

- Campo: adicionar nova FAQ (textarea P:/R: ou 2 inputs separados).
- **Botão "Meus FAQs"** (NEW) — abre modal listando todos os FAQs já configurados, com botão editar/deletar em cada um. Persistência: `tenants.faq_texto` continua sendo a string completa, mas modal serializa/desserializa em pares P:/R: pra UX.

---

## Painel 3 — Conversas

### Estrutura — 3 grupos navegáveis

Tabs ou collapsibles no topo (decidir no protótipo):

| Grupo | Estados que caem aqui | Lógica |
|---|---|---|
| **Conversas de hoje** | `coletando_tattoo`, `coletando_cadastro`, `escolhendo_horario`, `aguardando_sinal` | + filtro `last_msg_at >= today 00:00 BRT` |
| **Aguardando orçamento** | `aguardando_tatuador`, `aguardando_decisao_desconto` | Bot pausado esperando tatuador decidir no Telegram |
| **Em negociação** | `propondo_valor`, `lead_frio`, `pausada_tatuador` | Cliente já recebeu proposta; conversas vivas |

Conversas em estado `fechado` mostradas em sub-tab "Histórico" no fim.

### Layout — thread completa estilo WhatsApp Web

- Lista lateral esquerda (300px): cards com avatar, nome, última msg preview (50 chars), timestamp relativo, badge do estado.
- Painel direito: thread de mensagens completa scrollable.
  - Mensagens do cliente alinhadas à esquerda.
  - Mensagens do bot alinhadas à direita com avatar do agente.
  - Mensagens do tatuador (kill-switch ativo) alinhadas à direita com fundo diferente + ícone "🔇".
- Header da thread: nome do cliente + estado_agente badge + ações.

### Ações na conversa

- **Se `estado_agente='pausada_tatuador'`:** botão "Devolver pro bot" no header. Click → atualiza estado + envia `mensagem_ao_retomar` ao cliente.
- **Se conversa qualquer:** botão "Assumir conversa" → atualiza estado pra `pausada_tatuador` (mesmo efeito da frase mágica). Bot manda no chat: "Tatuador assumiu, ele te responde em breve."
- Click numa mensagem específica → copy text (helper).

### Performance

- Lista paginada (carrega 30 conversas inicial, "carregar mais" no scroll).
- Thread paginada por `created_at DESC` (carrega últimas 50 msgs, "carregar mais antigas" no topo).
- Real-time via Supabase Realtime subscription (`conversas`, `mensagens`) — atualiza UI quando msg nova chega.

---

## Painel 4 — Agenda

### Integração — Google Calendar OAuth (única v1)

**Decisão:** Cal.com e fallback "agenda interna InkFlow" descartados pra v1. Justificativa documentada em `docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md` §2 Painel 4.

**Fluxo de conexão:**
1. Tatuador entra em Settings → Integrações → "Conectar Google Calendar".
2. UI redireciona pra Google OAuth consent screen (escopo `https://www.googleapis.com/auth/calendar`).
3. Callback grava `refresh_token`, `access_token`, `expires_at` em `google_oauth_tokens`.
4. UI volta pra Agenda mostrando ✓ conectado.

**Operações do bot:**
- **Ler slots livres:** GET `https://www.googleapis.com/calendar/v3/freeBusy` no calendário configurado, considerando `horario_funcionamento`, `duracao_sessao_padrao_h`, `buffer_minutos`, `janela_visibilidade_dias`.
- **Criar evento:** POST `https://www.googleapis.com/calendar/v3/calendars/{id}/events` quando agendamento confirmado. Salva `google_event_id` em `agendamentos_google`.
- **Cancelar evento:** DELETE no Google + UPDATE em `agendamentos_google.status='cancelado'`.

### Configurações novas

| Campo | Tipo | Default | Função |
|---|---|---|---|
| Buffer entre sessões (min) | input numérico | 30 | Tempo entre fim de uma sessão e começo da próxima (limpeza, descanso) |
| Janela de visibilidade (dias) | select (7, 14, 30, 60) | 14 | Quantos dias à frente o bot oferece slots ao cliente |
| Calendário Google de destino | select (carregado via API `calendarList`) | "primary" | Tatuador pode ter múltiplos calendários (Pessoal, Estúdio, etc) — escolhe um |
| Cor do evento | select 11 cores Google (`colorId` 1-11) | `2` (Sage) | Cor com que evento aparece no Calendar; só visual, não muda comportamento |

### Configs migradas do Painel Agente

- Horário de funcionamento (JSON 7 dias) — UI virá visual com 7 sliders no v2; v1 mantém JSON com hint
- Duração padrão de sessão (horas)
- Sinal % — mantido aqui em Agenda (config operacional do agendamento, não billing administrativo)

### View do painel

- Calendário visual mensal/semanal (lib leve: `fullcalendar` standalone ou custom).
- Lista de próximos agendamentos (next 10) abaixo do calendário com: nome cliente, data/hora, valor, link pra conversa.
- Banner de status de conexão Google (verde/vermelho) + botão reconectar (atalho pra Settings → Integrações).

---

## Painel 5 — Portfólio (NEW)

### Modelo C híbrido — Favoritas + galeria com chips de "estilo"

**2 zonas:**

1. **Favoritas do estúdio** (até 10, fixas)
   - Linha horizontal de até 10 fotos no topo do painel.
   - Tatuador arrasta foto da galeria pra cá ou marca ⭐ na grid.
   - Bot manda essas fotos quando cliente pede portfólio "geral" sem especificar estilo.
   - Ordem editável (drag to reorder).

2. **Galeria geral** (sem limite)
   - Grid de fotos com filtros de estilo no topo.
   - Cada foto pode ter 0+ estilos atribuídos.

### Linguagem leiga — sem "tag"

UI usa exclusivamente a palavra **"estilo"**. Termos `tag`, `metadata`, `categoria` proibidos em qualquer texto visível ao tatuador.

### Upload

**Drag-drop area** + botão "Escolher arquivos":
- Aceita JPEG, PNG, WebP até 5MB cada.
- Multi-upload (até 10 simultâneos).
- Após drop, abre modal "Que estilo é essa tatuagem? (opcional)" com:
  - Chips clicáveis dos `estilos_aceitos` do estúdio (puxados do Painel Agente)
  - Chip "+ Outro estilo" abre input livre
  - Chip pré-marcado se nome do arquivo bate com algum estilo (`fineline_costas.jpg` → "Fineline" pré-marcado)
- Compressão via Supabase Storage image transformation (built-in no plano free, sem dependência externa nova): `?width=800&quality=80` no signed URL. Original preservado, versão comprimida servida sob demanda.
- Path: `{tenant_id}/{photo_id}.{ext}` (sem subdir `originals/compressed/` — transformação é parâmetro de URL).

### Storage

- Supabase Storage bucket `portfolio` (privado, acesso via signed URLs).
- Estrutura de path: `{tenant_id}/{photo_id}.{ext}`.
- Quota: 1GB/tenant (5GB free tier do Supabase cobre 5+ tenants confortavelmente; revisitar quando atingir).

### Migração de `portfolio_urls` existentes

- Tabela `portfolio_fotos` é o novo home. Coluna `portfolio_urls` em `tenants` mantém-se até migração completa.
- Banner no painel: "Você tem N URLs externas no formato antigo. [Migrar pro storage InkFlow]" → ação que baixa cada URL, comprime, salva no Supabase Storage, deleta linha de `portfolio_urls`.
- Se URL externa quebrou (404), reporta erro pro tatuador decidir (deletar entrada ou manter URL externa).

### Bot serve mídia direto via Evolution

Hoje (`portfolio_urls` apenas): bot manda mensagem com URL pra cliente clicar.
Pós-refactor: bot chama Evolution API `sendMedia` com signed URL temporária do Supabase Storage. Cliente recebe mídia inline no WhatsApp, não link.

**Lógica de seleção:**
- Cliente pede portfólio sem especificar estilo → bot manda 3 favoritas (random entre as 10).
- Cliente pede estilo específico ("tem fineline?") → bot busca `portfolio_fotos WHERE 'fineline' = ANY(estilos)` → manda 2-3 random match.
- Sem match no estilo pedido → bot manda 1 favorita + mensagem "esse estilo não tenho exemplo direto, mas dá uma olhada nesse trabalho".

---

## Painel 6 — Ideias & Sugestões (NEW)

### Apresentação

**Hero header pessoal:**
- Emoji 💡, título "Aqui é onde o InkFlow escuta tu".
- Subtítulo: "Sentiu falta de alguma coisa? Tem ideia que ia melhorar teu dia a dia? Manda aqui — eu (Leandro, fundador) leio cada uma e respondo o status."

**Bloco "Como funciona" — 3 passos numerados:**
1. **Tu escreve** — sem rodeio, curto ou longo, anexa screenshot se ajudar.
2. **Eu leio e respondo** — em até 7 dias o status muda aqui. Pode ser "vou fazer" ou "não vai dar" — sempre com motivo.
3. **Quando ficar pronto** — notificação quando feature implementada. Status "Implementada" pra sempre.

### Caixa de envio

| Campo | Tipo | Detalhe |
|---|---|---|
| Categoria | chips obrigatórios (1) | `✨ Nova ferramenta` · `🔧 Melhorar algo que já tem` · `🐞 Algo está bugado` · `💬 Outro` |
| Texto | textarea (min 10 chars) | Placeholder: "Ex: Seria massa se o bot reconhecesse cobertura..." |
| Anexar screenshot | file upload | Opcional, salva em Supabase Storage bucket `feedback` |

Botão "Enviar →" cria linha em `sugestoes_tatuador` com `status='enviada'`.

### Histórico — "Minhas sugestões"

Lista das próprias sugestões ordenadas por mais recente:
- Card mostra: status badge, timestamp relativo, categoria chip, texto da sugestão.
- Se admin respondeu: bloco verde citação com nome ("Resposta do Leandro: ...").
- Se status `implementada`: badge verde + bloco verde da resposta.
- Se status `nao_vamos_fazer`: badge vermelho + bloco com motivo.

### 4 status possíveis (badges)

| Badge | Significado | Quem muda? |
|---|---|---|
| 📨 **ENVIADA** | Recebida, ainda não lida | Auto |
| ⏳ **EM ANÁLISE** | Lendo, decidindo | Admin (Leandro) |
| ✓ **IMPLEMENTADA** | Já está no app | Admin |
| ⊘ **NÃO VAMOS FAZER** | Com motivo na resposta | Admin |

### Admin (out of scope desta spec)

Painel `admin.html` ganha uma view `Sugestões` listando todas, com filtros por status/categoria/tenant. Admin marca status + escreve `resposta_admin` + opcionalmente dispara email/push de notificação ao tatuador.

---

## Painel 7 — Suporte e dúvidas

Promovido de "botão na bottom" pra painel próprio. Conteúdo:

1. **FAQ do produto** (sobre o InkFlow, não sobre o estúdio do cliente):
   - "Como conecto meu WhatsApp?"
   - "O que é o Modo Coleta?"
   - "Como funciona a integração com Google Calendar?"
   - "Posso cancelar quando quiser?"
   - (~10-15 perguntas curadas)
   - Tipo accordion, search box no topo.
2. **Botão "Falar com Leandro"** — abre WhatsApp com texto pré-preenchido `Olá Leandro! Sou do estúdio [nome] e preciso de ajuda com:`.
3. **Tutoriais em vídeo** (placeholder v1, conteúdo no v2): "Tour do painel", "Configurando teu agente em 5 min", "Conectar Google Calendar".

---

## Painel 8 — Settings (NEW)

### 6 seções accordion

#### Seção 1 — 🏠 Estúdio

- Nome do estúdio (input)
- CEP (input, busca via ViaCEP)
- Cidade (input)
- Endereço (input)
- Número (input)

Origem: Onboarding s2. Escreve em `tenants.{nome_estudio,cep,cidade,endereco,numero}`.

#### Seção 2 — 👤 Conta

- Nome do tatuador (input)
- Email (input + validação)
- Senha (botão "Alterar senha" abre modal — Supabase Auth flow)
- Telefone WhatsApp pessoal (input com formatação BR)

Origem: Onboarding s2 + Supabase Auth. Escreve em `tenants.{nome,email,telefone}`.

#### Seção 3 — 💳 Plano e cobrança

- Plano atual (badge readonly): Individual / Estúdio / Estúdio VIP
- Próxima cobrança (data + valor, vindo de MP)
- Histórico de pagamentos (tabela com data, valor, status — fetched de `mercado_pago_subscriptions`)
- Botão "Mudar plano" → modal com 3 cards de plano + radio
- Botão "Cancelar plano" → flow detalhado abaixo (§Fluxos críticos)

#### Seção 4 — 🔔 Notificações

- **Telegram do tatuador** (Coleta v2):
  - Status: ✓ Conectado @username | ⚠ Desconectado
  - Botão "Reconectar Telegram" (gera novo onboarding_key + QR)
  - Botão "Desconectar" (limpa `tatuador_telegram_chat_id`)
- **Email de notificações** — toggle ON/OFF (default ON)
- **Push web** — toggle ON/OFF (default OFF; futuro v2 com Web Push API)

Schema: `tenants.config_notificacoes` JSONB `{email_enabled, push_enabled}`.

#### Seção 5 — 🔌 Integrações

- **Google Calendar:**
  - Status: ✓ Conectado (calendário "Trabalho") | ⚠ Não conectado
  - Botão "Conectar Google Calendar" → OAuth flow
  - Botão "Desconectar" (limpa `google_oauth_tokens`)
- **WhatsApp (Evolution API):**
  - Status: ✓ Conectado (+55 11 98765-4321) | ⚠ Desconectado
  - Botão "Reconectar WhatsApp" (gera novo QR Code)
  - Botão "Desconectar" (deleta instance Evolution + marca `tenants.ativo=false`)

#### Seção 6 — ⚠️ Zona de perigo

- **Exportar meus dados (LGPD)** — botão que gera ZIP com todas as conversas, agendamentos, portfólio, configurações em formato JSON + CSVs. Email com link signed URL válido por 24h.
- **Deletar conta** — flow detalhado abaixo (§Fluxos críticos).

### Toggle pill — padrão de UI

Estilo do toggle:
```
[OFF state]  ⚪──── (cinza, slider à esquerda)
[ON state]   ────🟢 (teal, slider à direita)
```
Animação suave de slide (~150ms). Aplica em Notificações, Auto-retomar bot, Aceita cobertura, etc — todo lugar que era checkbox.

---

## Painel 9 — Calculadora InkFlow (Modo Exato only)

**Out of scope desta spec.** Refactor do Modo Exato vem em spec separada. V1 desta refatoração mantém `studio.html` Modo Exato com aviso "Em refatoração — UI atual permanece" no painel 9 com placeholder explicativo.

Razão: Coleta v2 é prioridade absoluta (zero tenants pagantes em Faixa, modo principal mudou). Exato vira beta secundário com badge BETA na UI até ser refatorado.

---

## Fluxos críticos

### Fluxo 1 — Cancelar plano (sem deletar conta)

**UI — Modal "Cancelar plano":**

3 botões antes de confirmar:
1. 💬 *"Falar com o suporte primeiro"* — abre WhatsApp do suporte
2. 📥 *"Pausar (manter acesso até fim do ciclo)"* — opção de v2; v1 trata como "Cancelar mesmo assim"
3. ❌ *"Cancelar mesmo assim"*

**Backend (em ordem, com abort em qualquer falha):**

```javascript
// /api/cancel-plan
async function cancelPlan(tenant_id, studio_token) {
  const tenant = await db.tenants.findById(tenant_id);
  if (!tenant.mp_subscription_id) {
    return { error: 'no_subscription' };
  }

  // 1. Cancela MP — bloqueante
  const mpRes = await fetch(
    `https://api.mercadopago.com/preapproval/${tenant.mp_subscription_id}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      body: JSON.stringify({ status: 'cancelled' }),
    },
  );
  if (!mpRes.ok) {
    return { error: 'mp_cancel_failed', detail: await mpRes.text() };
  }

  // 2. Atualiza DB
  const ativoAte = tenant.proxima_cobranca; // fim do ciclo já pago
  await db.tenants.update(tenant_id, {
    status_pagamento: 'cancelado',
    ativo_ate: ativoAte,
  });

  // 3. Email automático
  await sendEmail(tenant.email, 'plan_cancelled', { ativo_ate: ativoAte });

  return { success: true, ativo_ate: ativoAte };
}
```

**Garantias:**
- Falha MP → DB inalterado, tatuador vê erro e pode tentar de novo ou falar com suporte.
- Sucesso → acesso continua até `ativo_ate` (fim do ciclo). Cron de expirar trial/plano (`cron-worker`) já marca `ativo=false` quando `ativo_ate < now()`.

### Fluxo 2 — Deletar conta

**UI — 3 etapas em modal:**

**Etapa A** — Lista do que será apagado + aviso de billing:
> "Ao deletar tua conta, vamos apagar permanentemente:
> - X conversas com clientes
> - Y agendamentos
> - Z fotos do portfólio
> - Todas as configurações do estúdio
>
> ✅ **Sua inscrição no Mercado Pago será cancelada automaticamente — você não será cobrado novamente.**
>
> Histórico que aceitamos manter por exigência fiscal: comprovantes de pagamentos passados (anonimizados)."

**Etapa B** — Ofertas antes de prosseguir:
- 💬 Botão "Falar com o suporte primeiro" (WhatsApp Leandro)
- 📥 Botão "Exportar meus dados primeiro" (gera ZIP LGPD)
- ❌ Botão "Continuar com a deleção"

**Etapa C** — Confirmação final:
- Texto: "Pra confirmar, digite **CANCELAR** abaixo:"
- Input texto (case-insensitive match)
- Botão final vermelho "Apagar minha conta para sempre" (desabilitado até match exato)

**Backend (ordem, abort em qualquer falha):**

```javascript
// /api/delete-account
async function deleteAccount(tenant_id, studio_token, confirmation_word) {
  if (confirmation_word.toUpperCase() !== 'CANCELAR') {
    return { error: 'wrong_confirmation' };
  }

  const tenant = await db.tenants.findById(tenant_id);

  // 1. Cancela MP — bloqueante
  if (tenant.mp_subscription_id) {
    const mpRes = await cancelMpSubscription(tenant.mp_subscription_id);
    if (!mpRes.ok) {
      return { error: 'mp_cancel_failed', detail: 'Não conseguimos cancelar tua inscrição. Por favor fale com o suporte antes de seguir.' };
    }
  }

  // 2. Deleta instância Evolution — bloqueante
  if (tenant.evo_instance) {
    const evoRes = await deleteEvolutionInstance(tenant.evo_instance);
    if (!evoRes.ok) {
      // Reverte? MP cancel já efetivou, mas tatuador quis deletar mesmo assim.
      // Decisão: log warning, segue. Não vai cobrar de novo (MP cancelado), instance fica "órfã" no Evolution e é limpa pelo cron de cleanup-tenants.
      console.warn('[delete-account] Evolution delete falhou, MP já cancelado. Tenant:', tenant_id);
    }
  }

  // 3. Deleta storage (portfolio + feedback screenshots)
  await supabase.storage.from('portfolio').remove([`${tenant_id}/*`]);
  await supabase.storage.from('feedback').remove([`${tenant_id}/*`]);

  // 4. Anonimiza linhas DB (compliance fiscal — não delete duro)
  await db.run(`
    UPDATE tenants SET
      nome = '[deletado]',
      email = 'deleted+' || id || '@inkflow.app',
      telefone = NULL,
      nome_estudio = '[deletado]',
      endereco = NULL,
      cep = NULL,
      cidade = NULL,
      ativo = false,
      status_pagamento = 'deletado',
      deletado_em = now()
    WHERE id = $1
  `, [tenant_id]);

  await db.run(`UPDATE conversas SET cliente_nome = '[anonimizado]', cliente_telefone = NULL WHERE tenant_id = $1`, [tenant_id]);
  await db.run(`DELETE FROM portfolio_fotos WHERE tenant_id = $1`, [tenant_id]);
  await db.run(`DELETE FROM agendamentos_google WHERE tenant_id = $1`, [tenant_id]);
  await db.run(`DELETE FROM google_oauth_tokens WHERE tenant_id = $1`, [tenant_id]);
  await db.run(`DELETE FROM sugestoes_tatuador WHERE tenant_id = $1`, [tenant_id]);

  // 5. Email final
  await sendEmail(tenant.email, 'account_deleted');

  return { success: true };
}
```

**Garantias:**
- MP cancel **antes** de tudo. Falha MP → aborta tudo, tatuador NÃO fica sem cobrar mas com conta meio-deletada.
- Histórico fiscal de pagamentos (linhas em `payments` ou similar) preservado anonimizado pra compliance.
- LGPD: dados pessoais anonimizados/deletados; linhas de relacionamento preservadas com identificadores não-pessoais.

### Fluxo 3 — Kill-switch (assumir/devolver conversa)

**Detecção via Evolution webhook (msg `fromMe: true`):**

```javascript
// n8n workflow ou function /api/whatsapp-webhook
async function handleIncoming(msg) {
  if (!msg.fromMe) return processClientMessage(msg);

  const conversa = await findConversaByCliente(msg.tenant_id, msg.cliente_phone);
  const config = (await db.tenants.findById(msg.tenant_id)).config_agente;

  const text = msg.text.toLowerCase().trim();

  if (text === config.frase_assumir.toLowerCase()) {
    await db.conversas.update(conversa.id, {
      estado_agente_anterior: conversa.estado_agente,
      estado_agente: 'pausada_tatuador',
      pausada_em: new Date(),
    });
    // ack só pro tatuador (msg fromMe não vai pro cliente)
    await sendWhatsAppToSelf(msg.tenant_id, msg.cliente_phone, '✓ Ok, conversa sua.');
    return;
  }

  if (text === config.frase_devolver.toLowerCase()) {
    if (conversa.estado_agente !== 'pausada_tatuador') return; // ignore
    await db.conversas.update(conversa.id, {
      estado_agente: conversa.estado_agente_anterior || 'propondo_valor',
      pausada_em: null,
    });
    await sendWhatsApp(msg.cliente_phone, config.mensagem_ao_retomar);
    return;
  }

  // qualquer outra msg fromMe: passa, não pausa não retoma
  return processClientMessage(msg);
}
```

**Auto-retomar:**

Cron Cloudflare Worker a cada 30min:

```javascript
const conversasPausadas = await db.run(`
  SELECT c.*, t.config_agente->>'auto_retomar_horas' as horas
  FROM conversas c JOIN tenants t ON c.tenant_id = t.id
  WHERE c.estado_agente = 'pausada_tatuador'
    AND t.config_agente->>'auto_retomar_horas' IS NOT NULL
    AND c.pausada_em < now() - (CAST(t.config_agente->>'auto_retomar_horas' AS int) || ' hours')::interval
`);
for (const c of conversasPausadas) {
  await retomarBot(c);
}
```

---

## Schema deltas

```sql
-- tenants — colunas novas
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ativo_ate timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deletado_em timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS resumo_semanal_atual jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS resumo_semanal_ultima_geracao_manual timestamptz;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS config_notificacoes jsonb DEFAULT '{"email_enabled": true, "push_enabled": false}'::jsonb;

-- tenants — config_agente delta (validação JSON-side em update-tenant.js)
-- ADD: emoji_favorito, frase_assumir, frase_devolver, mensagem_ao_retomar, auto_retomar_horas
-- REMOVE: usa_giria (deletar do JSON ao salvar)

-- tenants — Artistas removido
ALTER TABLE tenants DROP COLUMN IF EXISTS slots_max;
ALTER TABLE tenants DROP COLUMN IF EXISTS slots_ocupados;
ALTER TABLE tenants DROP COLUMN IF EXISTS parent_tenant_id;
DROP TABLE IF EXISTS tenant_invites;

-- conversas — novo estado + tracking de pausa
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS estado_agente_anterior text;
ALTER TABLE conversas ADD COLUMN IF NOT EXISTS pausada_em timestamptz;
-- estado_agente CHECK constraint update pra incluir 'pausada_tatuador'
ALTER TABLE conversas DROP CONSTRAINT IF EXISTS conversas_estado_agente_check;
ALTER TABLE conversas ADD CONSTRAINT conversas_estado_agente_check
  CHECK (estado_agente IN (
    'ativo','coletando_tattoo','coletando_cadastro','aguardando_tatuador',
    'propondo_valor','aguardando_decisao_desconto','escolhendo_horario',
    'aguardando_sinal','lead_frio','fechado','pausada_tatuador'
  ));

-- portfolio_fotos
CREATE TABLE IF NOT EXISTS portfolio_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  storage_path_original text,
  nome_arquivo_original text,
  estilos text[] DEFAULT '{}',
  is_favorita boolean DEFAULT false,
  ordem int,
  size_bytes int,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_portfolio_fotos_tenant ON portfolio_fotos(tenant_id);
CREATE INDEX idx_portfolio_fotos_favorita ON portfolio_fotos(tenant_id, is_favorita) WHERE is_favorita = true;
CREATE INDEX idx_portfolio_fotos_estilos ON portfolio_fotos USING gin(estilos);

-- sugestoes_tatuador
CREATE TABLE IF NOT EXISTS sugestoes_tatuador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  categoria text NOT NULL CHECK (categoria IN ('nova_ferramenta','melhoria','bug','outro')),
  texto text NOT NULL CHECK (length(texto) >= 10),
  screenshot_storage_path text,
  status text NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada','em_analise','implementada','nao_vamos_fazer')),
  resposta_admin text,
  created_at timestamptz DEFAULT now(),
  responded_at timestamptz
);
CREATE INDEX idx_sugestoes_tenant ON sugestoes_tatuador(tenant_id, created_at DESC);
CREATE INDEX idx_sugestoes_status ON sugestoes_tatuador(status, created_at DESC);

-- agendamentos_google
CREATE TABLE IF NOT EXISTS agendamentos_google (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversa_id uuid REFERENCES conversas(id),
  google_event_id text NOT NULL,
  google_calendar_id text NOT NULL,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  cliente_nome text,
  status text NOT NULL DEFAULT 'confirmado'
    CHECK (status IN ('confirmado','cancelado','realizado','no_show')),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_agendamentos_tenant_inicio ON agendamentos_google(tenant_id, inicio);

-- google_oauth_tokens
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  access_token text,
  expires_at timestamptz,
  scope text,
  conectado_em timestamptz DEFAULT now()
);
```

---

## Mudanças nos arquivos do projeto

### Frontend

| Arquivo | Ação | Detalhes |
|---|---|---|
| `studio.html` | Refatorado | 4 abas → 8 painéis (9 Exato). Nova sidebar lógica. Remove tudo de "Artistas" |
| `onboarding.html` | Patch | Remover step de "convidar artistas" (sw step?). Garantir que campos casem com Settings |
| `admin.html` | Patch | Adicionar view "Sugestões" (responder, mudar status) |

### Backend (functions/api)

| Arquivo | Ação |
|---|---|
| `functions/api/cancel-plan.js` | NEW |
| `functions/api/delete-account.js` | NEW |
| `functions/api/regenerate-resumo-semanal.js` | NEW (botão "Atualizar resumo") |
| `functions/api/portfolio/upload.js` | NEW |
| `functions/api/portfolio/list.js` | NEW |
| `functions/api/portfolio/update-foto.js` | NEW |
| `functions/api/portfolio/delete-foto.js` | NEW |
| `functions/api/portfolio/migrate-urls.js` | NEW (migração de portfolio_urls antigos) |
| `functions/api/sugestoes/create.js` | NEW |
| `functions/api/sugestoes/list-mine.js` | NEW |
| `functions/api/google-oauth/start.js` | NEW |
| `functions/api/google-oauth/callback.js` | NEW |
| `functions/api/google-oauth/disconnect.js` | NEW |
| `functions/api/agenda/list-events.js` | NEW |
| `functions/api/agenda/create-event.js` | NEW (chamado pelo bot) |
| `functions/api/agenda/free-busy.js` | NEW (chamado pelo bot pra slots) |
| `functions/api/conversas/list.js` | NEW (3 grupos) |
| `functions/api/conversas/thread.js` | NEW (mensagens da conversa) |
| `functions/api/conversas/assumir.js` | NEW (kill-switch UI) |
| `functions/api/conversas/devolver.js` | NEW |
| `functions/api/whatsapp-webhook.js` | Patch | Detectar frase_assumir/frase_devolver em msgs fromMe |
| `functions/api/update-tenant.js` | Patch | Remover validação de `usa_giria`; aceitar novos campos config_agente; rejeitar campos de Artistas |
| `functions/api/invite-artist.js` | DELETE | Feature de Artistas removida |
| `functions/api/validate-artist-invite.js` | DELETE | Idem |

### Cron worker

| Arquivo | Ação |
|---|---|
| `cron-worker/src/jobs/resumo-semanal.js` | NEW (segunda 9h BRT) |
| `cron-worker/src/jobs/auto-retomar-bot.js` | NEW (a cada 30min) |
| `cron-worker/src/jobs/expirar-plano.js` | Patch (já existe, agora considerar `ativo_ate`) |

### n8n workflows

| Workflow | Mudança |
|---|---|
| INKFLOW principal | Branch nova: se `estado_agente='pausada_tatuador'` → não chama LLM, ignora msg cliente |
| INKFLOW Telegram tatuador | Continua como spec Coleta v2 |

### Plans

| Arquivo | Mudança |
|---|---|
| `functions/_lib/plans.js` (catálogo único) | Cada plano vira `{ id, nome, preco_mensal_brl, conversas_mes, features: string[] }`. Sem `slots_artistas` ou `max_tatuadores`. Preços e features exatas decididos fora desta spec — esta refatoração só remove o conceito de múltiplos tatuadores |

---

## Migração de dados

### Tenants existentes com Artistas

Hoje (zero tenants pagantes confirmado em [Painel 02/05]), risco zero. Migration:

```sql
-- Se algum tenant pré-existente tinha slots_max>1, vira Individual (slots_max=1 era a feature de plano)
UPDATE tenants SET plano = 'individual' WHERE plano IN ('estudio','premium') AND id IN (
  SELECT id FROM tenants WHERE NOT EXISTS (SELECT 1 FROM tenants child WHERE child.parent_tenant_id = tenants.id)
);
-- Tenants que eram filhos de outro estúdio: anonimizam-se (perderam vínculo no schema novo)
UPDATE tenants SET parent_tenant_id = NULL, ativo = false, status_pagamento = 'orfao' WHERE parent_tenant_id IS NOT NULL;
-- Drop columns
ALTER TABLE tenants DROP COLUMN slots_max, DROP COLUMN slots_ocupados, DROP COLUMN parent_tenant_id;
DROP TABLE tenant_invites;
```

### portfolio_urls → portfolio_fotos

Migração on-demand (não batch automático): banner no painel Portfólio mostra "Você tem N URLs antigas. Migrar?". Tatuador clica → backend baixa cada URL, comprime, salva no Supabase Storage, cria linha em `portfolio_fotos`, deleta do array `portfolio_urls`.

---

## Critérios de aceitação

### Sidebar e navegação

- [ ] Desktop tem 8 painéis (9 Exato) com tooltip que aparece no hover
- [ ] Mobile tem bottom tab bar com os mesmos 8 painéis (overflow se necessário)
- [ ] URL hash (`#dashboard`, `#agente`, ...) navega entre painéis e persiste no reload
- [ ] Modo Exato exibe painel "Calculadora InkFlow" com placeholder "Em refatoração"
- [ ] Modo Coleta NÃO mostra painel "Calculadora InkFlow"

### Dashboard

- [ ] 5 KPIs renderizam com dados reais do DB (Conversas hoje, Orçamentos esta semana, Aguardando sinal, Taxa conversão, Sinal recebido)
- [ ] Atividade recente mostra últimas 3 conversas com link pra Conversas
- [ ] Resumo semanal IA aparece se `tenants.resumo_semanal_atual IS NOT NULL`, senão mostra "Próximo resumo na segunda 9h"
- [ ] Botão "Atualizar resumo" desabilita se `resumo_semanal_ultima_geracao_manual >= today 00:00`
- [ ] Slot "Conectar Telegram" some quando `tatuador_telegram_chat_id IS NOT NULL`
- [ ] Header mostra 2 indicadores (WhatsApp + Telegram) com cor correta

### Agente

- [ ] 6 grupos visíveis (sem "Agenda e preços", sem "Portfólio")
- [ ] "Personalidade" é o último campo do grupo Identidade
- [ ] "Uso de emojis" tem só 2 opções (Moderado, Nenhum)
- [ ] Campo "Emoji favorito" presente e editável
- [ ] "Usa gírias brasileiras" NÃO aparece em lugar nenhum
- [ ] "Casos que o agente passa pra você" é o título do grupo (não "Gatilhos de handoff")
- [ ] Grupo "Controle manual" tem 4 campos: frase_assumir, frase_devolver, mensagem_ao_retomar, auto_retomar_horas
- [ ] FAQ tem botão "Meus FAQs" que abre modal listando FAQs configurados
- [ ] Toggle pill substituiu todos os checkboxes do painel

### Conversas

- [ ] 3 grupos navegáveis: "Conversas de hoje", "Aguardando orçamento", "Em negociação"
- [ ] Sub-tab "Histórico" pra conversas em `fechado`
- [ ] Click em conversa abre thread completa (lista lateral + painel msgs)
- [ ] Botão "Assumir conversa" pausa via API (estado `pausada_tatuador`)
- [ ] Botão "Devolver pro bot" retoma e envia `mensagem_ao_retomar`
- [ ] Conversas pausadas mostram badge "🔇 Tatuador no comando"
- [ ] Real-time atualiza quando msg nova chega (Supabase Realtime)

### Agenda

- [ ] Botão "Conectar Google Calendar" inicia OAuth
- [ ] Pós-conexão, calendário visual mostra eventos do `google_calendar_id` configurado
- [ ] 4 configs novas funcionam (buffer, janela, calendário destino, cor)
- [ ] Configs migradas (horário, duração, sinal) editáveis aqui
- [ ] Bot consegue ler slots livres via free-busy quando agenda Google está conectada

### Portfólio

- [ ] Drag-drop upload aceita JPEG/PNG/WebP até 5MB
- [ ] Modal pós-upload pergunta "Que estilo é essa tatuagem?" com chips dos `estilos_aceitos`
- [ ] Auto-marcar chip se nome do arquivo bate com estilo
- [ ] Zona "Favoritas" aceita drag-to-reorder, máx 10 fotos
- [ ] Filtro por estilo no topo da galeria geral funciona
- [ ] Migração de `portfolio_urls` antigos disponível em banner
- [ ] Bot manda mídia inline via Evolution `sendMedia` (não link)
- [ ] Palavra "tag" não aparece em lugar nenhum visível

### Ideias & Sugestões

- [ ] Hero header pessoal renderiza com nome do fundador
- [ ] Bloco "Como funciona" com 3 passos visíveis
- [ ] 4 categorias clicáveis (nova ferramenta, melhoria, bug, outro)
- [ ] Textarea + screenshot opcional + botão Enviar
- [ ] Sugestão criada vira card em "Minhas sugestões" com badge "ENVIADA"
- [ ] Card mostra resposta inline quando admin responde
- [ ] 4 status badges renderizam com cores distintas

### Suporte e dúvidas

- [ ] FAQ accordion com 10-15 perguntas
- [ ] Botão "Falar com Leandro" abre WhatsApp com texto pré-preenchido

### Settings

- [ ] 6 seções accordion abrem/fecham
- [ ] Estúdio: campos editáveis, save funciona
- [ ] Conta: alterar senha via Supabase Auth
- [ ] Plano: histórico de pagamentos visível, botão "Cancelar plano" abre flow correto
- [ ] Notificações: Telegram + email + push toggles
- [ ] Integrações: Google Calendar e WhatsApp com status + reconectar
- [ ] Zona de perigo: exportar dados (LGPD) gera ZIP, deletar conta abre flow 3 etapas

### Fluxos críticos

- [ ] **Cancelar plano:** falha MP aborta operação completa. DB inalterado. Mostra erro "fale com suporte".
- [ ] **Deletar conta:** confirmação por palavra `CANCELAR` exigida. Flow de 3 etapas. MP cancel antes de qualquer outra etapa. Falha MP aborta.
- [ ] **Kill-switch:** msg `frase_assumir` em conversa pausa. `frase_devolver` retoma. Ack pro tatuador na mensagem do tatuador (ack visível só pra ele no WhatsApp). Auto-retomar após N horas funciona.

### "Artistas do estúdio" — eliminação completa

- [ ] Studio.html sem nenhuma referência a "Artistas", "Convidar Artista", "Slots"
- [ ] Onboarding.html sem step de convidar artistas
- [ ] Schema sem colunas `slots_*` ou `parent_tenant_id`
- [ ] Tabela `tenant_invites` deletada
- [ ] Endpoints `/api/invite-artist*` deletados
- [ ] Plans atualizados (sem mention de número de tatuadores)
- [ ] Prompts do bot sem qualquer ref a "estúdio com múltiplos tatuadores"

---

## Riscos e mitigações

### Risco 1 — Refator quebra usuários existentes

**Mitigação:** zero tenants pagantes em produção (confirmado 02/05/2026). Refactor + drops de colunas seguros. Migration idempotente com `IF EXISTS`.

### Risco 2 — Cancelar plano falha em edge case e tatuador continua sendo cobrado

**Mitigação:** circuit breaker em `cancelMpSubscription` — só atualiza DB após HTTP 200 da API MP. Logs estruturados em Sentry com tenant_id pra debug. Email de confirmação envia só após sucesso.

### Risco 3 — Kill-switch via frase mágica falha (`fromMe: true` mal detectado)

**Mitigação:** botão "Assumir/Devolver" no Painel Conversas serve de fallback. Frase mágica é UX rápida, não única.

### Risco 4 — Storage Supabase enche

**Mitigação:** quota 1GB/tenant aplicada no upload (rejeita com mensagem amigável "Limite atingido. Apague fotos antigas ou suba pra plano superior"). Cron limpa storage de tenants deletados (já cobre `cleanup-tenants`).

### Risco 5 — Resumo semanal IA gera texto de baixa qualidade ou alucina números

**Mitigação:** prompt rígido com schema de output. Fallback: se LLM erra (fora de schema, números fora dos passados), regenera 1x; se errar de novo, mostra texto fixo "Resumo desta semana indisponível, tenta atualizar manualmente".

### Risco 6 — Google OAuth tokens expirados não refrescam

**Mitigação:** middleware antes de qualquer chamada Google: se `expires_at < now() + 5min`, refresca usando `refresh_token`. Se refresh falhar (revogado), marca `google_oauth_tokens` como inválido e UI mostra "Reconectar Google Calendar" no Painel Agenda.

---

## Out of scope desta spec

- Modo Exato refactor completo (Calculadora InkFlow detalhada) — spec separada em `2026-XX-modo-exato-refactor.md`
- Cal.com como alternativa de agenda — só se Google virar dor
- Roadmap público com voto (Sugestões opção C) — v2 se demanda existir
- Vision IA pra auto-detectar estilo da foto — caro, sem ROI claro
- Multi-tatuador por tenant — explicitamente removido por decisão de produto
- App nativo iOS/Android — PWA atende v1
- Push notifications real (Web Push API) — toggle existe na Settings, implementação fica pra v2
- Tutoriais em vídeo no Painel Suporte — placeholder v1, conteúdo v2
- Re-design da Home/Funcionalidades/Preços (`index.html`) — Fase 2 SEO, spec separada

---

## Dependências e ordem de execução

1. **Bloqueante: Modo Coleta v2 backend** ([`2026-05-02-modo-coleta-v2-principal.md`](./2026-05-02-modo-coleta-v2-principal.md)) — Fases 3, 4, 7, 8, 9, 10 da execução em andamento. UI da página do tatuador depende dos endpoints Telegram, prompts Coleta, e schema migration v2 estarem deployed.
2. **Pode rodar em paralelo:** SEO Fase 2 (`docs/seo-strategy/2026-05-02-site-restructure-plan.md`) — sem overlap.
3. **Esta spec:** quando Coleta v2 backend tiver Fase 7 UI started, esta refatoração entra como sub-projeto da Fase 7 expandida. Estimativa: 6-8 dias de execução com Claude assistido.

---

## Próximos passos

1. **Aprovação Leandro** — leitura desta spec + ajustes finais.
2. **Invocar `writing-plans`** — gerar plano de implementação detalhado com tasks executáveis (~30-40 tasks em 8-10 fases).
3. **Branch:** `feat/pagina-tatuador-refactor` saindo de `feat/modo-coleta-v2-principal` (depende do backend Coleta v2).
4. **Execução** via subagent-driven-development ou executing-plans.

---

## Apêndice — Mapeamento campo do onboarding → painel

| Campo onboarding | Tabela.coluna | Painel onde edita |
|---|---|---|
| Nome do tatuador | `tenants.nome` | Settings → Conta |
| Email | `tenants.email` | Settings → Conta |
| Telefone | `tenants.telefone` | Settings → Conta |
| Nome estúdio | `tenants.nome_estudio` | Settings → Estúdio |
| CEP, cidade, endereço, número | `tenants.{cep,cidade,endereco,numero}` | Settings → Estúdio |
| Plano | `tenants.plano` | Settings → Plano e cobrança |
| Nome do agente | `tenants.nome_agente` | Agente → Identidade |
| Tom | `tenants.config_agente.tom` | Agente → Identidade |
| Personalidade livre | `tenants.config_agente.persona_livre` | Agente → Identidade (último) |
| Emoji level | `tenants.config_agente.emoji_level` | Agente → Estilo (só Moderado/Nenhum) |
| Emoji favorito | `tenants.config_agente.emoji_favorito` (NEW) | Agente → Estilo |
| Frases naturais | `tenants.config_agente.frases_naturais` | Agente → Estilo |
| Estilos aceitos/recusados | `tenants.config_agente.estilos_*` | Agente → Escopo |
| Aceita cobertura | `tenants.config_agente.aceita_cobertura` | Agente → Escopo |
| Gatilhos handoff | `tenants.gatilhos_handoff` | Agente → Casos que o agente passa pra você |
| Horário funcionamento | `tenants.horario_funcionamento` | Agenda |
| Duração sessão | `tenants.duracao_sessao_padrao_h` | Agenda |
| Sinal % | `tenants.sinal_percentual` | Agenda |
| Tabela preços | `tenants.config_precificacao` | Agenda (parcial) + Modo Exato → Calculadora InkFlow |
| Portfólio URLs | `tenants.portfolio_urls` (legacy) → `portfolio_fotos` (novo) | Portfólio |
| FAQ | `tenants.faq_texto` | Agente → FAQ + botão "Meus FAQs" |
| Telegram chat ID | `tenants.tatuador_telegram_chat_id` | Settings → Notificações |
| Frase assumir/devolver | `tenants.config_agente.frase_*` (NEW) | Agente → Controle manual |
