// Tenant "feliz" — todos os campos preenchidos, sem contaminação.
// Usado pra gerar snapshots de baseline dos prompts por modo.

export const tenantCanonicoFaixa = {
  id: '00000000-0000-0000-0000-000000000001',
  nome_agente: 'Lina',
  nome_estudio: 'Estudio Teste',
  plano: 'individual',
  sinal_percentual: 30,
  duracao_sessao_padrao_h: 3,
  gatilhos_handoff: ['cobertura', 'retoque', 'rosto', 'mao', 'pescoco', 'menor_idade'],
  horario_funcionamento: { 'seg-sex': '10:00-19:00', 'sab': '10:00-15:00' },
  faq_texto: 'Atendemos de terca a sabado. Duracao media de sessao 3h.',
  config_agente: {
    persona_livre: 'Brasileira, direta, atende com carinho sem formalidade excessiva.',
    tom: 'amigavel',
    emoji_level: 'raro',
    usa_giria: true,
    usa_identificador: false,
    aceita_cobertura: true,
    estilos_aceitos: ['fineline', 'realismo', 'blackwork'],
    estilos_recusados: ['tribal'],
    expressoes_proibidas: ['meu bem'],
    frases_naturais: {
      saudacao: ['Oii', 'Olá'],
      confirmacao: ['Show', 'Fechou'],
      encerramento: ['Até mais', 'Valeu'],
    },
  },
  config_precificacao: {
    modo: 'faixa',
    sinal_percentual: 30,
    tamanho_maximo_sessao_cm: 35,
    observacoes_tatuador: '',
  },
};

export const tenantCanonicoExato = {
  ...tenantCanonicoFaixa,
  id: '00000000-0000-0000-0000-000000000002',
  config_precificacao: {
    ...tenantCanonicoFaixa.config_precificacao,
    modo: 'exato',
  },
};

export const conversaVazia = null;

export const clientContextPrimeiroContato = {
  is_first_contact: true,
  eh_recorrente: false,
  total_sessoes: 0,
  nome_cliente: null,
};
