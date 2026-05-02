# InkFlow — Plano de Reestruturação do Site (SEO + Multi-página)

**Data:** 2026-05-02
**Autor:** Leandro Marques (planejado com Claude Code)
**Status:** Aprovado para execução faseada
**Objetivo:** Reestruturar site monolítico em arquitetura multi-página otimizada pra tráfego orgânico Google + facilitar uso do Claude Design pra cada página.

---

## 1. Realidade dura sobre SEO (ler antes de tudo)

SEO orgânico tem 3 pilares e nenhum sozinho funciona:

1. **Estrutura técnica** (URLs limpas, meta tags, sitemap, schema, velocidade) — 20% do esforço, mandatório
2. **Conteúdo substantivo e original** (artigos, guias, FAQs longas, +800 palavras únicas por página) — 50% do peso real
3. **Backlinks** (sites confiáveis linkando pra ti) — 30% do peso, off-page, demora 3-6 meses

Se fizer só #1 (estrutura): aparece SÓ pra quem busca "InkFlow" literalmente. Pra rankear "automação WhatsApp tatuagem" precisa dos 3.

**Tempo realista até primeiros resultados orgânicos:** 3-6 meses depois de tudo no ar + blog ativo + 2-3 backlinks de qualidade.

**Esse documento cobre #1 e #2.** Backlinks (#3) é trabalho contínuo de outreach (parcerias, ProductHunt BR, comunidades de tatuadores, listas de SaaS brasileiros) — fica fora do escopo técnico.

---

## 2. Pesquisa de Keywords (público brasileiro de tatuadores)

### 2.1 Keywords-alvo PRIMÁRIAS (volume médio-alto, intenção comercial)

| Keyword | Intenção | Página alvo | Concorrência |
|---|---|---|---|
| sistema para tatuador | Comercial | `/` | Média |
| agenda online tatuagem | Comercial | `/funcionalidades` | Média |
| automação WhatsApp tatuagem | Comercial | `/` | Baixa (oportunidade) |
| atendimento automático tatuador | Comercial | `/funcionalidades` | Baixa |
| chatbot WhatsApp estúdio tatuagem | Comercial | `/modos` | Baixa |
| gestão estúdio tatuagem | Comercial | `/funcionalidades` | Média |
| software para estúdio tatuagem | Comercial | `/` | Baixa |

### 2.2 Keywords-alvo SECUNDÁRIAS (long-tail, alta conversão)

| Keyword | Intenção | Página alvo |
|---|---|---|
| como organizar agenda tatuagem | Informacional → Comercial | Blog |
| como cobrar sinal tatuagem | Informacional | Blog |
| calculadora orçamento tatuagem | Informacional | Blog (lead magnet) |
| WhatsApp business para tatuador | Informacional | Blog |
| como precificar tatuagem | Informacional | Blog (alto volume) |
| tabela de preços tatuagem | Informacional | Blog (alto volume) |
| chatbot grátis WhatsApp tatuagem | Comercial | `/precos` (trial) |
| sistema agendamento estúdio | Comercial | `/funcionalidades` |
| tatuador perde cliente WhatsApp | Problema | Blog (PAS framework) |

### 2.3 Keywords COMPARATIVAS (intenção de compra alta)

| Keyword | Página alvo |
|---|---|
| InkFlow vs planilha agenda tatuagem | `/comparar/inkflow-vs-planilha` |
| InkFlow vs secretária estúdio | `/comparar/inkflow-vs-secretaria` |
| sistema tatuador grátis vs pago | Blog |
| chatbot WhatsApp manual vs automático | Blog |

### 2.4 Keywords de MARCA (defensiva)

- "inkflow"
- "inkflow brasil"
- "inkflow tatuagem"
- "inkflow leandro"
- "inkflow é confiável"

Essas devem ranquear posição #1 trivialmente. Garantir que home + páginas institucionais (sobre, contato) capturam essas buscas.

---

## 3. Arquitetura de Páginas (Mapa Completo)

### 3.1 Estrutura final de URLs

```
inkflowbrasil.com
│
├── /                                    (Home)
├── /funcionalidades                     (Features detalhadas)
├── /precos                              (Pricing + trial CTA)
├── /modos                               (Faixa, Exato, Coleta — diferencial)
├── /como-funciona                       (3 passos visuais)
├── /faq                                 (15-20 perguntas)
├── /sobre                               (Quem é o InkFlow)
├── /contato                             (Form + WhatsApp direto)
├── /termos                              ✅ (já existe)
├── /privacidade                         (LGPD + cookies)
│
├── /blog                                (Hub artigos)
│   ├── /como-precificar-tatuagem
│   ├── /como-cobrar-sinal-tatuagem
│   ├── /whatsapp-business-tatuador-guia-completo
│   ├── /como-organizar-agenda-estudio-tatuagem
│   ├── /chatbot-whatsapp-tatuagem-vale-a-pena
│   ├── /atendimento-automatico-estudio-tatuagem
│   ├── /precificacao-tatuagem-faixa-vs-fechado
│   ├── /como-perder-menos-cliente-whatsapp-tatuagem
│   ├── /sistemas-de-agenda-tatuagem-comparativo
│   └── /lgpd-para-tatuadores-o-que-precisa-saber
│
├── /comparar
│   ├── /inkflow-vs-planilha
│   └── /inkflow-vs-secretaria
│
├── /onboarding                          (Split de onboarding.html — área logada, noindex)
│   ├── /onboarding/inicio
│   ├── /onboarding/agente
│   ├── /onboarding/precificacao
│   ├── /onboarding/modos
│   ├── /onboarding/whatsapp
│   └── /onboarding/finalizar
├── /studio                              (Studio admin — logado, noindex)
├── /admin                               (Admin geral — logado, noindex)
└── /reconnect                           (Reconnect WhatsApp — logado, noindex)
```

### 3.2 Páginas-chave (especificações COMPLETAS)

Pra cada página: **URL, Title, Meta Description, H1, Keywords, Schema.org type, Brief pra Claude Design, Brief de Conteúdo.**

---

## 4. Especificação Página por Página

### 4.1 `/` — Home

**Title (50-60 chars):**
```
InkFlow — Atendimento WhatsApp Automático pra Tatuadores
```

**Meta description (150-160 chars):**
```
Bot que atende, orça e agenda no WhatsApp do teu estúdio 24h. Trial grátis 7 dias. Sem cartão. Pra tatuadores brasileiros que perdem cliente por demora.
```

**H1:**
```
Teu WhatsApp atende, orça e agenda — mesmo enquanto tu tatua.
```

**Sub-headline (H2):**
```
Bot inteligente que conversa com cliente, calcula preço da tatuagem, agenda na tua agenda e cobra sinal automático. Tu só faz a arte.
```

**Keywords:**
- Primária: `sistema para tatuador`, `automação WhatsApp tatuagem`
- Secundárias: `agenda online tatuagem`, `bot WhatsApp tatuador`

**Schema.org:** `SoftwareApplication` + `Organization`

**Brief pra Claude Design:**

```
Página HOME do InkFlow — landing principal. Single page focada 100% em conversão pra trial grátis.

Estrutura (em ordem, scroll vertical):

1. NAV simples — logo InkFlow + 5 links (Funcionalidades, Modos, Preços, Blog, Entrar) + CTA principal "Começar grátis"

2. HERO — fundo escuro elegante (preto/cinza grafite), headline serif gigante "Teu WhatsApp atende, orça e agenda — mesmo enquanto tu tatua." + sub em sans, CTA primário "Começar grátis 7 dias" + secundário "Ver como funciona". Mock visual à direita: print de conversa WhatsApp com bot respondendo (mockup honesto, não 3D flutuando).

3. SEÇÃO PROBLEMA — 3 cards com ícone simples (linha) + título + 1 frase:
   - "Atende fora de hora?" (cliente manda 22h, tu só vê de manhã, ele já fechou com outro)
   - "Perde cliente que pergunta preço?" (não responder = -30% conversão)
   - "Esquece de cobrar sinal?" (cliente desmarca sem custo, tua agenda fura)

4. SEÇÃO COMO FUNCIONA — 3 passos numerados visuais:
   1. Conecta teu WhatsApp via QR code (10 min)
   2. Define como teu agente responde (modo, tom, regras)
   3. Bot atende, agenda e cobra. Tu só faz a arte.

5. SEÇÃO MODOS DE PRECIFICAÇÃO — 3 cards lado a lado (Faixa / Exato / Coleta) com micro-explicação de cada + CTA "Ver detalhes" → /modos

6. SEÇÃO SOCIAL PROOF — banner com logos de estúdios (placeholder se ainda não tiver clientes; remove se vazio) + 1-2 quotes em destaque

7. SEÇÃO PRICING (resumida) — 3 planos card horizontal + CTA "Ver detalhes" → /precos

8. FAQ RÁPIDA — 5 perguntas top em accordion + link "Ver todas" → /faq

9. CTA FINAL — fundo destacado, headline "Pronto pra parar de perder cliente?", CTA grande "Começar trial grátis"

10. FOOTER — links institucionais, redes sociais, copyright, LGPD link
```

**Brief de Conteúdo (texto a escrever):**

- Hero copy direto, sem floreio (~50 palavras total)
- Cada seção problema: 25-40 palavras
- Como funciona: 30 palavras por passo
- Modos: 60 palavras de descrição cada
- FAQ: 30-50 palavras por resposta
- CTA final: 1 frase impactante

**Total de palavras no /:** ~800-1000 palavras (suficiente pra Google considerar conteúdo substancial).

---

### 4.2 `/funcionalidades` — Features detalhadas

**Title:**
```
Funcionalidades do InkFlow — Bot, Agenda, Sinal e mais
```

**Meta description:**
```
Bot WhatsApp, agenda integrada, cobrança automática de sinal via Pix, calculadora de orçamento, customização do agente. Veja tudo que o InkFlow faz.
```

**H1:**
```
Tudo que o teu estúdio precisa em um sistema só.
```

**Keywords:**
- Primária: `funcionalidades sistema tatuador`, `agenda online tatuagem`
- Secundárias: `cobrança sinal tatuagem`, `calculadora orçamento tatuagem`

**Schema.org:** `SoftwareApplication`

**Brief pra Claude Design:**

```
Página /funcionalidades — landing de features detalhada. Foco em mostrar profundidade técnica sem assustar não-tech.

Estrutura:

1. NAV (mesma da Home)

2. HERO mais leve — H1 + 1 sub-frase + 1 imagem ilustrativa de painel/dashboard

3. SEÇÃO PRINCIPAIS FEATURES — 6-8 cards grandes, cada um com:
   - Ícone simples linha
   - Título da feature
   - 2-3 frases descritivas
   - Mini-imagem/print da feature em ação

   Features a destacar:
   - Bot conversacional inteligente (Claude/GPT)
   - 3 modos de precificação (Faixa / Exato / Coleta) — link pra /modos
   - Agenda integrada (Google Calendar opcional)
   - Cobrança automática de sinal via PIX (Mercado Pago)
   - Reconhecimento de fotos de referência
   - Customização total do agente (tom, regras, FAQ)
   - Histórico completo de conversas
   - Painel admin com métricas

4. SEÇÃO INTEGRAÇÕES — bloco horizontal com logos: WhatsApp Business, Mercado Pago, Google Calendar, MailerLite. Texto: "Funciona com o que tu já usa."

5. SEÇÃO SEGURANÇA — bloco simples mostrando: dados criptografados, LGPD compliant, hospedagem Cloudflare (Brasil), uptime 99.9%

6. CTA — "Pronto pra ver na prática?" + botão "Começar trial grátis"

7. FOOTER (mesma)
```

**Brief de Conteúdo:**

Cada feature = 80-120 palavras (descrição + benefício + caso de uso real).

Total: ~1200-1500 palavras.

---

### 4.3 `/precos` — Pricing

**Title:**
```
Preços InkFlow — Trial grátis 7 dias, planos a partir de R$ XX
```

**Meta description:**
```
Comece grátis sem cartão. Plano mensal e anual com desconto. Cancele quando quiser. Sem fidelidade. Veja preços do InkFlow pra tatuador.
```

**H1:**
```
Planos pra cada momento do teu estúdio.
```

**Keywords:**
- Primária: `preço sistema tatuador`, `inkflow valor`
- Secundárias: `chatbot WhatsApp grátis tatuagem`, `software tatuador preço`

**Schema.org:** `Product` + `Offer` (importante pra Google Shopping ranks)

**Brief pra Claude Design:**

```
Página /precos — pricing limpo e direto. Sem ginástica visual.

Estrutura:

1. NAV

2. HERO curto — H1 + 1 sub-frase ("Sem cartão pra trial. Cancela quando quiser.")

3. TOGGLE Mensal / Anual (com badge "-20%" no Anual)

4. 3 CARDS DE PLANOS lado a lado:

   - PLANO INDIVIDUAL (Tatuador solo)
     R$ XX/mês
     - 1 WhatsApp conectado
     - Bot ilimitado
     - Agenda + sinal
     - Suporte email
     CTA: Começar grátis

   - PLANO ESTÚDIO (destaque, badge "Mais popular")
     R$ XX/mês
     - Até 3 WhatsApp
     - Tudo do Individual +
     - Multi-tatuador (cada um com agente)
     - Suporte prioritário
     CTA: Começar grátis

   - PLANO PREMIUM (Estúdios grandes)
     Sob consulta
     - WhatsApp ilimitado
     - White-label opcional
     - SLA dedicado
     CTA: Falar com vendas

5. SEÇÃO COMPARATIVO — tabela com features × planos (verde check / cinza X)

6. SEÇÃO TRIAL — bloco em destaque explicando o trial 7 dias (sem cartão, acesso completo, cancelamento automático)

7. FAQ pricing-específica — 6-8 perguntas (cancelamento, troca de plano, refund, NF-e, multi-tatuador)

8. CTA final + FOOTER
```

**Brief de Conteúdo:**

Hero: 40 palavras. Planos: 60 palavras descritivas + bullet points. Comparativo: 200 palavras explicativas. FAQ: 50 palavras/resposta.

Total: ~1000 palavras + tabela.

---

### 4.4 `/modos` — Os 3 modos de precificação

**Title:**
```
3 Modos de Precificação — Faixa, Exato ou Coleta de Info | InkFlow
```

**Meta description:**
```
Escolhe como teu bot fala de preço: faixa de valor, valor exato calculado ou só coleta info pra tu orçar. Único SaaS que oferece os 3 modos.
```

**H1:**
```
3 jeitos do teu bot lidar com preço — tu escolhe.
```

**Sub-headline:**
```
Cada tatuador tem uma forma diferente de orçar. Por isso o InkFlow é o único SaaS com 3 modos configuráveis.
```

**Keywords:**
- Primária: `modos precificação tatuagem`, `como orçar tatuagem WhatsApp`
- Secundárias: `tatuador faixa de preço vs exato`, `bot WhatsApp tatuagem sem valor`

**Schema.org:** `WebPage` + `FAQPage`

**Brief pra Claude Design:**

```
Página /modos — DIFERENCIAL competitivo. Visual deve enfatizar que essa flexibilidade é única no mercado.

Estrutura:

1. NAV

2. HERO — H1 grande, sub explicando que é o único SaaS com 3 modos. Mini-imagem mostrando 3 ícones (faixa visual, valor cravado, lupa de info).

3. SEÇÃO COMPARATIVO RÁPIDO — 3 colunas lado a lado, cada uma com:
   - Nome do modo
   - 1 frase do que faz
   - Quando escolher
   - Print de conversa WhatsApp exemplificando

4. SEÇÃO MODO FAIXA (detalhada, scroll continua):
   - Título "Modo Faixa — orçamento em faixa, tu fecha o valor final"
   - Texto explicativo (200 palavras)
   - Print de conversa real
   - Quando faz sentido + Quando NÃO faz sentido
   - "Ideal pra:" tags

5. SEÇÃO MODO EXATO (mesma estrutura)

6. SEÇÃO MODO COLETA (mesma estrutura, com sub-explicação dos 2 sub-modos: Puro e Reentrada)

7. FAQ específica de modos (5-7 perguntas)

8. CTA — "Qual modo combina com teu estúdio?" + botão "Testar grátis"

9. FOOTER
```

**Brief de Conteúdo:**

Cada modo merece ~300-400 palavras de explicação detalhada (problema/solução, exemplo conversa, vantagens, quando escolher).

Total: ~1500 palavras.

---

### 4.5 `/como-funciona` — 3 passos visuais

**Title:**
```
Como Funciona o InkFlow — Setup em 10 minutos | Tatuador
```

**Meta description:**
```
Conecta WhatsApp via QR, configura teu agente, e bot começa a atender. Tudo em 10 minutos. Veja passo a passo como o InkFlow funciona.
```

**H1:**
```
Setup em 10 minutos. Agente atendendo na sequência.
```

**Keywords:**
- Primária: `como funciona inkflow`, `como instalar bot WhatsApp tatuagem`
- Secundárias: `tutorial chatbot tatuador`, `setup automação WhatsApp`

**Schema.org:** `HowTo`

**Brief pra Claude Design:**

```
Página /como-funciona — explicação visual passo a passo. Reduz fricção pra trial.

Estrutura:

1. NAV

2. HERO — H1 + sub + vídeo demo embedded (placeholder se não tiver, ou GIF animado)

3. SEÇÃO 3 PASSOS GRANDES, scroll vertical:

   PASSO 1 — CONECTA WHATSAPP
   - Texto + screenshot da tela de QR code
   - 1-2 minutos
   - Funciona com WhatsApp normal e Business

   PASSO 2 — CONFIGURA AGENTE
   - Texto + screenshot da tela de config
   - 5-7 minutos
   - Define modo, tom, FAQ, regras

   PASSO 3 — BOT ATENDE
   - Texto + screenshot de conversa real
   - Imediato
   - Tu acompanha pelo Studio

4. SEÇÃO O QUE TU MANTÉM CONTROLE — bloco enfatizando que tu pode pausar bot, editar resposta, assumir conversa a qualquer hora. Reduz medo.

5. SEÇÃO O QUE BOT NÃO FAZ — honesto: bot NÃO faz orçamento de cobertura, NÃO insiste se cliente recusar, NÃO mente. Sempre passa pra ti em casos sensíveis.

6. CTA — "Pronto pra começar?" + botão "Começar grátis"

7. FOOTER
```

**Brief de Conteúdo:**

Cada passo: 200-300 palavras detalhadas + screenshot. Seção controle: 200 palavras. Seção honestidade: 200 palavras.

Total: ~1200 palavras.

---

### 4.6 `/faq` — Perguntas Frequentes

**Title:**
```
FAQ InkFlow — Perguntas Frequentes de Tatuadores
```

**Meta description:**
```
Tira tuas dúvidas: como funciona o trial, segurança WhatsApp, integrações, cancelamento, multi-tatuador, suporte. 20+ perguntas respondidas.
```

**H1:**
```
Perguntas frequentes
```

**Keywords:**
- Primária: `inkflow dúvidas`, `chatbot WhatsApp tatuagem dúvidas`
- Long-tail: várias (cada pergunta vira keyword)

**Schema.org:** `FAQPage` (CRÍTICO — Google mostra rich snippets de FAQ)

**Brief pra Claude Design:**

```
Página /faq — funcional e organizada por categoria. Sem floreio.

Estrutura:

1. NAV

2. HERO simples — H1 + busca por palavra-chave nas FAQs

3. SEÇÕES CATEGORIZADAS (cada uma é um accordion expansível):

   GERAL
   - O que é o InkFlow?
   - Pra quem é?
   - Como começo?
   - Posso testar grátis?

   FUNCIONALIDADES
   - O bot responde 24/7?
   - O bot funciona enquanto tu tatua?
   - Posso pausar o bot a qualquer hora?
   - O bot fecha agendamento sozinho?
   - Cobra sinal via PIX?

   MODOS DE PRECIFICAÇÃO
   - Qual a diferença entre Faixa, Exato e Coleta?
   - Posso mudar de modo depois?
   - Preciso configurar tabela de preços?

   WHATSAPP
   - Funciona com WhatsApp normal ou só Business?
   - Posso usar com meu número pessoal?
   - O bot bloqueia meu WhatsApp?
   - E se WhatsApp desconectar?

   SEGURANÇA E LGPD
   - Meus dados estão seguros?
   - Vocês são LGPD?
   - Posso exportar dados?
   - Posso deletar tudo?

   PAGAMENTO
   - Como funciona o trial 7 dias?
   - Sem cartão mesmo?
   - Como cancelo?
   - Tem multa de cancelamento?
   - Tem nota fiscal?
   - Quais formas de pagamento?

   TÉCNICO
   - Funciona em Android e iPhone?
   - Preciso instalar app?
   - Funciona offline?
   - Tem API?

4. CTA bottom — "Não achou tua dúvida?" + botão "Falar com a gente"

5. FOOTER
```

**Brief de Conteúdo:**

Cada resposta: 60-150 palavras (suficiente pra Google extrair como featured snippet).

Total: ~25 perguntas × ~100 palavras = ~2500 palavras (excelente pra SEO).

---

### 4.7 `/sobre` — Quem é o InkFlow

**Title:**
```
Sobre o InkFlow — Sistema feito por brasileiro pra tatuador
```

**Meta description:**
```
Quem é o InkFlow, por que foi criado, quem está por trás. SaaS brasileiro pra tatuadores, com suporte em português e dor real do mercado.
```

**H1:**
```
Feito no Brasil. Pra tatuador brasileiro.
```

**Keywords:**
- Primária: `inkflow quem é`, `inkflow brasil`
- Long-tail: `sistema tatuador brasileiro`

**Schema.org:** `AboutPage` + `Organization`

**Brief pra Claude Design:**

```
Página /sobre — humaniza a marca. CRUCIAL pra confiança em SaaS B2B brasileiro.

Estrutura:

1. NAV

2. HERO — H1 + foto sua (Leandro) trabalhando ou no estúdio + 2 parágrafos: quem és, por que criaste o InkFlow

3. SEÇÃO HISTÓRIA — texto storytelling: tatuador frustrado com WhatsApp, viu que ninguém resolvia direito, decidiu construir

4. SEÇÃO MISSÃO — 3-4 frases sobre o que vocês acreditam (tatuador deve focar na arte, atendimento não pode ser gargalo, tecnologia deve ser simples)

5. SEÇÃO COMO FUNCIONAMOS — operação solo founder, foco em qualidade, transparência (pode até linkar este doc se quiser ser radical)

6. SEÇÃO CONTATO DIRETO — "Quer falar comigo? Manda mensagem." + WhatsApp + email

7. FOOTER
```

**Brief de Conteúdo:**

História honesta + missão clara. ~600-800 palavras. Foto real. Pode ser pessoal — gente compra de gente.

---

### 4.8 `/contato` — Contato

**Title:**
```
Fale com o InkFlow — Suporte, Vendas, Parcerias
```

**Meta description:**
```
Dúvidas, suporte ou parceria? Fala direto pelo WhatsApp ou email. Resposta em até 24h em dias úteis. InkFlow Brasil.
```

**H1:**
```
Vamos conversar.
```

**Keywords:**
- Primária: `inkflow contato`, `inkflow suporte`

**Schema.org:** `ContactPage` + `Organization`

**Brief pra Claude Design:**

```
Página /contato — duas opções claras (WhatsApp e Email), sem complicação.

Estrutura:

1. NAV

2. HERO — H1 + sub explicando como funciona (resposta 24h dia útil)

3. SEÇÃO CANAIS — 2 cards grandes:
   - WhatsApp (link wa.me/55XXXXXXXXX) — recomendado pra suporte rápido
   - Email (contato@inkflowbrasil.com) — pra demandas detalhadas

4. SEÇÃO FORMULÁRIO (opcional, pode pular se quiser simplicidade) — nome, email, mensagem, motivo (suporte/vendas/parceria/outro)

5. SEÇÃO HORÁRIO — quando responder

6. FOOTER
```

**Brief de Conteúdo:**

Direto. ~300 palavras.

---

### 4.9 `/privacidade` — Política de Privacidade (LGPD)

**Title:**
```
Política de Privacidade — InkFlow | LGPD compliant
```

**Meta description:**
```
Como o InkFlow coleta, usa e protege teus dados e dos teus clientes. Política de privacidade completa em conformidade com LGPD.
```

**H1:**
```
Política de Privacidade
```

**Keywords:**
- Defensiva: `inkflow lgpd`, `inkflow política privacidade`

**Schema.org:** `WebPage`

**Brief pra Claude Design:**

```
Página /privacidade — formal, clara, sem ginástica visual. Texto puro com índice lateral.

Estrutura:

1. NAV
2. HERO simples — título + última atualização (data)
3. ÍNDICE LATERAL fixo (sticky) — navegação por seções
4. CONTEÚDO em colunas:
   - 1. Dados que coletamos
   - 2. Como usamos
   - 3. Com quem compartilhamos
   - 4. Direitos do titular (LGPD)
   - 5. Cookies
   - 6. Segurança
   - 7. Retenção
   - 8. Crianças
   - 9. Mudanças nesta política
   - 10. Contato (DPO)
5. FOOTER
```

**Brief de Conteúdo:**

Política completa LGPD. ~2000-3000 palavras (legal, mandatório).

**RECOMENDAÇÃO:** contratar advogado/escritório especializado em LGPD pra revisar. Pode usar template de SaaS brasileiro como base (ex: Resultados Digitais, RD Station publicam template aberto).

---

### 4.10 `/blog` — Hub de artigos

**Title:**
```
Blog InkFlow — Dicas pra Tatuadores Brasileiros
```

**Meta description:**
```
Como precificar tatuagem, gerir agenda, atendimento WhatsApp, gestão de estúdio. Conteúdo prático pra tatuador brasileiro crescer o estúdio.
```

**H1:**
```
Blog InkFlow
```

**Sub-headline:**
```
Dicas práticas pra tatuador profissional. Gestão, atendimento e crescimento.
```

**Keywords:**
- Hub: `blog tatuagem`, `dicas tatuador`, `gestão estúdio tatuagem`

**Schema.org:** `Blog` + `BreadcrumbList`

**Brief pra Claude Design:**

```
Hub /blog — listagem de artigos.

Estrutura:

1. NAV

2. HERO — H1 + sub + busca

3. SEÇÃO CATEGORIAS (tags clicáveis):
   - Precificação
   - WhatsApp
   - Agenda e Agendamento
   - Gestão de Estúdio
   - Atendimento
   - LGPD e Compliance
   - Crescimento

4. SEÇÃO POSTS EM DESTAQUE — 3 cards grandes (mais lidos)

5. SEÇÃO TODOS OS POSTS — grid de cards com:
   - Imagem destaque (placeholder se não tiver)
   - Categoria (tag)
   - Título
   - Resumo (50 palavras)
   - Data + autor + tempo de leitura
   - Link "Ler mais"

6. PAGINAÇÃO ou infinite scroll

7. SEÇÃO NEWSLETTER (opcional) — captura email pra avisar artigos novos

8. FOOTER
```

**Brief de Conteúdo:**

Hub não tem conteúdo próprio (só links pros posts). Posts individuais cobertos na seção 5 deste documento.

---

### 4.11 `/comparar/inkflow-vs-planilha` — Comparativo

**Title:**
```
InkFlow vs Planilha pra Agenda — Qual escolher? | Tatuador
```

**Meta description:**
```
Planilha funciona, mas até quando? Compare InkFlow vs planilha pra agenda do estúdio: tempo gasto, erros, escalabilidade, custo real.
```

**H1:**
```
InkFlow vs Planilha — qual faz sentido pro teu estúdio?
```

**Keywords:**
- Primária: `inkflow vs planilha`, `planilha vs sistema agenda tatuagem`
- Long-tail: `vale a pena trocar planilha por sistema tatuador`

**Schema.org:** `Article` + `ComparisonPage` (custom)

**Brief pra Claude Design:**

```
Página /comparar/X — formato comparison específico. Honesto (não vende muito agressivo).

Estrutura:

1. NAV

2. HERO — H1 + sub explicando que é comparação honesta

3. SEÇÃO RESUMO — tabela com 8-10 critérios × 2 colunas (Planilha / InkFlow):
   Critérios sugeridos:
   - Custo direto
   - Tempo gasto por semana
   - Erros de agendamento
   - Cliente perdido por demora
   - Cobrança automática de sinal
   - Histórico de conversas
   - Acesso pelo celular
   - Backup automático
   - Multi-tatuador
   - Tempo de setup

4. SEÇÃO QUANDO PLANILHA FAZ SENTIDO — honesto: tatuador iniciante, baixo volume, sem orçamento

5. SEÇÃO QUANDO TROCAR — sinais: > 30 mensagens/dia, perde cliente, esquece sinal, multi-tatuador

6. SEÇÃO HISTÓRIA REAL — (futuro, com cliente real) ou case hipotético

7. CTA — "Quer ver na prática?" + trial grátis

8. FOOTER
```

**Brief de Conteúdo:**

Honesto = ranquea. Vende = não ranquea (Google detecta). ~1500 palavras.

---

### 4.12 `/comparar/inkflow-vs-secretaria` — Comparativo

Mesma estrutura que /comparar/inkflow-vs-planilha, mudando o concorrente.

**Título:**
```
InkFlow vs Secretária Humana — Custo-Benefício pra Estúdio
```

**Meta description:**
```
Vale mais ter secretária ou InkFlow? Compare custo, escalabilidade, disponibilidade, qualidade do atendimento. Análise honesta pra tatuador.
```

**H1:**
```
Bot ou secretária — o que faz mais sentido pro teu estúdio?
```

---

## 5. Conteúdo de Blog (10 artigos iniciais — execução em paralelo à reestruturação)

### 5.1 Por que blog é crítico

Site institucional bem feito ranqueia "InkFlow" (busca de marca). Pra ranquear keywords genéricas tipo "como precificar tatuagem", precisa de **artigos longos (1500-2500 palavras), originais, atualizados regularmente**.

Cada artigo = 1 keyword principal + 5-10 secundárias capturadas naturalmente.

**Frequência recomendada após lançamento:** 1-2 artigos por semana, mínimo 3 meses, pra Google começar a indexar e dar relevância.

### 5.2 Os 10 artigos iniciais

#### Artigo 1: `/blog/como-precificar-tatuagem`

**Title:** `Como Precificar Tatuagem em 2026 — Guia Completo pra Tatuador`
**Meta:** `Calculadora, fatores que pesam (tamanho, estilo, região), erros comuns. Guia definitivo pra precificar tatuagem com lucro e sem cliente espantar.`
**Keyword principal:** `como precificar tatuagem`
**Volume estimado:** Alto (~5K-10K buscas/mês BR)
**Outline:**
- H2: Por que tantos tatuadores erram no preço
- H2: Os 5 fatores que devem entrar no cálculo
  - H3: Tamanho
  - H3: Estilo e complexidade
  - H3: Região do corpo
  - H3: Cor (P&B vs colorido)
  - H3: Sessões necessárias
- H2: Os 3 modelos de precificação
  - H3: Por hora
  - H3: Por peça (faixa)
  - H3: Por peça (fechado)
- H2: Como criar tua tabela de preços
- H2: Erros comuns que custam clientes
- H2: Calculadora pronta (link pra ferramenta InkFlow ou planilha grátis)

**Palavras alvo:** 2500
**Schema:** `Article` + `HowTo`

#### Artigo 2: `/blog/como-cobrar-sinal-tatuagem`

**Title:** `Como Cobrar Sinal de Tatuagem sem Perder Cliente`
**Meta:** `Quanto cobrar, quando cobrar, como falar pro cliente, métodos (PIX vs cartão), políticas justas. Guia pra cobrar sinal e parar de furar agenda.`
**Keyword principal:** `como cobrar sinal tatuagem`
**Outline:**
- H2: Por que cobrar sinal não é "ser chato" — é proteger teu trabalho
- H2: Quanto cobrar (% típico no Brasil)
- H2: Quando pedir (timing certo na conversa)
- H2: PIX vs cartão vs link de pagamento
- H2: Política de cancelamento (modelo pronto)
- H2: Como falar pro cliente sem assustar
- H2: Automatizar cobrança via WhatsApp

**Palavras:** 2000

#### Artigo 3: `/blog/whatsapp-business-tatuador-guia-completo`

**Title:** `WhatsApp Business pra Tatuador — Guia Completo 2026`
**Meta:** `Setup, configuração, mensagens automáticas, etiquetas, catálogo, métricas. Tudo que tatuador precisa do WhatsApp Business pra crescer estúdio.`
**Keyword principal:** `WhatsApp Business tatuador`
**Outline:**
- H2: WhatsApp normal vs Business — vale trocar?
- H2: Como configurar WhatsApp Business em 10 min
- H2: Mensagens automáticas que tatuador deveria ter
- H2: Como organizar conversas com etiquetas
- H2: Catálogo de portfólio no WhatsApp
- H2: Respostas rápidas — atalhos que ganham tempo
- H2: Limites do WhatsApp Business (e quando usar API/automação)

**Palavras:** 2500

#### Artigo 4: `/blog/como-organizar-agenda-estudio-tatuagem`

**Title:** `Como Organizar Agenda do Estúdio de Tatuagem (Sem Furar)`
**Meta:** `Métodos pra organizar agenda do estúdio, evitar conflitos, gerir múltiplos tatuadores e parar de perder horário. Comparativo de ferramentas grátis e pagas.`
**Keyword principal:** `como organizar agenda tatuagem`

#### Artigo 5: `/blog/chatbot-whatsapp-tatuagem-vale-a-pena`

**Title:** `Chatbot WhatsApp pra Tatuagem — Vale a Pena em 2026?`
**Meta:** `Bot WhatsApp pra estúdio: vantagens, riscos, custos, casos reais. Análise honesta pra tatuador decidir se automatizar atendimento faz sentido.`
**Keyword principal:** `chatbot WhatsApp tatuagem`

#### Artigo 6: `/blog/atendimento-automatico-estudio-tatuagem`

**Title:** `Atendimento Automático pra Estúdio de Tatuagem — Como Implementar`
**Meta:** `Passo a passo pra automatizar atendimento do estúdio sem perder personalização. Ferramentas, etapas, cuidados, métricas pra acompanhar.`
**Keyword principal:** `atendimento automático tatuador`

#### Artigo 7: `/blog/precificacao-tatuagem-faixa-vs-fechado`

**Title:** `Faixa de Preço vs Valor Fechado em Tatuagem — Qual Escolher?`
**Meta:** `Vantagens e desvantagens de orçar tatuagem em faixa ou valor fechado. Quando usar cada um. Como evitar confusão com cliente.`
**Keyword principal:** `precificação tatuagem faixa fechado`

#### Artigo 8: `/blog/como-perder-menos-cliente-whatsapp-tatuagem`

**Title:** `Como Perder Menos Cliente no WhatsApp do Estúdio (5 Estratégias)`
**Meta:** `Tempo de resposta, mensagens automáticas, follow-up, qualificação. 5 táticas comprovadas pra parar de perder cliente que pergunta preço no WhatsApp.`
**Keyword principal:** `tatuador perde cliente WhatsApp`

#### Artigo 9: `/blog/sistemas-de-agenda-tatuagem-comparativo`

**Title:** `Sistemas de Agenda pra Tatuagem — Comparativo 2026`
**Meta:** `Compare InkFlow, planilha, Google Agenda, Trello e outros sistemas pra gerir agenda do estúdio. Vantagens, custo, quando usar cada um.`
**Keyword principal:** `sistemas agenda tatuagem`

#### Artigo 10: `/blog/lgpd-para-tatuadores-o-que-precisa-saber`

**Title:** `LGPD pra Tatuador — O que Precisa Saber em 2026`
**Meta:** `LGPD se aplica a tatuador? Multas, deveres, o que fazer com dados de cliente, contratos, fotos. Guia prático pra estúdio se proteger.`
**Keyword principal:** `LGPD tatuador`

---

## 6. Setup Técnico SEO (implementação no repo)

### 6.1 Arquivos a criar/modificar na raiz

```
inkflow-saas/
├── _redirects                  ← Cloudflare redirects (legacy URLs)
├── _headers                    ← Cloudflare headers (cache, security)
├── robots.txt                  ← Diretivas pra crawlers
├── sitemap.xml                 ← Mapa do site (gerado por script)
├── favicon.ico                 ← Já existe? (verificar)
├── apple-touch-icon.png        ← Pra iOS share
└── og-default.png              ← Imagem padrão Open Graph (1200x630)
```

### 6.2 `_redirects` (Cloudflare Pages — formato simples)

```
# === Legacy URLs → URLs limpas ===
/index.html              /                       301
/onboarding.html         /onboarding             301
/studio.html             /studio                 301
/admin.html              /admin                  301
/reconnect.html          /reconnect              301
/termos.html             /termos                 301

# === Garantir HTTPS ===
http://inkflowbrasil.com/*    https://inkflowbrasil.com/:splat    301!
http://www.inkflowbrasil.com/*    https://inkflowbrasil.com/:splat    301!
https://www.inkflowbrasil.com/*    https://inkflowbrasil.com/:splat    301!

# === Trailing slash consistency (sem trailing slash) ===
/funcionalidades/        /funcionalidades        301
/precos/                 /precos                 301
/modos/                  /modos                  301
/como-funciona/          /como-funciona          301
/faq/                    /faq                    301
/sobre/                  /sobre                  301
/contato/                /contato                301
/blog/                   /blog                   301
```

### 6.3 `robots.txt`

```
User-agent: *
Allow: /

# Áreas internas/logadas — não indexar
Disallow: /onboarding
Disallow: /onboarding/
Disallow: /studio
Disallow: /admin
Disallow: /reconnect
Disallow: /api/

# Bloquear crawlers agressivos não-essenciais
User-agent: AhrefsBot
Crawl-delay: 10

User-agent: SemrushBot
Crawl-delay: 10

# Sitemap location
Sitemap: https://inkflowbrasil.com/sitemap.xml
```

### 6.4 `sitemap.xml` (gerado por script)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://inkflowbrasil.com/</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/funcionalidades</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/precos</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/modos</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/como-funciona</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/faq</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/sobre</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/contato</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/blog</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- Cada artigo do blog vai aqui -->
  <url>
    <loc>https://inkflowbrasil.com/blog/como-precificar-tatuagem</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.7</priority>
  </url>
  <!-- ... resto dos artigos ... -->
  <url>
    <loc>https://inkflowbrasil.com/comparar/inkflow-vs-planilha</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/comparar/inkflow-vs-secretaria</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/termos</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://inkflowbrasil.com/privacidade</loc>
    <lastmod>2026-05-02</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>
```

**Recomendação:** criar `scripts/generate-sitemap.sh` que regenera o sitemap automaticamente lendo as páginas do repo. Roda em pre-commit ou no GHA.

### 6.5 `_headers` (Cloudflare Pages — cache + security)

```
# Cache estático longo pros assets
/*.css
  Cache-Control: public, max-age=31536000, immutable

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.png
  Cache-Control: public, max-age=31536000, immutable

/*.svg
  Cache-Control: public, max-age=31536000, immutable

/*.woff2
  Cache-Control: public, max-age=31536000, immutable

# HTML cache curto (pra atualizar rápido)
/*.html
  Cache-Control: public, max-age=300, must-revalidate

# Security headers em TODAS as páginas
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### 6.6 Meta tags template (cabeçalho de cada página)

Template HTML padrão pra cabeçalho de cada página:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <!-- SEO básico -->
  <title>{{TITLE — máx 60 chars}}</title>
  <meta name="description" content="{{DESCRIPTION — máx 160 chars}}">
  <link rel="canonical" href="https://inkflowbrasil.com{{PATH}}">

  <!-- Open Graph (Facebook, WhatsApp, LinkedIn) -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://inkflowbrasil.com{{PATH}}">
  <meta property="og:title" content="{{OG_TITLE}}">
  <meta property="og:description" content="{{OG_DESC}}">
  <meta property="og:image" content="https://inkflowbrasil.com/og/{{PAGE_SLUG}}.png">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:site_name" content="InkFlow">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{{TITLE}}">
  <meta name="twitter:description" content="{{DESCRIPTION}}">
  <meta name="twitter:image" content="https://inkflowbrasil.com/og/{{PAGE_SLUG}}.png">

  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="alternate icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">

  <!-- Schema.org JSON-LD (varia por página) -->
  <script type="application/ld+json">
  {{SCHEMA_JSON}}
  </script>

  <!-- Performance: preconnect CDNs críticos -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
</head>
```

### 6.7 Schemas JSON-LD por tipo de página

#### Schema HOME (`SoftwareApplication` + `Organization`)

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "InkFlow",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "description": "Bot WhatsApp que atende, orça e agenda pra estúdios de tatuagem brasileiros. Trial grátis 7 dias.",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "BRL",
        "description": "Trial grátis 7 dias"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "ratingCount": "0"
      }
    },
    {
      "@type": "Organization",
      "name": "InkFlow",
      "url": "https://inkflowbrasil.com",
      "logo": "https://inkflowbrasil.com/logo.png",
      "sameAs": [
        "https://instagram.com/inkflowbrasil",
        "https://www.linkedin.com/company/inkflow"
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer support",
        "email": "contato@inkflowbrasil.com",
        "availableLanguage": ["Portuguese"]
      }
    }
  ]
}
```

(Ajustar `ratingCount` quando tiver clientes reais reviewando.)

#### Schema FAQ (`/faq` e em qualquer página com FAQ)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "O que é o InkFlow?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "InkFlow é um sistema brasileiro que automatiza o atendimento de estúdios de tatuagem via WhatsApp. Bot conversa com cliente, calcula orçamento, agenda sessão e cobra sinal — tudo automático."
      }
    },
    {
      "@type": "Question",
      "name": "Posso testar grátis?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Sim, trial 7 dias sem cartão de crédito. Acesso completo a todas as funcionalidades."
      }
    }
    // ... todas as FAQs
  ]
}
```

#### Schema HOWTO (`/como-funciona`)

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "Como configurar o InkFlow no teu estúdio",
  "totalTime": "PT10M",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Conectar WhatsApp",
      "text": "Abra o painel InkFlow, escaneie o QR code com teu WhatsApp Business ou pessoal."
    },
    {
      "@type": "HowToStep",
      "name": "Configurar agente",
      "text": "Defina nome do agente, modo de precificação (Faixa/Exato/Coleta), tom de voz e regras."
    },
    {
      "@type": "HowToStep",
      "name": "Bot começa a atender",
      "text": "A partir desse momento, mensagens recebidas no teu WhatsApp são respondidas automaticamente."
    }
  ]
}
```

#### Schema PRICING (`/precos` — cada plano vira `Offer`)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "InkFlow",
  "description": "Sistema de automação de atendimento WhatsApp pra estúdios de tatuagem",
  "offers": [
    {
      "@type": "Offer",
      "name": "Plano Individual",
      "price": "XX",
      "priceCurrency": "BRL",
      "priceSpecification": {
        "@type": "RecurringPaymentsPriceSpecification",
        "billingDuration": "P1M"
      }
    },
    {
      "@type": "Offer",
      "name": "Plano Estúdio",
      "price": "XX",
      "priceCurrency": "BRL"
    }
  ]
}
```

#### Schema BLOG POST (cada artigo)

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{{TITLE}}",
  "description": "{{META_DESC}}",
  "image": "https://inkflowbrasil.com/blog/{{SLUG}}/cover.png",
  "datePublished": "2026-05-02",
  "dateModified": "2026-05-02",
  "author": {
    "@type": "Person",
    "name": "Leandro Marques",
    "url": "https://inkflowbrasil.com/sobre"
  },
  "publisher": {
    "@type": "Organization",
    "name": "InkFlow",
    "logo": {
      "@type": "ImageObject",
      "url": "https://inkflowbrasil.com/logo.png"
    }
  }
}
```

#### Schema BREADCRUMB (todas as páginas exceto home)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://inkflowbrasil.com/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Blog",
      "item": "https://inkflowbrasil.com/blog"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Como Precificar Tatuagem"
    }
  ]
}
```

---

## 7. Plano de Divisão do `onboarding.html` (180KB monolito)

### 7.1 Diagnóstico atual

`onboarding.html` tem 180KB num único arquivo. Performance ruim, SEO impossível (todo conteúdo numa única URL), manutenção difícil.

### 7.2 Plano de divisão

Quebrar em **6 rotas**, cada uma com sua própria URL e estado:

```
/onboarding              → /onboarding/inicio (redirect default)
/onboarding/inicio       → Boas-vindas + termos
/onboarding/agente       → Config agente (nome, persona, tom)
/onboarding/precificacao → Modo (Faixa/Exato/Coleta)
/onboarding/modos        → Sub-config por modo
/onboarding/whatsapp     → QR code + conexão
/onboarding/finalizar    → Confirmação + redirect Studio
```

### 7.3 Estado entre páginas

**Opção A — localStorage (recomendada pra simplicidade):**
- Cada página salva progresso em `localStorage.inkflow_onboarding_state`
- Próxima página lê estado, valida que step anterior foi completo
- Submit final consolida e POSTa pro backend

**Opção B — Multi-step server-side:**
- Backend mantém sessão temporária por `onboarding_key`
- Cada página POSTa o step e recebe próximo
- Mais robusto, mais código

**Recomendação:** Opção A pra MVP (já tem `onboarding_key` na URL, tu pode usar como ID de sessão localStorage). Migra pra Opção B se virar gargalo.

### 7.4 Componentes compartilhados

Criar `partials/`:
- `partials/onboarding-nav.html` — barra de progresso
- `partials/onboarding-footer.html` — footer simples
- `assets/css/onboarding.css` — CSS comum
- `assets/js/onboarding-state.js` — gerenciamento de localStorage

Cada página `onboarding/X.html` usa esses partials via include simples (server-side com Cloudflare _routes ou inline-include via build).

### 7.5 Vantagens da divisão

- **Performance:** carrega só o que precisa por step (~30KB cada vs 180KB)
- **Análise:** Google Analytics consegue mapear funil step-by-step
- **Manutenção:** cada step isolado é fácil de mudar
- **Recovery:** cliente fecha browser, volta no link, retoma do step certo
- **Mobile:** menos JavaScript carregado de uma vez

### 7.6 Rotas Cloudflare

`_redirects`:
```
/onboarding              /onboarding/inicio        302
/onboarding/inicio       /onboarding/inicio.html   200
/onboarding/agente       /onboarding/agente.html   200
/onboarding/precificacao /onboarding/precificacao.html 200
/onboarding/modos        /onboarding/modos.html    200
/onboarding/whatsapp     /onboarding/whatsapp.html 200
/onboarding/finalizar    /onboarding/finalizar.html 200
```

(Status 200 = "rewrite" sem mudar URL no browser. Status 302 = redirect com mudança de URL.)

---

## 8. Sequência de Execução Recomendada

### Fase 1 — Setup técnico SEO base (1 sessão, ~2h aqui no Claude Code)

1. Criar `_redirects` + `_headers` + `robots.txt` na root
2. Criar `sitemap.xml` (estático inicial, depois automatizar)
3. Criar template HTML padrão com meta tags + schema (`templates/page-base.html`)
4. Atualizar `index.html` atual com:
   - Meta tags SEO completas
   - Schema JSON-LD (SoftwareApplication + Organization)
   - Open Graph tags
   - Canonical URL
5. Criar imagem OG default (1200x630px, pode ser placeholder simples)
6. Deploy Cloudflare Pages
7. Submeter sitemap no Google Search Console
8. **Commit + PR**

### Fase 2 — Páginas-chave visualmente (5 sessões Claude Design + 5 sessões Claude Code)

Pra cada página da lista (`/`, `/funcionalidades`, `/precos`, `/modos`, `/como-funciona`, `/faq`, `/sobre`, `/contato`):

1. **Claude Design (~1-2h):**
   - Cria prototype usando o brief da seção 4 deste doc
   - Usa o design system já configurado
   - Itera visualmente
   - Exporta handoff bundle

2. **Claude Code (~1-2h):**
   - Implementa o handoff em HTML/CSS vanilla
   - Wire meta tags + schema + canonical
   - Adiciona ao sitemap
   - Round-trip Playwright pra validar visual
   - Lighthouse audit (Performance + SEO scores ≥90)
   - **Commit + PR**

### Fase 3 — Divisão do onboarding (1 sessão Claude Code, ~3h)

1. Plano detalhado de divisão (já tens nesse doc seção 7)
2. Implementa via subagent-driven (similar ao Modo Coleta PR 1)
3. Migra estado entre páginas (localStorage)
4. Testa fluxo end-to-end
5. **Commit + PR**

### Fase 4 — Conteúdo blog (10 artigos, ~5-10 sessões total)

Pra cada artigo:

1. **Brainstorm + outline (15 min aqui):** valida estrutura, ajusta keywords
2. **Geração de 1ª versão (Claude — 30-45 min):** produz artigo completo seguindo outline
3. **Tu revisa (~30-60 min):** corrige tom, adiciona experiência pessoal, ajusta voz
4. **Implementação (~15 min aqui):** cria HTML do post, adiciona ao sitemap, wire schema Article
5. **Imagem cover (Claude Design ou tool externa):** 1200x630px com tipografia do design system
6. **Deploy**

Frequência: **1 artigo por semana**, durante 10 semanas. Não tenta empilhar tudo de uma vez (Google penaliza spam de conteúdo).

### Fase 5 — Backlinks e off-page (paralelo, contínuo)

Não é técnico, mas crítico. Sugestões iniciais:

1. **ProductHunt BR launch** (pode dar 10-50 backlinks e 100-500 visitas)
2. **Listas de SaaS brasileiros** (saasinabox.com.br, brstartups.com.br, listsbrasil.com.br)
3. **Comunidades de tatuadores** (Telegram/Discord/grupos Facebook) — com cuidado, sem spam
4. **Podcast invites** (podcasts de empreendedorismo brasileiro pra contar a história)
5. **Guest posts** em blogs de gestão/empreendedorismo (ofereça artigo grátis pra blog grande do segmento)
6. **Parcerias com fornecedores** (lojas de material de tatuagem podem linkar pra ti em troca de algo)

---

## 9. Métricas pra Acompanhar

### 9.1 Setup obrigatório

- **Google Search Console** (gratuito) — submete sitemap, vê queries, indexação, erros
- **Google Analytics 4** (gratuito) — comportamento, conversão, funil
- **Bing Webmaster Tools** (gratuito) — Bing tem 5-10% do tráfego BR
- **PostHog** ou **Plausible** (auditor #6 do plano-mestre Fábrica) — analytics privacy-friendly

### 9.2 KPIs SEO mensais

| Métrica | Mês 1 | Mês 3 | Mês 6 |
|---|---|---|---|
| Páginas indexadas no Google | 5-10 | 20-30 | 30-50 |
| Impressões orgânicas/mês | 100-500 | 1K-5K | 5K-20K |
| Cliques orgânicos/mês | 10-50 | 100-300 | 500-1500 |
| CTR médio | 2-3% | 3-5% | 4-7% |
| Posição média | 30-50 | 15-25 | 5-15 |
| Backlinks únicos | 1-3 | 5-10 | 15-30 |
| Tempo médio na página | 30s | 1min | 1.5min |
| Trial signups via orgânico | 0-2 | 5-15 | 30-100 |

(Estimativas conservadoras. Pode ser melhor/pior dependendo de execução do conteúdo + backlinks.)

---

## 10. Próximos Passos Práticos

### Imediato (esta sessão)

- [x] Documento de plano completo (este arquivo)
- [ ] Validar com Leandro: aprovação do mapa de páginas
- [ ] Definir prioridade: o que fazer primeiro

### Próxima sessão

- [ ] Fase 1: Setup técnico SEO base no repo (PR dedicado)

### Sessões seguintes

- [ ] Fase 2: páginas-chave visualmente (5 PRs separados)
- [ ] Fase 3: divisão onboarding (1 PR)
- [ ] Fase 4: blog posts (10 PRs em ritmo semanal)

---

## 11. Caveats e Riscos

### 11.1 Riscos identificados

- **Conteúdo escrito por IA:** Google penaliza conteúdo gerado sem revisão humana. **Mandatório:** tu revisar cada artigo antes de publicar.
- **Spam de backlinks:** comprar backlink ou trocar em massa = penalização Google. Backlinks naturais (bem feitos) > 100 backlinks ruins.
- **Páginas finas:** página com <500 palavras dificilmente ranqueia. Se uma página específica não tem substância, talvez melhor mergir com outra.
- **Velocidade móvel:** Google usa mobile-first indexing. Lighthouse móvel score <80 = ranking ruim. Testar SEMPRE em mobile.

### 11.2 Não-objetivos (deste plano)

- Internacionalização (i18n) — fora do escopo, foco BR
- App mobile nativo — landing pra app + onboarding web é suficiente
- Comparativos com concorrentes diretos (ex: Sympla, Wamation) — esperar maturidade pra evitar ataque legal
- Conteúdo gerado puramente por IA sem revisão — penalizado pelo Google

### 11.3 Premissas

- Hospedagem continua Cloudflare Pages (já validado, performance excelente)
- Stack continua HTML/CSS vanilla (sem framework JS) — facilita SEO técnico
- Nome de domínio `inkflowbrasil.com` mantido (autoridade construída)
- Suporte/atendimento permanece em PT-BR

---

## 12. Recursos e Referências

### 12.1 Ferramentas SEO grátis recomendadas

- **Google Search Console** — search.google.com/search-console
- **Google Analytics 4** — analytics.google.com
- **Google Keyword Planner** — ads.google.com/keywordplanner
- **Ubersuggest** (Neil Patel, free tier) — ubersuggest.com
- **Answer The Public** — answerthepublic.com (perguntas que pessoas fazem)
- **Lighthouse** (built-in Chrome DevTools) — performance + SEO audit
- **Bing Webmaster Tools** — bing.com/webmasters

### 12.2 Templates LGPD/Privacidade BR

- **iubenda** (pago, gera template legal) — iubenda.com
- **Termly** (free tier) — termly.io
- **Modelo aberto:** RD Station Privacy Policy (busca "rdstation politica de privacidade" pra inspirar — não copia direto, adapta)
- **Recomendação séria:** advogado especializado em LGPD pra revisão final (R$ 800-2500)

### 12.3 Schema.org docs

- https://schema.org/SoftwareApplication
- https://schema.org/FAQPage
- https://schema.org/HowTo
- https://schema.org/Article
- **Validador:** https://search.google.com/test/rich-results

### 12.4 Cross-references neste repo

- [[InkFlow — Painel]] — dashboard projeto
- [[InkFlow — Plano-mestre Fábrica (2026-04-25)]] — roadmap geral (este plano não conflita, complementa Fase 6.0)
- [[InkFlow — Pendências (backlog)]] — backlog ativo
- `docs/superpowers/specs/2026-04-22-modo-coleta-design.md` — Modo Coleta (deve influenciar página /modos)
- `docs/canonical/` — Mapa Canônico (Sub-projeto 1) — fonte da verdade técnica

---

**Status:** Documento mestre criado. Aguarda aprovação Leandro pra começar Fase 1.

**Próximo arquivo a criar quando aprovado:** `docs/seo-strategy/fase-1-setup-tecnico.md` com detalhamento de execução da Fase 1.
