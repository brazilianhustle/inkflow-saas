#!/usr/bin/env bash
# run-baseline.sh — roda N rounds × 3 personas, salva reports individualmente,
# computa variance.
#
# Uso:
#   ./run-baseline.sh <BASE_URL> [N=5]
#   JUDGE_MODEL=claude-sonnet-4-6-20251001 OUT_DIR=/tmp/eval-baseline-sonnet \
#     ./run-baseline.sh <BASE_URL> 3
#
# Env vars:
#   OUT_DIR (default /tmp/eval-baseline)
#   JUDGE_MODEL (passa pro run.mjs, default claude-haiku-4-5)
set -euo pipefail

BASE_URL="${1:?BASE_URL obrigatório como primeiro arg}"
N="${2:-5}"
OUT_DIR="${OUT_DIR:-/tmp/eval-baseline}"
PERSONAS=("per-001" "per-009" "per-010")

mkdir -p "$OUT_DIR"
echo "→ baseline: BASE_URL=$BASE_URL N=$N OUT_DIR=$OUT_DIR JUDGE_MODEL=${JUDGE_MODEL:-default-haiku}"

for persona in "${PERSONAS[@]}"; do
  for i in $(seq 1 "$N"); do
    echo "==> $persona round $i/$N"
    BASE_URL="$BASE_URL" node --env-file=evals/.env \
      evals/inkflow-agent/_harness/run.mjs \
      --category=directed --agent=tattoo --persona="$persona" || true
    # `|| true` porque run.mjs sai com 1 quando alguma persona falha — não queremos abortar a coleta
    cp evals/inkflow-agent/report.json "$OUT_DIR/${persona}-r${i}.json"
  done
done

echo "→ computing variance..."
node evals/inkflow-agent/_harness/compute-variance.mjs "$OUT_DIR"
echo "→ done. aggregate em $OUT_DIR/aggregate.json"
