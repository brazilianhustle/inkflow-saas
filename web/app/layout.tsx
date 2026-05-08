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

// Schema.org JSON-LD copiado verbatim de index.html legacy (linhas 50-108).
// Estrutura: SoftwareApplication + Organization + WebSite no @graph.
const SCHEMA_ORG_JSONLD = `{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://inkflowbrasil.com/#software",
      "name": "InkFlow",
      "applicationCategory": "BusinessApplication",
      "applicationSubCategory": "Customer Service Software",
      "operatingSystem": "Web",
      "description": "Sistema brasileiro de automação de atendimento via WhatsApp para estúdios de tatuagem. Bot conversa com clientes, calcula orçamento (faixa, valor exato ou só coleta de info), agenda sessões e cobra sinal automático via PIX/Mercado Pago.",
      "url": "https://inkflowbrasil.com/",
      "inLanguage": "pt-BR",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "BRL",
        "description": "Trial grátis 7 dias, sem cartão de crédito",
        "availability": "https://schema.org/InStock"
      },
      "featureList": [
        "Bot conversacional WhatsApp 24/7",
        "3 modos de precificação (Faixa, Exato, Coleta)",
        "Agenda integrada com Google Calendar",
        "Cobrança automática de sinal via PIX",
        "Reconhecimento de fotos de referência",
        "Customização total do agente"
      ],
      "screenshot": "https://inkflowbrasil.com/images/og-default.svg"
    },
    {
      "@type": "Organization",
      "@id": "https://inkflowbrasil.com/#organization",
      "name": "InkFlow",
      "url": "https://inkflowbrasil.com/",
      "logo": "https://inkflowbrasil.com/images/favicon.svg",
      "description": "SaaS brasileiro que automatiza o atendimento via WhatsApp para estúdios de tatuagem.",
      "areaServed": {
        "@type": "Country",
        "name": "Brasil"
      },
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer support",
        "email": "contato@inkflowbrasil.com",
        "availableLanguage": ["Portuguese"]
      }
    },
    {
      "@type": "WebSite",
      "@id": "https://inkflowbrasil.com/#website",
      "url": "https://inkflowbrasil.com/",
      "name": "InkFlow",
      "description": "Atendimento WhatsApp automático para tatuadores brasileiros",
      "publisher": {"@id": "https://inkflowbrasil.com/#organization"},
      "inLanguage": "pt-BR"
    }
  ]
}`;

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
