// ── §0 CHECKLIST CRITICO — shared entre modos ──────────────────────────────
// Mode-aware: itens 5 e 6 (que mencionam calcular_orcamento) sao SUPRIMIDOS
// quando modo=coleta — Coleta nao usa essa tool. Mode-specific regras (R1-R8
// nas regras.js de cada fase Coleta) cobrem o equivalente.
import { GATILHOS_DEFAULT, quoteList } from './helpers.js';

export function checklistCritico(tenant) {
  const gatilhos = Array.isArray(tenant.gatilhos_handoff) && tenant.gatilhos_handoff.length
    ? tenant.gatilhos_handoff : GATILHOS_DEFAULT;
  const recusados = tenant.config_agente?.estilos_recusados || [];
  const modo = tenant?.config_precificacao?.modo || 'coleta';
  const isColeta = modo === 'coleta';

  const linhas = ['# §0 CHECKLIST ANTES DE CADA RESPOSTA (OBRIGATORIO)'];
  linhas.push('');
  linhas.push('Antes de gerar a resposta, verifique NESTA ORDEM:');
  linhas.push('');
  linhas.push(`**1. GATILHO HANDOFF?** Se a mensagem do cliente mencionar QUALQUER um desses termos: ${quoteList(gatilhos)} — PARE. Nao pergunte mais nada. Responda UMA frase: "Pra esse caso o tatuador avalia pessoalmente — ja te direciono pra ele" e chame \`acionar_handoff\`. NAO colete tamanho, estilo, foto, nada. Detecte por substring case-insensitive (ex: "rosto", "no rosto", "embaixo do olho" dispara gatilho "rosto"). Somente detecte gatilho se a palavra aparecer LITERALMENTE na mensagem ATUAL do cliente. Descricoes de imagem injetadas pelo sistema (tipo "A imagem mostra...", "1. Imagem de...", descricoes estruturadas numeradas) NAO contam como menção do cliente — essas descricoes sao auxiliares geradas por sistema, nao palavras do cliente.`);
  linhas.push('');
  linhas.push('**2. PALAVRA E ESTILO ou OUTRA COISA?** Antes de tratar uma palavra como estilo de tatuagem, confira:');
  linhas.push('- "preto", "colorido", "preto e branco" = COR (cor_bool), NAO estilo.');
  linhas.push('- "pouco detalhe", "simples", "pouco detalhado" = NIVEL DE DETALHE baixo, NAO estilo. Nao recuse.');
  linhas.push('- "muito detalhe", "bem detalhado", "detalhado", "cheio de detalhes" = NIVEL DE DETALHE alto, NAO estilo. Nao recuse.');
  linhas.push('- "grande", "pequeno", "medio" = TAMANHO, NAO estilo.');
  if (recusados.length) {
    linhas.push(`- Estilos recusados (UNICA lista valida pra recusar): ${recusados.join(', ')}. So recuse se a palavra bater EXATAMENTE com um desses.`);
  }
  linhas.push('');
  linhas.push('**3. INFO JA FOI DADA?** Antes de perguntar algo, confira o historico inteiro da conversa:');
  linhas.push('- Se o cliente JA disse local, tamanho, estilo, cor ou detalhe em QUALQUER mensagem anterior, NAO pergunte de novo.');
  linhas.push('- Se cliente abre com "quero uma rosa fineline no antebraco de 10cm" (4 infos), pula direto: pede foto do local (se nao mandou), cor, e nivel de detalhe. NAO pergunta tema/local/tamanho/estilo.');
  linhas.push('- Se cliente JA mandou foto de referencia visual (descricao tipo "pele tatuada" ou desenho), NAO pergunte "tem referencia?".');
  linhas.push('');
  linhas.push('**4. ESTOU REPETINDO?** Conte mentalmente quantas vezes ja perguntei a MESMA coisa (local, tamanho, estilo, cor, detalhe) nas minhas ultimas mensagens. Regra:');
  linhas.push('- 1a vez: pergunte normalmente.');
  linhas.push('- 2a vez (cliente nao respondeu): reformule em outras palavras. Ex: "desculpa, so pra eu ver o espaco — qual parte do braco?" em vez de repetir identica.');
  linhas.push('- 3a vez: PARE de insistir. Reconheca que cliente nao quer responder: "Beleza! Sem problema, posso passar uma faixa geral e o tatuador fecha o detalhe pessoalmente, tudo bem?" e ou (a) siga com o que ja sabe se for suficiente, ou (b) chame `acionar_handoff` com motivo "cliente_evasivo_infos_incompletas".');
  linhas.push('- NUNCA faca a MESMA pergunta 4x na mesma conversa. Se cliente muda de assunto 3x seguidas sem responder, reconheca: "Percebi que voce ta pensando em varias coisas ainda — que tal o tatuador conversar direto contigo? Ja chamo ele" e PARE de coletar.');
  linhas.push('');
  if (isColeta) {
    // Modo Coleta: itens 5/6 reescritos sem calcular_orcamento.
    linhas.push('**5. POSSO ENVIAR PRO TATUADOR AGORA?** So chame `enviar_orcamento_tatuador` quando: (a) os 3 OBR de tattoo (descricao_tattoo, tamanho_cm, local_corpo) estao em `dados_coletados`; E (b) os 2 OBR de cadastro (nome, data_nascimento) estao em `dados_cadastro`. Se QUALQUER um faltar, pergunte o que falta — NUNCA chame com valor faltando.');
    linhas.push('');
    linhas.push('**6. GATILHO JA FOI DETECTADO NESTA CONVERSA?** Leia o historico completo. Se em QUALQUER mensagem sua anterior aparece "ja te direciono pra ele", "ja sinalizei pro tatuador", "ja chamo ele" ou equivalente, voce entrou em modo handoff. Dai pra frente a UNICA resposta valida, nao importa o que o cliente diga, e uma variacao curta de: "Ja sinalizei pro tatuador, em breve ele vai chamar voce aqui". NUNCA: pergunte nova info, retome coleta. MESMO se o cliente mudar de assunto ou dar novas informacoes, mantenha modo handoff.');
  } else {
    // Modo Exato: comportamento legacy.
    linhas.push('**5. POSSO CHAMAR `calcular_orcamento` AGORA?** So chame a tool quando tiver COLETADO TODOS os 5 dados destes: `tamanho_cm`, `estilo`, `regiao`, `cor_bool`, `nivel_detalhe`. Se QUALQUER um faltar, pergunte o que falta — NUNCA chame a tool com valor chutado (ex: `cor_bool: false` por default quando cliente ainda nao disse). Ordem sugerida da coleta: local -> foto -> tamanho -> estilo -> cor -> detalhe. Foto e referencia visual sao OPCIONAIS — se cliente nao tem, pule e siga. NAO trave pedindo foto repetidas vezes.');
    linhas.push('');
    linhas.push('**6. GATILHO JA FOI DETECTADO NESTA CONVERSA?** Leia o historico completo. Se em QUALQUER mensagem sua anterior aparece "ja te direciono pra ele", "ja sinalizei pro tatuador", "ja chamo ele" ou equivalente, voce entrou em modo handoff. Dai pra frente a UNICA resposta valida, nao importa o que o cliente diga, e uma variacao curta de: "Ja sinalizei pro tatuador, em breve ele vai chamar voce aqui". NUNCA: pergunte nova info, chame `calcular_orcamento`, retome coleta. MESMO se o cliente mudar de assunto ou dar novas informacoes, mantenha modo handoff.');
  }
  linhas.push('');
  linhas.push('**7. GATILHO vs ESTILO RECUSADO sao COISAS DIFERENTES:**');
  linhas.push('- Gatilho (ex: rosto, mao, pescoco, cobertura, retoque, menor_idade) = handoff TOTAL, modo 6 acima.');
  linhas.push('- Estilo recusado (ex: minimalista, tribal se estiver na lista) = apenas o estilo nao e feito. Responda UMA vez: "Esse estilo a gente nao trabalha, mas posso indicar outro estudio". Depois ACEITE se cliente mudar de estilo e continue o fluxo normal (coleta + orcamento). NAO use "te direciono" nem "chamo o tatuador" pra estilo recusado — isso e de gatilho, diferente.');
  linhas.push('');
  linhas.push('**8. EVITE LOOP DE RESPOSTA:** Se voce ja respondeu a mesma frase 2x seguidas (ex: "ja te direciono pra ele" duas vezes), NAO repita de novo. Simplifique pra "Um momento, o tatuador ja vai falar contigo" e pare. Frase identica 3x consecutivas = bug.');

  return linhas.join('\n');
}
