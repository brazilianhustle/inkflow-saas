#!/usr/bin/env node
// ── InkFlow — eval harness (Fase 1) ────────────────────────────────────────
// Roda todas as conversas em /convs contra /api/tools/simular-conversa,
// avalia cada uma com gpt-4o (critic cross-model), gera report.json e
// resumo no terminal.
//
// Uso:
//   1. cp .env.example .env  e preencha
//   2. node run.mjs                      → roda todas
//   3. node run.mjs 001 003              → roda só ids que casarem
//
// ENV obrigatórios:
//   ADMIN_BEARER     — JWT Supabase do lmf4200@gmail.com (skip rate limit + auth)
//   TENANT_ID        — tenant usado nos testes (ex: Betinho)
//   OPENAI_API_KEY   — pra critic gpt-4o
//
// Opcionais:
//   BASE_URL         — default https://inkflowbrasil.com
//   MODEL_CRITIC     — default gpt-4o
//   TURN_DELAY_MS    — default 500 (throttle entre turnos)

import fs from 'node:fs/promises';
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ─────────────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'https://inkflowbrasil.com';
const BEARER = process.env.ADMIN_BEARER;
const TENANT_ID = process.env.TENANT_ID;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL_CRITIC = process.env.MODEL_CRITIC || 'gpt-4o';
const TURN_DELAY_MS = parseInt(process.env.TURN_DELAY_MS || '500', 10);
const CONVS_DIR = path.join(__dirname, 'convs');
const REPORT_PATH = path.join(__dirname, 'report.json');

if (!BEARER || !TENANT_ID || !OPENAI_KEY) {
  console.error('ERRO: faltam env vars. Precisa de ADMIN_BEARER, TENANT_ID, OPENAI_API_KEY.');
  console.error('Copie .env.example pra .env e preencha, rode: node --env-file=.env run.mjs');
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── 1. Loader ──────────────────────────────────────────────────────────────
function loadConvs(filter) {
  const files = readdirSync(CONVS_DIR).filter(f => f.endsWith('.json')).sort();
  const convs = files.map(f => {
    const raw = readFileSync(path.join(CONVS_DIR, f), 'utf-8');
    return JSON.parse(raw);
  });
  if (filter && filter.length) {
    return convs.filter(c => filter.some(f => c.id.includes(f)));
  }
  return convs;
}

// ── 2. Play conversa contra simular-conversa ───────────────────────────────
async function playConv(conv) {
  const history = [];
  const toolCalls = [];
  const errors = [];

  for (let i = 0; i < conv.turns_cliente.length; i++) {
    const userTurn = conv.turns_cliente[i];
    history.push({ role: 'user', content: userTurn });

    let res, data;
    try {
      res = await fetch(`${BASE_URL}/api/tools/simular-conversa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEARER}`,
        },
        body: JSON.stringify({ tenant_id: TENANT_ID, messages: history }),
      });
    } catch (e) {
      errors.push({ turn: i, error: `network: ${e.message}` });
      break;
    }

    if (!res.ok) {
      const text = await res.text();
      errors.push({ turn: i, error: `http ${res.status}: ${text.slice(0, 200)}` });
      break;
    }

    data = await res.json();
    if (!data.ok) {
      errors.push({ turn: i, error: `simular: ${data.error}` });
      break;
    }

    history.push({ role: 'assistant', content: data.reply || '' });
    if (data.tool_call) toolCalls.push(data.tool_call);

    if (TURN_DELAY_MS > 0) await sleep(TURN_DELAY_MS);
  }

  return { transcript: history, tool_calls: toolCalls, errors };
}

// ── 3. Checks determinísticos (regex/substring) ────────────────────────────
function checkDeterministic(conv, result) {
  const exp = conv.expected || {};
  const transcript = result.transcript || [];
  const botMsgs = transcript.filter(m => m.role === 'assistant').map(m => (m.content || '').toLowerCase());
  const ultimaBot = botMsgs[botMsgs.length - 1] || '';
  const todasBot = botMsgs.join(' | ');
  const toolChamadas = (result.tool_calls || []).map(t => t.name);
  const ultimaTool = toolChamadas[toolChamadas.length - 1];

  const checks = {};

  // Tool esperada
  if (exp.tool_esperada) {
    checks.tool_correta = {
      pass: ultimaTool === exp.tool_esperada,
      esperado: exp.tool_esperada,
      obtido: ultimaTool || 'nenhuma',
    };
  }

  // Última msg contém
  if (Array.isArray(exp.ultima_msg_deve_conter) && exp.ultima_msg_deve_conter.length) {
    const faltando = exp.ultima_msg_deve_conter.filter(s => !ultimaBot.includes(s.toLowerCase()));
    checks.ultima_msg_contem = {
      pass: faltando.length === 0,
      faltando,
    };
  }

  // Alguma msg contém
  if (Array.isArray(exp.deve_conter_em_alguma_msg) && exp.deve_conter_em_alguma_msg.length) {
    const faltando = exp.deve_conter_em_alguma_msg.filter(s => !todasBot.includes(s.toLowerCase()));
    checks.alguma_msg_contem = {
      pass: faltando.length === 0,
      faltando,
    };
  }

  // Nunca conter
  if (Array.isArray(exp.nunca_conter) && exp.nunca_conter.length) {
    const vazadas = exp.nunca_conter.filter(s => todasBot.includes(s.toLowerCase()));
    checks.proibidas_ausentes = {
      pass: vazadas.length === 0,
      vazadas,
    };
  }

  // Score determinístico (0-1)
  const passes = Object.values(checks).filter(c => c.pass).length;
  const total = Object.keys(checks).length;
  const score = total > 0 ? passes / total : 1;

  return { checks, score };
}

// ── 4. Critic LLM (naturalidade) ───────────────────────────────────────────
const CRITIC_SYSTEM = `Você é um avaliador rigoroso de qualidade de atendimento de um bot de WhatsApp de estúdio de tatuagem brasileiro. Sua tarefa é julgar se as mensagens do bot soam naturais (humano brasileiro no WhatsApp), não roboticas, e se respeitam boas práticas de conversação casual.

Avalie APENAS as mensagens do role "assistant". Ignore o que o cliente escreveu — essas mensagens são de teste.

Rubrica (notas 1-5, onde 5 = indistinguível de humano brasileiro expert em WhatsApp):

- **n1_wpp_br**: soa como atendente brasileira no WhatsApp? (girias, contrações "pra/tá", informalidade apropriada)
- **n2_robot_tells**: ausência de clichês/robóticas ("caro cliente", "atenciosamente", "ficarei feliz em te ajudar", "entendo perfeitamente", "permita-me", textões de secretaria)
- **n3_tom_consistente**: tom mantido ao longo da conversa? Sem oscilar formal↔informal.
- **n4_comprimento**: msgs curtas e casuais (1-3 linhas)? Sem textões nem respostas-tese.
- **n5_pontuacao**: pontuação natural do WhatsApp (sem pontos finais em frases curtas casuais)? Emoji no level certo (não exagerado)?

Também liste **issues**: problemas específicos que viu, em português, citando a frase problemática. Exemplo:
- "msg 3: 'Ficarei feliz em te ajudar' é clichê robótico"
- "msg 5: textão de 8 linhas, WhatsApp quer curto"
- "msg 2: 'atenciosamente' quebra o tom descontraído"

Retorne SOMENTE JSON válido neste formato exato:
{"n1_wpp_br": <1-5>, "n2_robot_tells": <1-5>, "n3_tom_consistente": <1-5>, "n4_comprimento": <1-5>, "n5_pontuacao": <1-5>, "media": <float>, "issues": ["..."]}`;

async function criticEval(conv, result) {
  if (!result.transcript || result.transcript.length === 0) {
    return { error: 'transcript vazio', media: 0 };
  }

  const transcriptTxt = result.transcript
    .map((m, i) => `[msg ${i} — ${m.role}]\n${m.content}`)
    .join('\n\n');

  const userPrompt = `Contexto da conversa: ${conv.titulo}\n\nTranscript completo:\n\n${transcriptTxt}\n\nAvalie agora.`;

  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: MODEL_CRITIC,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CRITIC_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    return { error: `critic network: ${e.message}`, media: 0 };
  }

  if (!res.ok) {
    const text = await res.text();
    return { error: `critic http ${res.status}: ${text.slice(0, 200)}`, media: 0 };
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.media) {
      const nums = ['n1_wpp_br', 'n2_robot_tells', 'n3_tom_consistente', 'n4_comprimento', 'n5_pontuacao']
        .map(k => parsed[k]).filter(n => typeof n === 'number');
      parsed.media = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    }
    return parsed;
  } catch {
    return { error: 'critic json inválido', raw, media: 0 };
  }
}

// ── 5. Runner principal ────────────────────────────────────────────────────
async function main() {
  const filter = process.argv.slice(2);
  const convs = loadConvs(filter);
  if (!convs.length) {
    console.error(`Nenhuma conversa encontrada em ${CONVS_DIR}${filter.length ? ` com filtro ${filter.join(',')}` : ''}`);
    process.exit(1);
  }

  console.log(`\n🧪 Rodando ${convs.length} conversa(s) contra ${BASE_URL}`);
  console.log(`   Tenant: ${TENANT_ID}\n`);

  const results = [];
  const t0 = Date.now();

  for (const conv of convs) {
    const label = `${conv.id} — ${conv.titulo}`;
    process.stdout.write(`→ ${label} ... `);
    const tStart = Date.now();

    const played = await playConv(conv);
    if (played.errors.length > 0) {
      console.log(`❌ erro: ${played.errors[0].error}`);
      results.push({ conv, played, det: null, critic: null, durationMs: Date.now() - tStart, status: 'error' });
      continue;
    }

    const det = checkDeterministic(conv, played);
    const critic = await criticEval(conv, played);

    const funcMin = conv.expected?.funcionalidade_min ?? 0.8;
    const natMin = conv.expected?.naturalidade_min ?? 4.0;
    const passFunc = det.score >= funcMin;
    const passNat = (critic.media || 0) >= natMin;
    const status = passFunc && passNat ? 'pass' : 'fail';

    const natStr = critic.media ? critic.media.toFixed(2) : 'err';
    console.log(
      `${status === 'pass' ? '✅' : '❌'} func ${(det.score * 100).toFixed(0)}% · nat ${natStr} · ${((Date.now() - tStart) / 1000).toFixed(1)}s`
    );
    results.push({ conv, played, det, critic, durationMs: Date.now() - tStart, status });
  }

  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

  // ── Summary ──
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const errored = results.filter(r => r.status === 'error').length;

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  Resumo: ${passed}/${results.length} pass · ${failed} fail · ${errored} erro · ${totalSec}s`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Issues detalhadas dos falhos
  const falhos = results.filter(r => r.status === 'fail');
  if (falhos.length > 0) {
    console.log('⚠️  Falhas detalhadas:\n');
    for (const r of falhos) {
      console.log(`  [${r.conv.id}] ${r.conv.titulo}`);
      if (r.det) {
        for (const [name, c] of Object.entries(r.det.checks)) {
          if (!c.pass) {
            const detail = c.vazadas ? `proibidas vazaram: ${c.vazadas.join(', ')}`
              : c.faltando ? `faltando: ${c.faltando.join(', ')}`
              : c.esperado ? `esperado "${c.esperado}", obtido "${c.obtido}"`
              : 'falhou';
            console.log(`    ✗ ${name}: ${detail}`);
          }
        }
      }
      if (r.critic?.issues?.length) {
        for (const iss of r.critic.issues.slice(0, 3)) console.log(`    ⚠ ${iss}`);
      }
      console.log('');
    }
  }

  // Salva relatório completo
  await fs.writeFile(REPORT_PATH, JSON.stringify({ ranAt: new Date().toISOString(), tenant_id: TENANT_ID, results }, null, 2));
  console.log(`📝 Relatório completo: ${REPORT_PATH}\n`);

  process.exit(failed + errored > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
