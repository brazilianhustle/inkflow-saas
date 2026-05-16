#!/usr/bin/env node
// run.mjs — harness do programa InkFlow Agent (Pilar 4).
//
// Diferenças vs evals/run.mjs legado:
// - Judge model = Anthropic Claude Haiku 4.5 (não OpenAI)
// - Rubric 9 dimensoes (5 naturalidade + 3 manifesto + 1 state)
// - Suporta categorias: regression / directed / red-team
//
// Uso:
//   node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=regression
//   node --env-file=evals/.env evals/inkflow-agent/_harness/run.mjs --category=directed --agent=tattoo --persona=per-001
//
// ENV obrigatórios (em evals/.env):
//   BASE_URL, TENANT_ID, ADMIN_BEARER ou EVAL_SECRET, OPENAI_API_KEY (model under test)
//   ANTHROPIC_API_KEY (judge)
//
// Opcionais:
//   JUDGE_MODEL (default claude-haiku-4-5-20251001)

import fs from 'node:fs/promises';
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scoreNaturalidade, scoreManifesto, scoreState, computePass } from './rubric.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BASE_URL = process.env.BASE_URL || 'https://inkflowbrasil.com';
const EVAL_SECRET = process.env.EVAL_SECRET;
const BEARER = process.env.ADMIN_BEARER;
const TENANT_ID = process.env.TENANT_ID;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'claude-haiku-4-5-20251001';

const SUPABASE_URL = 'https://bfzuxxuscyplfoimvomh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--(\w[\w-]*)=(.+)$/);
    if (m) { args[m[1]] = m[2]; continue; }
    const f = a.match(/^--(\w[\w-]*)$/);
    if (f) { args[f[1]] = true; }
  }
  return args;
}

async function fetchTenant(tenantId) {
  if (!SUPABASE_KEY) {
    throw new Error('SUPABASE_SERVICE_KEY missing em evals/.env — adicione a variavel pra harness puxar config real do tenant.');
  }
  const fields = 'id,nome_agente,nome_estudio,plano,faq_texto,config_precificacao,' +
                 'config_agente,horario_funcionamento,duracao_sessao_padrao_h,' +
                 'sinal_percentual,gatilhos_handoff,portfolio_urls,modo_atendimento';
  const url = `${SUPABASE_URL}/rest/v1/tenants?id=eq.${encodeURIComponent(tenantId)}&select=${fields}`;
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`fetchTenant http ${r.status}: ${txt.slice(0, 200)}`);
  }
  const arr = await r.json();
  if (!arr.length) throw new Error(`fetchTenant: tenant ${tenantId} nao encontrado`);
  return arr[0];
}

function loadJudgePrompt(name) {
  return readFileSync(path.join(__dirname, 'judge-prompts', `${name}.txt`), 'utf-8');
}

async function callAnthropicJudge(systemPrompt, userPrompt) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY missing');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 1024,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = data.content?.[0]?.text || '{}';
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
}

const IMPLEMENTED_STATES = new Set([
  'coletando_tattoo',
  'tattoo',       // orchestrator canonical name for coletando_tattoo
  'cadastro',
  // PropostaAgent substates (Sub-3.2)
  'propondo_valor',
  'escolhendo_horario',
  'aguardando_sinal',
]);

// Fixture state names -> orchestrator canonical state names
// (fixtures use domain-readable names; orchestrator router uses short keys)
const STATE_NORMALIZE = {
  coletando_tattoo: 'tattoo',
};

function normalizeEstado(estado) {
  return STATE_NORMALIZE[estado] || estado;
}

async function playConv(conv, tenant, opts = {}) {
  const transcript = []; // { role, content, proxima_acao?, estado_novo?, dados_persistidos? }
  let estado_atual = normalizeEstado(conv.estado_atual || 'coletando_tattoo');
  let dados_acumulados = {};
  const run_ts = Date.now();
  const telefone = `eval-stub-${run_ts}`;

  for (let i = 0; i < (conv.turns_cliente || []).length; i++) {
    const turn = conv.turns_cliente[i];
    transcript.push({ role: 'user', content: turn });

    // historico que /api/agent/route espera: itens anteriores ao turn atual
    const historico = transcript
      .slice(0, -1) // exclui o user turn que acabamos de empilhar
      .map(m => ({ role: m.role, content: m.content }));

    const headers = { 'Content-Type': 'application/json' };
    // /api/agent/route e publico (Sub-1 PoC), nao precisa auth — header opcional
    // mantido pra compat futura.
    if (EVAL_SECRET) headers['X-Eval-Secret'] = EVAL_SECRET;
    // Sub 1.B: Cloudflare Access service token pra bater em preview deploys gated
    if (process.env.CF_ACCESS_CLIENT_ID) headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    if (process.env.CF_ACCESS_CLIENT_SECRET) headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;

    let res;
    try {
      res = await fetch(`${BASE_URL}/api/agent/route`, {
        method: 'POST', headers,
        body: JSON.stringify({
          tenant_id: TENANT_ID,
          telefone,
          mensagem: turn,
          estado_atual,
          dados_acumulados,
          historico,
          tenant, // override do stub default do route.js:275
        }),
      });
    } catch (e) {
      return { transcript, error: `network: ${e?.message || e}` };
    }

    if (res.status === 501) {
      // estado terminal (aguardando_tatuador / lead_frio / fechado) — handoff bem-sucedido
      transcript.push({ role: 'system', content: '[terminal_handoff: estado nao-implementado]' });
      return { transcript, terminal_handoff: true, last_estado_atual: estado_atual };
    }
    if (!res.ok) {
      let bodyRaw = null;
      if (opts.capture500Body && res.status >= 500) {
        try { bodyRaw = await res.text(); } catch { bodyRaw = '[read-error]'; }
      }
      return {
        transcript,
        error: `http ${res.status}`,
        ...(bodyRaw !== null && {
          response_status: res.status,
          response_body_raw: bodyRaw,
          turn_index: i,
          turn_content: turn,
        }),
      };
    }
    const data = await res.json();
    if (!data.ok) {
      const detail = data.reason ? ` reason=${data.reason}` : '';
      return { transcript, error: `${data.error || 'unknown'}${detail}` };
    }

    transcript.push({
      role: 'assistant',
      content: data.resposta_cliente || '',
      proxima_acao: data.proxima_acao,
      estado_novo: data.estado_novo,
      dados_persistidos: data.dados_persistidos || {},
    });

    // Propaga estado/dados pro proximo turn
    estado_atual = data.estado_novo || estado_atual;
    dados_acumulados = { ...dados_acumulados, ...(data.dados_persistidos || {}) };

    // Se estado_novo virou nao-implementado, proximo turn vai retornar 501.
    // Break preventivo (terminal_handoff bem-sucedido no turn atual).
    if (!IMPLEMENTED_STATES.has(estado_atual)) {
      transcript.push({ role: 'system', content: `[terminal_handoff: estado_novo=${estado_atual} nao-implementado]` });
      return { transcript, terminal_handoff: true, last_estado_atual: estado_atual };
    }
  }

  return { transcript, last_estado_atual: estado_atual };
}

function buildTranscriptTxt(transcript) {
  return transcript.map((m, i) => `[msg ${i} — ${m.role}]\n${m.content}`).join('\n\n');
}

async function judgeConv(conv, transcript, estado_atual) {
  const transcriptTxt = buildTranscriptTxt(transcript);

  // Bug Dim C fix: extrai proxima_acao REAL do ultimo turn assistant
  // (em vez de passar conv.expected.proxima_acao_esperada que e rotulo do
  // JSON eval, nao output do bot).
  const lastAssistant = [...transcript].reverse().find(m => m.role === 'assistant');
  const lastProximaAcao = lastAssistant?.proxima_acao || 'desconhecida';
  const lastEstadoNovo = lastAssistant?.estado_novo || estado_atual;

  const [natOut, manOut, stateOut] = await Promise.all([
    callAnthropicJudge(loadJudgePrompt('naturalidade-v2'), `Contexto: ${conv.titulo}\n\nTranscript:\n\n${transcriptTxt}\n\nAvalie.`),
    callAnthropicJudge(loadJudgePrompt('manifesto-adherence'), `Contexto: ${conv.titulo}\n\nTranscript:\n\n${transcriptTxt}\n\nAvalie cada principio aplicavel.`),
    callAnthropicJudge(loadJudgePrompt('state-transition'), `estado_atual: ${estado_atual} (estado inicial declarado no eval)\nestado_apos_ultimo_turn: ${lastEstadoNovo}\n\nTranscript:\n\n${transcriptTxt}\n\nUltima proxima_acao no output (REAL retornada pelo bot): ${lastProximaAcao}\n\nAvalie consistencia.`),
  ]);

  return {
    naturalidade: scoreNaturalidade(natOut),
    manifesto: scoreManifesto(manOut),
    state: scoreState(stateOut),
  };
}

function loadEvalsForCategory(category, args) {
  if (category === 'regression') {
    return [];
  }
  if (category === 'directed') {
    const dir = path.join(ROOT, 'directed', args.agent || '', args.persona || '');
    try {
      return readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(readFileSync(path.join(dir, f), 'utf-8')));
    } catch { return []; }
  }
  if (category === 'red-team') {
    return [];
  }
  return [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const category = args.category || 'directed';

  console.log(`\n🧪 InkFlow Agent harness — category=${category} agent=${args.agent || '-'} persona=${args.persona || '-'}`);
  console.log(`   Judge model: ${JUDGE_MODEL} (Anthropic)`);
  console.log(`   Base URL: ${BASE_URL}\n`);

  const convs = loadEvalsForCategory(category, args);
  if (!convs.length) {
    console.log('Nenhum eval encontrado pra esta categoria/filtro. (Phase 0: directed evals ainda nao criados.)');
    process.exit(0);
  }

  // Sub 1.A fix harness: fetch tenant real do Supabase pra passar config no payload
  // do /api/agent/route (que aceita body.tenant override do stub default).
  let tenantResolved;
  try {
    tenantResolved = await fetchTenant(TENANT_ID);
    console.log(`   Tenant: ${tenantResolved.nome_estudio || tenantResolved.id} (plano=${tenantResolved.plano})\n`);
  } catch (e) {
    console.error(`FATAL fetchTenant: ${e.message}`);
    process.exit(2);
  }

  const results = [];
  for (const conv of convs) {
    process.stdout.write(`→ ${conv.id} ... `);
    const played = await playConv(conv, tenantResolved, { capture500Body: !!args['capture-500-body'] });
    if (played.error) {
      console.log(`❌ ${played.error}`);
      const entry = { id: conv.id, status: 'error', error: played.error };
      if (played.response_body_raw) {
        entry.response_status = played.response_status;
        entry.response_body_raw = played.response_body_raw;
        entry.turn_index = played.turn_index;
        entry.turn_content = played.turn_content;
      }
      results.push(entry);
      continue;
    }
    const scores = await judgeConv(conv, played.transcript, conv.estado_atual || 'coletando_tattoo');
    const pass = computePass({ ...scores, funcionalidade: 1.0 }, conv.thresholds);
    console.log(pass.pass ? `✅ nat ${scores.naturalidade.media} · man ${scores.manifesto.m1_manifesto_adherence?.toFixed(2)}` : `❌ falhou em: ${pass.fails.join(', ')}`);
    results.push({ id: conv.id, status: pass.pass ? 'pass' : 'fail', scores, pass });
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  console.log(`\n${passed}/${results.length} pass · ${failed} fail`);

  await fs.writeFile(path.join(ROOT, 'report.json'), JSON.stringify({ ranAt: new Date().toISOString(), category, args, results }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
