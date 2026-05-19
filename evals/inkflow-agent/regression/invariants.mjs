#!/usr/bin/env node
// regression/invariants.mjs — gate CI: invariantes de schema dos agents.
// Atualizado Caminho C Fase 2B: schemas strict (3 agents) + contracts
// (handoffs + portfolio + proposta-actions) + run-*-agent (transport)
// + route/router (dispatch + validateAction). proposta-validator deletado
// (substituido por proposta-schema + proposta-actions). cadastro-agent
// renomeado pra run-cadastro-agent na Fase 2A.

import { spawnSync } from 'node:child_process';

const SUITES = [
  // Schemas strict (1 por agent customer-facing)
  'tests/agent/tattoo-schema.test.mjs',
  'tests/agent/cadastro-schema.test.mjs',
  'tests/agent/proposta-schema.test.mjs',
  // Transport (runtime.run + parse)
  'tests/agent/run-tattoo-agent.test.mjs',
  'tests/agent/run-cadastro-agent.test.mjs',
  'tests/agent/run-proposta-agent.test.mjs',
  // Cross-agent invariants + enforce
  'tests/agent/enforce-menor-idade.test.mjs',
  'tests/agent/router-validate-transition.test.mjs',
  'tests/agent/route.test.mjs',
  'tests/agent/route-runagent.test.mjs',
  // Prompt invariants
  'tests/prompts/invariants.test.mjs',
];

console.log('🔒 InkFlow Agent — regression/invariants');

const r = spawnSync('node', ['--test', ...SUITES], { stdio: 'inherit' });
process.exit(r.status || 0);
