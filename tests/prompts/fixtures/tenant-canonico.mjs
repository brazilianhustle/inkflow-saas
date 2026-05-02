// Tenant canônico — exercita TODOS os ramos do generator atual.
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
    modo: 'faixa',
    sinal_percentual: 30,
    tamanho_maximo_sessao_cm: 30,
    observacoes_tatuador: 'Sempre confirmar disponibilidade do tatuador antes de agendar.',
  },
};

export const TENANT_CANONICO_EXATO = {
  ...TENANT_CANONICO,
  config_precificacao: { ...TENANT_CANONICO.config_precificacao, modo: 'exato' },
};

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
