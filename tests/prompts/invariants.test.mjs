import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSystemPrompt } from '../../functions/_lib/prompts/index.js';
import {
  TENANT_CANONICO,
  TENANT_CANONICO_EXATO,
  CONVERSA_CANONICA,
  CONVERSA_COLETA_TATTOO,
  CONVERSA_COLETA_CADASTRO,
  CONVERSA_COLETA_PROPOSTA,
  CLIENT_CONTEXT_CANONICO,
} from './fixtures/tenant-canonico.mjs';

// 4 prompts ativos: 3 fases Coleta + Exato. Cada um gerado com sua conversa
// adequada (Coleta usa estado_agente; Exato usa conversa simples sem estado).
const PROMPTS = [
  { nome: 'coleta-tattoo',    tenant: TENANT_CANONICO,       conversa: CONVERSA_COLETA_TATTOO },
  { nome: 'coleta-cadastro',  tenant: TENANT_CANONICO,       conversa: CONVERSA_COLETA_CADASTRO },
  { nome: 'coleta-proposta',  tenant: TENANT_CANONICO,       conversa: CONVERSA_COLETA_PROPOSTA },
  { nome: 'exato',            tenant: TENANT_CANONICO_EXATO, conversa: CONVERSA_CANONICA },
];

test('invariante: todos prompts contem IDENTIDADE', () => {
  for (const { nome, tenant, conversa } of PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §1 IDENTIDADE/, `[${nome}] sem secao IDENTIDADE`);
  }
});

test('invariante: todos prompts contem CHECKLIST CRITICO', () => {
  for (const { nome, tenant, conversa } of PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §0 CHECKLIST/, `[${nome}] sem CHECKLIST`);
  }
});

test('invariante: todos prompts contem CONTEXTO', () => {
  for (const { nome, tenant, conversa } of PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §5 CONTEXTO/, `[${nome}] sem CONTEXTO`);
  }
});

test('invariante: todos prompts contem REGRAS INVIOLAVEIS', () => {
  for (const { nome, tenant, conversa } of PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §4 REGRAS INVIOLAVEIS/, `[${nome}] sem REGRAS`);
  }
});

test('invariante: nenhum prompt vaza meta-instrucao', () => {
  for (const { nome, tenant, conversa } of PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.doesNotMatch(out, /system prompt|meta-instrucao|prompt engineering/i,
      `[${nome}] vazou meta-instrucao`);
  }
});

test('invariante: separator "---" presente entre blocos', () => {
  for (const { nome, tenant, conversa } of PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /\n---\n/, `[${nome}] sem separadores`);
  }
});

// Estados em que o bot NAO deve responder (dispatcher retorna null).
test('invariante: estados de espera retornam null (bot nao responde)', () => {
  const ESTADOS_ESPERA = ['aguardando_tatuador', 'aguardando_decisao_desconto', 'lead_frio', 'fechado'];
  for (const estado of ESTADOS_ESPERA) {
    const conv = { id: 'test', estado_agente: estado };
    const out = generateSystemPrompt(TENANT_CANONICO, conv, CLIENT_CONTEXT_CANONICO);
    assert.strictEqual(out, null, `Esperado null pra estado_agente=${estado}, recebeu prompt de ${out?.length} chars`);
  }
});

// Cross-mode invariante: Coleta-Tattoo e Coleta-Cadastro NUNCA devem
// mencionar tools de agendamento (so Coleta-Proposta as usa). Nota:
// `calcular_orcamento` aparece em regras como proibicao — confiamos nessas
// regras + na ausencia da tool no schema do workflow n8n; nao validamos
// via regex (negacoes geram falsos positivos).
test('invariante: Coleta-Tattoo nao usa tools de agendamento', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  for (const tool of ['consultar_horarios_livres', 'reservar_horario', 'gerar_link_sinal']) {
    assert.doesNotMatch(out, new RegExp(tool), `Coleta-Tattoo mencionou tool de agendamento: ${tool}`);
  }
});

test('invariante: Coleta-Cadastro nao usa tools de agendamento', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_CADASTRO, CLIENT_CONTEXT_CANONICO);
  for (const tool of ['consultar_horarios_livres', 'reservar_horario', 'gerar_link_sinal']) {
    assert.doesNotMatch(out, new RegExp(tool), `Coleta-Cadastro mencionou tool de agendamento: ${tool}`);
  }
});

// Coleta-Proposta deve POSITIVAMENTE conter R3 que proibe "contraproposta"
// (a regra precisa mencionar a palavra pra o LLM saber o que evitar). Nao
// fazemos check negativo aqui pelo mesmo motivo.
test('invariante: Coleta-Proposta tem R3 proibindo contraproposta', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_PROPOSTA, CLIENT_CONTEXT_CANONICO);
  assert.match(out, /PROIBIDO[^\n]*contraproposta/i,
    'Coleta-Proposta deveria ter regra explicita proibindo "contraproposta"');
});
