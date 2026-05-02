#!/usr/bin/env bash
# Regenera snapshots de prompts. Use quando uma mudanca for INTENCIONAL.
# Sem este script, snapshot.test.mjs falha em mudancas — exatamente o
# comportamento desejado (forca PR a explicitar diff de prompt).
set -euo pipefail

cd "$(dirname "$0")/.."

node --input-type=module -e "
import { generateSystemPrompt } from './functions/_lib/generate-prompt.js';
import { TENANT_CANONICO, TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO } from './tests/prompts/fixtures/tenant-canonico.mjs';
import { writeSnapshot } from './tests/prompts/helpers.mjs';

writeSnapshot('faixa', generateSystemPrompt(TENANT_CANONICO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO));
writeSnapshot('exato', generateSystemPrompt(TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO));
console.log('OK — snapshots faixa.txt e exato.txt regenerados.');
"
