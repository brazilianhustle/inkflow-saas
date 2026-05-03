#!/usr/bin/env bash
# Regenera snapshots de prompts. Use quando uma mudanca for INTENCIONAL.
# Sem este script, snapshot.test.mjs falha em mudancas — exatamente o
# comportamento desejado (forca PR a explicitar diff de prompt).
#
# Modo Coleta v2: 4 snapshots — coleta-tattoo, coleta-cadastro,
# coleta-proposta, exato. Faixa removido (sem tenants pagantes).
set -euo pipefail

cd "$(dirname "$0")/.."

# Heredoc com quote ('EOF') evita expansao de bash em $vars/template literals
# do node script — robusto pra futuras edicoes que adicionem strings JS complexas.
node --input-type=module <<'NODE_EOF'
import { generateSystemPrompt } from './functions/_lib/prompts/index.js';
import {
  TENANT_CANONICO,
  TENANT_CANONICO_EXATO,
  CONVERSA_CANONICA,
  CONVERSA_COLETA_TATTOO,
  CONVERSA_COLETA_CADASTRO,
  CONVERSA_COLETA_PROPOSTA,
  CLIENT_CONTEXT_CANONICO,
} from './tests/prompts/fixtures/tenant-canonico.mjs';
import { writeSnapshot } from './tests/prompts/helpers.mjs';

writeSnapshot('coleta-tattoo',   generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO));
writeSnapshot('coleta-cadastro', generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_CADASTRO, CLIENT_CONTEXT_CANONICO));
writeSnapshot('coleta-proposta', generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_PROPOSTA, CLIENT_CONTEXT_CANONICO));
writeSnapshot('exato',           generateSystemPrompt(TENANT_CANONICO_EXATO, CONVERSA_CANONICA, CLIENT_CONTEXT_CANONICO));
console.log('OK — 4 snapshots regenerados (coleta-tattoo, coleta-cadastro, coleta-proposta, exato).');
NODE_EOF
