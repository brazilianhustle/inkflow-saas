#!/usr/bin/env node
// regression/snapshots.mjs — gate CI: snapshot tests de prompts.

import { spawnSync } from 'node:child_process';

console.log('📸 InkFlow Agent — regression/snapshots');

const r = spawnSync('node', ['--test', 'tests/prompts/snapshot.test.mjs'], { stdio: 'inherit' });
process.exit(r.status || 0);
