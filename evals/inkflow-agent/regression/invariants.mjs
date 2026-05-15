#!/usr/bin/env node
// regression/invariants.mjs — gate CI: invariantes de schema dos agents.
// Reusa tests existentes em tests/agent/*.test.mjs + tests/prompts/invariants.test.mjs.

import { spawnSync } from 'node:child_process';

const SUITES = [
  'tests/agent/tattoo-agent.test.mjs',
  'tests/agent/cadastro-agent.test.mjs',
  'tests/agent/proposta-validator.test.mjs',
  'tests/agent/enforce-menor-idade.test.mjs',
  'tests/agent/route.test.mjs',
  'tests/agent/route-runagent.test.mjs',
  'tests/prompts/invariants.test.mjs',
];

console.log('🔒 InkFlow Agent — regression/invariants');

const r = spawnSync('node', ['--test', ...SUITES], { stdio: 'inherit' });
process.exit(r.status || 0);
