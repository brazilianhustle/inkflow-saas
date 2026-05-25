// tests/agent/route-runagent.test.mjs
// Sub-4.1: smoke tests pra runAgent({...}) — funcao pura-ish exportavel
// que pipeline.js chama sem HTTP. Garante existencia + shape de erro
// previsivel em estado nao-implementado (sem precisar mockar @openai/agents).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { OPENAI_API_KEY: 'sk-test', INKFLOW_TOOL_SECRET: 'sec' };

test('runAgent: estado nao implementado → ok:false status:501', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'oi',
    estado_atual: 'estado_inexistente', dados_acumulados: {}, historico: [],
    tenant: { id: 't' }, conversa: { id: 'c', estado_agente: 'estado_inexistente' },
    clientContext: {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 501);
});

test('runAgent: existe e e AsyncFunction', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  assert.ok(typeof runAgent === 'function');
  assert.equal(runAgent.constructor.name, 'AsyncFunction');
});

test('runAgent: aceita historico vazio sem throw quando estado nao implementado', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'oi',
    estado_atual: 'unimpl', dados_acumulados: {}, historico: [],
    tenant: { id: 't' }, conversa: { id: 'c', estado_agente: 'unimpl' },
    clientContext: {},
  });
  assert.ok(r);
  assert.equal(r.ok, false);
});

const PERGUNTA_OUT_VISAO = {
  proxima_acao: 'pergunta',
  resposta_cliente: 'Vi a foto — rosa fineline!',
  dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
  dados_completos: false,
  campos_faltando: ['local_corpo'],
  campos_conflitantes: [],
  payload_portfolio: null,
  analise_imagens: [{ tipo: 'referencia', descricao: 'rosa fineline', corpo_tem_tattoo: false, corpo_tem_marcacao: false }],
  cobertura_suspeita: null,
};

function fakeOpenAI(captureRef) {
  return {
    responses: {
      parse: async (params) => {
        captureRef.params = params;
        return { status: 'completed', id: 'resp_fake', output_parsed: { output: PERGUNTA_OUT_VISAO } };
      },
    },
  };
}

const TENANT_STUB = { id: 't', nome_estudio: 'Stub', config_agente: {}, gatilhos_handoff: [], faqs: [], fewshots: [], portfolio_urls: [] };
const CONVERSA_STUB = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };

function fakeOpenAIOutput(output) {
  return {
    responses: {
      parse: async () => ({
        status: 'completed',
        id: 'resp_fake',
        output_parsed: { output },
      }),
    },
  };
}

test('runAgent (tattoo): repassa imagens como content multimodal ao TattooAgent', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const cap = {};
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'olha',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa: CONVERSA_STUB, clientContext: {},
    imagens: [{ base64: 'ZZ', mimetype: 'image/png', msgRowId: 1 }],
    openaiClient: fakeOpenAI(cap),
  });
  assert.equal(r.ok, true);
  const last = cap.params.input[cap.params.input.length - 1];
  assert.ok(Array.isArray(last.content));
  assert.equal(last.content[1].type, 'input_image');
});

test('runAgent (tattoo): surfacia analise_imagens no retorno', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const cap = {};
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'olha',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa: CONVERSA_STUB, clientContext: {},
    imagens: [{ base64: 'ZZ', mimetype: 'image/png', msgRowId: 1 }],
    openaiClient: fakeOpenAI(cap),
  });
  assert.equal(r.ok, true);
  assert.equal(r.analise_imagens[0].tipo, 'referencia');
  assert.equal(r.cobertura_suspeita, null);
});

test('runAgent (tattoo): pergunta de imagem com midia nao expõe limitação visual seca', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511',
    mensagem: 'o que você viu na imagem?',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: { ...TENANT_STUB, nome_agente: 'Assistente' },
    conversa: CONVERSA_STUB,
    clientContext: { is_first_contact: true },
    imagens: [{ base64: 'ZZ', mimetype: 'image/png', msgRowId: 1 }],
    openaiClient: fakeOpenAIOutput({
      proxima_acao: 'pergunta',
      resposta_cliente: 'Desculpe, mas não consigo identificar o que tem na imagem.',
      dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
      dados_completos: false,
      campos_faltando: ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo'],
      campos_conflitantes: [],
      payload_portfolio: null,
      analise_imagens: null,
      cobertura_suspeita: null,
    }),
  });
  assert.equal(r.ok, true);
  assert.match(r.resposta_cliente, /Vi a imagem/i);
  assert.match(r.resposta_cliente, /referência do desenho|referencia do desenho/i);
  assert.match(r.resposta_cliente, /local do corpo/i);
  assert.doesNotMatch(r.resposta_cliente, /desculpe|não consigo|nao consigo/i);
  assert.equal(r.campos_faltando.includes('tipo_foto'), true);
  assert.equal(r.analise_imagens[0].tipo, 'incerto');
});

test('runAgent (tattoo): primeiro contato com saudacao pura força 2 baloes canonicos', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'oi',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: { ...TENANT_STUB, nome_agente: 'Assistente' },
    conversa: CONVERSA_STUB,
    clientContext: { is_first_contact: true },
    openaiClient: {
      responses: {
        parse: async () => ({
          status: 'completed',
          id: 'r',
          output_parsed: { output: {
            proxima_acao: 'pergunta',
            resposta_cliente: 'Oii, tudo bem? Como posso te chamar?',
            dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
            dados_completos: false,
            campos_faltando: ['descricao_curta'],
            campos_conflitantes: [],
            payload_portfolio: null,
            analise_imagens: null,
            cobertura_suspeita: null,
          } },
        }),
      },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.resposta_cliente, 'Oii, tudo bem?\n\nMe chamo Assistente, muito prazer! Como posso te chamar?');
  assert.deepEqual(r.campos_faltando, ['descricao_curta', 'local_corpo', 'altura_cm', 'estilo']);
});

test('runAgent (tattoo): primeiro contato com "opa" tambem força saudacao canonica', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'opa',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: { ...TENANT_STUB, nome_agente: 'Assistente' },
    conversa: CONVERSA_STUB,
    clientContext: { is_first_contact: true },
    openaiClient: {
      responses: {
        parse: async () => ({
          status: 'completed',
          id: 'r',
          output_parsed: { output: {
            proxima_acao: 'pergunta',
            resposta_cliente: 'Opa, como posso ajudar?',
            dados_persistidos: { estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null, cor_preferencia: null, descricao_curta: null, foto_local: null },
            dados_completos: false,
            campos_faltando: ['descricao_curta'],
            campos_conflitantes: [],
            payload_portfolio: null,
            analise_imagens: null,
            cobertura_suspeita: null,
          } },
        }),
      },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.resposta_cliente, 'Oii, tudo bem?\n\nMe chamo Assistente, muito prazer! Como posso te chamar?');
});

test('runAgent (tattoo): primeiro contato misto preserva coleta mas garante apresentação', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511',
    mensagem: 'oi\nquero fazer uma tatuagem no braço',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: { ...TENANT_STUB, nome_agente: 'Assistente' },
    conversa: CONVERSA_STUB,
    clientContext: { is_first_contact: true, batch_message_count: 2 },
    openaiClient: {
      responses: {
        parse: async () => ({
          status: 'completed',
          id: 'r',
          output_parsed: { output: {
            proxima_acao: 'pergunta',
            resposta_cliente: 'Oi, tudo bem? E qual o tema ou ideia da tatuagem?',
            dados_persistidos: {
              descricao_curta: null,
              local_corpo: 'braço',
              altura_cm: null,
              estilo: null,
              tamanho_cm: null,
              cor_preferencia: null,
              foto_local: null,
            },
            dados_completos: false,
            campos_faltando: ['descricao_curta', 'altura_cm', 'estilo'],
            campos_conflitantes: [],
            payload_portfolio: null,
            analise_imagens: null,
            cobertura_suspeita: null,
          } },
        }),
      },
    },
  });
  assert.equal(r.ok, true);
  assert.match(r.resposta_cliente, /^Oii, tudo bem\?\n\nMe chamo Assistente, muito prazer!/);
  assert.match(r.resposta_cliente, /qual o tema ou ideia da tatuagem\?/i);
  assert.deepEqual(r.dados_persistidos.local_corpo, 'braço');
  assert.equal(r.campos_faltando.includes('descricao_curta'), true);
});

test('runAgent (tattoo): nao deixa resposta pedir altura ja persistida no mesmo lote', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511',
    mensagem: 'quero uma borboleta delicada na perna\ntenho 1.60',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB,
    conversa: CONVERSA_STUB,
    clientContext: { batch_message_count: 2 },
    openaiClient: {
      responses: {
        parse: async () => ({
          status: 'completed',
          id: 'r',
          output_parsed: { output: {
            proxima_acao: 'pergunta',
            resposta_cliente: 'Massa! E qual a tua altura?',
            dados_persistidos: {
              descricao_curta: 'borboleta delicada',
              local_corpo: 'perna',
              altura_cm: 160,
              estilo: null,
              tamanho_cm: null,
              cor_preferencia: null,
              foto_local: null,
            },
            dados_completos: false,
            campos_faltando: ['altura_cm'],
            campos_conflitantes: [],
            payload_portfolio: null,
            analise_imagens: null,
            cobertura_suspeita: null,
          } },
        }),
      },
    },
  });
  assert.equal(r.ok, true);
  assert.match(r.resposta_cliente, /estilo/i);
  assert.doesNotMatch(r.resposta_cliente, /qual a tua altura/i);
  assert.deepEqual(r.campos_faltando, ['estilo']);
});

test('runAgent (tattoo): resposta numerica solta vira pergunta coesa sobre campo faltante', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = {
    ...CONVERSA_STUB,
    dados_coletados: {
      descricao_curta: 'borboleta delicada',
      local_corpo: 'perna',
      altura_cm: 160,
    },
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511',
    mensagem: 'quanto fica?',
    estado_atual: 'tattoo', dados_acumulados: conversa.dados_coletados, historico: [],
    tenant: TENANT_STUB,
    conversa,
    clientContext: {},
    openaiClient: {
      responses: {
        parse: async () => ({
          status: 'completed',
          id: 'r',
          output_parsed: { output: {
            proxima_acao: 'pergunta',
            resposta_cliente: '1.60',
            dados_persistidos: {
              descricao_curta: null,
              local_corpo: null,
              altura_cm: null,
              estilo: null,
              tamanho_cm: null,
              cor_preferencia: null,
              foto_local: null,
            },
            dados_completos: false,
            campos_faltando: ['estilo'],
            campos_conflitantes: [],
            payload_portfolio: null,
            analise_imagens: null,
            cobertura_suspeita: null,
          } },
        }),
      },
    },
  });
  assert.equal(r.ok, true);
  assert.match(r.resposta_cliente, /Sobre valor/i);
  assert.match(r.resposta_cliente, /estilo/i);
  assert.deepEqual(r.campos_faltando, ['estilo']);
});

test('runAgent (tattoo): resposta curta de estilo nao confirma altura antiga', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = {
    ...CONVERSA_STUB,
    dados_coletados: {
      descricao_curta: 'rosa com bússola',
      local_corpo: 'braço',
      altura_cm: 170,
    },
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511',
    mensagem: 'realismo',
    estado_atual: 'tattoo', dados_acumulados: conversa.dados_coletados, historico: [],
    tenant: TENANT_STUB,
    conversa,
    clientContext: {},
    openaiClient: {
      responses: {
        parse: async () => ({
          status: 'completed',
          id: 'r',
          output_parsed: { output: {
            proxima_acao: 'pergunta',
            resposta_cliente: 'Fechou, 170cm. Agora, onde exatamente no braço tu quer a tattoo?',
            dados_persistidos: {
              descricao_curta: 'rosa com bússola',
              local_corpo: 'braço',
              altura_cm: 170,
              estilo: '',
              tamanho_cm: null,
              cor_preferencia: '',
              foto_local: '',
            },
            dados_completos: false,
            campos_faltando: ['local_corpo'],
            campos_conflitantes: [],
            payload_portfolio: null,
            analise_imagens: null,
            cobertura_suspeita: null,
          } },
        }),
      },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.dados_persistidos.estilo, 'realismo');
  assert.match(r.resposta_cliente, /Fechou, realismo/);
  assert.match(r.resposta_cliente, /Onde exatamente no braço tu quer a tattoo\?/);
  assert.doesNotMatch(r.resposta_cliente, /170cm/);
});

test('runAgent (tattoo): recupera local glúteo do texto quando agent nao persistiu', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = {
    ...CONVERSA_STUB,
    dados_coletados: {},
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511',
    mensagem: 'quero fazer uma borboleta na bunda',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB,
    conversa,
    clientContext: {},
    openaiClient: {
      responses: {
        parse: async () => ({
          status: 'completed',
          id: 'r',
          output_parsed: { output: {
            proxima_acao: 'pergunta',
            resposta_cliente: 'Qual parte do corpo?',
            dados_persistidos: {
              descricao_curta: 'borboleta',
              local_corpo: null,
              altura_cm: null,
              estilo: null,
              tamanho_cm: null,
              cor_preferencia: null,
              foto_local: null,
            },
            dados_completos: false,
            campos_faltando: ['local_corpo', 'altura_cm', 'estilo'],
            campos_conflitantes: [],
            payload_portfolio: null,
            analise_imagens: null,
            cobertura_suspeita: null,
          } },
        }),
      },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.dados_persistidos.local_corpo, 'glúteo');
  assert.deepEqual(r.campos_faltando, ['altura_cm', 'estilo']);
  assert.doesNotMatch(r.resposta_cliente, /parte do corpo/i);
});

test('runAgent (tattoo): foto de corpo ja tatuado no turno atual vira pergunta de ambiguidade', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = {
    ...CONVERSA_STUB,
    dados_coletados: {
      descricao_curta: 'borboleta',
      local_corpo: 'perna',
      altura_cm: 160,
      estilo: 'fineline',
      tentativas_foto_local: 1,
    },
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: '',
    estado_atual: 'tattoo', dados_acumulados: conversa.dados_coletados, historico: [],
    tenant: TENANT_STUB,
    conversa,
    clientContext: {},
    imagens: [{ base64: 'ZZ', mimetype: 'image/jpeg', msgRowId: 11941 }],
    openaiClient: {
      responses: {
        parse: async () => ({
          status: 'completed',
          id: 'r',
          output_parsed: { output: {
            proxima_acao: 'handoff',
            resposta_cliente: 'Borboleta em fineline na perna fica elegante e bem visivel.',
            dados_persistidos: {
              descricao_curta: 'borboleta',
              local_corpo: 'perna',
              altura_cm: 160,
              estilo: 'fineline',
              tamanho_cm: null,
              cor_preferencia: null,
              foto_local: 'foto de uma perna com tatuagens',
            },
            dados_completos: true,
            campos_faltando: [],
            campos_conflitantes: [],
            payload_portfolio: null,
            analise_imagens: [{
              tipo: 'corpo',
              descricao: 'foto de uma perna com tatuagens',
              corpo_tem_tattoo: true,
              corpo_tem_marcacao: false,
            }],
            cobertura_suspeita: null,
          } },
        }),
      },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta');
  assert.equal(r.estado_novo, 'tattoo');
  assert.match(r.resposta_cliente, /refer[eê]ncia|local/i);
  assert.equal(r.dados_persistidos.foto_local, null);
  assert.deepEqual(r.campos_faltando, ['tipo_foto']);
  assert.equal(r.analise_imagens[0].tipo, 'incerto');
  assert.ok(!r.pediu_foto_local);
});

// ─── Bug 1: gate handoff só após foto pedida >=1x ──────────────────────
const HANDOFF_OUT = {
  proxima_acao: 'handoff',
  resposta_cliente: 'Show, anotei tudo!',
  dados_persistidos: {
    descricao_curta: 'rosa', local_corpo: 'antebraco', altura_cm: 170,
    estilo: 'fineline', tamanho_cm: null, cor_preferencia: null, foto_local: null,
  },
  dados_completos: true,
  campos_faltando: [],
  campos_conflitantes: [],
  payload_portfolio: null,
  analise_imagens: null,
  cobertura_suspeita: null,
};

function fakeHandoff() {
  return {
    responses: {
      parse: async () => ({ status: 'completed', id: 'r', output_parsed: { output: HANDOFF_OUT } }),
    },
  };
}

test('Bug1 gate: handoff sem foto pedida (contador 0, sem foto) → força pergunta + pediu_foto_local', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'isso, pode ser',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeHandoff(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta', 'gate deve rebaixar handoff→pergunta');
  assert.equal(r.estado_novo, 'tattoo', 'estado permanece tattoo (sem handoff)');
  assert.equal(r.pediu_foto_local, true);
  assert.match(r.resposta_cliente, /foto/i);
});

test('Bug1 gate: handoff com contador=1 → handoff passa', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo',
    dados_coletados: { tentativas_foto_local: 1 }, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'isso',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeHandoff(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'handoff');
  assert.equal(r.estado_novo, 'cadastro');
  assert.ok(!r.pediu_foto_local);
});

test('Bug1 gate: handoff com foto_local presente → handoff passa mesmo sem contador', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };
  const comFoto = {
    responses: { parse: async () => ({ status: 'completed', id: 'r',
      output_parsed: { output: { ...HANDOFF_OUT, dados_persistidos: { ...HANDOFF_OUT.dados_persistidos, foto_local: 'msg-123' } } } }) },
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'mandei a foto',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: comFoto,
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'handoff');
});

test('Bug1 gate: handoff com foto_local_msg_id presente → handoff passa mesmo sem contador', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = {
    id: 'c',
    telefone: '5511',
    estado_agente: 'tattoo',
    dados_coletados: { foto_local_msg_id: 77 },
    dados_cadastro: {},
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'isso',
    estado_atual: 'tattoo', dados_acumulados: conversa.dados_coletados, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeHandoff(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'handoff');
  assert.equal(r.estado_novo, 'cadastro');
  assert.ok(!r.pediu_foto_local);
  assert.equal(r.dados_persistidos.foto_local_msg_id, 77);
});

// Output 'pergunta' com os 4 OBR completos (reusado nos testes do else-if do gate).
const PERGUNTA_OBR_COMPLETO = {
  proxima_acao: 'pergunta',
  resposta_cliente: '<override>',
  dados_persistidos: {
    descricao_curta: 'rosa', local_corpo: 'antebraco', altura_cm: 170,
    estilo: 'fineline', tamanho_cm: null, cor_preferencia: null, foto_local: null,
  },
  dados_completos: false,
  campos_faltando: [],
  campos_conflitantes: [],
  payload_portfolio: null,
  analise_imagens: null,
  cobertura_suspeita: null,
};
function fakePergunta(resposta) {
  return {
    responses: {
      parse: async () => ({ status: 'completed', id: 'r',
        output_parsed: { output: { ...PERGUNTA_OBR_COMPLETO, resposta_cliente: resposta } } }),
    },
  };
}

test('Bug1 gate: pergunta com OBR completos mas resposta NAO sobre foto → NAO marca pediu_foto_local', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'confirma',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakePergunta('Beleza! Confirma que e no antebraco direito mesmo?'),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta');
  assert.ok(!r.pediu_foto_local, 'contador nao deve subir quando a pergunta nao e sobre foto');
});

test('Bug1 gate: pergunta com OBR completos E resposta sobre foto → marca pediu_foto_local', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'fechou',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakePergunta('Show! Consegue mandar uma foto do local?'),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta');
  assert.equal(r.pediu_foto_local, true);
});

test('tattoo: confirmacao de foto ambigua como local promove ref e avanca para cadastro', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = {
    id: 'c',
    telefone: '5511',
    estado_agente: 'tattoo',
    dados_coletados: {
      descricao_curta: 'borboleta',
      local_corpo: 'perna direita',
      altura_cm: 160,
      estilo: 'fineline',
      refs_imagens_msg_ids: [11951],
      tentativas_foto_local: 1,
    },
    dados_cadastro: {},
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511',
    mensagem: 'do local, seria na perna direita\nsem tatuagem\nquanto é',
    estado_atual: 'tattoo', dados_acumulados: conversa.dados_coletados, historico: [],
    tenant: TENANT_STUB,
    conversa,
    clientContext: { batch_message_count: 3 },
    openaiClient: {
      responses: {
        parse: async () => ({
          status: 'completed',
          id: 'r',
          output_parsed: { output: {
            proxima_acao: 'pergunta',
            resposta_cliente: 'Viu que a tatuagem seria na perna direita',
            dados_persistidos: {
              descricao_curta: null,
              local_corpo: 'perna direita',
              altura_cm: null,
              estilo: null,
              tamanho_cm: null,
              cor_preferencia: null,
              foto_local: null,
            },
            dados_completos: false,
            campos_faltando: ['foto_local'],
            campos_conflitantes: [],
            payload_portfolio: null,
            analise_imagens: null,
            cobertura_suspeita: null,
          } },
        }),
      },
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'handoff');
  assert.equal(r.estado_novo, 'cadastro');
  assert.equal(r.dados_persistidos.foto_local_msg_id, 11951);
  assert.match(r.dados_persistidos.foto_local, /foto do local confirmada/i);
  assert.match(r.resposta_cliente, /nome completo/i);
  assert.match(r.resposta_cliente, /data de nascimento/i);
});

const CADASTRO_HANDOFF_OUT = {
  proxima_acao: 'handoff',
  resposta_cliente: 'Perfeito, vou mandar pro tatuador.',
  dados_persistidos: { nome: 'Mario', data_nascimento: '1993-10-19', email: null },
  dados_completos: true,
  campos_faltando: [],
  campos_conflitantes: [],
  email_recusado: true,
  payload_portfolio: null,
};

function fakeCadastro(out = CADASTRO_HANDOFF_OUT) {
  return {
    responses: {
      parse: async () => ({ status: 'completed', id: 'r', output_parsed: { output: out } }),
    },
  };
}

test('S1 cadastro: idade sem data explicita nao persiste data_nascimento inventada', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'cadastro', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'tenho 30 anos',
    estado_atual: 'cadastro', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeCadastro(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta');
  assert.equal(r.estado_novo, 'cadastro');
  assert.equal(r.dados_persistidos.data_nascimento, null);
  assert.ok(r.campos_faltando.includes('data_nascimento'));
  assert.match(r.resposta_cliente, /seguran[cç]a/i);
  assert.match(r.resposta_cliente, /registro de maioridade/i);
  assert.doesNotMatch(r.resposta_cliente, /idade (nao|não) (vale|é suficiente)/i);
});

test('S1 cadastro: idade com data explicita permite data_nascimento', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'cadastro', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'tenho 30 anos, nasci em 19/10/1993',
    estado_atual: 'cadastro', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeCadastro(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'handoff');
  assert.equal(r.dados_persistidos.data_nascimento, '1993-10-19');
});

test('S1 cadastro: data de menoridade aciona handoff humano sem seguir orçamento direto', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const minorOut = {
    ...CADASTRO_HANDOFF_OUT,
    dados_persistidos: { nome: 'Junior', data_nascimento: '2015-03-12', email: null },
  };
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'cadastro', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'nasci em 12/03/2015',
    estado_atual: 'cadastro', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeCadastro(minorOut),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'erro');
  assert.equal(r.estado_novo, 'aguardando_tatuador');
  assert.equal(r.dados_persistidos.data_nascimento, '2015-03-12');
  assert.ok(r.campos_faltando.includes('menor_idade_trigger'));
  assert.equal(r.escalation.reason_code, 'minor_age');
  assert.match(r.resposta_cliente, /menos de 18 anos/);
  assert.match(r.resposta_cliente, /respons[aá]vel legal/);
  assert.doesNotMatch(r.resposta_cliente, /orçamento liberado|valor certinho|agendar|pagar sinal/i);
});

test('S1 cadastro: data de menoridade na mensagem aciona handoff humano mesmo se agent nao persistiu', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const confusedOut = {
    proxima_acao: 'pergunta',
    resposta_cliente: 'Pode mandar a data em outro formato?',
    dados_persistidos: { nome: 'Junior' },
    dados_completos: false,
    campos_faltando: ['data_nascimento'],
    campos_conflitantes: [],
    payload_portfolio: null,
  };
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'cadastro', dados_coletados: {}, dados_cadastro: {} };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: '12/03/2015',
    estado_atual: 'cadastro', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeCadastro(confusedOut),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'erro');
  assert.equal(r.estado_novo, 'aguardando_tatuador');
  assert.equal(r.dados_persistidos.data_nascimento, '2015-03-12');
  assert.equal(r.escalation.source, 'mensagem');
  assert.match(r.resposta_cliente, /menos de 18 anos/);
});

test('S1 cadastro: idade sem data nao apaga data_nascimento ja existente no cadastro', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  const conversa = {
    id: 'c', telefone: '5511', estado_agente: 'cadastro', dados_coletados: {},
    dados_cadastro: { data_nascimento: '1993-10-19' },
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'sim, tenho 30 anos',
    estado_atual: 'cadastro', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: fakeCadastro(),
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'handoff');
  assert.equal(r.dados_persistidos.data_nascimento, '1993-10-19');
});

test('Bug1 gate: fallback de rede (sem foto na resposta) NAO marca pediu_foto_local mesmo com OBR completos no DB', async () => {
  const { runAgent } = await import('../../functions/api/agent/route.js');
  // 4 OBR ja completos no DB, foto nunca pedida; rede cai → buildFallbackOutput.
  const conversa = { id: 'c', telefone: '5511', estado_agente: 'tattoo',
    dados_coletados: { descricao_curta: 'rosa', local_corpo: 'antebraco', altura_cm: 170, estilo: 'fineline' },
    dados_cadastro: {} };
  const throwingClient = {
    responses: { parse: async () => { const e = new Error('network down'); e.status = 503; throw e; } },
  };
  const r = await runAgent({
    env: ENV, tenant_id: 't', telefone: '5511', mensagem: 'oi',
    estado_atual: 'tattoo', dados_acumulados: {}, historico: [],
    tenant: TENANT_STUB, conversa, clientContext: {},
    openaiClient: throwingClient,
  });
  assert.equal(r.ok, true);
  assert.equal(r.proxima_acao, 'pergunta');
  assert.ok(!r.pediu_foto_local, 'fallback de rede nao pode contar como foto pedida');
});
