#!/usr/bin/env node
// promote-logs-to-evals.mjs — extrai uma conversa real de agent_turn_logs +
// chat_messages e gera eval case em formato compatível com run.mjs.
//
// Uso:
//   node scripts/inkflow-agent/promote-logs-to-evals.mjs \
//     --conversa-id=<uuid> \
//     --persona=PER-001 \
//     --agent=tattoo \
//     [--titulo="<descrição curta>"]
//
// Output: evals/inkflow-agent/directed/<agent>/<persona-slug>/auto_<timestamp>_<slug>.json

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([\w-]+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

async function fetchConversa(conversaId) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatorios');

  const msgsRes = await fetch(`${url}/rest/v1/chat_messages?conversa_id=eq.${conversaId}&order=created_at.asc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!msgsRes.ok) throw new Error(`fetch chat_messages: ${msgsRes.status}`);
  const msgs = await msgsRes.json();

  const logsRes = await fetch(`${url}/rest/v1/agent_turn_logs?conversa_id=eq.${conversaId}&order=turn_index.asc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!logsRes.ok) throw new Error(`fetch agent_turn_logs: ${logsRes.status}`);
  const logs = await logsRes.json();

  return { msgs, logs };
}

function buildEvalCase({ conversaId, persona, agent, titulo, msgs, logs }) {
  const turnsCliente = msgs
    .filter(m => m.tipo === 'cliente' || m.role === 'user')
    .map(m => m.mensagem || m.content || '');

  const ultimaToolUsada = logs.length ? logs[logs.length - 1].tool_calls?.[0]?.tool || null : null;

  return {
    id: `auto_${Date.now()}_${persona.toLowerCase()}_${conversaId.slice(0, 6)}`,
    titulo: titulo || `auto: conversa real ${conversaId} (${persona})`,
    descricao: `Promovido de agent_turn_logs em ${new Date().toISOString()}. Persona: ${persona}. Agent: ${agent}.`,
    persona,
    agent,
    estado_atual: logs[0]?.estado_agente || `coletando_${agent}`,
    source_conversa_id: conversaId,
    turns_cliente: turnsCliente,
    expected: {
      tool_esperada: ultimaToolUsada,
      naturalidade_min: 4.0,
      manifesto_adherence_min: 0.85,
      funcionalidade_min: 0.8,
    },
  };
}

async function main() {
  const args = parseArgs();
  if (!args['conversa-id']) {
    console.error('--conversa-id=<uuid> obrigatório');
    process.exit(1);
  }
  if (!args.persona || !/^PER-\d{3}$/.test(args.persona)) {
    console.error('--persona=PER-NNN obrigatório (ex: PER-001)');
    process.exit(1);
  }
  if (!args.agent || !['tattoo', 'cadastro', 'proposta', 'portfolio'].includes(args.agent)) {
    console.error('--agent={tattoo|cadastro|proposta|portfolio} obrigatório');
    process.exit(1);
  }

  const personaSlug = args.persona.toLowerCase();
  const outDir = path.join(ROOT, 'evals/inkflow-agent/directed', args.agent, personaSlug);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const { msgs, logs } = await fetchConversa(args['conversa-id']);
  if (!msgs.length) {
    console.error(`Sem mensagens encontradas pra conversa ${args['conversa-id']}`);
    process.exit(1);
  }

  const evalCase = buildEvalCase({
    conversaId: args['conversa-id'],
    persona: args.persona,
    agent: args.agent,
    titulo: args.titulo,
    msgs,
    logs,
  });

  const slug = (args.titulo || `conv-${args['conversa-id'].slice(0, 6)}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const outPath = path.join(outDir, `auto_${new Date().toISOString().slice(0, 10)}_${slug}.json`);
  writeFileSync(outPath, JSON.stringify(evalCase, null, 2));
  console.log(`✅ Eval criado: ${outPath}`);
  console.log(`   Persona: ${args.persona}`);
  console.log(`   Turns: ${evalCase.turns_cliente.length}`);
  console.log(`   Review manual + ajuste expected antes de commitar.`);
}

main().catch(e => { console.error(e); process.exit(1); });
