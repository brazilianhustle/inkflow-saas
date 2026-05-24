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
//
// IMPORTANTE: coleta-tattoo (Sub-2, 2026-05-08), coleta-cadastro (Sub-3.1,
// 2026-05-08) e coleta-proposta (Sub-3.2, 2026-05-09) foram reescritos v2
// com estrutura diferente — nao tem §0 CHECKLIST, §5 CONTEXTO, §4 REGRAS
// INVIOLAVEIS, nem §4b TOOLS. Tem §1 IDENTIDADE, §2 CONTEXTO, §3 OBJETIVO,
// §4 DECISAO E REGRAS. Os invariants v1 que checam ancoras antigas excluem
// os tres abaixo.
const PROMPTS = [
  { nome: 'coleta-tattoo',    tenant: TENANT_CANONICO,       conversa: CONVERSA_COLETA_TATTOO },
  { nome: 'coleta-cadastro',  tenant: TENANT_CANONICO,       conversa: CONVERSA_COLETA_CADASTRO },
  { nome: 'coleta-proposta',  tenant: TENANT_CANONICO,       conversa: CONVERSA_COLETA_PROPOSTA },
  { nome: 'exato',            tenant: TENANT_CANONICO_EXATO, conversa: CONVERSA_CANONICA },
];

const PROMPTS_V1 = PROMPTS.filter(p => p.nome !== 'coleta-tattoo' && p.nome !== 'coleta-cadastro' && p.nome !== 'coleta-proposta');

test('invariante: todos prompts contem IDENTIDADE', () => {
  for (const { nome, tenant, conversa } of PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §1 IDENTIDADE/, `[${nome}] sem secao IDENTIDADE`);
  }
});

test('invariante v1: prompts v1 contem CHECKLIST CRITICO (tattoo+cadastro v2 isentos)', () => {
  for (const { nome, tenant, conversa } of PROMPTS_V1) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §0 CHECKLIST/, `[${nome}] sem CHECKLIST`);
  }
});

test('invariante v1: prompts v1 contem CONTEXTO §5 (tattoo+cadastro v2 usam §2)', () => {
  for (const { nome, tenant, conversa } of PROMPTS_V1) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §5 CONTEXTO/, `[${nome}] sem CONTEXTO`);
  }
});

test('invariante v1: prompts v1 contem REGRAS INVIOLAVEIS (tattoo+cadastro v2 usam §4 DECISAO)', () => {
  for (const { nome, tenant, conversa } of PROMPTS_V1) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §4 REGRAS INVIOLAVEIS/, `[${nome}] sem REGRAS`);
  }
});

test('invariante v2: coleta-tattoo contem §4 DECISAO E REGRAS', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  assert.match(out, /# §4 DECISAO E REGRAS/, 'coleta-tattoo v2 sem secao DECISAO');
  assert.match(out, /# §3 OBJETIVO/, 'coleta-tattoo v2 sem secao OBJETIVO');
});

test('invariante smoke: coleta-tattoo ancora saudacao inicial em 2 baloes com nome opcional', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  assert.match(out, /AGENTE: Oii, tudo bem\?\n\nAGENTE: Me chamo Lina, muito prazer! Como posso te chamar\?/);
  assert.match(out, /nome e opcional/i);
});

test('invariante smoke: coleta-tattoo descreve lote sequencial quando contexto indica batch', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, {
    ...CLIENT_CONTEXT_CANONICO,
    batch_message_count: 2,
    batch_joined_by: 'newline',
  });
  assert.match(out, /Turno atual: 2 baloes do cliente no mesmo lote/i);
  assert.match(out, /lote unico/i);
});

test('invariante smoke: coleta-tattoo nao ensina template "Anotei:"', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
  assert.doesNotMatch(out, /Anotei:/);
});

test('invariante v2: coleta-cadastro contem §4 DECISAO E REGRAS', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_CADASTRO, CLIENT_CONTEXT_CANONICO);
  assert.match(out, /# §4 DECISAO E REGRAS/, 'coleta-cadastro v2 sem secao DECISAO');
  assert.match(out, /# §3 OBJETIVO/, 'coleta-cadastro v2 sem secao OBJETIVO');
});

test('invariante v2: coleta-proposta contem §4 TABELA DE DECISAO + REGRAS', () => {
  const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_PROPOSTA, CLIENT_CONTEXT_CANONICO);
  assert.match(out, /# §4 TABELA DE DECISAO/, 'coleta-proposta v2 sem secao DECISAO');
  assert.match(out, /# §2 OBJETIVO/, 'coleta-proposta v2 sem secao OBJETIVO');
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

// ──────────────────────────────────────────────────────────────────────────
// REFATOR PROMPTS COLETA V2 (2026-05-06): invariants pra garantir que o
// anti-pattern "AGENTE: [chama X(...)]" foi extinto e que tom.js e respeitado
// pelos few-shots. Usa dispatcher + fixtures canonicos (mesmo pattern dos
// invariants ja existentes).
// ──────────────────────────────────────────────────────────────────────────

const COLETA_PROMPTS = [
  { nome: 'coleta-tattoo',   tenant: TENANT_CANONICO, conversa: CONVERSA_COLETA_TATTOO },
  { nome: 'coleta-cadastro', tenant: TENANT_CANONICO, conversa: CONVERSA_COLETA_CADASTRO },
  { nome: 'coleta-proposta', tenant: TENANT_CANONICO, conversa: CONVERSA_COLETA_PROPOSTA },
];

// Tattoo v2, Cadastro v2 e Proposta v2 nao tem mais §4b TOOLS (pure structured-output, sem tools).
const COLETA_PROMPTS_V1 = COLETA_PROMPTS.filter(p => p.nome !== 'coleta-tattoo' && p.nome !== 'coleta-cadastro' && p.nome !== 'coleta-proposta');

const ANTI_PATTERNS_PSEUDO = [
  /AGENTE:\s*\[chama\s+\w+/i,
  /AGENTE:\s*\[tool\s+retorna/i,
  /\[chama\s+dados_coletados/i,
  /\[chama\s+enviar_orcamento/i,
  /\[chama\s+enviar_objecao/i,
  /\[chama\s+consultar_proposta/i,
  /\[chama\s+acionar_handoff/i,
];

const FORBIDDEN_PHRASES_TOM = [
  /vou passar pro tatuador/i,
  /pra eu passar pro/i,
];

// Helper: extrai linhas iniciando por "AGENTE:" dentro de blocos ``` de few-shots.
function extractAgentTurns(promptText) {
  const lines = promptText.split('\n');
  const turns = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.trim() === '```') { inBlock = !inBlock; continue; }
    if (inBlock && /^AGENTE:/.test(line.trim())) {
      turns.push(line.replace(/^AGENTE:\s*/, '').trim());
    }
  }
  return turns;
}

test('invariante coleta v2: nenhum prompt contem pseudo-codigo de tool', () => {
  for (const { nome, tenant, conversa } of COLETA_PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    for (const pattern of ANTI_PATTERNS_PSEUDO) {
      assert.doesNotMatch(out, pattern,
        `[${nome}] anti-pattern de pseudo-codigo detectado (${pattern})`);
    }
  }
});

test('invariante coleta v2: nenhum turn AGENTE em few-shots usa frases proibidas tom.js', () => {
  for (const { nome, tenant, conversa } of COLETA_PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    const turns = extractAgentTurns(out);
    for (const turn of turns) {
      for (const pattern of FORBIDDEN_PHRASES_TOM) {
        assert.doesNotMatch(turn, pattern,
          `[${nome}] turn AGENTE com frase proibida: "${turn}"`);
      }
    }
  }
});

test('invariante coleta v2: nenhum turn AGENTE em few-shots excede 200 chars (tom.js)', () => {
  for (const { nome, tenant, conversa } of COLETA_PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    const turns = extractAgentTurns(out);
    for (const turn of turns) {
      if (turn.startsWith('http')) continue; // URLs de link-pagamento OK
      assert.ok(turn.length <= 200,
        `[${nome}] turn AGENTE excede 200 chars (${turn.length}): "${turn.slice(0, 100)}..."`);
    }
  }
});

test('invariante coleta v2: nenhum turn AGENTE em few-shots tem >1 pergunta (heuristica 1 pergunta/turno)', () => {
  for (const { nome, tenant, conversa } of COLETA_PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    const turns = extractAgentTurns(out);
    for (const turn of turns) {
      const qCount = (turn.match(/\?/g) || []).length;
      assert.ok(qCount <= 1,
        `[${nome}] turn AGENTE com ${qCount} perguntas: "${turn}"`);
    }
  }
});

test('invariante coleta v1: prompts v1 contem secao §4b TOOLS — QUANDO INVOCAR (tattoo+cadastro v2 isentos)', () => {
  for (const { nome, tenant, conversa } of COLETA_PROMPTS_V1) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §4b TOOLS — QUANDO INVOCAR/,
      `[${nome}] sem secao §4b TOOLS — QUANDO INVOCAR (regressao!)`);
  }
});
