#!/usr/bin/env node
// ── InkFlow — eval scenario generator ──────────────────────────────────────
// Usa gpt-4o pra gerar cenários de teste novos, baseado:
//   - Fixtures existentes em /convs (pra não duplicar)
//   - Config do tenant (gatilhos, estilos, preços, etc — via /api/tools/prompt)
//
// Uso:
//   node --env-file=.env generate.mjs [N]   → gera N cenários (default 3)
//
// Saída:
//   convs/auto_<timestamp>_<id>.json         → cada cenário num arquivo
//
// Depois é só rodar: node --env-file=.env run.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.BASE_URL || 'https://inkflowbrasil.com';
const EVAL_SECRET = process.env.EVAL_SECRET;
const TENANT_ID = process.env.TENANT_ID;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.MODEL_GENERATOR || 'gpt-4o';
const CONVS_DIR = path.join(__dirname, 'convs');

const N = parseInt(process.argv[2] || '3', 10);

if (!EVAL_SECRET || !TENANT_ID || !OPENAI_KEY) {
  console.error('ERRO: precisa de EVAL_SECRET, TENANT_ID, OPENAI_API_KEY no .env');
  process.exit(1);
}

// ── 1. Coleta contexto: fixtures existentes + system prompt do tenant ──────
function loadExistingConvs() {
  const files = readdirSync(CONVS_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try { return JSON.parse(readFileSync(path.join(CONVS_DIR, f), 'utf-8')); }
    catch { return null; }
  }).filter(Boolean);
}

async function loadTenantPrompt() {
  // Chama simular-conversa com msg vazia pra "espiar" o prompt efetivo — mas
  // simular não expõe. Então usa uma chamada dummy e lemos o reply vazio.
  // Alternativa: chamar /api/tools/prompt (tem auth diferente). Mais simples:
  // passa só o tenant_id e deixa o LLM gerador trabalhar com o contexto generico.
  return null;
}

// ── 2. System prompt pro gerador ───────────────────────────────────────────
const GENERATOR_SYSTEM = `Você é um gerador de casos de teste (fixtures) para um bot de WhatsApp de estúdio de tatuagem brasileiro.

CONTEXTO DO BOT:
- Atende clientes que querem tatuar: coleta tema, local, tamanho, estilo, cor, detalhe.
- Chama tool \`calcular_orcamento\` quando tem tudo. Retorna preço em R$.
- Gatilhos de handoff (bot NÃO orça, transfere pro tatuador): rosto, mão, pescoço, cobertura, retoque, menor de idade.
- Estilos recusados pelo tenant: minimalista, new school (exemplos).

SUA TAREFA:
Gerar ${N} cenários NOVOS de teste que:
1. NÃO dupliquem os cenários existentes que vou te mostrar.
2. Cubram edge cases: cliente confuso, contraditório, com pedido estranho, fora do escopo, tentando manipular, etc.
3. Cada cenário tem 3-10 turnos de cliente (mensagens curtas, estilo WhatsApp BR — minúsculo, sem pontuação excessiva, informal).
4. Inclua \`expected\` realista baseado no comportamento desejado.

FORMATO DE SAÍDA (JSON válido — objeto com array \`cenarios\`):
\`\`\`json
{
  "cenarios": [
    {
      "id": "auto_XXX_descricao_curta",
      "titulo": "Título curto do caso",
      "descricao": "O que testa e qual comportamento esperado",
      "turns_cliente": ["msg 1", "msg 2", "..."],
      "expected": {
        "tool_esperada": "calcular_orcamento" | "acionar_handoff" | null,
        "ultima_msg_deve_conter": ["R$"],
        "deve_conter_em_alguma_msg": ["..."],
        "nunca_conter": ["..."],
        "naturalidade_min": 4.0,
        "funcionalidade_min": 0.8
      }
    }
  ]
}
\`\`\`

O array \`cenarios\` DEVE ter EXATAMENTE ${N} itens.

REGRAS IMPORTANTES:
- Nunca coloque em \`nunca_conter\` substrings que o bot NORMALMENTE diria no fluxo válido (ex: "tamanho", "cm" — são palavras que aparecem muito). Use frases específicas e longas o suficiente pra não gerar falso positivo (ex: "passo pro tatuador", "caro cliente").
- Turnos do cliente devem soar REAIS, não formais. Ex: "ei", "oi, tudo bem?", "quero um desenho no braço", "uns 10cm acho", "kkkk", "sei la".
- \`id\` precisa ser único (adicione sufixo aleatório) e começar com \`auto_\`.

ASSERTIONS DE STRING — USE PALAVRAS-CHAVE CURTAS, NÃO FRASES LITERAIS:
- Bot fala em português natural de WhatsApp com VARIAÇÃO. Cada rodada ele varia as palavras. Se você assertar "desculpe, não fazemos minimalista" como substring obrigatória, vai falhar porque bot diz coisa tipo "esse estilo a gente não trabalha".
- REGRA: em \`deve_conter_em_alguma_msg\` e \`ultima_msg_deve_conter\`, use SÓ palavras-chave curtas de 1-2 palavras que são INEVITÁVEIS dada a temática. Exemplos bons: "tatuador", "altura", "R$", "minimalista", "cobertura", "outro estúdio". Exemplos ruins: "desculpe, não fazemos X", "qual o tamanho e a cor", "é maior de idade".
- Se quiser testar que bot recusou menor de idade, use \`deve_conter_em_alguma_msg: ["tatuador"]\` (vai falar em chamar o tatuador), NÃO "maior de idade" (bot pode nem usar essa frase).
- Se quiser testar recusa de estilo, use \`deve_conter_em_alguma_msg: ["não trabalha"]\` ou o nome do estilo recusado (ex: "minimalista").

CRÍTICO — LIMITAÇÕES DO SIMULADOR (senão o teste é impossível):
- O simulador SÓ expõe a tool \`calcular_orcamento\` pro bot. NÃO expõe \`acionar_handoff\`, \`consultar_horarios_livres\`, \`reservar_horario\`, etc.
- Se o cenário testa gatilho (menor de idade, rosto, mão, cobertura), NÃO use \`tool_esperada\` — use apenas \`deve_conter_em_alguma_msg: ["tatuador"]\` ou frases equivalentes pra checar que o bot RECONHECEU verbalmente.
- \`tool_esperada: "calcular_orcamento"\` só é válido quando os turnos_cliente contêm TODOS estes dados: local do corpo, tamanho em cm, estilo, cor (preto/colorido), e nível de detalhe (simples/detalhado). Se faltar qualquer um, use \`tool_esperada: null\` ou omita o campo.
- \`ultima_msg_deve_conter: ["R$"]\` só é válido se os turnos_cliente permitirem ao bot coletar tudo pra orçar. Se o cenário é sobre cliente evasivo/confuso/contraditório que nunca dá info completa, OMITA esse assertion.
- Regra de ouro: cada assertion precisa ser VERIFICADO mentalmente contra os turns_cliente. Se um bot perfeito não conseguiria cumprir dado o que o cliente disse, não coloque o assertion.

Retorne SOMENTE o JSON, sem texto fora.`;

function userPromptFromExisting(existing) {
  const sample = existing.slice(0, 10).map(c => ({
    id: c.id,
    titulo: c.titulo,
    turns_cliente: c.turns_cliente,
    expected: c.expected,
  }));
  return `Cenários já existentes (NÃO duplicar, gere coisas diferentes):

${JSON.stringify(sample, null, 2)}

Agora gere ${N} cenários novos, diversos entre si, cobrindo edge cases não testados acima.`;
}

// ── 3. Chama gpt-4o ────────────────────────────────────────────────────────
async function callLLM(userMsg) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.9,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: GENERATOR_SYSTEM },
        { role: 'user', content: userMsg },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`openai http ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(raw);
  // Aceita tanto {scenarios:[...]} quanto array solto
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.scenarios)) return parsed.scenarios;
  if (Array.isArray(parsed.cenarios)) return parsed.cenarios;
  // Se veio objeto único, envolve em array
  if (parsed.id && parsed.turns_cliente) return [parsed];
  throw new Error('formato de resposta inesperado: ' + raw.slice(0, 200));
}

// ── 4. Valida e salva ──────────────────────────────────────────────────────
function validate(sc) {
  if (!sc.id || typeof sc.id !== 'string') return 'id faltando';
  if (!sc.titulo) return 'titulo faltando';
  if (!Array.isArray(sc.turns_cliente) || sc.turns_cliente.length === 0) return 'turns_cliente invalido';
  if (sc.turns_cliente.some(t => typeof t !== 'string')) return 'turns_cliente nao-string';
  return null;
}

async function save(sc) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const slug = sc.id.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
  const filename = `auto_${ts}_${slug}.json`;
  const full = path.join(CONVS_DIR, filename);
  await fs.writeFile(full, JSON.stringify(sc, null, 2));
  return filename;
}

// ── 5. Runner ──────────────────────────────────────────────────────────────
async function main() {
  const existing = loadExistingConvs();
  console.log(`📂 ${existing.length} fixture(s) existente(s) em convs/`);
  console.log(`🧬 Gerando ${N} cenário(s) novo(s) com ${MODEL}...\n`);

  const userMsg = userPromptFromExisting(existing);
  let scenarios;
  try {
    scenarios = await callLLM(userMsg);
  } catch (e) {
    console.error('FATAL: geração falhou:', e.message);
    process.exit(2);
  }

  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    console.error('FATAL: LLM retornou zero cenários');
    process.exit(2);
  }

  let ok = 0, rejected = 0;
  for (const sc of scenarios) {
    const err = validate(sc);
    if (err) {
      console.log(`  ⚠️  rejeitado (${err}): ${sc.id || '<sem id>'}`);
      rejected++;
      continue;
    }
    const filename = await save(sc);
    console.log(`  ✅ ${filename}`);
    console.log(`     ${sc.titulo}`);
    console.log(`     ${sc.turns_cliente.length} turnos`);
    ok++;
  }

  console.log(`\n📝 ${ok} fixture(s) gerada(s). ${rejected} rejeitado(s).`);
  console.log(`\nPróximo passo: node --env-file=.env run.mjs`);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
