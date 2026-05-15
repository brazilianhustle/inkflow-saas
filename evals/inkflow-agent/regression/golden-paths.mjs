#!/usr/bin/env node
// regression/golden-paths.mjs — gate CI: happy path por persona core.
// Phase 0 stub: aponta pra evals legados de tattoo/cadastro/proposta que ja
// cobrem PER-001 implicitamente. Phase 1+ migra pra eval files dedicados.

import { spawnSync } from 'node:child_process';

console.log('🌟 InkFlow Agent — regression/golden-paths (Phase 0: usa eval suites legadas)');

const SUITES = [
  'tests/agent/tattoo-agent.eval.mjs',
  'tests/agent/cadastro-agent.eval.mjs',
];

if (!process.env.OPENAI_API_KEY) {
  console.log('SKIP: OPENAI_API_KEY ausente (eval suite requer)');
  process.exit(0);
}

const r = spawnSync('node', ['--test', ...SUITES], { stdio: 'inherit' });
process.exit(r.status || 0);
