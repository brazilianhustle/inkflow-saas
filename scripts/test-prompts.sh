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

echo "▶ API — conversas grupos..."
node --test tests/api/conversas-grupos.test.mjs

echo "▶ API — conversas list..."
node --test tests/api/conversas-list.test.mjs

echo "▶ API — conversas thread..."
node --test tests/api/conversas-thread.test.mjs

echo "▶ Lib — conversas-lifecycle..."
node --test tests/_lib/conversas-lifecycle.test.mjs

echo "▶ Lib — dashboard-time (PR 2)..."
node --test tests/_lib/dashboard-time.test.mjs

echo "▶ Lib — resumo-semanal-prompt (PR 2)..."
node --test tests/_lib/resumo-semanal-prompt.test.mjs

echo "▶ API — dashboard kpis (PR 2)..."
node --test tests/api/dashboard-kpis.test.mjs

echo "▶ API — dashboard atividade-recente (PR 2)..."
node --test tests/api/dashboard-atividade-recente.test.mjs

echo "▶ API — dashboard regenerate-resumo (PR 2)..."
node --test tests/api/dashboard-regenerate-resumo.test.mjs

echo "▶ API — cron resumo-semanal (PR 2)..."
node --test tests/api/cron-resumo-semanal.test.mjs

echo "✓ Todos os tests passaram."
