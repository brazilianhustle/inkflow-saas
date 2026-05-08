# Landing v2 — InkFlow (Eleken Escuro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a landing v2 (Eleken escuro) em Next.js 16 + Tailwind 4 + Framer Motion, exportada como site estático e migrada gradualmente pra `inkflowbrasil.com` com janela de smoke em preview.

**Architecture:** Componentes separados por seção em `web/components/landing/*`, composição enxuta em `app/page.tsx`. CSS via tokens em `globals.css` + classes Tailwind utility. Animações via Framer Motion (`motion`). Static export (`output: 'export'`) → `web/out/` → CF Pages preview project → swap controlado pra root.

**Tech Stack:** Next.js 16.2.6 · React 19.2.4 · TypeScript 5 · Tailwind 4 · Framer Motion (`motion`) · General Sans (Fontshare CDN) · JetBrains Mono (Google Fonts CDN) · Cloudflare Pages (deploy).

**Spec base:** [`docs/superpowers/specs/2026-05-08-landing-v2-design.md`](../specs/2026-05-08-landing-v2-design.md) (commit `9b3d319`).

**Decisões de plano (resolvidas em `/plan`):**

| # | Decisão | Razão |
|---|---|---|
| P1 | **Componentes separados por seção** em `web/components/landing/{Nav,Hero,HeroLines,Stats,Features,HowItWorks,Demo,Pricing,Faq,CtaFinal,Footer}.tsx`. `app/page.tsx` só compõe. | Padrão de mercado, 1 task = 1 componente, fácil de revisar isolado, fácil de iterar. |
| P2 | **Custom 100% nesta landing** (sem shadcn). Mantém `button.tsx` instalado pro dashboard futuro mas não consome aqui. FAQ via `<details>/<summary>` nativo. | Estética Eleken precisa controle total da tipografia/paleta/espaçamento. shadcn defaults são "clean SaaS" — oposto da direção. |
| P3 | **Branch strategy:** push `feat/web-nextjs-bootstrap` → PR pequeno → merge → criar `feat/landing-v2` from `main` → outro PR só da landing. | PRs revisáveis, rollback granular. Bootstrap é zero-risk (nada em prod usa `web/` ainda). |
| P4 | **Deploy:** Static export Next.js → CF Pages preview project (subdomínio `v2.inkflowbrasil.com`) → smoke 24-48h → swap pra root. Functions/ continuam intactas. | Spec D10: "conteúdo dinâmico nenhum" — static export é suficiente. Janela de smoke pré-prod com rollback trivial. |

---

## File Structure

**Bootstrap PR (já existe na branch `feat/web-nextjs-bootstrap`):** scaffold default do Next.js + shadcn. Nada a adicionar — só PR + merge.

**Landing v2 PR (em nova branch `feat/landing-v2` from `main`):**

| Path | Responsabilidade |
|---|---|
| `web/next.config.ts` | Modificar: `output: 'export'` + `images: { unoptimized: true }` |
| `web/app/layout.tsx` | Reescrever: fontes (General Sans + JetBrains Mono via `<link>`), metadata SEO copiada da legacy, JSON-LD Schema.org, BFCache handler |
| `web/app/globals.css` | Reescrever: design tokens (paleta, tipografia, espaçamento, sombras, easing) |
| `web/app/page.tsx` | Reescrever: composição das 10 seções, sem lógica |
| `web/lib/copy.ts` | Criar: const tipada com TODO copy literal extraído de `index.html` legacy |
| `web/lib/checkout.ts` | Criar: `startCheckout(plan)` — wrapper único pra `/api/public-start` (DRY entre Nav, Hero, Pricing, CtaFinal) |
| `web/lib/animations.ts` | Criar: variants Framer Motion compartilhadas (`fadeUp`, `staggerContainer`, etc) |
| `web/components/landing/Nav.tsx` | Logo + 4 links + CTA pill, scroll state (`window.scrollY > 60`), mobile hamburger |
| `web/components/landing/Hero.tsx` | Texto: pré-headline mono, headline 3 linhas, sub, 2 CTAs, animação cascata |
| `web/components/landing/HeroLines.tsx` | SVG full-bleed com 3 paths animadas (vermelha/branca/cinza tracejada) — separado pela complexidade |
| `web/components/landing/Stats.tsx` | Strip 4 stats (24/7, 2s, 94%, R$0) |
| `web/components/landing/Features.tsx` | 6 cards com number editorial + barra `::after` no hover |
| `web/components/landing/HowItWorks.tsx` | 3 steps com number gigante vermelho |
| `web/components/landing/Demo.tsx` | Mockup WhatsApp (HTML/CSS, não imagem) com 5+ bubbles |
| `web/components/landing/Pricing.tsx` | 3 planos, badge "MAIS POPULAR" no Estúdio |
| `web/components/landing/Faq.tsx` | 7 `<details>/<summary>` com chevron animado |
| `web/components/landing/CtaFinal.tsx` | Headline gigante + glow radial + CTA |
| `web/components/landing/Footer.tsx` | 4 colunas (Brand + Produto + Empresa + Legal) + bottom (copyright + redes) |

**Cleanup:** apagar `web/app/page.module.css` se existir (Next default scaffold) — não usamos CSS modules.

**O que NÃO mexer:** `functions/`, todos os HTMLs do root (`onboarding.html`, `admin.html`, `reconnect.html`, `studio.html`, `termos.html`, `index.html` legacy fica até o swap), branch `main` direto.

---

## Test strategy

Spec não pede testes automatizados (não-objetivo #10). Substituímos TDD por **smoke visual com critérios explícitos** em cada task de componente:

1. **Pre-implementation smoke**: `npm run dev` mostra placeholder visível e renderiza sem console errors.
2. **Post-implementation smoke**: navegador em viewport 1440×900 e 390×844 — verifica critérios visuais explícitos do spec (tipografia, paleta, espaçamento, hovers, animações).
3. **Build smoke**: `npm run build` passa sem warnings TypeScript ou Tailwind.

Validação automatizada final: Lighthouse (Task 14) + Build limpo (Task 15).

---

## Tasks

### Task 1: Push bootstrap branch + PR + merge

**Files:** nenhum a modificar. Operação git/GitHub.

**Pre-requisitos:** branch `feat/web-nextjs-bootstrap` localmente com 39 commits ahead de main. Remote `origin` configurado.

- [ ] **Step 1: Verificar estado da branch**

```bash
git status
git log --oneline main..feat/web-nextjs-bootstrap | wc -l
git diff main..feat/web-nextjs-bootstrap --stat | tail -5
```

Expected: working tree clean (excluindo `?? docs/superpowers/...`); ~39 commits; estatísticas razoáveis (+arquivos em `web/`, sem deletar nada de prod).

- [ ] **Step 2: Verificar que index.html legacy NÃO foi tocado**

```bash
git diff main..feat/web-nextjs-bootstrap -- index.html
```

Expected: vazio (nenhum diff). Se houver diff → STOP, investigar antes de continuar.

- [ ] **Step 3: Push da branch**

```bash
git push -u origin feat/web-nextjs-bootstrap
```

Expected: branch criada no remote.

- [ ] **Step 4: Abrir PR via gh**

```bash
gh pr create --title "feat(web): bootstrap Next.js 16 + Tailwind 4 + shadcn/ui" --body "$(cat <<'EOF'
## Summary

- Adiciona stack Next.js 16.2.6 + React 19.2.4 + TypeScript 5 + Tailwind 4 + shadcn/ui 4.7.0 em `web/`.
- Scaffold default sem feature alguma. Nada em prod consome `web/` ainda — `inkflowbrasil.com` continua servido pelo `index.html` legacy.
- Preparação pro spec da landing v2 (`docs/superpowers/specs/2026-05-08-landing-v2-design.md`).

## Test plan

- [x] `cd web && npm install` limpo
- [x] `cd web && npm run build` passa
- [x] `cd web && npm run dev` sobe scaffold default
- [x] `index.html` legacy intocado — `git diff main..HEAD -- index.html` vazio

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL retornada.

- [ ] **Step 5: Aguardar CI verde + aprovação humana e mergear**

```bash
gh pr checks
gh pr merge --squash --delete-branch
```

Expected: merge limpo, branch deletada local + remote.

- [ ] **Step 6: Sincronizar main local**

```bash
git checkout main
git pull
git log --oneline -3
```

Expected: commit do merge no topo.

---

### Task 2: Setup branch `feat/landing-v2` + dependências + tokens + layout + copy

Esta task agrupa o setup pesado pra desbloquear todas as tasks de componente. Segue na ordem dos substeps.

**Files:**
- Create: `web/lib/copy.ts`, `web/lib/checkout.ts`, `web/lib/animations.ts`
- Modify: `web/next.config.ts`, `web/app/layout.tsx`, `web/app/globals.css`, `web/app/page.tsx`
- Delete (se existir): `web/app/page.module.css`

- [ ] **Step 1: Criar branch e instalar Framer Motion**

```bash
git checkout main && git pull
git checkout -b feat/landing-v2
cd web
npm install motion
```

Expected: `motion` (~30KB) adicionada ao `package.json`.

- [ ] **Step 2: Configurar static export em `web/next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
```

Justificativa: `output: 'export'` gera site estático em `web/out/`. `trailingSlash: true` casa com hosts CDN que servem `/` sem rewrite. `images.unoptimized` necessário com export.

- [ ] **Step 3: Reescrever `web/app/globals.css` com design tokens do spec**

Apagar conteúdo atual e substituir por:

```css
@import "tailwindcss";

@theme {
  --color-bg: #08080c;
  --color-bg-card: #111118;
  --color-bg-elevated: #18181f;
  --color-text-primary: #ededef;
  --color-text-secondary: #8a8a95;
  --color-text-muted: #4a4a55;
  --color-accent: #e8260a;
  --color-accent-hover: #ff3d1f;
  --color-border: rgba(255, 255, 255, 0.06);
  --color-border-strong: rgba(255, 255, 255, 0.1);
  --color-success: #00d4aa;

  --font-display: 'General Sans', system-ui, -apple-system, sans-serif;
  --font-body: 'General Sans', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'SFMono-Regular', Menlo, monospace;
}

:root {
  --accent-soft: rgba(232, 38, 10, 0.08);
  --accent-glow: rgba(232, 38, 10, 0.12);
  --accent-border: rgba(232, 38, 10, 0.15);

  --container: 1240px;
  --section-gap: clamp(120px, 16vw, 200px);
  --side-pad: clamp(20px, 4vw, 60px);
  --section-padding: clamp(80px, 12vw, 140px);

  --shadow-card: 0 20px 60px rgba(0, 0, 0, 0.3);
  --shadow-button: 0 8px 32px rgba(232, 38, 10, 0.25);

  --easing-default: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

html { scroll-behavior: smooth; }

body {
  background: var(--color-bg);
  color: var(--color-text-primary);
  font-family: var(--font-body);
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Respeita usuário com prefers-reduced-motion: animações de Framer Motion respeitam isso nativamente; este bloco cobre o smooth-scroll do CSS e qualquer keyframe não-Framer */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Justificativa: tokens batem 1:1 com tabela do spec, paleta + fontes + espaçamento + sombras + easing. `prefers-reduced-motion` é mitigação do risco "Animação das 3 paths SVG no hero gera jank em low-end" (spec).

- [ ] **Step 4: Reescrever `web/app/layout.tsx` com fontes + metadata + Schema.org**

Substituir conteúdo do arquivo por (atenção: o JSON-LD precisa ser **copiado verbatim** de `inkflow-saas/index.html` linhas 49-150 — abrir o arquivo legacy, copiar o `<script type="application/ld+json">` inteiro, transformar em string e injetar via `dangerouslySetInnerHTML`):

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InkFlow — Atendimento WhatsApp Automático pra Tatuadores",
  description:
    "Bot que atende, orça e agenda no WhatsApp do teu estúdio 24h. Trial grátis 7 dias, sem cartão. Pra tatuadores brasileiros que perdem cliente por demora.",
  keywords: [
    "sistema para tatuador",
    "automação WhatsApp tatuagem",
    "agenda online tatuagem",
    "chatbot tatuador",
    "atendimento automático estúdio tatuagem",
  ],
  authors: [{ name: "InkFlow Brasil" }],
  robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  alternates: { canonical: "https://inkflowbrasil.com/" },
  openGraph: {
    type: "website",
    url: "https://inkflowbrasil.com/",
    title: "InkFlow — Atendimento WhatsApp Automático pra Tatuadores",
    description:
      "Bot que atende, orça e agenda no WhatsApp do teu estúdio 24h. Trial grátis 7 dias. Pra tatuadores brasileiros.",
    images: [
      {
        url: "https://inkflowbrasil.com/images/og-default.svg",
        width: 1200,
        height: 630,
        alt: "InkFlow — Atendimento WhatsApp pra estúdios de tatuagem",
      },
    ],
    locale: "pt_BR",
    siteName: "InkFlow",
  },
  twitter: {
    card: "summary_large_image",
    title: "InkFlow — Atendimento WhatsApp Automático pra Tatuadores",
    description:
      "Bot que atende, orça e agenda no WhatsApp do teu estúdio 24h. Trial grátis 7 dias.",
    images: ["https://inkflowbrasil.com/images/og-default.svg"],
  },
  icons: {
    icon: "/images/favicon.svg",
    apple: "/images/apple-touch-icon.png",
  },
};

const SCHEMA_ORG_JSONLD = `<<COLE-AQUI-VERBATIM-O-CONTEÚDO-DO-<script type="application/ld+json"> DA LEGACY index.html LINHAS 49-150>>`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <meta name="language" content="Portuguese" />
        <meta name="geo.region" content="BR" />
        <meta name="geo.placename" content="Brasil" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: SCHEMA_ORG_JSONLD }} />
      </head>
      <body>
        {children}
        {/* BFCache handler — preserva comportamento da legacy: pageshow event garante que o site re-renderiza ao voltar via back-forward cache */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('pageshow', function(e) {
                if (e.persisted) { window.location.reload(); }
              });
            `,
          }}
        />
      </body>
    </html>
  );
}
```

Atenção crítica: a const `SCHEMA_ORG_JSONLD` precisa ter o JSON-LD literal de `inkflow-saas/index.html`. Abrir o arquivo legacy, localizar `<script type="application/ld+json">`, copiar o conteúdo (sem as tags `<script>` em si), trim e colar.

- [ ] **Step 5: Criar `web/lib/copy.ts` extraindo TODO copy de `inkflow-saas/index.html`**

Abrir `inkflow-saas/index.html` legacy e extrair copy verbatim de cada seção. Estrutura final do arquivo:

```ts
// Copy literal extraído de inkflow-saas/index.html — NUNCA modificar sem aprovação explícita.
// Última extração: 2026-05-08 contra index.html commit <SHA>

export const copy = {
  nav: {
    links: [
      { label: "Recursos", href: "#recursos" },
      { label: "Como funciona", href: "#como-funciona" },
      { label: "Planos", href: "#planos" },
      { label: "FAQ", href: "#faq" },
    ],
    cta: "Começar agora",
  },
  hero: {
    preheadline: "ASSISTENTE IA PARA TATUADORES",
    headline: ["Seu estúdio", "não para nem", "quando você dorme."],
    sub: "A assistente virtual que atende, orça e agenda seus clientes pelo WhatsApp 24 horas por dia — sem você precisar responder uma mensagem.",
    ctaPrimary: "Começar agora",
    ctaGhost: "Ver demo",
  },
  stats: [
    { value: "24/7", label: "Atendimento" },
    { value: "2s", label: "Tempo de resposta" },
    { value: "94%", label: "Taxa de confirmação" },
    { value: "R$0", label: "Custo por atendimento" },
  ],
  features: {
    prelabel: "RECURSOS",
    headline: "Tudo que um atendente ideal faria,",
    headlineAccent: "sem pausa pra café.",
    cards: [
      // 6 cards — extrair TÍTULO + DESCRIÇÃO de cada da legacy section #recursos
      { num: "01", title: "<<EXTRAIR DA LEGACY>>", desc: "<<EXTRAIR DA LEGACY>>" },
      { num: "02", title: "<<>>", desc: "<<>>" },
      { num: "03", title: "<<>>", desc: "<<>>" },
      { num: "04", title: "<<>>", desc: "<<>>" },
      { num: "05", title: "<<>>", desc: "<<>>" },
      { num: "06", title: "<<>>", desc: "<<>>" },
    ],
  },
  howItWorks: {
    prelabel: "COMO FUNCIONA",
    headline: "Do cadastro ao primeiro cliente",
    headlineAccent: "em menos de 5 minutos.",
    steps: [
      { num: "01", title: "Se cadastre", desc: "<<EXTRAIR>>" },
      { num: "02", title: "Conecte o WhatsApp", desc: "<<EXTRAIR>>" },
      { num: "03", title: "Durma tranquilo", desc: "<<EXTRAIR>>" },
    ],
  },
  demo: {
    prelabel: "DEMO",
    headline: "Veja na prática como",
    headlineAccent: "é rápido começar.",
    chat: {
      botName: "InkFlow Studio",
      botStatus: "online",
      messages: [
        { from: "client", text: "Oi, vocês fazem um braço inteiro?" },
        {
          from: "bot",
          text:
            "Olá Mariana! Faço sim. Pra te dar um orçamento preciso, me conta o que você tem em mente: estilo (realismo, fineline, blackwork…), tamanho aproximado e qual braço.",
        },
        // 2-4 bubbles intermediárias plausíveis (ex: "Quero realismo, antebraço direito, uns 20cm" / "Beleza! Pra esse tamanho e estilo trabalho com…" / etc) — construir conversa orgânica
        { from: "bot", text: "Posso te marcar pra próxima quinta às 15h?" },
        { from: "client", text: "Pode 🙏" },
      ],
    },
  },
  pricing: {
    prelabel: "PLANOS",
    headline: "Escolha o tamanho",
    headlineAccent: "do seu estúdio.",
    plans: [
      {
        id: "individual",
        name: "Individual",
        price: 197,
        features: ["<<EXTRAIR LISTA DA LEGACY section #planos>>"],
        cta: "Começar agora",
        highlighted: false,
      },
      {
        id: "estudio",
        name: "Estúdio",
        price: 497,
        features: ["<<EXTRAIR>>"],
        cta: "Começar agora",
        highlighted: true,
        badge: "MAIS POPULAR",
      },
      {
        id: "vip",
        name: "VIP",
        price: 997,
        features: ["<<EXTRAIR>>"],
        cta: "Começar agora",
        highlighted: false,
      },
    ],
  },
  faq: {
    prelabel: "DÚVIDAS",
    headline: "Tudo que você quer saber",
    headlineAccent: "antes de começar.",
    items: [
      // 7 perguntas + respostas extraídas verbatim da seção #faq da legacy
      { q: "<<EXTRAIR>>", a: "<<EXTRAIR>>" },
      { q: "<<EXTRAIR>>", a: "<<EXTRAIR>>" },
      { q: "<<EXTRAIR>>", a: "<<EXTRAIR>>" },
      { q: "<<EXTRAIR>>", a: "<<EXTRAIR>>" },
      { q: "<<EXTRAIR>>", a: "<<EXTRAIR>>" },
      { q: "<<EXTRAIR>>", a: "<<EXTRAIR>>" },
      { q: "<<EXTRAIR>>", a: "<<EXTRAIR>>" },
    ],
  },
  ctaFinal: {
    headlineLine1: "Pronto pra deixar seu estúdio",
    headlineLine2: "no piloto automático?",
    sub: "Sem fidelidade. Cancele quando quiser.",
    cta: "Começar agora",
  },
  footer: {
    tagline: "Atendimento WhatsApp automático pra tatuadores. Made in Brazil.",
    columns: [
      {
        header: "Produto",
        links: [
          { label: "Recursos", href: "#recursos" },
          { label: "Como funciona", href: "#como-funciona" },
          { label: "Planos", href: "#planos" },
          { label: "FAQ", href: "#faq" },
        ],
      },
      {
        header: "Empresa",
        links: [
          { label: "Sobre", href: "#" },
          { label: "Contato", href: "#" },
          { label: "Blog", href: "#" },
        ],
      },
      {
        header: "Legal",
        links: [
          { label: "Termos", href: "/termos.html" },
          { label: "Privacidade", href: "/termos.html" },
          { label: "LGPD", href: "/termos.html" },
        ],
      },
    ],
    copyright: "© 2026 InkFlow. Todos os direitos reservados.",
    socials: [
      // extrair links Instagram/Twitter/LinkedIn da legacy se existirem; senão omitir
    ],
  },
} as const;
```

Atenção: marcadores `<<EXTRAIR DA LEGACY>>` e `<<>>` são placeholders — substituir pela extração real do `inkflow-saas/index.html` antes de continuar pra próxima task. Nada com `<<EXTRAIR>>` pode chegar em committed code.

- [ ] **Step 6: Criar `web/lib/checkout.ts`**

Abrir `inkflow-saas/index.html` legacy, localizar a função JS que dispara `/api/public-start` (provavelmente próximo aos botões CTA, dentro de `<script>`), entender o shape do payload + tratamento de erro. Portar pra:

```ts
type Plan = "individual" | "estudio" | "vip";

export async function startCheckout(plan: Plan = "individual") {
  // Replicar EXATAMENTE o shape de payload + headers + tratamento de erro da legacy.
  // Se a legacy redireciona pra URL retornada → replicar.
  // Se a legacy abre nova aba → replicar.
  // Se a legacy mostra alert em erro → replicar.
  try {
    const res = await fetch("/api/public-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.checkout_url) {
      window.location.href = data.checkout_url;
    } else {
      throw new Error("Sem checkout_url na resposta");
    }
  } catch (err) {
    console.error("Erro ao iniciar checkout:", err);
    alert("Algo deu errado. Tenta de novo em alguns segundos.");
  }
}
```

Atenção: o código acima é **estimativa** — verificar contra o JS da legacy e ajustar se shape divergir.

- [ ] **Step 7: Criar `web/lib/animations.ts`**

```ts
import type { Variants, Transition } from "motion/react";

export const easingDefault: Transition["ease"] = [0.25, 0.46, 0.45, 0.94];

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

export const fadeUpTransition: Transition = {
  duration: 0.7,
  ease: easingDefault,
};
```

- [ ] **Step 8: Reescrever `web/app/page.tsx` com placeholder mínimo**

```tsx
export default function Home() {
  return (
    <main>
      {/* Tasks 3-13 vão preencher esta lista */}
      <p className="p-12 text-text-secondary font-mono text-sm">
        Landing v2 — implementação em curso. Veja `docs/superpowers/plans/2026-05-08-landing-v2-implementation.md`.
      </p>
    </main>
  );
}
```

- [ ] **Step 9: Apagar `web/app/page.module.css` se existir**

```bash
rm -f web/app/page.module.css
```

Expected: arquivo removido (ou já não existia).

- [ ] **Step 10: Smoke build + dev**

```bash
cd web && npm run build
```

Expected: build passa, gera `web/out/` com index.html, sem warnings.

```bash
cd web && npm run dev
```

Abrir `http://localhost:3000` no navegador.

Expected:
- Background `#08080c` (preto com leve tom roxo).
- Texto cinza ("Landing v2 — implementação em curso…") visível em fonte mono.
- Console sem errors. Console pode ter um warning de fontes ainda não carregadas — OK.
- View source: `<script type="application/ld+json">` com Schema.org InkFlow.

Se algum smoke falhar → STOP e investigar antes de prosseguir.

- [ ] **Step 11: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas
git add web/next.config.ts web/app/layout.tsx web/app/globals.css web/app/page.tsx web/lib/copy.ts web/lib/checkout.ts web/lib/animations.ts web/package.json web/package-lock.json
git commit -m "$(cat <<'EOF'
feat(web): setup landing v2 — tokens, fontes, copy, checkout, motion

- next.config.ts: output:'export' (static) + images.unoptimized
- globals.css: design tokens completos (paleta escura, fontes, espaçamento, easing) + prefers-reduced-motion
- layout.tsx: General Sans + JetBrains Mono via CDN, metadata SEO + Schema.org JSON-LD verbatim da legacy, BFCache handler
- lib/copy.ts: copy literal extraído de index.html (10 seções)
- lib/checkout.ts: wrapper único pra /api/public-start
- lib/animations.ts: variants Framer Motion compartilhadas
- npm install motion (~30KB)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Componente `Nav.tsx`

**Files:**
- Create: `web/components/landing/Nav.tsx`
- Modify: `web/app/page.tsx` (importar e renderizar)

- [ ] **Step 1: Criar arquivo com placeholder mínimo + importar em page.tsx**

`web/components/landing/Nav.tsx`:

```tsx
"use client";

export default function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-[72px] border-b border-white/10">
      <p className="p-4 text-xs font-mono">[NAV PLACEHOLDER]</p>
    </nav>
  );
}
```

Modificar `web/app/page.tsx`:

```tsx
import Nav from "@/components/landing/Nav";

export default function Home() {
  return (
    <main>
      <Nav />
      <div className="h-screen" />
    </main>
  );
}
```

- [ ] **Step 2: Smoke do placeholder**

`npm run dev` → navegador.

Expected: barra fixa no topo com texto `[NAV PLACEHOLDER]` em fonte mono. Espaço abaixo (h-screen) pra rolar.

- [ ] **Step 3: Implementar visual completo**

Substituir conteúdo de `web/components/landing/Nav.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { startCheckout } from "@/lib/checkout";

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 h-[72px] transition-all duration-[400ms] ${
          scrolled
            ? "bg-[rgba(8,8,12,0.85)] backdrop-blur-[20px] backdrop-saturate-150 border-b border-[var(--color-border)]"
            : "bg-transparent border-b border-transparent"
        }`}
        style={{ paddingLeft: "var(--side-pad)", paddingRight: "var(--side-pad)" }}
      >
        <div className="h-full max-w-[var(--container)] mx-auto flex items-center justify-between gap-8">
          {/* Logo + nome */}
          <a href="/" className="flex items-center gap-3">
            <span className="grid place-items-center w-[34px] h-[34px] rounded-lg bg-[var(--color-accent)] font-display font-bold text-[18px] text-white">
              I
            </span>
            <span className="font-display font-bold text-[19px] tracking-[-0.5px] text-text-primary">
              InkFlow
            </span>
          </a>

          {/* Links centrais (desktop) */}
          <ul className="hidden lg:flex items-center gap-7">
            {copy.nav.links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="font-mono font-medium text-[13px] uppercase tracking-[1.2px] text-text-secondary hover:text-text-primary relative group transition-colors"
                >
                  {link.label}
                  <span className="absolute bottom-[-4px] left-0 h-px bg-current w-0 group-hover:w-full transition-all duration-300 ease-[var(--easing-default)]" />
                </a>
              </li>
            ))}
          </ul>

          {/* CTA pill (desktop + mobile sempre visível) */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => startCheckout("individual")}
              className="hidden sm:inline-block bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-display font-semibold text-[13px] px-[22px] py-[10px] rounded-lg transition-all duration-300 hover:-translate-y-px"
            >
              {copy.nav.cta}
            </button>

            {/* Hamburger mobile */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Abrir menu"
              aria-expanded={mobileOpen}
              className="lg:hidden text-text-primary"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileOpen ? (
                  <path d="M6 6 L18 18 M18 6 L6 18" strokeLinecap="round" />
                ) : (
                  <>
                    <line x1="3" y1="7" x2="21" y2="7" strokeLinecap="round" />
                    <line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round" />
                    <line x1="3" y1="17" x2="21" y2="17" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Overlay mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-[var(--color-bg)] pt-[72px] lg:hidden">
          <ul className="flex flex-col items-center gap-8 pt-12">
            {copy.nav.links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="font-display font-semibold text-[24px] text-text-primary"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <button
                onClick={() => {
                  setMobileOpen(false);
                  startCheckout("individual");
                }}
                className="bg-[var(--color-accent)] text-white font-display font-semibold text-[14px] px-8 py-3 rounded-lg"
              >
                {copy.nav.cta}
              </button>
            </li>
          </ul>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Smoke visual**

`npm run dev` → navegador em desktop (1440×900) e mobile (390×844 via DevTools).

Expected (desktop):
- Logo "I" vermelho 34×34 + "InkFlow" branco à esquerda.
- 4 links centralizados em mono uppercase 13px cinza, gap 28px.
- Botão "Começar agora" pill vermelho à direita.
- Inicial transparente — ao rolar 60px, vira `rgba(8,8,12,0.85)` com `backdrop-blur` e border-bottom.
- Hover em link: cor branca + underline animado da esquerda pra direita.
- Hover em botão: cor vermelho mais clara + leve translateY.

Expected (mobile):
- Links escondem, hamburger aparece.
- Click hamburger → overlay fullscreen com links empilhados centralizados.
- Botão CTA visível em ambos os modos.

- [ ] **Step 5: Commit**

```bash
git add web/components/landing/Nav.tsx web/app/page.tsx
git commit -m "feat(web): Nav com logo, links, CTA pill, scroll state e mobile menu

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Componente `Hero.tsx` (texto sem linhas onduladas)

Linhas onduladas saem na Task 5 — separação pela complexidade.

**Files:**
- Create: `web/components/landing/Hero.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Criar Hero com placeholder**

`web/components/landing/Hero.tsx`:

```tsx
"use client";

export default function Hero() {
  return (
    <section className="min-h-screen flex flex-col justify-center" style={{ paddingLeft: "var(--side-pad)", paddingRight: "var(--side-pad)" }}>
      <p className="font-mono">[HERO PLACEHOLDER]</p>
    </section>
  );
}
```

Atualizar `page.tsx`:

```tsx
import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
    </main>
  );
}
```

- [ ] **Step 2: Smoke placeholder**

`npm run dev` → expected: tela inteira preta com texto "[HERO PLACEHOLDER]" mono.

- [ ] **Step 3: Implementar Hero completo (texto, sem linhas)**

Substituir `web/components/landing/Hero.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { startCheckout } from "@/lib/checkout";
import { easingDefault } from "@/lib/animations";

export default function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col justify-center overflow-hidden"
      style={{ paddingLeft: "var(--side-pad)", paddingRight: "var(--side-pad)" }}
    >
      {/* Linhas onduladas serão inseridas pela Task 5 (HeroLines) — z-0 */}

      {/* Conteúdo textual — z-10 */}
      <div className="relative z-10 max-w-[var(--container)] w-full mx-auto">
        <div className="max-w-[720px]">
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: easingDefault }}
            className="font-mono font-medium uppercase text-xs tracking-[2.5px] text-[var(--color-accent)] flex items-center gap-2"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            {copy.hero.preheadline}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: easingDefault }}
            className="font-display font-semibold text-text-primary mt-6"
            style={{
              fontSize: "clamp(56px, 9vw, 128px)",
              letterSpacing: "-0.02em",
              lineHeight: 1.04,
            }}
          >
            {copy.hero.headline.map((line, i) => (
              <span key={i} className="block">
                {line}
              </span>
            ))}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5, ease: easingDefault }}
            className="font-display font-normal text-[17px] text-text-secondary max-w-[540px] mt-8"
            style={{ lineHeight: 1.7 }}
          >
            {copy.hero.sub}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7, ease: easingDefault }}
            className="flex flex-wrap gap-4 mt-10"
          >
            <button
              onClick={() => startCheckout("individual")}
              className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-display font-semibold text-[14px] px-[30px] py-[14px] rounded-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-button)]"
            >
              {copy.hero.ctaPrimary} →
            </button>
            <a
              href="#demo"
              className="bg-transparent text-text-primary font-display font-medium text-[14px] px-[28px] py-[14px] rounded-lg border border-white/10 hover:border-[var(--accent-border)] hover:text-[var(--color-accent)] hover:bg-[var(--accent-soft)] transition-all duration-300"
            >
              ▶ {copy.hero.ctaGhost}
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Smoke visual**

`npm run dev` → desktop + mobile.

Expected (desktop 1440×900):
- Pré-headline vermelha mono uppercase com bullet pontinho.
- Headline gigantesca (~115-128px) em 3 linhas, peso semibold General Sans, cinza-quase-branco.
- Sub-headline cinza-médio em 2-3 linhas.
- Dois botões: vermelho preenchido + outline cinza ghost.
- Animação de cascata: pré-headline aparece → headline → sub → botões (delays 100, 300, 500, 700ms).
- Hover botão primário: vermelho mais claro + sobe 2px + glow vermelho atrás.
- Hover botão ghost: borda vermelha + texto vermelho + bg vermelho transparente.

Expected (mobile 390×844):
- Headline `clamp(56px, 11vw, 96px)` — encaixa, não overflow.
- Botões fluem em linha, ou stack vertical se não couberem (`flex-wrap`).

- [ ] **Step 5: Commit**

```bash
git add web/components/landing/Hero.tsx web/app/page.tsx
git commit -m "feat(web): Hero text content + animação cascata Framer Motion

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Componente `HeroLines.tsx` (3 paths SVG animadas)

**Files:**
- Create: `web/components/landing/HeroLines.tsx`
- Modify: `web/components/landing/Hero.tsx` (importar e renderizar atrás do conteúdo)

- [ ] **Step 1: Criar HeroLines**

`web/components/landing/HeroLines.tsx`:

```tsx
"use client";

import { motion } from "motion/react";

export default function HeroLines() {
  return (
    <svg
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      {/* Curva 1: vermelha sólida */}
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

      {/* Curva 2: branca sólida (fase 6s) */}
      <motion.path
        d="M -100 600 Q 480 480, 960 580 T 1540 600"
        stroke="#ededef"
        strokeWidth="1.5"
        fill="none"
        opacity={0.7}
        animate={{
          d: [
            "M -100 600 Q 480 480, 960 580 T 1540 600",
            "M -100 580 Q 480 500, 960 590 T 1540 590",
            "M -100 600 Q 480 480, 960 580 T 1540 600",
          ],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 6 }}
      />

      {/* Curva 3: cinza tracejada (fase 3s) */}
      <motion.path
        d="M -100 550 Q 400 400, 800 540 T 1540 540"
        stroke="#4a4a55"
        strokeWidth="1.5"
        strokeDasharray="8 6"
        fill="none"
        animate={{
          d: [
            "M -100 550 Q 400 400, 800 540 T 1540 540",
            "M -100 530 Q 400 420, 800 550 T 1540 530",
            "M -100 550 Q 400 400, 800 540 T 1540 540",
          ],
        }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
    </svg>
  );
}
```

Justificativa: 3 paths num único SVG (otimização). `pointer-events-none` pra não bloquear cliques. `aria-hidden` porque é decorativo.

- [ ] **Step 2: Inserir em Hero**

Modificar `web/components/landing/Hero.tsx` adicionando antes do bloco "Conteúdo textual":

```tsx
import HeroLines from "./HeroLines";

// ... dentro do <section>, antes do {/* Conteúdo textual */}:
<div className="absolute inset-0 z-0">
  <HeroLines />
</div>

{/* Gradient overlay opcional pra escurecer ainda mais bordas */}
<div className="absolute inset-0 z-[1] bg-gradient-radial from-transparent to-[var(--color-bg)] pointer-events-none" />
```

(Tailwind 4: `bg-gradient-radial` precisa ser definido como utility custom em `globals.css`. Alternativa: `style={{ background: 'radial-gradient(...)' }}`.)

Mais simples — substituir o div overlay por `style`:

```tsx
<div
  className="absolute inset-0 z-[1] pointer-events-none"
  style={{
    background: "radial-gradient(circle at center, transparent 40%, var(--color-bg) 100%)",
  }}
/>
```

- [ ] **Step 3: Smoke visual + performance**

`npm run dev` → desktop.

Expected:
- 3 linhas onduladas atravessando o hero horizontalmente:
  - Vermelha sólida (mais grossa, ~2.5px), passa pelo meio-baixo.
  - Branca sólida fina (~1.5px, opacity 70%), passa mais embaixo.
  - Cinza tracejada (`8 6` dash), passa entre as duas.
- Cada uma respira sutilmente em loop infinito (~14-18s ciclos).
- Conteúdo textual permanece em z-index acima das linhas.
- Bordas do viewport ficam mais escuras (gradient radial sutil) — linhas "saem do nada" e "somem".

Performance check (DevTools → Performance → Record 5s no hero):
- Frame rate ≥ 55fps em desktop normal.
- Se < 55fps em low-end (testar via DevTools throttling 4× CPU): considera `will-change: transform` no SVG.

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/HeroLines.tsx web/components/landing/Hero.tsx
git commit -m "feat(web): HeroLines — 3 SVG paths animadas (vermelha, branca, cinza tracejada)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Componente `Stats.tsx`

**Files:**
- Create: `web/components/landing/Stats.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Criar Stats**

`web/components/landing/Stats.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { fadeUp, fadeUpTransition } from "@/lib/animations";

export default function Stats() {
  return (
    <section
      className="bg-[var(--color-bg-card)] border-t border-b border-[var(--color-border)] py-12"
      style={{ paddingLeft: "var(--side-pad)", paddingRight: "var(--side-pad)" }}
    >
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUp}
        transition={fadeUpTransition}
        className="max-w-[var(--container)] mx-auto grid grid-cols-2 md:grid-cols-4 gap-x-0 gap-y-6"
      >
        {copy.stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`text-center px-6 ${i < copy.stats.length - 1 ? "md:border-r md:border-[var(--color-border)]" : ""}`}
          >
            <div
              className="font-display font-bold text-text-primary"
              style={{ fontSize: "clamp(40px, 5vw, 64px)", letterSpacing: "-0.02em", lineHeight: 1 }}
            >
              {stat.value}
            </div>
            <div className="font-mono font-medium text-[11px] uppercase tracking-[2px] text-text-muted mt-2">
              {stat.label}
            </div>
          </div>
        ))}
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 2: Inserir em page.tsx**

```tsx
import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import Stats from "@/components/landing/Stats";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Stats />
    </main>
  );
}
```

- [ ] **Step 3: Smoke visual**

`npm run dev`.

Expected (desktop):
- Strip horizontal logo abaixo do hero, fundo `#111118`, border top + bottom sutil.
- 4 stats em grid: `24/7 · 2s · 94% · R$0` em fonte gigante peso bold.
- Labels embaixo em mono uppercase tracking largo, cinza claro.
- Border-right sutil entre cada stat.

Expected (mobile ≤ 600px):
- Grid 2 colunas, 2 linhas. Sem border-right entre. Gap row ~24px.

Scroll reveal: ao rolar pra cima e voltar, stats fade-in suave (não a cada vez — `once: true`).

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/Stats.tsx web/app/page.tsx
git commit -m "feat(web): Stats strip — 4 stats com scroll reveal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Componente `Features.tsx` (6 cards)

**Files:**
- Create: `web/components/landing/Features.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Criar Features**

`web/components/landing/Features.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { fadeUp, fadeUpTransition, staggerContainer } from "@/lib/animations";

export default function Features() {
  return (
    <section
      id="recursos"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "var(--section-padding)",
        paddingBottom: "var(--section-padding)",
      }}
    >
      <div className="max-w-[var(--container)] mx-auto">
        {/* Section header */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={fadeUpTransition}
          className="max-w-[720px]"
        >
          <p className="font-mono font-medium uppercase text-xs tracking-[2.5px] text-[var(--color-accent)] flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            [ {copy.features.prelabel} ]
          </p>
          <h2
            className="font-display font-semibold text-text-primary mt-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {copy.features.headline}{" "}
            <span className="text-[var(--color-accent)]">{copy.features.headlineAccent}</span>
          </h2>
        </motion.div>

        {/* Grid de cards */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-16"
        >
          {copy.features.cards.map((card) => (
            <motion.article
              key={card.num}
              variants={fadeUp}
              transition={fadeUpTransition}
              className="group relative bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-[14px] p-9 overflow-hidden transition-all duration-[400ms] ease-[var(--easing-default)] hover:-translate-y-1.5 hover:border-[var(--accent-border)] hover:shadow-[var(--shadow-card)]"
            >
              {/* Barra ::after (top) — usando Tailwind arbitrary com group-hover */}
              <span
                className="absolute top-0 left-0 right-0 h-0.5 origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500 ease-[var(--easing-default)]"
                style={{ background: "linear-gradient(90deg, var(--color-accent), transparent)" }}
              />
              <div className="font-mono font-semibold text-[13px] tracking-[1.5px] text-[var(--color-accent)] mb-4">
                {card.num}
              </div>
              <h3
                className="font-display font-semibold text-[22px] text-text-primary mb-3"
                style={{ letterSpacing: "-0.01em", lineHeight: 1.3 }}
              >
                {card.title}
              </h3>
              <p
                className="font-display font-normal text-[15px] text-text-secondary"
                style={{ lineHeight: 1.65 }}
              >
                {card.desc}
              </p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Inserir em page.tsx**

```tsx
import Features from "@/components/landing/Features";

// ... <main>:
<Features />
```

- [ ] **Step 3: Smoke visual**

Expected (desktop 1440×900):
- Section header: pré-label `[ RECURSOS ]` vermelho mono, depois headline H2 gigante com a palavra "sem pausa pra café." em vermelho.
- 6 cards em grid 3×2 com:
  - Number `01`-`06` em mono vermelho top.
  - Título 22px peso semibold.
  - Descrição cinza médio.
- Hover em card: sobe 6px, border vermelha sutil, shadow, e barra vermelha aparece no topo da esquerda pra direita (~500ms).
- Stagger: cards aparecem em cascata ao rolar (delay 100ms entre cada).

Expected (md = 768-900px): grid 2 colunas (3 linhas).
Expected (sm ≤ 600px): grid 1 coluna.

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/Features.tsx web/app/page.tsx
git commit -m "feat(web): Features — 6 cards com number editorial, hover bar e stagger reveal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Componente `HowItWorks.tsx` (3 steps)

**Files:**
- Create: `web/components/landing/HowItWorks.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Criar HowItWorks**

`web/components/landing/HowItWorks.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { fadeUp, fadeUpTransition, staggerContainer } from "@/lib/animations";

export default function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="bg-[var(--color-bg-card)] border-t border-b border-[var(--color-border)]"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "var(--section-padding)",
        paddingBottom: "var(--section-padding)",
      }}
    >
      <div className="max-w-[var(--container)] mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={fadeUpTransition}
          className="max-w-[720px]"
        >
          <p className="font-mono font-medium uppercase text-xs tracking-[2.5px] text-[var(--color-accent)] flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            [ {copy.howItWorks.prelabel} ]
          </p>
          <h2
            className="font-display font-semibold text-text-primary mt-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {copy.howItWorks.headline}{" "}
            <span className="text-[var(--color-accent)]">{copy.howItWorks.headlineAccent}</span>
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 lg:grid-cols-3 gap-0 mt-16"
        >
          {copy.howItWorks.steps.map((step, i) => (
            <motion.div
              key={step.num}
              variants={fadeUp}
              transition={fadeUpTransition}
              className={`px-0 lg:px-10 ${
                i > 0 ? "lg:border-l lg:border-[var(--color-border)]" : ""
              } ${i < copy.howItWorks.steps.length - 1 ? "border-b lg:border-b-0 border-[var(--color-border)] pb-10 lg:pb-0" : ""}`}
            >
              <div
                className="font-display font-bold text-[var(--color-accent)] mb-6"
                style={{ fontSize: "64px", letterSpacing: "-0.02em", lineHeight: 1 }}
              >
                {step.num}
              </div>
              <h3 className="font-display font-semibold text-[20px] text-text-primary mb-3">
                {step.title}
              </h3>
              <p
                className="font-display font-normal text-[15px] text-text-secondary"
                style={{ lineHeight: 1.65 }}
              >
                {step.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Inserir em page.tsx**

- [ ] **Step 3: Smoke visual**

Expected (desktop):
- Fundo levemente mais claro (`#111118`) — alternância visual com Features.
- Section header com `[ COMO FUNCIONA ]`.
- 3 steps em grid 3 colunas, com border-left vertical entre 2 e 3, padding lateral 40px em cada.
- Cada step: number gigante 64px em vermelho, depois título 20px branco, depois descrição cinza.
- Stagger.

Expected (mobile ≤ 900px):
- Stack vertical, border-bottom entre eles em vez de border-left.

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/HowItWorks.tsx web/app/page.tsx
git commit -m "feat(web): HowItWorks — 3 steps com number editorial vermelho

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Componente `Demo.tsx` (mockup WhatsApp)

**Files:**
- Create: `web/components/landing/Demo.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Criar Demo**

`web/components/landing/Demo.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { fadeUp, fadeUpTransition, staggerContainer } from "@/lib/animations";

export default function Demo() {
  return (
    <section
      id="demo"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "var(--section-padding)",
        paddingBottom: "var(--section-padding)",
      }}
    >
      <div className="max-w-[720px] mx-auto">
        {/* Section header centralizado */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={fadeUpTransition}
          className="text-center"
        >
          <p className="font-mono font-medium uppercase text-xs tracking-[2.5px] text-[var(--color-accent)] flex items-center gap-2 justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            [ {copy.demo.prelabel} ]
          </p>
          <h2
            className="font-display font-semibold text-text-primary mt-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {copy.demo.headline}{" "}
            <span className="text-[var(--color-accent)]">{copy.demo.headlineAccent}</span>
          </h2>
        </motion.div>

        {/* Mockup WhatsApp */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="max-w-[540px] mx-auto mt-16 bg-[#0d1418] border border-[var(--color-border)] rounded-[24px] overflow-hidden"
        >
          {/* Header WhatsApp */}
          <motion.div
            variants={fadeUp}
            transition={fadeUpTransition}
            className="bg-[#1f2c33] px-4 py-3 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-accent)] grid place-items-center font-display font-bold text-white text-[15px]">
              I
            </div>
            <div>
              <div className="font-display font-medium text-[15px] text-white">
                {copy.demo.chat.botName}
              </div>
              <div className="font-display text-[12px] text-[#00d4aa]">
                {copy.demo.chat.botStatus}
              </div>
            </div>
          </motion.div>

          {/* Body conversa */}
          <div className="p-4 flex flex-col gap-2">
            {copy.demo.chat.messages.map((msg, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                transition={fadeUpTransition}
                className={`flex ${msg.from === "bot" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] px-3 py-2 font-display text-[14px] text-white ${
                    msg.from === "bot"
                      ? "bg-[#005c4b] rounded-[8px] rounded-br-[2px]"
                      : "bg-[#1f2c33] rounded-[8px] rounded-bl-[2px]"
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Inserir em page.tsx**

- [ ] **Step 3: Smoke visual**

Expected (desktop):
- Section header centralizado.
- Mockup WhatsApp com bordas arredondadas 24px, max-width 540px, centralizado.
- Header dark `#1f2c33` com avatar redondo "I" vermelho, nome "InkFlow Studio" branco, "online" verde.
- Body fundo `#0d1418`, bubbles alternadas:
  - Cliente esquerda fundo `#1f2c33`, radius `8px 8px 8px 2px`.
  - Bot direita fundo verde WhatsApp `#005c4b`, radius `8px 8px 2px 8px`.
- Texto: pelo menos 5 bubbles, conversa orgânica terminando em "Pode 🙏" do cliente.
- Stagger ao entrar no viewport: bubbles aparecem em cascata.

Expected (mobile ≤ 600px):
- Mockup ocupa ~92vw, padding interno reduz.

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/Demo.tsx web/app/page.tsx
git commit -m "feat(web): Demo — mockup WhatsApp HTML/CSS com 5+ bubbles em cascata

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Componente `Pricing.tsx` (3 planos)

**Files:**
- Create: `web/components/landing/Pricing.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Criar Pricing**

`web/components/landing/Pricing.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { startCheckout } from "@/lib/checkout";
import { fadeUp, fadeUpTransition, staggerContainer } from "@/lib/animations";

export default function Pricing() {
  return (
    <section
      id="planos"
      className="bg-[var(--color-bg-card)] border-t border-b border-[var(--color-border)]"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "var(--section-padding)",
        paddingBottom: "var(--section-padding)",
      }}
    >
      <div className="max-w-[var(--container)] mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={fadeUpTransition}
          className="text-center"
        >
          <p className="font-mono font-medium uppercase text-xs tracking-[2.5px] text-[var(--color-accent)] flex items-center gap-2 justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            [ {copy.pricing.prelabel} ]
          </p>
          <h2
            className="font-display font-semibold text-text-primary mt-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {copy.pricing.headline}{" "}
            <span className="text-[var(--color-accent)]">{copy.pricing.headlineAccent}</span>
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
          className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-16 items-stretch"
        >
          {copy.pricing.plans.map((plan) => (
            <motion.div
              key={plan.id}
              variants={fadeUp}
              transition={fadeUpTransition}
              className={`relative bg-[var(--color-bg)] rounded-[14px] p-10 flex flex-col gap-6 ${
                plan.highlighted
                  ? "border border-[var(--color-accent)]"
                  : "border border-[var(--color-border)]"
              }`}
            >
              {plan.highlighted && plan.badge && (
                <div className="absolute -top-3 right-6 bg-[var(--color-accent)] text-white font-mono font-semibold text-[10px] uppercase tracking-[1.5px] px-2.5 py-1 rounded-full">
                  {plan.badge}
                </div>
              )}

              <div className="font-display font-semibold text-[20px] text-text-primary">
                {plan.name}
              </div>

              <div>
                <span
                  className="font-display font-bold text-text-primary"
                  style={{ fontSize: "56px", letterSpacing: "-0.02em", lineHeight: 1 }}
                >
                  R${plan.price}
                </span>
                <span className="font-display font-normal text-[15px] text-text-secondary ml-1">
                  /mês
                </span>
              </div>

              <ul className="flex flex-col gap-3 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex gap-3 font-display font-normal text-[15px] text-text-primary">
                    <span className="text-text-muted">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => startCheckout(plan.id as "individual" | "estudio" | "vip")}
                className="w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-display font-semibold text-[14px] py-[14px] rounded-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-button)]"
              >
                {plan.cta} →
              </button>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Inserir em page.tsx**

- [ ] **Step 3: Smoke visual**

Expected:
- 3 cards lado a lado (lg: 3 colunas), altura igual (`items-stretch`).
- Card 2 (Estúdio R$497) tem border vermelha + badge "MAIS POPULAR" pill no topo direito.
- Cada card: nome 20px, preço gigante R$X seguido de "/mês" cinza, lista de features com `✓` cinza, CTA full-width vermelho no rodapé.
- CTA dispara `startCheckout` com `plan.id`.

Mobile ≤ 900px: stack vertical, cards full-width.

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/Pricing.tsx web/app/page.tsx
git commit -m "feat(web): Pricing — 3 planos com badge MAIS POPULAR e CTA por plan

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Componente `Faq.tsx` (7 perguntas)

**Files:**
- Create: `web/components/landing/Faq.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Criar Faq**

`web/components/landing/Faq.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { fadeUp, fadeUpTransition } from "@/lib/animations";

export default function Faq() {
  return (
    <section
      id="faq"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "var(--section-padding)",
        paddingBottom: "var(--section-padding)",
      }}
    >
      <div className="max-w-[820px] mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          transition={fadeUpTransition}
          className="text-center"
        >
          <p className="font-mono font-medium uppercase text-xs tracking-[2.5px] text-[var(--color-accent)] flex items-center gap-2 justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            [ {copy.faq.prelabel} ]
          </p>
          <h2
            className="font-display font-semibold text-text-primary mt-4"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.015em", lineHeight: 1.1 }}
          >
            {copy.faq.headline}{" "}
            <span className="text-[var(--color-accent)]">{copy.faq.headlineAccent}</span>
          </h2>
        </motion.div>

        <div className="mt-12 border-t border-b border-[var(--color-border-strong)]">
          {copy.faq.items.map((item, i) => (
            <details
              key={i}
              className={`group ${i < copy.faq.items.length - 1 ? "border-b border-[var(--color-border)]" : ""}`}
            >
              <summary className="flex justify-between items-center py-6 cursor-pointer font-display font-semibold text-[17px] text-text-primary hover:text-[var(--color-accent)] transition-colors list-none">
                <span>{item.q}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-text-muted group-hover:text-[var(--color-accent)] group-open:rotate-180 transition-transform duration-300 ease-[var(--easing-default)]"
                >
                  <path d="M4 6 L8 10 L12 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div
                className="pb-6 max-w-[720px] font-display font-normal text-[15px] text-text-secondary"
                style={{ lineHeight: 1.7 }}
              >
                {item.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Inserir em page.tsx**

- [ ] **Step 3: Smoke visual + a11y**

Expected:
- 7 perguntas em accordion `<details>/<summary>` nativo.
- Cada summary: pergunta peso semibold 17px branco, chevron 16×16 cinza à direita.
- Hover summary: cor vermelha + chevron vira vermelho.
- Click expande resposta com chevron rotando 180°.
- Acessibilidade nativa: tab navega, enter/space expande.

A11y check (DevTools Accessibility tree): cada `<details>` é announced corretamente.

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/Faq.tsx web/app/page.tsx
git commit -m "feat(web): Faq — 7 perguntas em <details>/<summary> nativo com chevron animado

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Componente `CtaFinal.tsx`

**Files:**
- Create: `web/components/landing/CtaFinal.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Criar CtaFinal**

`web/components/landing/CtaFinal.tsx`:

```tsx
"use client";

import { motion } from "motion/react";
import { copy } from "@/lib/copy";
import { startCheckout } from "@/lib/checkout";
import { fadeUp, fadeUpTransition } from "@/lib/animations";

export default function CtaFinal() {
  return (
    <section
      className="relative overflow-hidden bg-[var(--color-bg-card)] border-t border-b border-[var(--color-border)] text-center"
      style={{
        paddingLeft: "var(--side-pad)",
        paddingRight: "var(--side-pad)",
        paddingTop: "clamp(120px, 16vw, 200px)",
        paddingBottom: "clamp(120px, 16vw, 200px)",
      }}
    >
      {/* Glow radial decorativo */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: "radial-gradient(circle at center, var(--accent-glow) 0%, transparent 70%)",
        }}
      />

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUp}
        transition={fadeUpTransition}
        className="relative z-10 max-w-[940px] mx-auto"
      >
        <h2
          className="font-display font-bold text-text-primary"
          style={{ fontSize: "clamp(48px, 8vw, 96px)", letterSpacing: "-0.02em", lineHeight: 1 }}
        >
          <span className="block">{copy.ctaFinal.headlineLine1}</span>
          <span className="block text-[var(--color-accent)]">{copy.ctaFinal.headlineLine2}</span>
        </h2>

        <p
          className="font-display font-normal text-[17px] text-text-secondary mt-6"
          style={{ lineHeight: 1.7 }}
        >
          {copy.ctaFinal.sub}
        </p>

        <button
          onClick={() => startCheckout("individual")}
          className="mt-10 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-display font-semibold text-[14px] px-[30px] py-[14px] rounded-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-button)]"
        >
          {copy.ctaFinal.cta} →
        </button>
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 2: Inserir em page.tsx**

- [ ] **Step 3: Smoke visual**

Expected:
- Section gigante (padding vertical 200px), fundo `#111118` com glow radial vermelho sutil saindo do centro.
- Headline em 2 linhas: linha 1 branca, linha 2 ("no piloto automático?") vermelha. Tamanho `clamp(48,8vw,96px)`.
- Sub centralizada cinza.
- CTA único centralizado.

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/CtaFinal.tsx web/app/page.tsx
git commit -m "feat(web): CtaFinal — headline gigante + glow radial vermelho

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Componente `Footer.tsx`

**Files:**
- Create: `web/components/landing/Footer.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Criar Footer**

`web/components/landing/Footer.tsx`:

```tsx
"use client";

import { copy } from "@/lib/copy";

export default function Footer() {
  return (
    <footer
      className="bg-[var(--color-bg)] py-16"
      style={{ paddingLeft: "var(--side-pad)", paddingRight: "var(--side-pad)" }}
    >
      <div className="max-w-[var(--container)] mx-auto">
        {/* Top */}
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-12 lg:gap-16 pb-12 border-b border-[var(--color-border)]">
          {/* Brand */}
          <div className="max-w-[280px]">
            <a href="/" className="flex items-center gap-3">
              <span className="grid place-items-center w-[34px] h-[34px] rounded-lg bg-[var(--color-accent)] font-display font-bold text-[18px] text-white">
                I
              </span>
              <span className="font-display font-bold text-[19px] tracking-[-0.5px] text-text-primary">
                InkFlow
              </span>
            </a>
            <p className="font-mono font-normal text-[12px] text-text-muted mt-4" style={{ lineHeight: 1.6 }}>
              {copy.footer.tagline}
            </p>
          </div>

          {/* Colunas de links */}
          <div className="flex flex-col sm:flex-row gap-8 sm:gap-16">
            {copy.footer.columns.map((col) => (
              <div key={col.header}>
                <div className="font-mono font-medium text-[11px] uppercase tracking-[2px] text-text-muted mb-4">
                  {col.header}
                </div>
                <ul className="flex flex-col gap-2.5">
                  {col.links.map((link) => (
                    <li key={link.href + link.label}>
                      <a
                        href={link.href}
                        className="font-display font-normal text-[14px] text-text-secondary hover:text-text-primary transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <p className="font-display font-normal text-[13px] text-text-muted">
            {copy.footer.copyright}
          </p>
          {copy.footer.socials.length > 0 && (
            <div className="flex gap-4">
              {/* Mapear socials se existirem na legacy */}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Inserir em page.tsx**

- [ ] **Step 3: Smoke visual**

Expected (desktop):
- Top section: brand à esquerda (logo + nome + tagline) + 3 colunas de links à direita (Produto, Empresa, Legal).
- Header de cada coluna em mono uppercase 11px tracking largo, cinza muito claro.
- Links em General Sans 14px cinza, hover branco.
- Border-bottom sutil entre top e bottom.
- Bottom: copyright esquerda + socials direita (se existirem na legacy).

Mobile ≤ 900px: stack vertical, gap maior.

- [ ] **Step 4: Commit**

```bash
git add web/components/landing/Footer.tsx web/app/page.tsx
git commit -m "feat(web): Footer — brand + 3 colunas + bottom copyright

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Polish global + Lighthouse audit

**Files:**
- Modify: `web/app/page.tsx` (sanity check final), `web/app/globals.css` (eventuais fixes)

- [ ] **Step 1: Verificar composition completa em page.tsx**

`web/app/page.tsx` final:

```tsx
import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import Stats from "@/components/landing/Stats";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import Demo from "@/components/landing/Demo";
import Pricing from "@/components/landing/Pricing";
import Faq from "@/components/landing/Faq";
import CtaFinal from "@/components/landing/CtaFinal";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <Demo />
      <Pricing />
      <Faq />
      <CtaFinal />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 2: Smoke completo end-to-end**

`npm run dev` → percorrer landing inteira em desktop (1440×900) e mobile (390×844 via DevTools).

Checklist:
- ✅ Todas as 10 seções renderizam na ordem certa.
- ✅ Sem overflow horizontal em desktop ou mobile.
- ✅ Sem console errors ou warnings React.
- ✅ Smooth scroll funciona ao clicar nos links da nav (`#recursos`, `#como-funciona`, `#planos`, `#faq`, `#demo`).
- ✅ Nav muda visual ao passar 60px de scroll (background, blur, border).
- ✅ Linhas onduladas do hero animam continuamente.
- ✅ Scroll reveal dispara em cada seção ao entrar no viewport.
- ✅ Hovers funcionam (botões, cards, links nav, FAQ).
- ✅ FAQ expande/colapsa com chevron rotacionando.
- ✅ Mobile menu abre overlay fullscreen.
- ✅ CTAs disparam `startCheckout` (verificar no DevTools Network: chamada POST a `/api/public-start`).

Se algum item falhar → fix antes de prosseguir.

- [ ] **Step 3: Lighthouse audit (mobile)**

DevTools → Lighthouse → device "Mobile" → categorias todas → Run.

Critérios de aceite (do spec):
- Performance ≥ 85
- Accessibility ≥ 90
- Best Practices ≥ 95
- SEO ≥ 90

Issues comuns + fixes rápidos:
- LCP alto: adicionar `<link rel="preload">` na font crítica (General Sans 600).
- CLS alto: garantir que SVG do hero tem `width`/`height` explícitos no contêiner.
- Aria-labels faltando: adicionar em ícones SVG decorativos `aria-hidden`, em botões só com ícone (`aria-label`).
- Contrast issues: rodar contra WCAG e ajustar `--color-text-secondary` se necessário (mas spec já cravou, evitar mudar).

Commit fixes incrementais como sub-commits dessa task.

- [ ] **Step 4: Validação cross-browser**

Abrir `http://localhost:3000` em:
- Chrome (versão atual)
- Safari (versão atual — macOS)
- Firefox (versão atual)

Verificar visual coerente. Issues conhecidos:
- `backdrop-filter` no Nav: Safari/iOS antigos não suportam — fallback é fundo opaco (já resolvido pelo `bg-[rgba(...)]`).
- `prefers-reduced-motion`: testar em Safari → System Settings → Accessibility → Reduce Motion → ON. Animações devem virar instantâneas.

- [ ] **Step 5: Commit do polish**

```bash
git add -A
git commit -m "polish(web): composition final + Lighthouse fixes + cross-browser

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Static build + deploy preview + smoke + gate humano pra swap

Esta task envolve **infra Cloudflare Pages** — usar agent `deploy-engineer` quando possível.

**Files:**
- Pode editar: `wrangler.jsonc` ou criar `web/wrangler.jsonc` separado pro CF Pages preview project.

- [ ] **Step 1: Build static export**

```bash
cd web && npm run build
ls -la out/
```

Expected: pasta `web/out/` com `index.html`, `_next/`, e demais assets estáticos.

- [ ] **Step 2: Smoke local do build**

```bash
cd web/out && npx serve -p 8080
# em outro terminal: open http://localhost:8080
```

Expected: site idêntico ao `npm run dev`, sem hot reload mas funcionalmente igual.

Se algo quebrou no build (cliente components não hidratam, fontes não carregam, etc) → STOP, debug antes de deployar.

- [ ] **Step 3: Abrir PR de `feat/landing-v2` → main**

```bash
git push -u origin feat/landing-v2
gh pr create --title "feat(web): landing v2 — Eleken escuro com Next.js 16 static export" --body "$(cat <<'EOF'
## Summary

- Implementa landing v2 conforme spec `docs/superpowers/specs/2026-05-08-landing-v2-design.md`.
- 10 componentes em `web/components/landing/*`, composição em `app/page.tsx`.
- Static export (`output: 'export'`) → `web/out/`.
- Copy 100% preservado da legacy via `web/lib/copy.ts`.
- Checkout via `web/lib/checkout.ts` chama `/api/public-start` (sem mudança no backend).
- Animações via Framer Motion respeitam `prefers-reduced-motion`.

## Não inclui

- Migração de `inkflowbrasil.com` pra novo build. Será deploy separado em CF Pages preview project após este merge, com smoke 24-48h antes do swap.
- Ajuste de DNS / CF Pages settings → tarefa do `deploy-engineer` agent pós-merge.

## Test plan

- [x] Smoke desktop (1440×900) — todas as 10 seções
- [x] Smoke mobile (390×844) — responsividade
- [x] Lighthouse mobile: Perf ≥85, A11y ≥90, BP ≥95, SEO ≥90
- [x] Cross-browser: Chrome, Safari, Firefox
- [x] FAQ a11y (tab + enter)
- [x] CTAs disparam `/api/public-start`
- [x] `prefers-reduced-motion` desliga animações

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Aguardar CI verde + aprovação humana + merge**

```bash
gh pr checks
# Após aprovação:
gh pr merge --squash --delete-branch
git checkout main && git pull
```

- [ ] **Step 5: Setup CF Pages preview project — `v2.inkflowbrasil.com`**

**Delegate to `deploy-engineer` subagent:**

> "Criar Cloudflare Pages project `inkflow-v2-preview` apontando pra branch `main` da repo `inkflow-saas`, build command `cd web && npm install && npm run build`, output dir `web/out`. Custom domain: `v2.inkflowbrasil.com` (CNAME no DNS apontando pra Pages). Verificar que o projeto NÃO afeta o `inkflowbrasil.com` atual (que continua servindo o `index.html` legacy)."

Output esperado: URL do preview (`https://v2.inkflowbrasil.com`) acessível com a landing v2.

- [ ] **Step 6: Smoke prod preview (24-48h)**

Acessar `https://v2.inkflowbrasil.com`:
- Verificar todos os smokes da Task 14, mas em prod.
- Verificar que `/api/public-start` continua funcionando — fazer 1 click real no CTA, observar redirect pra Mercado Pago checkout.
- Compartilhar URL com pessoa externa (não-Leandro, não-Claude) e pedir feedback visual rápido. Spec: "smoke visual com pessoa externa antes de mergear".
- Aguardar 24-48h pra capturar bugs intermitentes.

Se algum bug crítico → criar issue, voltar pra Task 14 ou anterior, **NÃO swap**.

- [ ] **Step 7: ⛔ GATE HUMANO — aprovação explícita do Leandro pra swap**

Antes de prosseguir pra Step 8: parar e perguntar:

> "Smoke do preview rodou por 24-48h em `v2.inkflowbrasil.com` sem incidentes críticos. Pronto pra swap pra `inkflowbrasil.com`?"

Aprovação explícita necessária (sim/não). Sem aprovação → STOP, plan termina aqui (build + preview disponíveis).

- [ ] **Step 8: Swap — apontar `inkflowbrasil.com` pro novo build**

**Delegate to `deploy-engineer` subagent:**

> "Migrar `inkflowbrasil.com` do projeto CF Pages atual (que serve `index.html` legacy do root da repo) pra novo build do `web/out/`. Estratégia preferida: alterar build command + output dir do projeto Pages atual pra `cd web && npm install && npm run build` + `web/out`, mantendo `functions/` ainda servindo `/api/*`. Não mudar DNS — só config do Pages. Verificar que functions Cloudflare permanecem ativas (CTAs continuam chamando `/api/public-start`). Plano de rollback: revert do PR + redeploy."

Output esperado: `inkflowbrasil.com` agora serve a landing v2; functions intactas.

- [ ] **Step 9: Smoke prod final + tag**

Acessar `https://inkflowbrasil.com`:
- ✅ Landing v2 renderiza
- ✅ Click CTA → `/api/public-start` → Mercado Pago
- ✅ Outras URLs legacy ainda respondem (`/onboarding.html`, `/admin.html`, `/studio.html`, `/termos.html`, `/reconnect.html`)
- ✅ Schema.org JSON-LD presente no view-source

Tagear o commit:

```bash
git tag -a "landing-v2-launch" -m "Landing v2 (Eleken escuro) live em inkflowbrasil.com"
git push origin landing-v2-launch
```

- [ ] **Step 10: Commit do plan completo**

Commitar este arquivo do plan se ainda não estiver no main (do branch `feat/landing-v2` que já mergeou).

```bash
git status docs/superpowers/plans/2026-05-08-landing-v2-implementation.md
# Se untracked → adicionar e commitar separado
git add docs/superpowers/plans/2026-05-08-landing-v2-implementation.md
git commit -m "docs(plan): landing v2 implementation completed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (executada antes de salvar)

**1. Spec coverage** — varredura por seção do spec:

| Spec | Task | OK |
|---|---|---|
| 5 princípios não-negociáveis | Distribuídos em smoke visual de cada componente | ✅ |
| Design tokens (paleta, tipografia, espaçamento) | Task 2 | ✅ |
| Seção 1 Nav | Task 3 | ✅ |
| Seção 2 Hero (texto + linhas) | Tasks 4 + 5 | ✅ |
| Seção 3 Stats | Task 6 | ✅ |
| Seção 4 Features | Task 7 | ✅ |
| Seção 5 HowItWorks | Task 8 | ✅ |
| Seção 6 Demo (mockup WhatsApp) | Task 9 | ✅ |
| Seção 7 Pricing | Task 10 | ✅ |
| Seção 8 FAQ | Task 11 | ✅ |
| Seção 9 CTA Final | Task 12 | ✅ |
| Seção 10 Footer | Task 13 | ✅ |
| Animações globais (scroll reveal, hero lines, hovers, nav scroll) | Task 2 (utils) + Tasks 3-5 (uso) + Task 14 (audit) | ✅ |
| Responsividade | Em cada componente + Task 14 smoke | ✅ |
| Aceite (build limpo, smoke, Lighthouse) | Task 14-15 | ✅ |
| Riscos (jank, fonts, mockup, "Eleken escuro genérico", migração, logos ausentes) | Mitigados nas tasks (prefers-reduced-motion, smoke externo, gate humano) | ✅ |
| Não-mexer (functions/, HTMLs legacy, pricing logic, Schema.org, BFCache, smooth scroll) | Task 2 preserva metadata + BFCache; functions/ intactas; T15 não mexe em outros HTMLs | ✅ |
| Decisões pendentes pro plano (1, 2, 3, 5) | Resolvidas no header do plan (P1-P4) | ✅ |
| Decisões pendentes 4 (ink-bottle SVG) | Não usado nesta landing — confirmado no spec D3. Não-aplicável. | ✅ |
| Decisões pendentes 6 (prefers-reduced-motion) | Task 2 globals.css + Framer Motion respeita nativamente | ✅ |
| Decisões pendentes 7 (E2E vs smoke) | Smoke manual (Task 14) — alinhado ao não-objetivo #10 | ✅ |

Coverage 100%. Nenhum gap.

**2. Placeholder scan:**
- `<<EXTRAIR DA LEGACY>>` em `lib/copy.ts` (Task 2 Step 5) é placeholder **intencional e explícito** — gateado por instrução clara: "Nada com `<<EXTRAIR>>` pode chegar em committed code." Aceito.
- `<<COLE-AQUI-VERBATIM-O-CONTEÚDO-DO-<script>...>>` em `layout.tsx` (Task 2 Step 4) — também explícito + gateado.
- Nenhum "TBD" / "implement later" / "similar to Task N" sem código.
- ✅ Limpo.

**3. Type consistency:**
- `Plan = "individual" | "estudio" | "vip"` em `lib/checkout.ts` consistente com `plan.id` em `copy.ts` e cast `as` em `Pricing.tsx`. ✅
- `copy.faq.items[i].q` e `.a` consistente em `Faq.tsx`. ✅
- `copy.demo.chat.messages[i].from === "bot" | "client"` consistente em `Demo.tsx`. ✅
- `fadeUp`, `staggerContainer`, `fadeUpTransition` definidos em `lib/animations.ts` e usados consistentemente. ✅

Sem inconsistências.

---

## Riscos do plano (não do spec)

| Risco | Severidade | Mitigação |
|---|---|---|
| Extração de copy da legacy demora mais do que parece | Médio | Task 2 isola a extração — agente para se topar `<<EXTRAIR>>` ainda em código |
| Build CF Pages do `web/` quebra (build command, output dir) | Médio | Task 15 delega pro `deploy-engineer` que conhece o config |
| Swap de `inkflowbrasil.com` derruba edge functions `/api/*` | Alto | Mantém `functions/` no mesmo Pages project — só troca o source dos arquivos estáticos. Rollback via revert. |
| Lighthouse mobile < 85 no preview | Médio | Task 14 Step 3 isola fixes incrementais; se falhar critério, criar follow-up plan separado pra otimização |
| Framer Motion `motion/react` API muda entre versões | Baixo | Lock no `package.json`; usar `motion@latest` no momento da Task 2 |

---

## Quantidade de tasks

15 tasks. No limite recomendado (`<15`). Justificado pelo tamanho do spec (619 linhas, 10 seções complexas) — cada componente pesa o equivalente a uma feature mínima.

---

## Próximo passo

Plano salvo. Escolher modo de execução.
