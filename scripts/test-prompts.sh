#!/usr/bin/env bash
# Roda toda a bateria de tests de prompts. Use antes de commit/push.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ Snapshots..."
node --test tests/prompts/snapshot.test.mjs

echo "▶ Contracts..."
node --test tests/prompts/contracts.test.mjs

echo "▶ Invariants..."
node --test tests/prompts/invariants.test.mjs

echo "▶ Contamination..."
node --test tests/prompts/contamination.test.mjs

echo "▶ Update-tenant validation..."
node --test tests/update-tenant-validation.test.mjs

echo "▶ Tools — dados-coletados helpers..."
node --test tests/tools/dados-coletados-helpers.test.mjs

echo "▶ Tools — reentrada helpers..."
node --test tests/tools/reentrada-helpers.test.mjs

echo "▶ API — kill-switch-detect..."
node --test tests/api/kill-switch-detect.test.mjs

echo "▶ API — conversas assumir/devolver..."
node --test tests/api/conversas-assumir-devolver.test.mjs

echo "▶ API — auto-retomar-bot..."
node --test tests/api/auto-retomar-bot.test.mjs

echo "✓ Todos os tests passaram."
