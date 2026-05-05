---
title: Plano Premium "Gestão de Estúdio" — Design
date: 2026-05-03
status: design
supersedes: null
related:
  - docs/canonical/stack.md
  - docs/canonical/flows.md
  - docs/superpowers/specs/2026-05-02-modo-coleta-v2-principal.md
  - docs/superpowers/specs/2026-05-03-pagina-tatuador-refactor-design.md
---

# Plano Premium "Gestão de Estúdio" — Design

## 1. Resumo executivo

Novo tier comercial **InkFlow Pro** (e variante **Pro + Ads**) que estende o produto-base (Modo Coleta v2) com:

1. **WhatsApp deep** — personalização de IA, templates aprovados, broadcasts, catálogo, follow-ups, lembretes — via **stack híbrida** Evolution API (mantém app mobile do tatuador) + WhatsApp Cloud API oficial (templates HSM, broadcasts, catálogo nativo, zero risco de ban).
2. **Gestão de Meta Ads (variante Pro + Ads)** — campanhas Facebook/Instagram + catálogo + retargeting + Click-to-WhatsApp Ads via **MCP oficial Meta** (`mcp.facebook.com/ads`, lançado em open beta 29/04/2026, 29 ferramentas, OAuth nativo).
3. **Modelo híbrido de entrega** — onboarding **Done-For-You (DFY)** de 1–2h presencial/remoto pago como setup fee; manutenção **self-service** no painel após handoff.

Fora de escopo na v1: financeiro do estúdio (caixa/comissões), inventário, multi-artista profundo, site/portfolio, sync Google My Business. Reservados pra Pro v2 ou tier "Estúdio Gerenciado" futuro.

## 2. Motivação

- **Tração comercial:** plano único atual (Modo Coleta v2) não captura disposição-a-pagar de estúdios maiores que querem mais que conversa-base.
- **Defensibilidade:** WhatsApp + Meta Ads sob mesma stack Claude/MCP é difícil pra concorrente local replicar — exige conhecimento de Anthropic ecosystem.
- **Janela de oportunidade:** MCP oficial Meta lançou em 29/04/2026. Quem encaixar primeiro no nicho tatuador BR captura share antes de chegar concorrência.
- **Risco do Evolution puro:** plano premium em cima de stack que pode banir conta do cliente é frágil. Cloud API oficial absorve as features mais arriscadas (broadcasts, marketing).

## 3. Estrutura de tiers proposta

| Tier | Posicionamento | Setup fee | Mensalidade | Gasto Meta Ads | Capacity (gestor) |
|---|---|---|---|---|---|
| **Basic** (mantém atual) | Modo Coleta v2 + Evolution + IA básica + dashboard | — | R$ 97/mês (ou definido) | n/a | unlimited (self-service) |
| **Pro** | Basic + WhatsApp deep + DFY onboarding | R$ 1.500 | R$ 397–597/mês | n/a | ~30 estúdios/gestor |
| **Pro + Ads** | Pro + gestão Meta Ads via MCP | R$ 2.500 | R$ 897–1.497/mês | **pago pelo cliente direto à Meta** | **5–10 estúdios/gestor** |

Faixas de mensalidade são dependentes de volume (conversas/mês, R$ ads/mês). Tier final ajustado após beta.

## 4. Catálogo de features — matriz dificuldade × custo

Eixos:
- **Dificuldade implementação (Easy/Medium/Hard)** — esforço pra construir e manter.
- **Custo operacional recorrente (Low/Medium/High)** — custo por cliente/mês: APIs, infra, tempo humano.

### 4.1 Bloco WhatsApp deep (Pro + Pro+Ads)

| # | Feature | Dificuldade | Custo op | Notas |
|---|---|---|---|---|
| W1 | IA com tom de voz personalizado (prompt afinado no DFY) | Easy | Low | Já tem prompt-base; DFY ajusta |
| W2 | Lembretes automáticos de agendamento (24h / 1h antes) | Easy | Low | n8n já roda crons |
| W3 | Follow-up pós-tatuagem (D+1, D+7, D+15, D+30) | Easy | Low | Templates fixos + cron |
| W4 | Coleta de avaliação pós-serviço (NPS) | Easy | Low | Mensagem única + storage |
| W5 | Tags/segmentação de clientes no painel | Easy | Low | Schema Supabase + UI |
| W6 | Relatório semanal automatizado pro tatuador | Easy | Low | Cron + Claude resumo |
| W7 | Templates HSM aprovados Cloud API | Medium | Medium | Processo Meta + custo por msg |
| W8 | Broadcasts segmentados (Cloud API) | Medium | Medium | Categoria marketing ~R$0,15/msg |
| W9 | Catálogo nativo WhatsApp (Cloud API) | Medium | Low | Sync com serviços do estúdio |
| W10 | Botões interativos / quick replies (Cloud API) | Medium | Low | Migração parcial fluxos |
| W11 | Auto-reativação clientes inativos (90+ dias) | Medium | Medium | Segmentação + broadcast |
| W12 | Encaminhamento humano com handoff IA→humano | Medium | Low | Flag no painel + notificação |
| W13 | Análise de sentimento + alertas | Medium | Low | Claude já roda |
| W14 | Calendar integration (Google Cal, já no roadmap) | Medium | Low | Refactor página tatuador 03/05 cobre |
| W15 | Templates dinâmicos com merge variables | Medium | Low | Painel + render server-side |
| W16 | Inbox compartilhada multi-atendente | Hard | Medium | UI + Realtime; v2 |

### 4.2 Bloco Meta Ads (Pro + Ads apenas)

| # | Feature | Dificuldade | Custo op | Notas |
|---|---|---|---|---|
| A1 | Click-to-WhatsApp Ads (CTWA) | Easy | Low | Meta nativo; conecta ao número Cloud API |
| A2 | Diagnóstico semanal de campanhas (relatório auto) | Easy | Low | MCP query + Claude resumo |
| A3 | Criação de campanhas via MCP | Easy | Medium | Tempo humano DFY/manutenção |
| A4 | Setup Meta Business Manager + verificação | Medium | Low | Step DFY ~30min |
| A5 | Conexão Pixel + Conversions API | Medium | Low | CF Pages já tem doc |
| A6 | Audiences (lookalikes baseados em clientes) | Medium | Low | MCP audience tools |
| A7 | Pause/scaling automático baseado em ROAS | Medium | Low | Workflow n8n + MCP |
| A8 | Retargeting de visitantes do funil InkFlow | Medium | Low | Pixel + custom audience |
| A9 | Criativos sugeridos via Claude (briefing → variações) | Medium | Medium | Tempo humano + revisão |
| A10 | Catálogo Meta sincronizado com WhatsApp | Hard | Low | Catalog management cross-platform |

### 4.3 Bloco gestão estúdio adjacente (limitado na v1)

| # | Feature | Dificuldade | Custo op | Notas |
|---|---|---|---|---|
| G1 | Métricas conversão coleta→fechamento | Medium | Low | Já tem dados; precisa UI |
| G2 | CRM cliente final (lista, filtros, histórico básico) | Medium | Low | Refactor página tatuador 03/05 cobre parcial |
| G3 | Histórico tatuagem com fotos | Hard | Medium | Storage + UI; v2 |
| G4 | NPS/Google My Business sync | Medium | Low | Roadmap futuro |

### 4.4 Recomendação de fases

**Fase 1 (MVP Pro v1 — 4–6 semanas):** W1, W2, W3, W4, W5, W6, W12, W13, W14, G1, G2 (parcial). Tudo Easy/Medium baixo custo.

**Fase 2 (Pro v1.1 + Cloud API — 3–4 semanas):** W7, W8, W9, W10, W11, W15. Habilita Cloud API híbrida.

**Fase 3 (Pro+Ads MVP — 4–6 semanas):** A1, A2, A3, A4, A5, A6, A8. MCP Meta integrado.

**Fase 4 (extensões):** W16 (inbox), A7, A9, A10, G3, G4.

## 5. Stack técnica

### 5.1 Existente (mantém)
- **Evolution API self-hosted (Vultr)** — conversação diária, app mobile do cliente intacto, número original.
- **n8n** — orquestração workflows, crons.
- **Supabase** — Postgres, Auth, Storage.
- **Cloudflare Pages Functions** — backend `/api/*`.
- **Claude API** — IA conversacional.

### 5.2 Adicionado para Pro
- **WhatsApp Cloud API (Meta oficial)** — segundo número ou número-paralelo apenas pra envio de templates HSM e broadcasts. Não substitui Evolution; **complementa**. Cliente continua atendendo no app do número Evolution dia-a-dia.
  - Decisão: usar **mesmo número** via migração do tipo "On-Premises → Cloud API" só se o cliente concordar; caso contrário, usar **número secundário** dedicado a marketing.
  - Custo Meta: R$ 0,03 conversa utility BR / R$ 0,12–0,15 conversa marketing BR (aprox; valida na docs Meta antes do go-live).
- **Painel Pro** — UI nova/extendida no `studio.html` (ou subpágina) pra: tags, broadcasts, templates, catálogo, follow-ups configuráveis.

### 5.3 Adicionado para Pro + Ads
- **Meta Ads MCP oficial** (`mcp.facebook.com/ads`) — InkFlow conecta via OAuth na conta Meta do cliente (cliente autoriza como Partner).
- **Dashboard de campanhas** — UI no painel mostrando KPIs lidos via MCP (gasto, ROAS, CTR, CPM, conversas iniciadas).
- **Pixel Meta + Conversions API** — instalado no funil InkFlow (`/api/track-*`).
- **Workflows n8n** pra automação de pause/scale e relatórios.

### 5.4 Diagrama lógico

```
Cliente final do estúdio
  │
  ├── (conversa diária) → Evolution → n8n → Claude → resposta
  │
  ├── (lembretes/broadcasts/templates) → Cloud API ← n8n cron
  │
  └── (clica em CTWA) ← Meta Ads campaign ← Meta Ads MCP ← Painel/Claude

Tatuador (cliente InkFlow)
  │
  ├── App WhatsApp Business mobile (Evolution) — dia-a-dia
  ├── Painel InkFlow web — config de Pro/Pro+Ads, dashboards
  └── Telegram tatuador — orçamentos Modo Coleta (mantém)

InkFlow (operador)
  │
  ├── Claude Code com MCPs: Meta Ads, Cloud API (custom MCP), n8n, Supabase
  ├── Acesso delegado via Business Manager Partner do cliente
  └── Não toca em cartão Meta do cliente (cliente paga direto)
```

## 6. Modelo financeiro e contratual

### 6.1 Composição de receita InkFlow

| Item | Quem paga | Para quem | Frequência |
|---|---|---|---|
| Setup fee | Cliente (estúdio) | InkFlow | One-time, no contrato |
| Mensalidade Pro / Pro+Ads | Cliente | InkFlow | Recorrente (mensal) |
| Excedente conversas Cloud API | Cliente | InkFlow (que repassa Meta) | Mensal, conforme volume |
| Gasto em Meta Ads | Cliente | **Direto à Meta** (cartão do cliente) | Conforme campanha |
| Excedente uso (storage, etc.) | Cliente | InkFlow | Conforme contrato |

### 6.2 Por que ads NÃO passam pelo InkFlow

**Decisão arquitetural:** o cliente paga ads direto à Meta com cartão dele cadastrado na conta Meta dele. **InkFlow nunca toca em cartão de crédito de cliente, nunca repassa gasto de ads.**

Razões:
1. **Tributário/contábil** — repassar R$ de ads exige nota fiscal, gestão de impostos sobre intermediação. Inviável solo founder não-dev.
2. **Risco de inadimplência** — cliente cancela cartão, tu ficou no prejuízo até campanhas pausarem.
3. **Compliance LGPD/Meta** — repassar dados financeiros de cliente implica obrigações adicionais.
4. **Padrão de mercado** — agências de tráfego sérias cobram **só fee de gestão**; ads ficam no cartão do cliente.

### 6.3 Setup fee — o que cobre

DFY de 1–2h presencial/remoto:
- Treinar IA com tom do estúdio (W1)
- Configurar templates iniciais HSM (W7) — submeter pra aprovação Meta
- Verificar Meta Business Manager, instalar Pixel (A4, A5)
- Conectar MCP via OAuth do cliente
- Subir 1ª campanha CTWA (Pro+Ads) — A1
- Treinar tatuador no painel (30min)

### 6.4 Cláusulas contratuais essenciais

#### A. Propriedade dos assets
- **Cliente é dono** de: número WhatsApp, conta Meta Business, Pixel, criativos, base de clientes finais.
- **InkFlow é prestador de serviço** com acesso delegado revogável a qualquer tempo.
- No término do contrato, **InkFlow remove acessos em até 7 dias** e fornece export dos dados do cliente.

#### B. Acesso técnico
- Cliente adiciona InkFlow como **Partner no Business Manager** com permissões de Admin de Anúncios + Catálogo + WhatsApp.
- **Permissões revogáveis** — cliente pode remover InkFlow do BM a qualquer momento (pausa serviço imediato).
- Acesso a **Pixel** e **Conversions API token** via Business Manager.

#### C. Pagamento de ads (crítico)
- **Cliente cadastra cartão de crédito próprio na conta Meta**. Cobrança Meta vai direto pro cartão do cliente.
- **InkFlow não autoriza, não revisa, não absorve gastos com Meta**.
- InkFlow **gerencia campanhas dentro do orçamento autorizado pelo cliente** (limite mensal definido no contrato).
- Mudanças de orçamento exigem aprovação por escrito (e-mail/WhatsApp registrado) do cliente.

#### D. SLA
- **Pro:** suporte por chat até 24h úteis. Setup de novos broadcasts/templates em até 5 dias úteis.
- **Pro+Ads:** suporte 8h úteis. Relatório semanal de campanhas. Ajustes táticos (pause/scale) dentro de 24h da identificação.
- **Indisponibilidade:** uptime alvo 98% (já é o padrão InkFlow). Crítico Meta downtime fora do escopo.

#### E. Responsabilidade sobre resultado
- **InkFlow garante execução técnica e gestão diligente.**
- **InkFlow NÃO garante resultado de ads** (ROAS, CPL, vendas) — depende de criativo, oferta, mercado, sazonalidade. Cláusula obrigatória no contrato.
- Métricas de processo (entrega de relatórios, ajustes feitos, campanhas no ar) são SLA InkFlow. Métricas de outcome são responsabilidade compartilhada.

#### F. Conformidade
- **Cliente é responsável** por: legalidade de promoções, veracidade de preços/serviços anunciados, ToS Meta (não usar para spam), licenciamento de imagens dos criativos.
- **InkFlow orienta** sobre boas práticas WhatsApp (opt-in, frequência, categorias) e revisa criativos antes de subir.
- **LGPD:** Cliente é controlador dos dados dos clientes finais (consumidores do estúdio). InkFlow é operador. Termo de operador anexo.

#### G. Período mínimo e cancelamento
- **Período de fidelidade:** 6 meses (compensa setup fee subsidiado).
- **Cancelamento durante fidelidade:** multa proporcional ao restante do período × 50% da mensalidade.
- **Cancelamento após fidelidade:** aviso prévio de 30 dias.
- **Cancelamento por inadimplência InkFlow:** cliente pode rescindir sem multa após 15 dias de descumprimento de SLA.

#### H. Mudanças de plataforma
- Mudanças de política Meta/WhatsApp (banimento de feature, novos custos, etc.) podem afetar entrega.
- InkFlow notifica cliente em até 5 dias e ajusta plano dentro do escopo. Mudanças disruptivas (ex: Meta encerra MCP) podem exigir aditivo contratual.

## 7. Onboarding DFY — playbook resumido

**Pré-requisitos do cliente:**
- Conta WhatsApp Business já em uso ou número novo dedicado.
- Conta Meta Business Manager (cria-se durante o onboarding se não tiver).
- Cartão de crédito próprio aceito pela Meta (Pro+Ads).
- 1–2h disponíveis (síncronos).

**Fluxo:**

1. **Pre-call (30min antes, async):** cliente preenche form de descoberta — tom desejado, serviços/preços, FAQs comuns, fotos pra criativos, perfil ideal de cliente, orçamento mensal de ads.
2. **Call 1 (60min):** InkFlow guia setup do BM, instala Pixel, conecta MCP via OAuth, configura templates iniciais. Cliente vê tela compartilhada.
3. **Async (24–72h):** templates Meta passam por aprovação. InkFlow afina prompt de IA, sobe primeira campanha CTWA (Pro+Ads).
4. **Call 2 (30min):** treino do painel, demo de broadcasts/relatórios, handoff. Cliente faz primeira ação self-service supervisionado.
5. **Acompanhamento (semana 1–2):** check-in via WhatsApp interno + relatório do dia 7 + ajustes finos.

## 8. Riscos e mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| MCP Meta em open beta — quebra/muda API | Alto | Média | Versionar integração; ter fallback CLI; monitorar changelog Meta |
| Evolution bana conta do cliente | Alto | Média | Cloud API absorve features de risco (broadcasts); orientar cliente sobre boas práticas |
| Cliente desconfigura no painel e culpa InkFlow | Médio | Alta | Audit log de mudanças no painel + tela "quem fez o quê" + restore via histórico |
| Cliente cancela cartão Meta no meio do mês | Médio | Média | Alerta no dashboard quando saldo Meta < X; cláusula contratual cobrindo pausa |
| Acesso BM revogado acidentalmente | Médio | Média | Health-check semanal de acesso; alerta no painel se token expirou |
| Capacity do gestor (tu) esgota | Alto | Alta (após sucesso) | Hard limit 10 Pro+Ads/gestor; processo documentado pra contratar/treinar VA quando passar de 7 |
| Meta muda política de templates HSM | Médio | Média | Catálogo de templates aprovados com fallback; revisão trimestral |
| LGPD — incidente com dado de cliente final | Alto | Baixa | Processos auditores existentes + termo de operador + plano de resposta a incidente |

## 9. Decisões em aberto

- [ ] **Faixas de mensalidade exatas** — definir após pesquisa com 5–10 estúdios (R$ 397/597 vs R$ 597/897 etc).
- [ ] **Ads: número WhatsApp dedicado vs migração do principal** — decidir caso a caso ou padrão? Recomendação inicial: **número secundário** pra minimizar atrito.
- [ ] **Limite de conversas Cloud API incluso** na mensalidade base — sugestão inicial: 1.000 conversas/mês inclusas, excedente repassado.
- [ ] **Pricing setup fee** — R$ 1.500 / R$ 2.500 são chutes; calibrar contra valor percebido + tempo gasto real.
- [ ] **Capacity humana real** — testar com 3 estúdios beta pra medir tempo médio de gestão por estúdio antes de fixar limite.
- [ ] **Quem revisa contrato jurídico** — recomendação: contratar advogado especialista em SaaS+LGPD pra revisar Cláusulas D, E, F, H.

## 10. Métricas de sucesso

**Beta (primeiros 3 estúdios, 60 dias):**
- 100% dos clientes completam onboarding DFY no SLA (≤ 2 calls em ≤ 1 semana).
- ≥ 80% NPS pós-onboarding.
- ≥ 50% retenção D+30; ≥ 70% retenção D+60.
- Pro+Ads: pelo menos 1 campanha ativa em D+14, com relatório semanal entregue 100% dos casos.
- Tempo médio de gestão/cliente medido — base pra ajustar capacity.

**GA (6 meses pós-launch):**
- ≥ 10 estúdios em Pro, ≥ 5 em Pro+Ads.
- LTV/CAC ≥ 3.
- Churn mensal < 5%.

## 11. Roadmap de implementação (alto nível)

| Fase | Duração | Conteúdo |
|---|---|---|
| Fase 0 — Comercial/jurídico | 2 semanas | Spec aprovada → contratos redigidos (advogado) → landing page Pro → form de interesse |
| Fase 1 — MVP Pro | 4–6 semanas | W1, W2, W3, W4, W5, W6, W12, W13, W14, G1, G2 (parcial) — sem Cloud API ainda |
| Fase 2 — Cloud API integrada | 3–4 semanas | W7, W8, W9, W10, W11, W15 |
| Fase 3 — MVP Pro+Ads | 4–6 semanas | A1–A8 + dashboard campanhas |
| Fase 4 — Beta com 3 estúdios | 60 dias | Validação e ajuste de pricing/capacity |
| Fase 5 — GA + extensões | ongoing | W16, A9, A10, G3, G4 |

## 12. Dependências externas

- **Aprovação Meta** dos templates HSM iniciais (24–72h por template).
- **MCP Meta GA** (atualmente open beta) — recomendado aguardar antes de lançar Pro+Ads em escala, OU lançar com cláusula contratual cobrindo eventual descontinuação.
- **Verificação Meta Business** dos clientes — pode levar 1–7 dias por cliente (gargalo conhecido).
- **Advogado** revisar contrato (Fase 0).

## 13. Próximos passos pós-aprovação desta spec

1. Transição pro skill `superpowers:writing-plans` pra criar plano de implementação detalhado da Fase 1.
2. Em paralelo: redigir contratos (Fase 0) — pode ser sub-projeto separado com advogado.
3. Validar matriz de features 4.1–4.3 com 2–3 tatuadores reais antes de investir tempo em construção (entrevistas).

---

**Fonte da janela de oportunidade Meta MCP (29/04/2026):**
- [Meta opens its ad system to Claude and ChatGPT with new AI connectors](https://ppc.land/meta-opens-its-ad-system-to-claude-and-chatgpt-with-new-ai-connectors/)
- [Official Meta Ads MCP for Claude: Complete Guide to All 29 Tools (April 2026)](https://pasqualepillitteri.it/en/news/1707/official-meta-ads-mcp-claude-29-tools-2026)
- [Anthropic invests $100 million into the Claude Partner Network](https://www.anthropic.com/news/claude-partner-network)
