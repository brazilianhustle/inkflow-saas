# Página do Tatuador — Refactor — Plano-mestre (orquestração)

> **For agentic workers:** Este é o **plano-mestre** que coordena 9 sub-PRs independentes. Cada PR tem (ou terá) seu próprio plano detalhado em `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR<N>-<nome>.md`. Sub-plans são escritos sob demanda — quando for executar PR N, invoque `superpowers:writing-plans` apontando pro escopo desta linha + a spec mestre. Cada sub-plan deve usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` pra implementação task-a-task.

**Goal:** Refatorar `studio.html` de 4 abas pra 8 painéis (9 no Modo Exato), eliminar "Artistas do estúdio" do SaaS por completo, conectar todos os campos do onboarding aos painéis temáticos via modelo "formulário-vira-página", e adicionar canais de feedback, integração de agenda real, painel de portfólio dedicado e fluxos de cancelamento/deleção de conta seguros (MP cancel-first).

**Architecture:** Frontend é HTML+JS estático servido por Cloudflare Pages com endpoints Cloudflare Functions em `/api/*`. Database Supabase Postgres + Storage. Crons via Cloudflare Worker (`cron-worker/`). LLM calls via prompts modulares em `prompts/{coleta,exato}/`. Refator preserva esse stack — nenhum framework novo. UI sidebar lateral 60px desktop / bottom tab bar mobile, hash-routing simples, real-time via Supabase Realtime onde necessário (Conversas), OAuth Google direto (sem Supabase Auth integration porque escopos são diferentes do auth do tenant).

**Tech Stack:** HTML+JS vanilla, Cloudflare Pages Functions, Supabase Postgres + Storage + Realtime, Google Calendar API v3 (OAuth 2.0 com refresh token), Mercado Pago Subscriptions API (`preapproval`), Evolution API (WhatsApp send/sendMedia), Telegram Bot API (webhook + sendMessage com inline keyboard), n8n para orquestração de fluxos, gpt-4o-mini para resumo semanal IA.

**Spec mestre:** [`docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md`](../specs/2026-05-03-pagina-tatuador-refactor-design.md)

**Branch base:** `feat/pagina-tatuador-refactor` saindo de `feat/modo-coleta-v2-principal` (depende do backend Coleta v2 estar deployed).

**Estimativa total:** 12-14 dias com Claude assistido (subagent-driven recomendado). PRs 2-9 paralelizáveis após PR 1 (foundation).

---

## Ordem de execução e dependências

```
PR 1 (Foundation)
  ├─→ PR 2 (Dashboard)
  ├─→ PR 3 (Agente + kill-switch backend)
  │     └─→ PR 4 (Conversas — usa kill-switch)
  ├─→ PR 5 (Portfólio)
  ├─→ PR 6 (Agenda)
  │     └─→ PR 9 (Settings — Cancelar plano referencia Agenda integration)
  ├─→ PR 7 (Sugestões)
  ├─→ PR 8 (Suporte)
  └─→ PR 9 (Settings — destrutivo, último)
```

PR 1 é fundação — bloqueia todos. Depois de PR 1 mergeado, **PRs 2, 3, 5, 6, 7, 8 podem rodar em paralelo**. PR 4 espera PR 3 (kill-switch backend tem que existir antes da UI assumir). PR 9 é o último porque é destrutivo (mexe com cobrança Mercado Pago).

---

## PR 1 — Foundation: Sidebar de 8 painéis + Eliminação de "Artistas do estúdio"

- [ ] Sub-plan escrito? **NÃO** — gerar com `/superpowers:writing-plans` quando começar
- [ ] PR criado e mergeado

**Caminho do sub-plan:** `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR1-foundation.md`

**Escopo:**

1. **Schema migration:**
   - DROP `tenants.slots_max`, `tenants.slots_ocupados`, `tenants.parent_tenant_id`.
   - DROP TABLE `tenant_invites`.
   - ADD `tenants.ativo_ate`, `tenants.deletado_em`, `tenants.config_notificacoes` (JSONB default `{"email_enabled":true,"push_enabled":false}`).
   - ADD CHECK constraint update em `conversas.estado_agente` incluindo `'pausada_tatuador'`.
   - ADD `conversas.estado_agente_anterior`, `conversas.pausada_em`.

2. **Frontend `studio.html`:**
   - Substituir sidebar de 4 botões por 8 botões (Dashboard, Agente, Conversas, Agenda, Portfólio, Ideias & Sugestões, Suporte e dúvidas, Settings) + 9º placeholder pro Modo Exato (Calculadora InkFlow).
   - Cada novo painel inicia como placeholder "Em breve — feature do PR N" com link pro card de roadmap.
   - Hash-routing pra navegar (`#dashboard`, `#agente`, ...).
   - Mobile bottom tab bar com mesmos painéis (overflow `…` se faltar espaço).
   - Remover toda seção/script de "Artistas do Estúdio", "Convidar Artista", "slots-bar", `link-box` invite, modal welcome com convite.
   - Toggle pill component reutilizável (CSS+JS) — usado nos próximos PRs.

3. **Frontend `onboarding.html`:**
   - Remover step `sw` part de "convidar artistas" (manter resto do welcome chat).
   - Garantir mensagens não mencionam múltiplos tatuadores.

4. **Backend:**
   - DELETE `functions/api/invite-artist.js` (e arquivos relacionados).
   - DELETE `functions/api/validate-artist-invite.js`.
   - PATCH `functions/api/update-tenant.js`: rejeitar campos `parent_tenant_id`, `slots_*`; aceitar `ativo_ate`, `deletado_em`, `config_notificacoes`.
   - PATCH `functions/_lib/plans.js`: remover `slots_max` de cada plano, manter `nome`, `preco_mensal_brl`, `conversas_mes`, `features`.

5. **Prompts (zero menção a multi-tatuador):**
   - Audit em `prompts/_shared/`, `prompts/coleta/`, `prompts/exato/` por strings tipo "tatuadores do estúdio", "artistas do estúdio", "outros tatuadores". Substituir/remover.

6. **Testes:**
   - Snapshot tests passando (zero regressão em prompts).
   - Validation tests aceitando novos campos `tenants` e rejeitando os removidos.
   - Smoke E2E: tenant trial passa pelo onboarding → studio.html → vê 8 painéis na sidebar (placeholders nos PRs futuros).

**Critério de DONE:**
- `git grep -i "artistas\|invite-artist\|slots_max"` retorna zero resultados em código de produção (allowlisted: spec, plan, painel histórico).
- Migration aplicada em prod.
- studio.html abre sem erro JS, navega entre 8 painéis (mesmo que placeholders).
- Onboarding finaliza sem mencionar artistas.

---

## PR 2 — Dashboard: KPIs + Atividade recente + Resumo IA + slot Telegram

- [ ] Sub-plan escrito? **NÃO**
- [ ] PR criado e mergeado

**Caminho:** `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR2-dashboard.md`

**Escopo:**

1. **Schema:**
   - ADD `tenants.resumo_semanal_atual` (JSONB).
   - ADD `tenants.resumo_semanal_ultima_geracao_manual` (timestamptz).

2. **Frontend Dashboard:**
   - 5 KPI cards na ordem: Conversas hoje, Orçamentos esta semana, **Aguardando sinal** (NEW), Taxa de conversão, Sinal recebido.
   - Slot Atividade recente: últimas 3 conversas com link pra Conversas.
   - Slot Resumo semanal IA: card mostra texto de `tenants.resumo_semanal_atual.texto` + botão "Atualizar resumo" desabilitado se rate-limit atingido.
   - Slot Conectar Telegram: visível só se `tatuador_telegram_chat_id IS NULL`. Reaproveita QR do step Telegram do onboarding Coleta v2.
   - Slot Info do estúdio (último).
   - Header da página com 2 indicadores (WhatsApp + Telegram) coloridos por status.

3. **Endpoints:**
   - `GET /api/dashboard/kpis?tenant_id=X` retorna os 5 KPIs calculados.
   - `GET /api/dashboard/atividade-recente?tenant_id=X` retorna últimas 3 conversas.
   - `POST /api/dashboard/regenerate-resumo-semanal` — rate-limit por tenant 1x/24h via `resumo_semanal_ultima_geracao_manual`.

4. **Cron worker:**
   - `cron-worker/src/jobs/resumo-semanal.js`: segunda 9h BRT, gera resumo via gpt-4o-mini pra cada tenant ativo. Schema fixo de output (JSON parseable). Salva em `tenants.resumo_semanal_atual`.

**Critério de DONE:**
- Tatuador novo (tenant trial) abre Dashboard, vê todos os KPIs em 0, "Próximo resumo na segunda 9h", slot Conectar Telegram visível.
- Tatuador existente vê KPIs com dados reais.
- Cron rodou pelo menos 1x em prod, gerou resumo válido.
- Botão "Atualizar resumo" funciona, desabilita após click até next day.

---

## PR 3 — Agente: 6 grupos refatorados + Kill-switch backend

- [ ] Sub-plan escrito? **NÃO**
- [ ] PR criado e mergeado

**Caminho:** `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR3-agente-killswitch.md`

**Escopo:**

1. **Schema:**
   - `config_agente` ganha campos: `emoji_favorito` (string), `frase_assumir` (string default `/eu assumo`), `frase_devolver` (string default `/bot volta`), `mensagem_ao_retomar` (string default `Voltei! Alguma dúvida sobre o orçamento?`), `auto_retomar_horas` (int default 6, null = nunca).
   - Update validation em `update-tenant.js`: aceitar novos campos, **rejeitar** `usa_giria`, validar `auto_retomar_horas` IN (null, 2, 6, 12, 24).

2. **Frontend Painel Agente:**
   - Refatorar pra 6 grupos:
     - Identidade (com Personalidade em último)
     - Estilo das mensagens (emoji só `Moderado`/`Nenhum`, campo Emoji favorito, sem gírias)
     - Escopo do estúdio (toggle aceita cobertura)
     - Casos que o agente passa pra você (era "Gatilhos de handoff")
     - **Controle manual** (NEW: 4 campos do kill-switch)
     - FAQ do estúdio + botão "Meus FAQs" (modal)
   - Toggle pill substituindo todos os `<input type=checkbox>` deste painel.

3. **Modal "Meus FAQs":**
   - Parse de `tenants.faq_texto` em pares P:/R: → lista editável.
   - Click em FAQ abre edit inline, botão deletar.
   - Save serializa de volta pra string.

4. **Backend kill-switch:**
   - `functions/api/whatsapp-webhook.js` (existing): branch nova quando `msg.fromMe === true`. Detecta `frase_assumir`/`frase_devolver` (case-insensitive trim). Atualiza `conversas.estado_agente` pra `pausada_tatuador` ou volta pro `estado_agente_anterior`. Manda ack via Evolution `sendMessage` ao próprio tatuador (msg fromMe igual).
   - n8n principal: branch que detecta `estado_agente='pausada_tatuador'` → não chama LLM, apenas armazena msg do cliente.

5. **Cron auto-retomar:**
   - `cron-worker/src/jobs/auto-retomar-bot.js`: cada 30min, query `conversas WHERE estado_agente='pausada_tatuador' AND pausada_em < now() - INTERVAL config_agente.auto_retomar_horas hours`. Pra cada uma, retoma estado anterior + manda mensagem ao retomar.

6. **Endpoints UI:**
   - `POST /api/conversas/assumir` — manual (UI Conversas) — mesma lógica da frase mágica.
   - `POST /api/conversas/devolver` — manual.

**Critério de DONE:**
- Tatuador edita config_agente sem `usa_giria`, com novos campos, save funciona.
- Tatuador manda `/eu assumo` no WhatsApp do cliente → bot pausa, ack chega como msg fromMe.
- Cliente manda msg seguinte → bot ignora (estado pausado), só armazena.
- Tatuador manda `/bot volta` → bot retoma + manda `mensagem_ao_retomar` ao cliente.
- Conversa pausada há > 6h sem msg do cliente → cron retoma sozinho.

---

## PR 4 — Conversas: 3 grupos + thread WhatsApp Web + botões UI

- [x] Sub-plan escrito? `docs/superpowers/plans/2026-05-04-pagina-tatuador-PR4-conversas.md`
- [x] PR criado e mergeado (PR #24, squash `90a8c2e` em 2026-05-04)
- **Bloqueado por:** PR 3 (kill-switch backend tem que existir) ✅ DONE PR #23

**Caminho:** `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR4-conversas.md`

**Escopo:**

1. **Frontend Painel Conversas:**
   - 3 tabs/collapsibles: "Conversas de hoje", "Aguardando orçamento", "Em negociação".
   - Sub-tab "Histórico" pra `fechado`.
   - Lista lateral de conversas (300px) com card: avatar, nome, preview msg, badge estado, timestamp.
   - Painel direito: thread completa (cliente esquerda, bot direita com avatar, tatuador direita com fundo distinto + 🔇 ícone).
   - Header da thread: nome cliente + estado_agente badge + botão "Assumir/Devolver".
   - Real-time via Supabase Realtime: subscribe em `conversas` e `mensagens` filtrado por tenant_id.
   - Lista paginada (30 inicial, "carregar mais").
   - Thread paginada (50 msgs inicial, "carregar mais antigas").

2. **Endpoints:**
   - `GET /api/conversas/list?tenant_id=X&grupo=hoje|aguardando|negociacao|historico&page=N` — retorna conversas + last_msg.
   - `GET /api/conversas/thread?conversa_id=Y&before_ts=Z` — retorna mensagens paginadas.

**Critério de DONE:**
- Tatuador abre Conversas, vê 3 grupos com counts corretos.
- Click em conversa abre thread, scroll mostra mensagens em ordem cronológica.
- Botão "Assumir" pausa via API → badge "🔇 Tatuador no comando" aparece em real-time.
- Botão "Devolver" retoma → bot manda msg configurada.
- Msg nova chega → aparece no topo da lista + na thread sem refresh.

---

## PR 5 — Portfólio: tabela nova, upload, chips de "estilo", favoritas, migração

- [ ] Sub-plan escrito? **NÃO**
- [ ] PR criado e mergeado

**Caminho:** `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR5-portfolio.md`

**Escopo:**

1. **Schema:**
   - CREATE TABLE `portfolio_fotos` (id uuid, tenant_id, storage_path, nome_arquivo_original, estilos text[], is_favorita bool, ordem int, size_bytes int, created_at).
   - 3 indexes: tenant, favorita parcial, gin estilos.

2. **Supabase Storage:**
   - Bucket `portfolio` (privado, signed URLs).
   - Path: `{tenant_id}/{photo_id}.{ext}`.
   - Image transformation via URL params (?width=800&quality=80).

3. **Frontend Painel Portfólio:**
   - Zona "Favoritas" (até 10, drag-to-reorder).
   - Galeria geral com filtro por estilo (chips no topo com count).
   - Drag-drop upload area + botão "Escolher arquivos".
   - Modal pós-upload "Que estilo é essa tatuagem? (opcional)" com chips dos `estilos_aceitos` + chip "+ Outro estilo" → input livre.
   - Auto-marcar chip se nome do arquivo bate com estilo (regex `[a-z]+` no nome lowercase).
   - Banner de migração se `tenants.portfolio_urls.length > 0`.

4. **Endpoints:**
   - `POST /api/portfolio/upload` — recebe multipart, valida 5MB max, JPEG/PNG/WebP, salva no Storage, cria linha em `portfolio_fotos`. Aceita `estilos[]` e `is_favorita` no body.
   - `GET /api/portfolio/list?tenant_id=X&estilo=Y` — retorna lista com signed URLs.
   - `POST /api/portfolio/update-foto?id=Z` — edita estilos, is_favorita, ordem.
   - `DELETE /api/portfolio/delete-foto?id=Z` — remove do Storage + DB.
   - `POST /api/portfolio/migrate-urls` — itera `portfolio_urls`, baixa cada URL, faz upload no Storage, cria linha `portfolio_fotos`, deleta do array.

5. **Bot integration:**
   - Tool nova ou patch em prompt Coleta/Exato: quando cliente pede portfólio, bot chama `dados_portfolio` com filtro estilo. Backend retorna 2-3 signed URLs. Bot manda via `sendMedia` Evolution.

**Critério de DONE:**
- Tatuador faz drag-drop de 5 fotos com nomes diversos, modal abre, chips pré-marcados quando nome bate.
- Foto marcada como favorita aparece na zona Favoritas, drag reordena.
- Filtro por estilo no topo funciona.
- Banner de migração mostra contagem correta, click migra todas.
- Bot manda mídia inline (não link) em conversa de teste.

---

## PR 6 — Agenda: Google Calendar OAuth + free-busy + criar evento

- [ ] Sub-plan escrito? **NÃO**
- [ ] PR criado e mergeado

**Caminho:** `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR6-agenda.md`

**Escopo:**

1. **Schema:**
   - CREATE TABLE `google_oauth_tokens` (tenant_id PK, refresh_token, access_token, expires_at, scope, conectado_em).
   - CREATE TABLE `agendamentos_google` (id, tenant_id, conversa_id, google_event_id, google_calendar_id, inicio, fim, cliente_nome, status).
   - 1 index: tenant + inicio.

2. **Configs novas em `tenants` ou `config_agendamento`:**
   - `buffer_minutos` (int default 30).
   - `janela_visibilidade_dias` (int default 14).
   - `google_calendar_destino` (text default 'primary').
   - `google_event_color_id` (int default 2).

3. **Endpoints OAuth:**
   - `GET /api/google-oauth/start?tenant_id=X&studio_token=Y` → redirect pra Google consent (escopo `https://www.googleapis.com/auth/calendar`).
   - `GET /api/google-oauth/callback?code=Z&state=...` → troca code por tokens, salva em `google_oauth_tokens`, redirect pra Settings → Integrações.
   - `POST /api/google-oauth/disconnect` → DELETE `google_oauth_tokens`.

4. **Endpoints Agenda (chamados pelo bot):**
   - `GET /api/agenda/free-busy?tenant_id=X&from=ISO&to=ISO` → consulta freeBusy do Google, considera horario_funcionamento, duracao_sessao, buffer. Retorna slots disponíveis.
   - `POST /api/agenda/create-event` body `{tenant_id, conversa_id, inicio, fim, cliente_nome}` → cria event no Google + insert em `agendamentos_google`.
   - `DELETE /api/agenda/cancel-event?id=Z` → DELETE Google + UPDATE status.

5. **Middleware refresh token:**
   - `functions/_lib/google-token.js`: fn `getValidAccessToken(tenant_id)`. Se `expires_at < now() + 5min`, refresca via `refresh_token`. Se refresh falhar (revogado), marca tokens inválidos.

6. **Frontend Painel Agenda:**
   - Banner status conexão Google (verde/vermelho).
   - 4 configs novas (4 inputs/selects).
   - 3 configs migradas do Agente: Horário funcionamento (JSON v1, UI visual v2), Duração padrão, Sinal %.
   - View: calendário visual mensal (lib `fullcalendar` standalone ou simples) + lista próximos 10 agendamentos abaixo.
   - Click em evento → mostra detalhes + link pra conversa.

7. **Bot integration:**
   - Patch em prompt Coleta `escolhendo_horario`: chama `consultar_horarios` (nova tool ou endpoint) que internamente chama `/api/agenda/free-busy`. Bot oferece 2-3 slots ao cliente.
   - Quando cliente aceita slot: chama `criar_agendamento` (tool) → endpoint cria evento.

**Critério de DONE:**
- Tatuador clica "Conectar Google Calendar" em Settings, OAuth flow funciona, status fica verde.
- Tatuador edita as 4 configs, save persiste.
- Calendário visual no painel renderiza eventos do calendário escolhido.
- Em conversa de teste: bot oferece slots reais (livres na agenda do tatuador), cliente aceita, evento criado no Google Calendar com cor correta.
- Refresh token funciona em call após access_token expirar.

---

## PR 7 — Sugestões: tabela, hero pessoal, 4 categorias, histórico, view admin

- [ ] Sub-plan escrito? **NÃO**
- [ ] PR criado e mergeado

**Caminho:** `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR7-sugestoes.md`

**Escopo:**

1. **Schema:**
   - CREATE TABLE `sugestoes_tatuador` (id, tenant_id, categoria, texto, screenshot_storage_path, status, resposta_admin, created_at, responded_at).
   - 2 indexes: tenant_created_desc, status_created_desc.
   - Bucket Storage `feedback` privado.

2. **Frontend Painel Sugestões:**
   - Hero header com emoji 💡, título, subtítulo personalizado.
   - Bloco "Como funciona" com 3 passos.
   - Caixa de envio: 4 chips de categoria (1 obrigatório), textarea (min 10 chars), botão anexar screenshot, botão Enviar.
   - Lista "Minhas sugestões" ordenada DESC: card com badge status colorido + categoria chip + timestamp + texto + bloco resposta inline (se houver).

3. **Endpoints:**
   - `POST /api/sugestoes/create` body `{categoria, texto, screenshot_path?}` → INSERT row.
   - `GET /api/sugestoes/list-mine?tenant_id=X` → SELECT WHERE tenant_id ORDER BY created_at DESC.
   - `POST /api/sugestoes/upload-screenshot` → multipart, salva em bucket `feedback/{tenant_id}/{uuid}.{ext}`.

4. **Admin view (`admin.html`):**
   - Tab "Sugestões" listando todas (filtro por status, categoria, tenant).
   - Click expande: editar `status`, escrever `resposta_admin`, opcional notificar tenant via email/push.

**Critério de DONE:**
- Tatuador escreve sugestão, anexa screenshot, envia → aparece em "Minhas sugestões" com status "ENVIADA".
- Admin (Leandro) abre admin.html, vê sugestão, marca "EM ANÁLISE" + escreve resposta + status "IMPLEMENTADA".
- Tatuador volta no painel, vê resposta inline + status "IMPLEMENTADA" verde.

---

## PR 8 — Suporte: painel próprio com FAQ produto + Falar com Leandro

- [ ] Sub-plan escrito? **NÃO**
- [ ] PR criado e mergeado

**Caminho:** `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR8-suporte.md`

**Escopo:**

1. **Frontend Painel Suporte:**
   - FAQ accordion com 10-15 perguntas curadas (sobre o InkFlow, não sobre o estúdio do cliente).
   - Search box no topo (filtro client-side).
   - Botão "Falar com Leandro" → abre WhatsApp com texto pré-preenchido `https://wa.me/55XXXXXXXXXXX?text=...`.
   - Placeholders pra "Tutoriais em vídeo" (3 cards "Em breve").

2. **Backend:**
   - Conteúdo das FAQs hardcoded em `studio.html` (não vale CMS pra v1).

**Critério de DONE:**
- Painel abre, 10+ FAQs renderizadas em accordion.
- Search filtra perguntas em tempo real.
- Botão "Falar com Leandro" abre WhatsApp do suporte.

---

## PR 9 — Settings: 6 seções + Cancelar plano (MP-first) + Deletar conta (3 etapas)

- [ ] Sub-plan escrito? **NÃO**
- [ ] PR criado e mergeado
- **Bloqueado por:** PR 6 (Settings → Integrações lista Google Calendar)

**Caminho:** `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR9-settings.md`

**Escopo:**

1. **Frontend Painel Settings:**
   - Accordion com 6 seções (Estúdio, Conta, Plano e cobrança, Notificações, Integrações, Zona de perigo).
   - Cada seção com seus campos editáveis + botão Save por seção.
   - Notificações: toggles + status Telegram + botão reconectar.
   - Integrações: status Google Calendar + WhatsApp Evolution + reconectar.
   - Zona de perigo: 2 ações (Exportar dados LGPD, Deletar conta).

2. **Endpoints:**
   - `POST /api/settings/update-estudio` body `{cep, cidade, endereco, numero, nome_estudio}` — usa update-tenant existente.
   - `POST /api/settings/update-conta` body `{nome, email, telefone}` — idem.
   - `POST /api/settings/change-password` — Supabase Auth `updateUser({password})`.
   - `POST /api/settings/update-notifications` body `{email_enabled, push_enabled}`.
   - `POST /api/settings/cancel-plan` — fluxo crítico (ver §3 abaixo).
   - `POST /api/settings/delete-account` — fluxo crítico (ver §4 abaixo).
   - `POST /api/settings/export-data` — gera ZIP, manda email com signed URL 24h.

3. **Cancelar plano (MP-first, abort em falha):**
   ```javascript
   // 1. Chama MP cancel
   const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${subId}`,
     { method: 'PUT', headers, body: JSON.stringify({ status: 'cancelled' }) });
   if (!mpRes.ok) return { error: 'mp_cancel_failed', detail };
   // 2. Atualiza DB
   await db.tenants.update(id, { status_pagamento: 'cancelado', ativo_ate: tenant.proxima_cobranca });
   // 3. Email
   await sendEmail(...);
   ```
   - Modal UI antes de chamar: 3 botões (Falar com suporte / Pausar [v2] / Cancelar mesmo assim).

4. **Deletar conta (3 etapas UI + ordem backend):**
   - **Etapa A** (lista do que apaga + aviso billing).
   - **Etapa B** (botões: Falar com suporte / Exportar dados / Continuar).
   - **Etapa C** (input "CANCELAR" case-insensitive + botão final vermelho).
   - Backend ordem: cancela MP (abort se falhar) → deleta Evolution instance (warning se falhar mas segue, MP já cancelado) → deleta storage portfolio + feedback → anonimiza linhas tenants/conversas + DELETE portfolio_fotos/agendamentos/google_oauth/sugestoes.
   - Sets `tenants.deletado_em = now()`, `ativo = false`, `status_pagamento = 'deletado'`.

**Critério de DONE:**
- Tatuador edita campos em todas 6 seções, save funciona.
- "Cancelar plano" em ambiente de staging com Mercado Pago test: cancel chama API, DB atualizado, email recebido.
- "Deletar conta": 3 etapas UI funcionam, palavra `CANCELAR` exigida, MP cancel chamado primeiro, dados anonimizados, conta inacessível depois.
- Falha simulada na API MP (stubbed) → fluxo aborta sem mexer DB, mostra erro user-friendly.
- Exportar dados gera ZIP recebido por email.

---

## Princípios gerais (todos os PRs seguem)

- **TDD onde aplicável:** rotas backend testadas antes de implementar lógica, fluxos críticos (cancel plan, delete account) com testes de integração simulando falha de API externa.
- **Snapshot tests pra prompts:** se PR mexe em prompt, gerar baseline + diff explícito.
- **Frequent commits:** 1 commit por step do sub-plan (não acumular changes grandes).
- **Toggle pill global:** após PR 1 implementar, todos os PRs subsequentes usam, nunca `<input type=checkbox>`.
- **Linguagem leiga:** auditar textos por jargão (`tag`, `metadata`, `webhook`, `endpoint`) antes de mergear.
- **Sem feature flags:** PRs ligam tudo direto. Foundation (PR 1) garante que sidebar tem placeholders pra painéis ainda não shipados — usuário vê "Em breve" em vez de quebrar.
- **Aplicar migration SQL no Supabase Dashboard manual** após merge (Leandro). Plano de cada PR inclui o SQL pronto pra colar.
- **Telegram bot token + Google OAuth credentials** já no Bitwarden Secrets (project `inkflow`). Plans referenciam as keys, não os valores.

---

## Checklist mestre

- [x] PR 1 — Foundation (PR #21)
- [ ] PR 2 — Dashboard
- [x] PR 3 — Agente + kill-switch backend (PR #23)
- [x] PR 4 — Conversas (PR #24)
- [ ] PR 5 — Portfólio
- [ ] PR 6 — Agenda
- [ ] PR 7 — Sugestões
- [ ] PR 8 — Suporte
- [ ] PR 9 — Settings (cancelar + deletar)

Marcar conforme cada PR for mergeado em main.

---

## Como gerar cada sub-plan

Quando for executar PR N:

1. Invocar `superpowers:writing-plans` com o seguinte input:
   > "Escreve plano detalhado pro PR N da refatoração da página do tatuador. Spec mestre: `docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md`. Plano-mestre: `docs/superpowers/plans/2026-05-03-pagina-tatuador-MASTER.md`. Escopo: ler seção 'PR N — ...' do plano-mestre. Salvar em `docs/superpowers/plans/2026-05-03-pagina-tatuador-PR<N>-<nome>.md`."

2. Sub-plan deve ter:
   - Header obrigatório (Goal, Architecture, Tech Stack)
   - File structure (lista de arquivos a criar/modificar)
   - Tasks bite-sized (2-5 min cada step)
   - Código completo em todo step (sem placeholders)
   - Test-first onde possível
   - 1 commit por step
   - Self-review antes de salvar

3. Após sub-plan salvo: marcar `[x]` em "Sub-plan escrito?" deste master plan.

4. Executar via `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans`.

5. Após PR mergeado: marcar `[x]` em "PR criado e mergeado" + atualizar checklist mestre.

---

## Out of scope deste plano-mestre (já documentado na spec)

- Modo Exato refactor completo (Calculadora InkFlow detalhada) — spec separada futura
- Cal.com, fallback agenda interna, multi-tatuador, push real Web Push API, vídeos tutoriais, app nativo
- Re-design Home/Funcionalidades/Preços (`index.html`) — Fase 2 SEO
