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

echo "✓ Todos os tests de prompts passaram."
