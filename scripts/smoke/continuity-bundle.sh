#!/usr/bin/env bash
# scripts/smoke/continuity-bundle.sh
#
# Gera/reinjeta o estado vivo da frente atendimento-premium depois de
# limpar/compactar o contexto, para o loop sobreviver sem depender da memoria
# do chat.
#
# Modos:
#   - Hook SessionStart do Claude Code: le JSON no stdin e dispara em
#     clear/compact/resume.
#   - Execucao explicita: `bash scripts/smoke/continuity-bundle.sh --force`
#     sempre imprime o bundle. Este e o modo portavel para Codex/CLI.
#
# Adaptado a realidade multi-cliente:
#   - no hook, dispara so em clear/compact/resume;
#   - no modo --force, dispara sempre;
#   - so injeta quando docs/atendimento-premium/current-objective.md existe
#     (frente ativa neste repo/worktree);
#   - melhor-esforco: nunca derruba o SessionStart, sempre sai 0.
#
# Equivale ao "Comando De Retomada" de 12-loop-continuity-protocol.md,
# so que automatico.

# Best-effort: sem strict mode para nao quebrar o inicio de sessao.
cd "$(dirname "$0")/../.." 2>/dev/null || exit 0

force=0
if [ "${1:-}" = "--force" ]; then
  force=1
fi

if [ "$force" = "1" ]; then
  source_kind="force"
else
  # SessionStart entrega JSON no stdin; nos so queremos o campo .source.
  input="$(cat 2>/dev/null || true)"
  source_kind="$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null || true)"
fi

case "$source_kind" in
  clear|compact|resume|force) ;;
  *) exit 0 ;;   # startup ou desconhecido: nao injeta nada
esac

OBJ="docs/atendimento-premium/current-objective.md"
RUNS="docs/atendimento-premium/smoke-runs.md"
[ -f "$OBJ" ] || exit 0   # frente nao ativa aqui

bundle="$(
  {
    echo "## Retomada automatica - atendimento-premium (source=${source_kind})"
    echo
    echo "Fonte de verdade = repo. O chat acima pode ter sido compactado;"
    echo "abaixo esta o estado vivo. Protocolo completo:"
    echo "docs/atendimento-premium/12-loop-continuity-protocol.md"
    echo
    echo "### git"
    git status --short 2>/dev/null | head -20
    echo "---"
    git log --oneline -5 2>/dev/null
    echo
    echo "### current-objective.md (topo)"
    sed -n '1,80p' "$OBJ" 2>/dev/null
    if [ -f "$RUNS" ]; then
      echo
      echo "### smoke-runs.md (topo)"
      sed -n '1,40p' "$RUNS" 2>/dev/null
    fi
    echo
    echo "### gates"
    bash scripts/smoke/check-autonomy-gate.sh 2>/dev/null | sed -n '1,80p'
    echo
    bash scripts/smoke/check-slice-gate.sh cadastro-handoff 2>/dev/null | sed -n '1,80p'
  } 2>/dev/null
)"

[ -n "$bundle" ] || exit 0

if [ "$force" = "1" ]; then
  printf '%s\n' "$bundle"
elif command -v jq >/dev/null 2>&1; then
  jq -nc \
    --arg ctx "$bundle" \
    '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$ctx}}' 2>/dev/null \
    || printf '%s\n' "$bundle"
else
  # Sem jq: SessionStart tambem aceita stdout puro como contexto.
  printf '%s\n' "$bundle"
fi

exit 0
