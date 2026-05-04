#!/bin/bash
# Audit: lista todas as referências a "Artistas do estúdio" no codebase
# Saída: stdout com 4 seções (schema, frontend, backend, prompts)
# Uso: bash scripts/audit-artistas-refs.sh
# Descartável: deletar após PR 1 merged.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "═══ 1. Schema (colunas tenants/onboarding_links) ═══"
grep -rn "is_artist_slot\|parent_tenant_id\|max_artists\|artista_slot\|is_artist_invite" \
  --include="*.js" --include="*.sql" --include="*.html" \
  --exclude-dir=node_modules --exclude-dir=.superpowers --exclude-dir=docs --exclude-dir=.claude --exclude-dir=worktrees \
  | sort -u || true

echo ""
echo "═══ 2. Frontend (texto visível ao tatuador) ═══"
grep -rn "Artista\|artistas\|Convidar\|invite-" \
  --include="*.html" \
  --exclude-dir=node_modules --exclude-dir=.superpowers --exclude-dir=docs --exclude-dir=.claude --exclude-dir=worktrees \
  | grep -iE "estudio|tatuador|estud|artist" \
  | sort -u || true

echo ""
echo "═══ 3. Backend (endpoints e lib) ═══"
ls functions/api/*invite* functions/api/*artist* 2>/dev/null || echo "(nenhum)"

echo ""
echo "═══ 4. Prompts (refs a multi-tatuador) ═══"
grep -rn "tatuadores do estudio\|tatuadores do estúdio\|artistas do estudio\|artistas do estúdio\|outros tatuadores\|outros artistas" \
  functions/_lib/prompts/ 2>/dev/null || echo "(nenhum)"

echo ""
echo "═══ Audit concluído ═══"
