// Copy literal extraído de index.html — NUNCA modificar sem aprovação explícita.
// Última extração: 2026-05-08 contra index.html legacy (792 linhas).
//
// Mapeamento legacy → estrutura nova:
//   features cards .........: index.html linhas 440-481 (6 cards)
//   howItWorks steps .......: index.html linhas 495-512 (3 steps com tag de duração)
//   demo chat messages .....: index.html linhas 396-402 (7 bubbles, termina em "Pode!")
//   pricing plans ..........: index.html linhas 546-610 (3 planos: individual, estudio, vip)
//                              IDs mantidos como na legacy: 'individual'|'estudio'|'premium'
//                              (legacy usa 'premium' no startCheckout do plano VIP)
//   faq items ..............: index.html linhas 627-654 (7 perguntas)
//   footer columns .........: index.html linhas 685-702 (Produto, Suporte, Legal)

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
    headline: ["InkFlow", "seu estúdio", "na palma da mão"],
    sub: "A assistente virtual que atende, orça e agenda seus clientes pelo WhatsApp 24 horas por dia — sem você precisar responder uma mensagem.",
    ctaPrimary: "Começar agora",
    ctaGhost: "Ver demo",
    trust: "Usado por tatuadores que não querem mais perder cliente por demora no WhatsApp",
  },
  stats: [
    { value: "24/7", label: "Disponível" },
    { value: "< 2s", label: "Resposta média" },
    { value: "94%", label: "Confirmação" },
    { value: "R$ 0", label: "Em atendente" },
  ],
  features: {
    prelabel: "RECURSOS",
    headline: "Tudo que um atendente ideal faria,",
    headlineAccent: "sem pausa pra café.",
    sub: "Da primeira mensagem até o lembrete de cicatrização. O InkFlow cuida de cada etapa do relacionamento com o cliente.",
    cards: [
      {
        num: "01",
        title: "Atendimento 24/7",
        desc: "Primeira mensagem respondida em menos de 2 segundos. Não importa se é domingo à noite ou feriado.",
      },
      {
        num: "02",
        title: "Orçamento inteligente",
        desc: "A IA entende tamanho, estilo e complexidade e dá uma faixa de preço baseada na sua tabela.",
      },
      {
        num: "03",
        title: "Agenda integrada",
        desc: "Agendamentos caem direto no seu Google Calendar. Zero conflito de horário, zero planilha.",
      },
      {
        num: "04",
        title: "Follow-up automático",
        desc: "Lembretes pré-sessão, instruções de cicatrização e convite pra retorno depois de 6 meses.",
      },
      {
        num: "05",
        title: "Portfolio por estilo",
        desc: "Cliente pede referência, a IA manda fotos do seu portfolio direto na conversa, no estilo certo.",
      },
      {
        num: "06",
        title: "Multi-artista",
        desc: "Plano Estúdio permite até 4 artistas. Cada um com WhatsApp próprio e agenda separada.",
      },
    ],
  },
  howItWorks: {
    prelabel: "COMO FUNCIONA",
    headline: "Do cadastro ao primeiro cliente",
    headlineAccent: "em menos de 5 minutos.",
    sub: "Sem integração complicada. Sem suporte técnico. Sem servidor pra configurar.",
    steps: [
      {
        num: "01",
        title: "Se cadastre",
        desc: "Preencha os dados do seu estúdio e escolha seu plano. Validação automática de CEP e email.",
        tag: "~2 min",
      },
      {
        num: "02",
        title: "Conecte o WhatsApp",
        desc: "Um QR code aparece no seu painel. Escaneia pelo celular e pronto — a IA já está ativa.",
        tag: "~1 min",
      },
      {
        num: "03",
        title: "Durma tranquilo",
        desc: "A IA começa a responder clientes na hora. Você acompanha tudo pelo painel do estúdio.",
        tag: "Para sempre",
      },
    ],
  },
  demo: {
    prelabel: "DEMO",
    headline: "Veja na prática como",
    headlineAccent: "é rápido começar.",
    sub: "Video do cadastro completo, do primeiro clique até a IA atendendo o primeiro cliente. Funciona igualmente bem no celular e no computador.",
    caption: "Do cadastro ao WhatsApp conectado em menos de 5 minutos",
    chat: {
      botName: "Ink Studio",
      botStatus: "online · assistente IA",
      messages: [
        { from: "client", text: "Oi, queria saber sobre uma tattoo de realismo", time: "10:24" },
        {
          from: "bot",
          text: "Oi, beleza? Aqui é do Ink Studio. Que legal. Qual parte do corpo e tamanho aproximado?",
          time: "10:24",
        },
        { from: "client", text: "Antebraço inteiro, uns 20cm", time: "10:25" },
        {
          from: "bot",
          text: "Perfeito. Pra realismo nesse tamanho a faixa é R$ 800 a R$ 1.200. Tem referência?",
          time: "10:25",
        },
        { from: "client", text: "Sim, mando ja", time: "10:26" },
        {
          from: "bot",
          text: "Top. Tenho sessão disponível sábado 18/05 às 14h. Posso reservar?",
          time: "10:26",
        },
        { from: "client", text: "Pode 🙏", time: "10:27" },
      ],
    },
  },
  pricing: {
    prelabel: "PLANOS",
    headline: "Escolha o tamanho",
    headlineAccent: "do seu estúdio.",
    sub: "Pague uma mensalidade fixa e ganhe uma IA que trabalha mais que qualquer atendente humano.",
    trialBadge: "7 dias grátis sem cartão",
    footer: "Cancele quando quiser. Sem multa, sem fidelidade.",
    plans: [
      {
        id: "individual",
        name: "Individual",
        price: 197,
        period: "/mês",
        currency: "R$",
        desc: "Pra tatuador solo que quer parar de perder cliente por demora na resposta.",
        features: [
          { text: "1 WhatsApp conectado", highlight: "1 WhatsApp" },
          { text: "Até 400 conversas/mês", highlight: "400 conversas" },
          { text: "Orçamento inteligente" },
          { text: "Agenda Google Calendar" },
          { text: "Follow-up automático" },
          { text: "Suporte por WhatsApp" },
        ],
        ctaTrial: "Começar 7 dias grátis",
        ctaPrimary: "Assinar agora",
        highlighted: false,
      },
      {
        id: "estudio",
        name: "Estúdio",
        price: 497,
        period: "/mês",
        currency: "R$",
        desc: "Pra estúdios de 2 a 4 artistas que querem um atendimento unificado.",
        features: [
          { text: "Até 4 artistas vinculados", highlight: "Até 4 artistas" },
          { text: "Até 2.000 conversas/mês", highlight: "2.000 conversas" },
          { text: "Painel de gestão do estúdio" },
          { text: "WhatsApp individual por artista" },
          { text: "Métricas consolidadas" },
          { text: "Suporte prioritário" },
        ],
        ctaTrial: "Começar 7 dias grátis",
        ctaPrimary: "Assinar agora",
        highlighted: true,
        badge: "MAIS POPULAR",
      },
      {
        // Legacy usa 'premium' no onclick startCheckout — mantemos pra não quebrar API.
        id: "premium",
        name: "Estúdio VIP",
        price: 997,
        period: "/mês",
        currency: "R$",
        desc: "Pra estúdios grandes que precisam de volume e personalização avançada.",
        features: [
          { text: "Até 9 artistas vinculados", highlight: "Até 9 artistas" },
          { text: "Até 4.000 conversas/mês", highlight: "4.000 conversas" },
          { text: "Prompt customizado por artista" },
          { text: "Portfolio por estilo" },
          { text: "Analytics avançados" },
          { text: "Account manager dedicado" },
        ],
        ctaTrial: "Começar 7 dias grátis",
        ctaPrimary: "Assinar agora",
        highlighted: false,
      },
    ],
  },
  faq: {
    prelabel: "DÚVIDAS",
    headline: "Tudo que você quer saber",
    headlineAccent: "antes de começar.",
    items: [
      {
        q: "A IA usa meu número de WhatsApp atual?",
        a: "Sim. Você conecta o WhatsApp do seu estúdio à plataforma em 1 clique (QR code). A IA atende usando esse mesmo número — seu cliente não percebe diferença. Você pode pausar a qualquer momento pra atender você mesmo.",
      },
      {
        q: "Quanto tempo leva pra configurar?",
        a: "Menos de 5 minutos. Cadastro, pagamento, escaneamento do QR code e pronto — a IA começa a atender na hora. Zero configuração técnica.",
      },
      {
        q: "Como a IA sabe os meus preços?",
        a: "No primeiro acesso você informa uma tabela base (pequena/média/grande, colorida/preto-cinza). A IA usa isso como referência. Você pode ajustar a qualquer momento pelo painel.",
      },
      {
        q: "E se eu quiser atender pessoalmente?",
        a: "Basta pausar a IA no painel ou digitar uma mensagem manual na conversa. A IA detecta e recua. Quando você quiser, retoma com um clique.",
      },
      {
        q: "Meu WhatsApp corre risco de banimento?",
        a: "Não. Usamos a WhatsApp Business API via protocolo oficial. Os limites respeitam a política do WhatsApp (sem spam, sem mensagens em massa não solicitadas).",
      },
      {
        q: "Posso cancelar quando quiser?",
        a: "Sim, sem multa e sem fidelidade. Você cancela direto pelo painel. O acesso continua até o fim do período já pago.",
      },
      {
        q: "A IA fala como eu?",
        a: "Sim. Durante o cadastro você define o estilo de atendimento (mais formal, mais descontraído). No plano VIP dá pra treinar a IA com exemplos das suas conversas reais.",
      },
    ],
  },
  ctaFinal: {
    headlineLine1: "Pronto pra deixar seu estúdio",
    headlineLine2: "no piloto automático?",
    sub: "Começa hoje. Em 5 minutos seu WhatsApp já está atendendo cliente sozinho.",
    cta: "Começar agora",
    foot: "Sem fidelidade. Cancele quando quiser.",
  },
  footer: {
    tagline: "Assistente virtual via WhatsApp para estúdios de tatuagem. Atende, orça e agenda 24 horas por dia.",
    columns: [
      {
        header: "Produto",
        links: [
          { label: "Recursos", href: "#recursos" },
          { label: "Como funciona", href: "#como-funciona" },
          { label: "Planos", href: "#planos" },
          { label: "Demonstração", href: "#demo" },
        ],
      },
      {
        header: "Suporte",
        links: [
          { label: "FAQ", href: "#faq" },
          { label: "Contato WhatsApp", href: "https://wa.me/5521970789797", external: true },
          { label: "Email", href: "mailto:suporte@inkflowbrasil.com" },
        ],
      },
      {
        header: "Legal",
        links: [
          { label: "Termos de uso", href: "/termos.html" },
          { label: "Privacidade", href: "/termos.html#privacidade" },
        ],
      },
    ],
    copyright: "© 2026 InkFlow. Todos os direitos reservados.",
    madeIn: "Feito no Brasil",
    socials: [],
  },
} as const;
