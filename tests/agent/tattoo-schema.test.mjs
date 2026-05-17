import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TattooOutputSchema } from '../../functions/api/agent/agents/tattoo-schema.js';

const DADOS_VAZIOS = {
  estilo: null, tamanho_cm: null, altura_cm: null, local_corpo: null,
  cor_preferencia: null, descricao_curta: null, foto_local: null,
};

// ─── Branch 'pergunta' ─────────────────────────────────────────────────

test('pergunta valido com campos_faltando nao-vazio passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'Qual o local da tatuagem?',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(ok.success, true);
});

test('pergunta com dados_completos=true e REJEITADO (literal:false)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'qual local?',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: true,
    campos_faltando: ['local_corpo'],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('pergunta com campos_faltando vazio e REJEITADO (min:1)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'pergunta',
    resposta_cliente: 'qual local?',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false,
    campos_faltando: [],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

// ─── Branch 'handoff' ──────────────────────────────────────────────────

test('handoff com 4 OBR completos passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'Beleza, ja vou passar pra cadastro!',
    dados_persistidos: {
      descricao_curta: 'rosa pequena traco fino',
      local_corpo: 'braco direito',
      altura_cm: 170,
      estilo: 'fineline',
      tamanho_cm: 5,
      cor_preferencia: 'preto',
      foto_local: null,
    },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(ok.success, true);
});

test('handoff sem descricao_curta e REJEITADO', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'oi',
    dados_persistidos: {
      local_corpo: 'braco', altura_cm: 170, estilo: 'fineline',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true,
    campos_faltando: [],
    campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('handoff com altura_cm null e REJEITADO (handoff exige non-null)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'oi',
    dados_persistidos: {
      descricao_curta: 'x', local_corpo: 'y', altura_cm: null, estilo: 'z',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('handoff com dados_completos=false e REJEITADO (literal:true)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'oi',
    dados_persistidos: {
      descricao_curta: 'x', local_corpo: 'y', altura_cm: 170, estilo: 'z',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: false,
    campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

test('handoff com campos_conflitantes nao-vazio e REJEITADO (length:0)', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'handoff',
    resposta_cliente: 'oi',
    dados_persistidos: {
      descricao_curta: 'x', local_corpo: 'y', altura_cm: 170, estilo: 'z',
      tamanho_cm: null, cor_preferencia: null, foto_local: null,
    },
    dados_completos: true, campos_faltando: [],
    campos_conflitantes: ['x'],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

// ─── Branch 'enviar_portfolio' ─────────────────────────────────────────

test('enviar_portfolio com payload_portfolio nao-null passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    resposta_cliente: 'aqui vai uma referencia',
    dados_persistidos: { ...DADOS_VAZIOS, estilo: 'fineline' },
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: { estilo: 'fineline', max: 3, motivo: 'cliente pediu referencia' },
  });
  assert.equal(ok.success, true);
});

test('enviar_portfolio com payload_portfolio null e REJEITADO', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'enviar_portfolio',
    resposta_cliente: 'oi',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false, campos_faltando: ['local_corpo'], campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});

// ─── Branch 'erro' ─────────────────────────────────────────────────────

test('erro com mensagem amigavel passa', () => {
  const ok = TattooOutputSchema.safeParse({
    proxima_acao: 'erro',
    resposta_cliente: 'Tive um problema aqui, podes mandar de novo?',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(ok.success, true);
});

// ─── Discriminator ──────────────────────────────────────────────────────

test('proxima_acao desconhecido e REJEITADO', () => {
  const r = TattooOutputSchema.safeParse({
    proxima_acao: 'xyz',
    resposta_cliente: 'oi',
    dados_persistidos: DADOS_VAZIOS,
    dados_completos: false, campos_faltando: [], campos_conflitantes: [],
    payload_portfolio: null,
  });
  assert.equal(r.success, false);
});
