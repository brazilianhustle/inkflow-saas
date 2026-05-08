---
status: ready-to-plan
date: 2026-05-08
author: Leandro + Claude (sessão 08/05 madrugada parte 3)
related-files:
  - /Users/brazilianhustler/Desktop/InkFlow Site/Spec Claude Code Hero/INKFLOW-REDESIGN-SPEC.md (referência parcial — visual editorial Kyiv DESCARTADO, copy preservado)
  - /Users/brazilianhustler/Desktop/InkFlow Site/Imagens Referencia /inkflow-hero-builder.html (DESCARTADO — hero gigante editorial não será mais usado)
  - /Users/brazilianhustler/Documents/inkflow-saas/index.html (legacy — fonte do copy preservado, estrutura de 10 seções)
  - https://www.awwwards.com/sites/eleken-saas-design-agency-1 (referência visual primária)
  - https://eleken.co (referência visual secundária)
visual-reference: hero do Eleken SaaS Design Agency conforme screenshot Awwwards (fundo escuro + 3 linhas onduladas + tipografia grande sans-serif)
---

# Landing v2 — InkFlow (Eleken Escuro)

## Contexto

A landing atual (`inkflow-saas/index.html`, 792 linhas, servida via Cloudflare Pages em `inkflowbrasil.com`) é uma single-page HTML monolítica com CSS inline. Estética genérica de SaaS-tech-startup (verde teal `#00d4aa` + cyan + magenta), tipografia Inter sem personalidade, zero elementos gráficos marcantes, espaçamento conservador.

Sessão 1 do bootstrap web (commit `0ab5992`, 2026-05-08 madrugada) preparou stack Next.js 16 + Tailwind 4 + shadcn/ui na pasta `web/` exatamente pra suportar este redesign.

Esta v2 redesenha visualmente toda a landing (10 seções existentes), preservando 100% do copy/conteúdo da legacy, e migra o frontend pra stack moderna em `web/`. **Não** é re-port 1:1 do HTML legacy — é redesign completo na nova stack, alinhado ao feedback `padrao_mercado > preservação` (default profissional, não migração mecânica).

**Direção visual:** estética Eleken SaaS Design Agency adaptada pra paleta escura + acento vermelho do InkFlow. Hero com **3 linhas onduladas animadas** (vermelha sólida + branca sólida + cinza tracejada) atravessando o background, **sem foto** e **sem mockup** (hero limpo focado em tipografia + linhas). Demais seções seguem padrão Eleken: estrutura clean, mockups reais do produto onde aplicável (seção Demo: conversa WhatsApp do bot), social proof seções omitidas até ter material real (MVP honesto).

**Não é migração de domínio.** Spec cobre só o design + estrutura React. Como/quando migrar `inkflowbrasil.com` do `index.html` legacy pro Next.js build é decisão de plano de implementação separado (gateado por este spec).

## Não-objetivos

1. **Não modificar copy.** Headlines, sub-headlines, descrições, FAQ, pricing copy — tudo preservado da legacy. Esta é uma decisão consciente: copy testado em prod, redesign é só visual.
2. **Não modificar pricing.** 3 planos (Individual R$197, Estúdio R$497, VIP R$997) com features e lógica de checkout existentes. Botões continuam chamando `/api/public-start` com o mesmo shape de payload.
3. **Não tocar dashboard `/studio`.** Verde teal `#00d4aa` permanece no dashboard como cor de sucesso. Esta v2 é só da landing.
4. **Não tocar `onboarding.html`, `admin.html`, `reconnect.html`, `studio.html`, `termos.html`** (outros HTMLs legacy do root). Esses ficam no Cloudflare Pages como estão.
5. **Não criar páginas novas além da landing.** Não há `/sobre`, `/blog`, `/cases`, etc. Single-page (`/`).
6. **Não implementar logos de tatuadores nem testimonials.** MVP honesto — site lança com 10 seções (sem `social-proof-logos` e `testimonials`). Quando tiver 6+ logos reais e 2-3 depoimentos beta, expansão fica em backlog (não-bloqueante).
7. **Não tocar Schema.org / meta tags / SEO** sem revisão. Manter `SoftwareApplication`, `Organization`, `WebSite` da legacy. (Tarefa de implementação irá copiar metadata pra `app/layout.tsx` Next.js.)
8. **Não tocar BFCache handler** (`pageshow` listener da legacy) — preservar lógica em script externo se aplicável.
9. **Não tocar smooth scroll** existente — preservar/integrar.
10. **Não criar Storybook nem testes visuais por enquanto.** Smoke test pelo navegador (`npm run dev`) basta pra MVP. Cobertura de testes vira backlog se a landing crescer.

## Pré-requisitos

1. ✅ Bootstrap web fechado (commit `0ab5992` na branch `feat/web-nextjs-bootstrap`): Next.js 16.2.6 + React 19.2.4 + TypeScript 5 + Tailwind 4 + shadcn/ui 4.7.0 em `web/`.
2. ✅ Branch `feat/web-nextjs-bootstrap` (não-pushed). Decisão pendente no `/plan`: continuar nesta branch (1 PR grande) ou push+merge bootstrap → criar branch nova de `main`.
3. ✅ Copy fonte: `inkflow-saas/index.html` no root.
4. ✅ Decisão de stack/lib (todas tomadas no brainstorm 2026-05-08 parte 3):
   - Next.js 16 + React 19 + TypeScript 5 (já bootados)
   - Tailwind 4 (já bootada)
   - Framer Motion (`motion`) — instalar
   - General Sans via Fontshare CDN
   - JetBrains Mono via Google Fonts
   - shadcn/ui já instalada (decisão de uso por componente fica no `/plan`)

## Decisões de design (cravadas no brainstorm)

| # | Decisão | Razão |
|---|---|---|
| D1 | **Direção visual: Eleken-style adaptado** (descarta Kyiv editorial) | Leandro reconheceu mais profissional, decisão consciente após 3 problemas apontados |
| D2 | **Paleta: fundo escuro + branco gelo + acento vermelho** | Mantém identidade do InkFlow, com risco de virar "SaaS B2B genérico mal pintado de preto" mitigado pelos 5 princípios de design abaixo |
| D3 | **Hero sem foto, sem mockup** | Eleken não tem; layout tipográfico + linhas onduladas; força o visual a se sustentar pela tipografia |
| D4 | **3 linhas onduladas animadas no hero** | Vermelha sólida + branca sólida + cinza tracejada; respiração sutil em loop infinito (Framer Motion) |
| D5 | **Tipografia: General Sans (display) + JetBrains Mono (mono)** | General Sans aproxima visualmente do Eleken (curvas suaves não-geométricas); JetBrains Mono pra labels técnicas (pré-headlines, números editoriais) |
| D6 | **Lib animação: Framer Motion** | Padrão profissional Next.js, ~30KB, declarativa, serve pra paths SVG + scroll reveal + hover states |
| D7 | **Estrutura: 10 seções (legacy preservada)** | Logos e testimonials OMITIDOS no launch (MVP honesto sem dados reais) |
| D8 | **Mockup do produto: conversa WhatsApp do bot real** | HTML/CSS real (não imagem), texto plausível, dados anonimizados — vai na seção Demo |
| D9 | **Copy 100% preservado da legacy** | Decisão explícita do Leandro |
| D10 | **Conteúdo dinâmico: nenhum.** Single-page estática. | Não há fetch de API na landing. CTAs continuam chamando `/api/public-start` (já em prod). |

### 5 Princípios não-negociáveis pra "Eleken escuro" não virar genérico

1. **Vermelho com escassez disciplinada.** Eleken usa laranja só em CTA primário e setas longas. No InkFlow vermelho aparece em: 1 CTA primary, pré-headlines mono `[ LABEL ]`, números editoriais nos features (01-06), barra hover em cards, accent na curva 1 do hero, glow do CTA final, badge "MAIS POPULAR" no plano Estúdio. **Nunca em:** subtítulos, ícones genéricos, borders gerais, dividers, hovers de link.
2. **Tipografia com presença visual.** Headline hero `clamp(56px, 9vw, 128px)` com peso 600 General Sans, letter-spacing -0.02em, line-height 1.04. Sem isso vira tech startup.
3. **Mockup real do bot, MUITO bem produzido.** Conversa plausível atendendo cliente — texto real, dados anonimizados (nome do cliente como "Mariana", tatuador como "Estúdio Tatuador"). É a alma da seção Demo.
4. **Espaço em branco generoso (escuro).** `--section-gap: clamp(120px, 16vw, 200px)`. Sem isso, fica abafado e perde a estética Eleken.
5. **Um elemento gráfico autoral por seção.** Linha tracejada vermelha sob cada section header, números editoriais gigantes em features/steps, glow radial no CTA final, animação suave nas linhas do hero. Nada dominante; todos sutis.

## Design Tokens

### Paleta

```css
:root {
  /* Backgrounds */
  --bg:               #08080c;
  --bg-card:          #111118;
  --bg-elevated:      #18181f;

  /* Texto */
  --text-primary:     #ededef;
  --text-secondary:   #8a8a95;
  --text-muted:       #4a4a55;

  /* Accent — VERMELHO COM ESCASSEZ */
  --accent:           #e8260a;
  --accent-hover:     #ff3d1f;
  --accent-soft:      rgba(232, 38, 10, 0.08);
  --accent-glow:      rgba(232, 38, 10, 0.12);
  --accent-border:    rgba(232, 38, 10, 0.15);

  /* Bordas */
  --border:           rgba(255, 255, 255, 0.06);
  --border-strong:    rgba(255, 255, 255, 0.10);

  /* Status (preservado pra futuro uso em estados de sucesso, NÃO usado na landing) */
  --success:          #00d4aa;
}
```

### Tipografia

```css
:root {
  --font-display:     'General Sans', system-ui, -apple-system, sans-serif;
  --font-body:        'General Sans', system-ui, -apple-system, sans-serif;
  --font-mono:        'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
}
```

**Importação:**
```html
<!-- General Sans via Fontshare (CDN free) -->
<link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap" rel="stylesheet" />

<!-- JetBrains Mono via Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
```

(Em Next.js: usar `next/font` ou `<link>` em `app/layout.tsx`. Decisão técnica fica no `/plan`.)

**Regras tipográficas:**

| Uso | Família | Peso | Tamanho | Letter-spacing | Line-height |
|---|---|---|---|---|---|
| H1 hero | General Sans | 600 | clamp(56px, 9vw, 128px) | -0.02em | 1.04 |
| H2 seção | General Sans | 600 | clamp(36px, 5vw, 64px) | -0.015em | 1.1 |
| H3 card title | General Sans | 600 | 22px | -0.01em | 1.3 |
| Pré-headline `[ LABEL ]` | JetBrains Mono | 500 | 12px | 2.5px (uppercase) | 1.5 |
| Sub-headline | General Sans | 400 | 17px | normal | 1.7 |
| Body / descrição | General Sans | 400 | 15px | normal | 1.65 |
| Stat value | General Sans | 700 | clamp(40px, 5vw, 64px) | -0.02em | 1.0 |
| Stat label | JetBrains Mono | 500 | 11px | 2px (uppercase) | 1.5 |
| Step number | General Sans | 700 | 64px | -0.02em | 1.0 |
| Feature number | JetBrains Mono | 600 | 13px | 1.5px | 1.0 |
| Nav link | JetBrains Mono | 500 | 13px | 1.2px (uppercase) | 1.0 |
| Pricing value | General Sans | 700 | 56px | -0.02em | 1.0 |
| FAQ summary | General Sans | 600 | 17px | normal | 1.4 |
| FAQ body | General Sans | 400 | 15px | normal | 1.7 |
| CTA final headline | General Sans | 700 | clamp(48px, 8vw, 96px) | -0.02em | 1.0 |
| Footer link | General Sans | 400 | 14px | normal | 1.6 |
| Footer header | JetBrains Mono | 500 | 11px | 2px (uppercase) | 1.5 |

### Espaçamento

```css
:root {
  --container:        1240px;
  --section-gap:      clamp(120px, 16vw, 200px);   /* respiro vertical entre seções */
  --side-pad:         clamp(20px, 4vw, 60px);       /* padding horizontal global */
  --section-padding:  clamp(80px, 12vw, 140px);     /* padding vertical interno de seção */
}
```

### Border Radius

- Buttons: 8px
- Cards: 14px
- Logo icon: 8px
- Pills (badges): 999px (full)
- Modais (n/a na landing): 16px

### Sombras

```css
--shadow-card:        0 20px 60px rgba(0, 0, 0, 0.3);
--shadow-button:      0 8px 32px rgba(232, 38, 10, 0.25);
```

### Curvas de easing

```css
--easing-default:     cubic-bezier(0.25, 0.46, 0.45, 0.94);
--easing-spring:      cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## Estrutura por seção

### 1. Nav (fixed top)

**Layout:** logo à esquerda + 4 links no meio + CTA pill à direita. Height 72px. Padding horizontal `--side-pad`. Position `fixed; top:0; left:0; right:0; z-index:100`.

**Logo:** quadrado vermelho 34×34px com letra "I" em General Sans 700 (18px) branca centralizada (`display:grid; place-items:center; border-radius:8px`). Ao lado: nome "InkFlow" em General Sans 700, 19px, letter-spacing -0.5px, cor `--text-primary`. Gap entre quadrado e nome: 12px. Total clicável → link pra `/`.

**Links centralizados (gap 28px):**
- `Recursos` → `#recursos`
- `Como funciona` → `#como-funciona`
- `Planos` → `#planos`
- `FAQ` → `#faq`

Estilo: JetBrains Mono 500, 13px, uppercase, letter-spacing 1.2px, cor `--text-secondary`. Hover: cor `--text-primary`. Underline animado via `::after` (width 0 → 100%, transição 0.3s `--easing-default`).

**CTA pill:** background `--accent`, padding 10px 22px, border-radius 8px, General Sans 600, 13px, cor `#fff`, texto "Começar agora". Hover: background `--accent-hover`, translateY(-1px). Click → mesma lógica de checkout do CTA hero (chama `/api/public-start`).

**Estado inicial:** background transparente, border-bottom transparente.

**Estado scrolled (`window.scrollY > 60px`):** background `rgba(8, 8, 12, 0.85)`, `backdrop-filter: blur(20px) saturate(1.4)`, border-bottom `1px solid var(--border)`. Transição 0.4s.

**Mobile (≤900px):** links escondem (`display:none`); aparece botão hamburger (ícone SVG 24×24px); ao clicar abre overlay full-screen com links empilhados verticalmente em General Sans 600, 24px. CTA pill permanece visível.

### 2. Hero

**Layout container:** min-height `100vh`, position relative, overflow hidden, padding `0 var(--side-pad)`, display flex flex-direction column justify-content center align-items flex-start. Container interno max-width `var(--container)`, width 100%, margin 0 auto.

**Z-index stack:**
- 0: linhas onduladas SVG (background)
- 1: gradient overlay (sutil escurecimento nas bordas)
- 2: conteúdo textual
- (sem foto, sem mockup, sem ink bottle)

**Linhas onduladas (elemento marcante):** SVG full-width position absolute inset 0, viewBox `0 0 1440 900`, preserveAspectRatio `xMidYMid slice`. 3 paths:

```jsx
<svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
  <motion.path
    d="M -100 500 Q 360 300, 720 500 T 1540 500"
    stroke="#e8260a"
    strokeWidth="2.5"
    fill="none"
    animate={{
      d: [
        "M -100 500 Q 360 300, 720 500 T 1540 500",
        "M -100 480 Q 360 320, 720 510 T 1540 490",
        "M -100 500 Q 360 300, 720 500 T 1540 500",
      ],
    }}
    transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
  />
  <motion.path
    d="M -100 600 Q 480 480, 960 580 T 1540 600"
    stroke="#ededef"
    strokeWidth="1.5"
    fill="none"
    opacity="0.7"
    animate={{ /* ondulação dessincronizada */ }}
    transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
  />
  <motion.path
    d="M -100 550 Q 400 400, 800 540 T 1540 540"
    stroke="#4a4a55"
    strokeWidth="1.5"
    strokeDasharray="8 6"
    fill="none"
    animate={{ /* ondulação fase intermediária */ }}
    transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
  />
</svg>
```

(Coordenadas exatas dos paths são guideline — implementação pode ajustar finely durante smoke visual pra ficar bonito em viewport real.)

**Conteúdo textual (z-index 2, max-width 720px, margin esquerda):**

1. **Pré-headline:** `<span className="font-mono uppercase text-xs tracking-[2.5px] text-accent flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" />ASSISTENTE IA PARA TATUADORES</span>`

2. **Headline:** General Sans 600, `clamp(56px, 9vw, 128px)`, line-height 1.04, letter-spacing -0.02em, cor `--text-primary`. Texto em 3 linhas (quebras explícitas via `<br />` ou `<span className="block">`):
   ```
   Seu estúdio
   não para nem
   quando você dorme.
   ```
   Margem-top do pré-headline: 24px.

3. **Sub-headline:** General Sans 400, 17px, line-height 1.7, cor `--text-secondary`, max-width 540px, margin-top 32px:
   > "A assistente virtual que atende, orça e agenda seus clientes pelo WhatsApp 24 horas por dia — sem você precisar responder uma mensagem."

4. **Botões (gap 16px, margin-top 40px):**
   - Primary `Começar agora →` — background `--accent`, color `#fff`, padding 14px 30px, radius 8px, General Sans 600, 14px. Hover: `--accent-hover`, translateY(-2px), box-shadow `--shadow-button`.
   - Ghost `▶ Ver demo` — background transparent, color `--text-primary`, padding 14px 28px, border 1px `rgba(255,255,255,0.1)`, radius 8px, General Sans 500, 14px. Hover: border `--accent-border`, color `--accent`, background `--accent-soft`. Click: smooth-scroll pra `#demo`.

**Animação de entrada do conteúdo:** Framer Motion `initial={{opacity:0, y:30}} animate={{opacity:1, y:0}} transition={{duration:0.8, delay:0.1, ease:--easing-default}}` em cascata: pré-headline → headline (delay 0.2s) → sub (delay 0.4s) → CTAs (delay 0.6s).

### 3. Stats Strip

**Layout:** background `--bg-card`, border-top + border-bottom `--border`, padding `48px var(--side-pad)`. Container interno max-width `var(--container)`, grid 4 colunas.

**Cada stat:** text-align center, padding `0 24px`, border-right `--border` (último sem). Conteúdo:

- Valor: General Sans 700, `clamp(40px, 5vw, 64px)`, letter-spacing -0.02em, cor `--text-primary`
- Label: JetBrains Mono 500, 11px, uppercase, letter-spacing 2px, cor `--text-muted`, margin-top 8px

**Conteúdo (preservar legacy):**
1. `24/7` — `Atendimento`
2. `2s` — `Tempo de resposta`
3. `94%` — `Taxa de confirmação`
4. `R$0` — `Custo por atendimento`

**Mobile (≤600px):** grid 2 colunas, gap 24px row, sem border-right.

### 4. Recursos (features)

**Layout container:** padding vertical `--section-padding`, padding horizontal `--side-pad`. Container interno max-width `var(--container)`, margin 0 auto.

**Section header:**
- Pré-label `[ RECURSOS ]` em JetBrains Mono 500, 12px, uppercase, letter-spacing 2.5px, cor `--accent`, com bullet `●` antes (gap 8px).
- Headline H2 General Sans 600, `clamp(36px, 5vw, 64px)`, line-height 1.1, letter-spacing -0.015em, cor `--text-primary`, max-width 720px, margin-top 16px:
  > "Tudo que um atendente ideal faria, **sem pausa pra café.**"
  
  Palavra final em vermelho (span `text-accent`).

**Grid features:** 3 colunas, gap 24px, margin-top 64px.

**Cada card (`<article className="feature-card">`):**
- Background `--bg-card`, border 1px `--border`, border-radius 14px, padding 36px 28px, position relative, overflow hidden, transição all 0.4s `--easing-default`
- Number editorial: JetBrains Mono 600, 13px, letter-spacing 1.5px, cor `--accent`, text-content `01`/`02`/.../`06`. Margin-bottom 16px.
- Título: General Sans 600, 22px, line-height 1.3, cor `--text-primary`. Margin-bottom 12px.
- Descrição: General Sans 400, 15px, line-height 1.65, cor `--text-secondary`.
- `::after` decorativo: position absolute top 0 left 0 right 0 height 2px, background linear-gradient 90deg `--accent` → transparent, transform scaleX(0), transform-origin left, transition 0.5s `--easing-default`.
- **Hover:** translateY(-6px), border-color `--accent-border`, box-shadow `--shadow-card`. `::after` scaleX(1).

**Conteúdo (preservar legacy):**

| # | Título | Descrição |
|---|---|---|
| 01 | Atendimento 24/7 | (preservar copy da legacy) |
| 02 | Orçamento inteligente | (preservar) |
| 03 | Agenda integrada | (preservar) |
| 04 | Follow-up automático | (preservar) |
| 05 | Portfolio por estilo | (preservar) |
| 06 | Multi-artista | (preservar) |

**Implementação:** o copy real deve ser copiado verbatim do `inkflow-saas/index.html` (seções `#recursos`) durante implementação.

**Responsivo:**
- ≤900px: 2 colunas
- ≤600px: 1 coluna

### 5. Como Funciona (steps)

**Layout:** background `--bg-card` (alternância visual com Recursos), border-top + border-bottom `--border`, padding vertical `--section-padding`, padding horizontal `--side-pad`. Container max-width `var(--container)`, margin 0 auto.

**Section header:** mesmo padrão de Recursos:
- Pré-label `[ COMO FUNCIONA ]`
- Headline: "Do cadastro ao primeiro cliente **em menos de 5 minutos.**"

**Grid steps:** 3 colunas, gap 0, margin-top 64px.

**Cada step:**
- Padding 0 40px, border-left 1px `--border` (primeiro sem; padding-left 0)
- Number gigante: General Sans 700, 64px, letter-spacing -0.02em, cor `--accent`, line-height 1.0. Texto: `01`, `02`, `03`. Margin-bottom 24px.
- Título: General Sans 600, 20px, cor `--text-primary`. Margin-bottom 12px.
- Descrição: General Sans 400, 15px, line-height 1.65, cor `--text-secondary`.

**Conteúdo (preservar legacy):**

| # | Título | Descrição |
|---|---|---|
| 01 | Se cadastre | (preservar copy) |
| 02 | Conecte o WhatsApp | (preservar) |
| 03 | Durma tranquilo | (preservar) |

**Responsivo (≤900px):** stack vertical, border-left → border-bottom no separador, padding-bottom 40px no penúltimo, último sem border.

### 6. Demo (mockup do produto)

**Layout:** padding vertical `--section-padding`, padding horizontal `--side-pad`. Container max-width 720px, centralizado.

**Section header:**
- Pré-label `[ DEMO ]`
- Headline centralizado: "Veja na prática como **é rápido começar.**"

**Mockup WhatsApp:** container max-width 540px, margin 64px auto 0, background `#0d1418` (cor real WhatsApp dark mode), border 1px `--border`, border-radius 24px, padding 0, overflow hidden, position relative.

**Estrutura do mockup (HTML/CSS real, não imagem):**

1. **Header WhatsApp:** background `#1f2c33`, padding 12px 16px, display flex align-items center gap 12px:
   - Avatar: 40×40px circular com inicial "I" em fundo `--accent` (mock do bot InkFlow)
   - Nome + status: "InkFlow Studio" em branco 15px peso 500 + "online" em verde `#00d4aa` 12px

2. **Body conversa:** padding 16px, display flex flex-direction column gap 8px:
   - Bubble cliente (recebida, alinhada esquerda): background `#1f2c33`, padding 8px 12px, border-radius `8px 8px 8px 2px`, max-width 75%, texto General Sans 400 14px branco. Texto plausível: `"Oi, vocês fazem um braço inteiro?"`
   - Bubble bot (enviada, alinhada direita): background `#005c4b` (verde WhatsApp), padding 8px 12px, border-radius `8px 8px 2px 8px`, max-width 75%, texto branco. Plausível: `"Olá Mariana! Faço sim. Pra te dar um orçamento preciso, me conta o que você tem em mente: estilo (realismo, fineline, blackwork…), tamanho aproximado e qual braço."`
   - Mais 2-4 bubbles construindo conversa orgânica até o bot enviar `"Posso te marcar pra próxima quinta às 15h?"`. Conteúdo final: bubble cliente `"Pode 🙏"`.

3. **Typing indicator estático na última bubble do bot** (3 dots cinza-claro animados — opcional, pode usar Framer Motion).

**Animação de entrada:** scroll reveal do container completo. Bubbles aparecem em cascata (delay 0.15s entre cada) quando o mockup entra no viewport.

**Mobile (≤600px):** mockup permanece centralizado, max-width 92vw, ajusta padding interno.

### 7. Planos (pricing)

**Layout:** background `--bg-card`, border-top + border-bottom `--border`, padding vertical `--section-padding`, padding horizontal `--side-pad`. Container max-width `var(--container)`, margin 0 auto.

**Section header:**
- Pré-label `[ PLANOS ]`
- Headline centralizado: "Escolha o tamanho **do seu estúdio.**"

**Grid pricing:** 3 colunas, gap 24px, margin-top 64px, align-items stretch.

**Cada card:**
- Background `--bg`, border 1px `--border`, border-radius 14px, padding 40px 32px, display flex flex-direction column gap 24px
- **Card 2 (Estúdio R$497) destacado:**
  - Border 1px `--accent`
  - Position relative com badge "MAIS POPULAR" em pill vermelho absoluto top -12px right 24px (background `--accent`, padding 4px 10px, border-radius 999px, JetBrains Mono 600 10px uppercase letter-spacing 1.5px branco)
- Conteúdo:
  - Nome do plano: General Sans 600, 20px, cor `--text-primary`
  - Preço: General Sans 700, 56px, letter-spacing -0.02em, cor `--text-primary`. Sufix `/mês` em General Sans 400, 15px, cor `--text-secondary` (inline)
  - Lista de features (preservar legacy): `<ul>` sem bullets, gap 12px. Cada item: `<li>` com check `✓` (cor `--text-muted`) à esquerda + texto General Sans 400 15px cor `--text-primary`
  - CTA `Começar agora` no rodapé, full-width, padrão btn-primary

**Conteúdo (preservar legacy):** copiar literalmente as 3 colunas existentes (R$197/R$497/R$997, features, ações de checkout).

**Responsivo:** ≤900px stack vertical (1 coluna), badge "MAIS POPULAR" mantém destaque.

### 8. FAQ

**Layout:** padding vertical `--section-padding`, padding horizontal `--side-pad`. Container max-width 820px, margin 0 auto.

**Section header:**
- Pré-label `[ DÚVIDAS ]`
- Headline centralizado: "Tudo que você quer saber **antes de começar.**"

**Accordion:** lista de 7 `<details>` (lógica nativa, preserva acessibilidade), border-top + border-bottom `--border-strong` no container.

**Cada item:**
- `<details>` com border-bottom `--border` (último sem)
- `<summary>`: padding 24px 0, display flex justify-content space-between align-items center, cursor pointer
  - Texto: General Sans 600, 17px, cor `--text-primary`
  - Ícone: SVG chevron 16×16px à direita, cor `--text-muted`. Animação rotate 180deg quando `details[open]` (transição 0.3s `--easing-default`).
- Hover summary: cor `--text-primary` → cor `--accent`
- Body (`<div>` dentro de details, fora de summary): padding 0 0 24px, max-width 720px, General Sans 400, 15px, line-height 1.7, cor `--text-secondary`

**Conteúdo (preservar legacy):** 7 perguntas e respostas existentes do `index.html` legacy. Copiar verbatim.

### 9. CTA Final

**Layout:** background `--bg-card`, border-top + border-bottom `--border`, padding vertical 200px (clamp 120-200), padding horizontal `--side-pad`, position relative, overflow hidden, text-align center.

**Glow radial decorativo:** `::before` position absolute inset 0 (centralizado), background `radial-gradient(circle at center, var(--accent-glow) 0%, transparent 70%)`, pointer-events none, z-index 0. Width/height ~80% do container, blur sutil.

**Conteúdo (z-index 1):**
- Headline: General Sans 700, `clamp(48px, 8vw, 96px)`, line-height 1.0, letter-spacing -0.02em, cor `--text-primary`, max-width 940px, margin 0 auto. Texto em 2 linhas:
  > Pronto pra deixar seu estúdio
  > **no piloto automático?**
  
  "no piloto automático?" em vermelho (span `text-accent`). Quebras explícitas.
- Sub: General Sans 400, 17px, line-height 1.7, cor `--text-secondary`, margin-top 24px: "Sem fidelidade. Cancele quando quiser."
- CTA primary `Começar agora →` margin-top 40px (mesmo estilo do CTA hero)

### 10. Footer

**Layout:** background `--bg`, padding vertical 64px, padding horizontal `--side-pad`. Container max-width `var(--container)`, margin 0 auto.

**Top section:** display flex justify-content space-between align-items flex-start, gap 64px, padding-bottom 48px, border-bottom `--border`.

**Coluna 1 — Brand:**
- Logo + nome InkFlow (mesma do nav)
- Tagline: JetBrains Mono 400, 12px, line-height 1.6, cor `--text-muted`, max-width 280px, margin-top 16px: `"Atendimento WhatsApp automático pra tatuadores. Made in Brazil."`

**Colunas 2-4 — Links agrupados:**
- Cada coluna: header em JetBrains Mono 500, 11px, uppercase, letter-spacing 2px, cor `--text-muted`, margin-bottom 16px
- Lista: General Sans 400, 14px, cor `--text-secondary` (hover `--text-primary`), gap 10px
- Grupos:
  - **Produto:** Recursos · Como funciona · Planos · FAQ
  - **Empresa:** Sobre · Contato · Blog (links opcionais — usar `#` placeholder se não existir página)
  - **Legal:** Termos · Privacidade · LGPD (links pra `termos.html` legacy se já existir)

**Bottom section:** padding-top 32px, display flex justify-content space-between align-items center.
- Copyright: General Sans 400, 13px, cor `--text-muted`: "© 2026 InkFlow. Todos os direitos reservados."
- Redes sociais: ícones SVG 18×18px (Instagram, Twitter/X, LinkedIn — preservar links da legacy se existirem), cor `--text-muted` (hover `--text-primary`), gap 16px.

**Responsivo (≤900px):** top section stack vertical, gap 48px, colunas full-width. Bottom section stack vertical centralizado.

---

## Animações globais

### Scroll Reveal (todas as seções principais)

Implementação: Framer Motion `whileInView` com:

```jsx
<motion.div
  initial={{ opacity: 0, y: 30 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-80px" }}
  transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
>
  {/* conteúdo da seção */}
</motion.div>
```

Aplicar em: section headers, card grids (com stagger 0.1s entre filhos), step grids, mockup WhatsApp, FAQ items.

### Linhas onduladas do hero

Framer Motion `motion.path` com `animate={{ d: [...waves] }}` em loop infinito. 3 paths com:
- Curva 1 (vermelha): duration 14s, fase 0
- Curva 2 (branca): duration 18s, fase 6s (delay)
- Curva 3 (cinza tracejada): duration 16s, fase 3s (delay)

Easing `easeInOut`. Respiração sutil — nenhum path se move mais que ~30px verticalmente em pontos de controle.

**Performance:** todas as 3 paths em UM SVG, GPU-accelerated via `transform` em wrapper se necessário. Target: 60fps em viewport 1440×900 desktop.

### Hover states

- Cards features: `translateY(-6px)` + border-color → `--accent-border` + box-shadow + barra `::after` scaleX 0→1
- Botões primary: `translateY(-2px)` + box-shadow + background `--accent-hover`
- Botões ghost: border-color → `--accent-border` + color → `--accent` + background `--accent-soft`
- Nav links: underline animado via `::after` width 0→100%
- FAQ summary: cor `--text-primary` → cor `--accent` + chevron rotate 180

Todas com transição 0.3-0.4s `--easing-default`.

### Nav scroll state

JavaScript listener em `window.scroll` (passive) toggla classe `.scrolled` quando `window.scrollY > 60`. Transição CSS 0.4s no background + backdrop-filter + border.

---

## Responsividade

### Breakpoints

```css
/* Tailwind 4 default + custom */
sm:    640px
md:    768px
lg:    900px   /* breakpoint custom — não-Tailwind */
xl:    1024px
2xl:   1240px  /* container max-width */
```

### Regras por breakpoint

**≤900px (md/lg):**
- Hero: headline `clamp(56px, 11vw, 96px)`, conteúdo full-width, sub `max-width: 100%`
- Features: grid 2 colunas
- Steps: stack vertical (border-left → border-bottom)
- Pricing: stack vertical
- Footer top: stack vertical
- Nav: hamburger menu

**≤600px (sm):**
- Features: grid 1 coluna
- Stats: grid 2 colunas, gap 24px row, sem border-right
- Hero CTAs: stack vertical full-width
- Headlines de seção: `clamp(28px, 7vw, 36px)`
- Mockup WhatsApp: max-width 92vw
- Pricing card: padding reduzido `32px 24px`
- Footer bottom: stack vertical centralizado

---

## Aceite / critérios de PASS

1. ✅ Build Next.js limpo (`cd web && npm run build` passa sem warnings TypeScript ou Tailwind)
2. ✅ Smoke visual em viewport 1440×900 (desktop) e 390×844 (iPhone 14): todas as 10 seções renderizam corretamente, sem overflow horizontal, sem bugs visíveis
3. ✅ Linhas onduladas do hero animam em loop suave a 60fps (validar via DevTools Performance tab)
4. ✅ Scroll reveal funciona em todas as seções marcadas
5. ✅ FAQ accordion abre/fecha com rotação do chevron
6. ✅ Nav muda visual ao scrollar (>60px) — glassmorphism aplicado
7. ✅ CTAs do hero, pricing e CTA final disparam mesma lógica de checkout da legacy (chama `/api/public-start` com payload existente)
8. ✅ Lighthouse Performance ≥ 85, Accessibility ≥ 90, Best Practices ≥ 95, SEO ≥ 90 (mobile)
9. ✅ Validação cross-browser: Chrome, Safari, Firefox (versões atuais) — visual coerente
10. ✅ Copy literal preservado da legacy (validar diff de texto contra `index.html`)

---

## Riscos identificados

| Risco | Severidade | Mitigação |
|---|---|---|
| Animação das 3 paths SVG no hero gera jank em dispositivos low-end | Médio | Reduzir complexidade dos paths em mobile; opção `prefers-reduced-motion` desabilita animação |
| General Sans via Fontshare CDN tem latência alta ou cai | Baixo | `font-display: swap` + system-ui fallback em todos os usos. Pode-se hospedar localmente via `next/font/local` se Fontshare se mostrar instável |
| Mockup WhatsApp HTML/CSS dá trabalho de produzir bem | Médio | Investir tempo na fidelidade visual desde o início — é a alma da seção Demo. Se fugir do escopo desta sessão, fica em backlog separado |
| "Eleken escuro" vira SaaS B2B genérico (risco apontado no brainstorm) | Alto | 5 princípios não-negociáveis cravados acima na seção "Decisões de design"; smoke visual com pessoa externa antes de mergear (alguém que não viu nem o spec nem o Eleken) |
| Migração de `index.html` legacy pra Next.js build em `inkflowbrasil.com` | Alto | NÃO é escopo deste spec — vira plano de implementação separado. Decisões de deploy + janela + rollback ficam no `/plan` |
| Logos/testimonials ausentes fazem o site parecer pequeno | Médio | Decisão consciente (MVP honesto); hero + mockup WhatsApp precisam carregar o peso visual |

---

## O que NÃO mexer (preservar)

1. **`functions/`** — todas as edge functions Cloudflare Pages permanecem, incluindo `/api/public-start` chamado pelos CTAs
2. **`onboarding.html`, `admin.html`, `reconnect.html`, `studio.html`, `termos.html`** — outros HTMLs legacy do root
3. **Pricing logic** — preços, features, lógica de checkout (3 planos preservados verbatim)
4. **Schema.org / meta tags / SEO** — copiar metadata existente da legacy pro `app/layout.tsx` Next.js
5. **BFCache handler** (`pageshow` listener) — preservar lógica em script
6. **Smooth scroll** — preservar/integrar com novo código
7. **Verde teal `#00d4aa`** no dashboard `/studio` (NÃO usar na landing)
8. **Branch `main`** — qualquer migração de produção fica em PR review aprovado

---

## Próximos passos pós-aprovação

1. Leandro revisa este spec
2. Se ajuste pedido → atualizo + re-revisão
3. Se aprovado → invoco `superpowers:writing-plans` pra gerar plano de implementação detalhado (com tasks, ordem, checkpoints, branch strategy, deploy strategy)
4. Plano executado em sessão fresca via `superpowers:subagent-driven-development` ou `executing-plans`
5. PR aberto, smoke visual, deploy em CF Pages, migração de `inkflowbrasil.com`

---

## Decisões pendentes pro plano de implementação (NÃO pro spec)

1. **Estrutura de componentes Next.js:** monolítica `app/page.tsx` vs componentes separados (`<Hero>`, `<Stats>`, `<Features>`, etc) em `components/landing/`. Default profissional: separados.
2. **Uso de shadcn/ui:** `Button`, `Accordion` da shadcn vs custom. Default: custom (controle 100% do visual editorial).
3. **Branch strategy:** continuar em `feat/web-nextjs-bootstrap` (1 PR grande) vs push bootstrap → mergear → criar `feat/landing-v2` de `main` (PRs separados).
4. **Imagens/assets:** ink-bottle SVG vai pra `web/public/` se for usado como logo? (Hoje no spec, ink-bottle NÃO é usado na landing v2, mas pode virar logo do nav.)
5. **Deploy:** continuar CF Pages servindo `index.html` legacy enquanto Next.js builda em rota separada (preview), ou troca direta? Janela de migração?
6. **Animação `prefers-reduced-motion`:** todas as animações respeitam o setting do usuário?
7. **Testes E2E (Playwright?) ou só smoke manual?**

Essas decisões ficam pro `/plan` — não invalidam o spec visual.
