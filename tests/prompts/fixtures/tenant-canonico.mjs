// Tenant canônico v2 — Coleta default. Exercita positive-path sweep do
// generator atual (emoji_level, usa_giria=true, usa_identificador=false,
// aceita_cobertura=true, frases_naturais com 3 sub-arrays, estilos_recusados
// não-vazio, faq presente, few-shot custom legacy, gatilhos custom,
// observacoes_tatuador, fewshots_por_modo v2 vazio).
// Mudanças aqui invalidam snapshots — atualize conscientemente.
export const TENANT_CANONICO = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_agente: 'Lina',
  nome_estudio: 'Estudio Teste',
  plano: 'individual',
  faq_texto: 'Q: Tem estacionamento?\nA: Sim, gratuito ao lado.',
  gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
  sinal_percentual: 30,
  horario_funcionamento: { 'seg-sex': '10:00-19:00', 'sab': '10:00-15:00' },
  // Telegram: vazio na fixture canonica (v2 onboarding popula isso depois)
  tatuador_telegram_chat_id: null,
  tatuador_telegram_username: null,
  fewshots_por_modo: {
    coleta_tattoo: [],
    coleta_cadastro: [],
    coleta_proposta: [],
    exato: [],
  },
  config_agente: {
    persona_livre: 'Atendente brasileira, descontraida.',
    tom: 'amigavel',
    emoji_level: 'raro',
    usa_giria: true,
    usa_identificador: false,
    aceita_cobertura: true,
    expressoes_proibidas: ['caro cliente'],
    frases_naturais: {
      saudacao: ['oii', 'olá'],
      confirmacao: ['fechou', 'massa'],
      encerramento: ['valeu', 'até mais'],
    },
    estilos_aceitos: ['blackwork', 'fineline', 'realismo'],
    estilos_recusados: ['tribal'],
    few_shot_exemplos: [
      { cliente: 'oi', agente: 'Oii, aqui e Lina do Estudio Teste.' },
    ],
  },
  config_precificacao: {
    modo: 'coleta',
    sinal_percentual: 30,
    tamanho_maximo_sessao_cm: 30,
    observacoes_tatuador: 'Sempre confirmar disponibilidade do tatuador antes de agendar.',
  },
};

// Fixture pra modo Exato (beta secundario)
export const TENANT_CANONICO_EXATO = {
  ...TENANT_CANONICO,
  config_precificacao: { ...TENANT_CANONICO.config_precificacao, modo: 'exato' },
};

// Conversas por estado_agente (Coleta v2 state machine)
export const CONVERSA_COLETA_TATTOO = {
  id: 'conv-coleta-tattoo-001',
  estado: 'qualificando',
  estado_agente: 'coletando_tattoo',
  dados_coletados: {},
  dados_cadastro: {},
};

export const CONVERSA_COLETA_CADASTRO = {
  id: 'conv-coleta-cadastro-001',
  estado: 'qualificando',
  estado_agente: 'coletando_cadastro',
  dados_coletados: {
    descricao_tattoo: 'rosa fineline',
    tamanho_cm: 10,
    local_corpo: 'antebraço',
  },
  dados_cadastro: {},
};

export const CONVERSA_COLETA_PROPOSTA = {
  id: 'conv-coleta-proposta-001',
  estado: 'orcando',
  estado_agente: 'propondo_valor',
  valor_proposto: 750,
  orcid: 'orc_test01',
  dados_coletados: {
    descricao_tattoo: 'rosa fineline',
    tamanho_cm: 10,
    local_corpo: 'antebraço',
    estilo: 'fineline',
  },
  dados_cadastro: {
    nome: 'Maria Silva',
    data_nascimento: '1995-03-12',
    email: 'maria@email.com',
  },
};

// Conversa "vazia" — pra Exato no estado inicial (qualificando, sem estado_agente)
export const CONVERSA_CANONICA = {
  id: 'conv-001',
  estado: 'qualificando',
  dados_coletados: {},
};

export const CLIENT_CONTEXT_CANONICO = {
  is_first_contact: true,
  eh_recorrente: false,
  total_sessoes: 0,
  nome_cliente: null,
};
