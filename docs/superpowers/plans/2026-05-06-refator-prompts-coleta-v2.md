# Refator Prompts Coleta v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar prompts do Modo Coleta v2 em 3 camadas (n8n tool descriptions canonicalizadas + §4b TOOLS QUANDO INVOCAR adicionado a regras.js de cada fase + few-shots reescritos em format A com tom B) pra que o bot invoque tools de verdade ao invés de imitar pseudo-código `[chama X]` no chat.

**Architecture:** 3 camadas em ordem de prioridade do pattern canônico Anthropic Tool Use: (1) tool descriptions no Agent n8n com template 5-seções (O QUE FAZ / QUANDO INVOCAR / QUANDO NÃO INVOCAR / PARÂMETROS / APÓS RESPOSTA); (2) políticas de invocação por fase em `regras.js` numeradas T1-Tn paralelas a R1-R8 existentes; (3) few-shots em conversa pura `CLIENTE ↔ AGENTE` sem pseudo-código de tool, aplicando pace moderado (validação substantiva antes de pedir cadastro + cadastro em texto corrido). Tests existentes serão estendidos com 5 invariants em `tests/prompts/invariants.test.mjs` + re-snapshot dos 3 snapshots Coleta.

**Tech Stack:** Node.js 22, ES modules, `node:test` builtin runner, Cloudflare Pages Functions backend, n8n self-hosted workflow (Langchain Agent node + httpRequestTool nodes), Supabase Postgres, MCP Supabase + MCP n8n.

---

## Pre-conditions

- Branch atual: `feat/refator-prompts-coleta-v2` (criada via `git checkout -b feat/refator-prompts-coleta-v2` a partir de main; já tem 3 commits do spec)
- Working tree clean
- Spec aprovado em `docs/superpowers/specs/2026-05-06-refator-prompts-coleta-v2-design.md` (commit `2e6f56a`)
- URL fix do `consultar_proposta_tatuador` já aplicado em produção pelo user via UI n8n em 2026-05-06

---

## File Structure

### Arquivos modificados (existentes)

| Path | Responsabilidade | Tipo de mudança |
|---|---|---|
| `functions/_lib/prompts/coleta/tattoo/regras.js` | Regras invioláveis fase Tattoo | **Append §4b** com T1-T4 |
| `functions/_lib/prompts/coleta/cadastro/regras.js` | Regras invioláveis fase Cadastro | **Append §4b** com T1-T5 |
| `functions/_lib/prompts/coleta/proposta/regras.js` | Regras invioláveis fase Proposta | **Append §4b** com T1-T5 |
| `functions/_lib/prompts/coleta/tattoo/few-shot.js` | Exemplos conversa fase Tattoo | **Reescrever 5 exemplos** (format A + tom B) |
| `functions/_lib/prompts/coleta/cadastro/few-shot.js` | Exemplos conversa fase Cadastro | **Reescrever 5 exemplos** (format A + tom B) |
| `functions/_lib/prompts/coleta/proposta/few-shot.js` | Exemplos conversa fase Proposta | **Reescrever 6 exemplos** (format A + tom B) |
| `tests/prompts/invariants.test.mjs` | Invariants de prompt (estrutura, segurança) | **Append 5 testes** + helpers |
| `tests/prompts/snapshots/coleta-tattoo.txt` | Snapshot do prompt Tattoo gerado | **Re-snapshot** via script |
| `tests/prompts/snapshots/coleta-cadastro.txt` | Snapshot do prompt Cadastro gerado | **Re-snapshot** via script |
| `tests/prompts/snapshots/coleta-proposta.txt` | Snapshot do prompt Proposta gerado | **Re-snapshot** via script |

### Arquivos auditados (sem mudança esperada)

- `functions/_lib/prompts/coleta/tattoo/few-shot-tenant.js`
- `functions/_lib/prompts/coleta/cadastro/few-shot-tenant.js`
- `functions/_lib/prompts/coleta/proposta/few-shot-tenant.js`

### Arquivos criados

| Path | Responsabilidade |
|---|---|
| `docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json` | Snapshot do workflow n8n pós-refator (rastreabilidade) |
| `docs/workflows/.gitkeep` (se dir não existir) | Placeholder |

### Arquivos NÃO tocados (out-of-scope)

- `functions/_lib/prompts/_shared/*.js` — checklistCritico, tom, identidade, faq, contexto, helpers — todos OK
- `functions/_lib/prompts/exato/*.js` — Modo Exato (beta secundário), sem mudança
- `functions/api/tools/*.js` — backend tools já refatoradas em PR #27, sem mudança
- `tests/prompts/snapshot.test.mjs` — sem mudança (script de regen é o vehicle)
- `tests/prompts/snapshots/exato.txt` — não muda (Modo Exato não tocado)

---

## Task 1: Pre-flight + baseline

**Files:**
- Read-only: `package.json`, `scripts/update-prompt-snapshots.sh`
- Verify: branch + working tree

- [ ] **Step 1.1: Confirmar branch e clean state**

Run: `git -C /Users/brazilianhustler/Documents/inkflow-saas status && git -C /Users/brazilianhustler/Documents/inkflow-saas branch --show-current`

Expected:
```
On branch feat/refator-prompts-coleta-v2
Your branch is up to date with 'origin/feat/refator-prompts-coleta-v2'.

nothing to commit, working tree clean
feat/refator-prompts-coleta-v2
```

- [ ] **Step 1.2: Rodar bateria completa de tests pra capturar baseline**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && npm test 2>&1 | tail -50`

Expected: TODOS os testes passam (incluindo os 4 snapshots e invariants existentes). Se algum falhar, parar e reportar — refator não pode partir de bateria vermelha.

- [ ] **Step 1.3: Confirmar que `scripts/update-prompt-snapshots.sh` é executável**

Run: `ls -l /Users/brazilianhustler/Documents/inkflow-saas/scripts/update-prompt-snapshots.sh`

Expected: arquivo existe com bit `x`. Se não, rodar `chmod +x scripts/update-prompt-snapshots.sh`.

- [ ] **Step 1.4: Sem commit nesta task** — apenas verificação. Commits começam em Task 2.

---

## Task 2: Salvar export n8n com URL fix já aplicado

**Files:**
- Create: `docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json`
- Create (se não existir): `docs/workflows/.gitkeep`

**Contexto:** Leandro já corrigiu a URL corrompida em `consultar_proposta_tatuador` via UI n8n em 2026-05-06. Esta task cria o diretório `docs/workflows/` (se não existir) e salva o export atualizado pra rastreabilidade. O export-fonte está em `/Users/brazilianhustler/Downloads/MEU NOVO WORK - SAAS (20).json` mas tem a URL CORROMPIDA. Precisamos do export PÓS-fix.

- [ ] **Step 2.1: Criar diretório se não existir**

Run: `mkdir -p /Users/brazilianhustler/Documents/inkflow-saas/docs/workflows && touch /Users/brazilianhustler/Documents/inkflow-saas/docs/workflows/.gitkeep`

Expected: dir criado, .gitkeep criado.

- [ ] **Step 2.2: Pedir ao user pra exportar o workflow atual via UI n8n e mover pra `docs/workflows/`**

**MANUAL — instruções pro Leandro:**
1. Abre o workflow `MEU NOVO WORK - SAAS` na UI do n8n
2. Menu superior direito → "Download" → salva como JSON
3. Move o arquivo pra `/Users/brazilianhustler/Documents/inkflow-saas/docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json`

Aguardar confirmação do user.

- [ ] **Step 2.3: Verificar URL do `consultar_proposta_tatuador` no novo export**

Run:
```bash
jq -r '.nodes[] | select(.type == "n8n-nodes-base.httpRequestTool" and .name == "consultar_proposta_tatuador") | .parameters.url' "/Users/brazilianhustler/Documents/inkflow-saas/docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json"
```

Expected exato: `https://inkflowbrasil.com/api/tools/consultar-proposta-tatuador`

Se diferente: Leandro precisa rever a edição na UI n8n e re-exportar.

- [ ] **Step 2.4: Smoke curl pra confirmar que a URL responde**

Run:
```bash
curl -sS -X POST 'https://inkflowbrasil.com/api/tools/consultar-proposta-tatuador' \
  -H 'Authorization: Bearer DEFINIR_VIA_BWS' \
  -H 'Content-Type: application/json' \
  -d '{"tenant_id":"00000000-0000-0000-0000-000000000001","telefone":"5511999999999"}' \
  -o /tmp/consultar_proposta_response.json -w "HTTP %{http_code}\n"
```

(Token via `bws secret get <id>` — pedir ao user qual secret-id usar. Não inserir token literal no plano.)

Expected: HTTP 401 (sem token válido) OU 404 (token válido, conversa não existe). NUNCA 502 ou timeout — isso indicaria URL ainda quebrada.

- [ ] **Step 2.5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add docs/workflows/.gitkeep "docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json" && \
git commit -m "$(cat <<'EOF'
fix(n8n): documentar URL fix em consultar_proposta_tatuador (aplicado em prod)

Bug descoberto via inspeção do export anterior: URL do node
consultar_proposta_tatuador estava corrompida com copy-paste invertido
(https://inkflowbrasil.cohttps://inkflowbrasil.com/...m/api/tools/acionar-handoff).
Aplicação real: feita pelo user via UI n8n em 2026-05-06.

Salva export atualizado em docs/workflows/ pra rastreabilidade. Smoke curl
confirma URL responde (não mais 502/timeout).
EOF
)"
```

Expected: commit criado, branch ahead 1 commit.

---

## Task 3: Canonicalizar 4 tool descriptions Coleta v2 no n8n

**Files:**
- Modify (via UI n8n, depois export): `docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json` — campos `parameters.toolDescription` dos 4 nodes Coleta v2

**Contexto:** PR #27 deixou as 4 tool descriptions pragmáticas mas não-canônicas. Spec §1.2 define template 5-seções (O QUE FAZ / QUANDO INVOCAR / QUANDO NÃO INVOCAR / PARÂMETROS / APÓS RESPOSTA). Spec §1.3 tem texto exato pra cada uma das 4. Esta task aplica os 4 textos novos via UI n8n (manual) e re-salva export.

- [ ] **Step 3.1: Apresentar ao user os 4 textos canônicos pra colar na UI n8n**

**MANUAL — instruções pro Leandro:**
1. Abre o workflow na UI n8n
2. Pra cada um dos 4 nodes abaixo, clica no node, edita o campo "Tool Description", apaga o texto atual e cola o texto canônico:

#### Node `dados_coletados`:
```
Persiste 1 campo coletado do cliente em `conversas.dados_coletados` ou `dados_cadastro` (JSONB). Cria a row se primeira chamada (UPSERT idempotente).

QUANDO INVOCAR
- Após cliente fornecer 1 ou mais campos OBR da fase atual.
- Tattoo OBR: descricao_tattoo, tamanho_cm, local_corpo (3 campos pra completar fase).
- Cadastro OBR: nome, data_nascimento (2 campos pra completar; email é opcional).
- Pode encadear várias chamadas no MESMO turno se cliente mandou multi-info ("Maria Silva, 12/03/1995, maria@gmail.com").

QUANDO NÃO INVOCAR
- Se valor está obviamente inválido (deixe o backend validar — ele retorna gatilho).
- Se cliente está perguntando, não fornecendo (ex: "qual nome vocês precisam?").

PARÂMETROS
- campo (string): nome do campo. Tattoo: descricao_tattoo, tamanho_cm, local_corpo, estilo, foto_local, refs_imagens. Cadastro: nome, data_nascimento, email.
- valor (string): valor literal. Tamanho_cm: número como string. refs_imagens: array como string.

APÓS RESPOSTA
- Sucesso normal: estado avança internamente. Confirme a coleta com 1 frase de validação substantiva, sem citar a tool.
- proxima_fase="cadastro": 3 OBR tattoo completos. Peça nome+data+email em texto corrido (NÃO lista bullet).
- gatilho="data_invalida": peça data em formato dia/mes/ano.
- gatilho="menor_idade": 1 frase educada de despedida. Tool já fez handoff — NÃO chame acionar_handoff manualmente.
```

#### Node `enviar_orcamento_tatuador`:
```
Monta orçamento (3 OBR tattoo + 2 OBR cadastro) e envia ao tatuador via Telegram com botões [Fechar valor / Recusar]. Idempotente via orcid (chamadas duplicadas retornam o existente sem reenviar). Estado vira `aguardando_tatuador`.

QUANDO INVOCAR
- Após `dados_coletados` confirmar nome + data_nascimento (2 OBR cadastro completos) E os 3 OBR tattoo (descricao_tattoo, tamanho_cm, local_corpo) já estarem em `dados_coletados`.
- Email é OPCIONAL — não bloqueia envio.

QUANDO NÃO INVOCAR
- Se algum dos 5 OBR está faltando (a tool retorna 400).
- Se conversa retornou gatilho="menor_idade" — handoff já foi disparado.
- Se cliente ainda está fornecendo dados — espere coletar tudo primeiro.

PARÂMETROS
- tenant_id (string, UUID do estúdio).
- telefone (string, telefone do cliente sem formatação).

APÓS RESPOSTA
- Sucesso: confirme ao cliente que enviou ao tatuador e que dará retorno em breve. NÃO prometa prazo específico ("hoje", "1h") — use "em breve". Você SAI da conversa (estado=aguardando_tatuador). Bot reentra automaticamente quando tatuador decidir no Telegram.
- 404: conversa não existe — provavelmente cadeia rompida. Refaça `dados_coletados` ou peça os campos faltantes.
- 400 (telegram-sem-configurar): tenant não tem `tatuador_telegram_chat_id` — chame `acionar_handoff` em vez disso.
```

#### Node `enviar_objecao_tatuador`:
```
Envia desconto pedido pelo cliente ao tatuador via Telegram com botões [Aceitar X / Manter Y]. Estado vira `aguardando_decisao_desconto`.

QUANDO INVOCAR
- Cliente solicitou valor diferente do `valor_proposto` em fase `propondo_valor`.
- Cliente disse "ta um pouco caro" + você perguntou "quanto tu tava pensando?" + cliente respondeu valor.
- Cliente disse direto "consegue por X?".

QUANDO NÃO INVOCAR
- Se `valor_proposto` ainda não foi setado (estado_agente != propondo_valor) — tool retorna 400.
- Se cliente está só perguntando preço sem propor desconto — confirme valor original em vez de objetar.
- Duas vezes pra mesma decisão — espere tatuador decidir antes de re-objetar.

PARÂMETROS
- tenant_id (string).
- telefone (string).
- valor_pedido_cliente (number): valor numérico que cliente pediu (ex: 600).

APÓS RESPOSTA
- Sucesso: 1 frase confirmando que vai consultar o tatuador, em primeira pessoa ("vou consultar com o tatuador e te retorno"). NÃO use "vou passar pro tatuador" — soa como secretária. Você SAI da conversa.
- 400 (valor_proposto ausente): estado errado, possível bug de fluxo — chame `acionar_handoff` em vez de retentar.
```

#### Node `consultar_proposta_tatuador`:
```
Lê estado atual da conversa (estado_agente, valor_proposto, valor_pedido_cliente, decisao_desconto, mensagem_tatuador, orcid). Read-only — não muta nada.

QUANDO INVOCAR
- Cliente perguntou status do orçamento ("e aí, ele já respondeu?").
- Você está em estado_agente=propondo_valor ou aguardando_decisao_desconto e precisa confirmar valor atual antes de responder.

QUANDO NÃO INVOCAR
- Em estado_agente=coletando_tattoo ou coletando_cadastro — ainda não há orçamento pra consultar.
- Após cada turno do cliente — read-only mas custa 1 chamada de rede + tokens.

PARÂMETROS
- tenant_id (string).
- telefone (string).

APÓS RESPOSTA
- Sucesso: use os campos retornados pra fundamentar resposta ao cliente. Ex: se decisao_desconto="aceito", confirme novo valor; se decisao_desconto="recusado", apresente valor original com tom suave.
- 404: conversa não existe ainda — possível inconsistência, chame `acionar_handoff`.
```

3. Após editar todos 4, salva o workflow (botão "Save") e clica "Activate" (ou ativa via toggle).
4. Re-exporta o workflow → substitui o arquivo `docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json`

Aguardar confirmação do user.

- [ ] **Step 3.2: Verificar 4 descriptions atualizadas no JSON**

Run:
```bash
for tool in dados_coletados enviar_orcamento_tatuador enviar_objecao_tatuador consultar_proposta_tatuador; do
  echo "=== $tool ==="
  jq -r ".nodes[] | select(.name == \"$tool\") | .parameters.toolDescription" "/Users/brazilianhustler/Documents/inkflow-saas/docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json" | head -5
done
```

Expected pra cada tool: primeira linha começa com a frase canônica do template (ex: dados_coletados começa com "Persiste 1 campo coletado..."). Se descrição antiga ainda aparecer, Leandro precisa salvar/exportar de novo.

- [ ] **Step 3.3: Smoke E2E mínimo via WhatsApp pra verificar que workflow ainda funciona**

**MANUAL — instruções pro Leandro:**
1. Manda mensagem WhatsApp pro `@inkflow_studio_bot`: "oi"
2. Bot deve responder normalmente (saudação)
3. Cleanup imediato via SQL (não deixa lixo na conversa de produção):
   ```sql
   DELETE FROM tool_calls_log WHERE tenant_id = '<dagobert-id>' AND telefone = '<leandro-tel>';
   DELETE FROM conversas WHERE tenant_id = '<dagobert-id>' AND telefone = '<leandro-tel>';
   DELETE FROM n8n_chat_histories WHERE session_id LIKE '<dagobert-id>_<leandro-tel>%';
   ```

Expected: bot responde normal. Se silente ou erro, descrições novas podem ter bug de formatação — checar.

- [ ] **Step 3.4: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add "docs/workflows/MEU NOVO WORK - SAAS - 2026-05-06.json" && \
git commit -m "$(cat <<'EOF'
feat(n8n): canonicalizar 4 tool descriptions Coleta v2

Reescreve as 4 descriptions seguindo template canônico Anthropic Tool Use
(O QUE FAZ / QUANDO INVOCAR / QUANDO NAO INVOCAR / PARAMETROS / APOS RESPOSTA),
mantendo concisão (~15 linhas estruturadas/tool).

Aplicado via UI n8n; export atualizado em docs/workflows/. As 8 tools antigas
(Modo Exato/Faixa) ficam intactas (P2 backlog) pra evitar regressão em código
funcionando em prod.
EOF
)"
```

Expected: commit criado.

---

## Task 4: Adicionar §4b TOOLS QUANDO INVOCAR a tattoo/regras.js

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/regras.js` — append no final da função `regras(tenant)` antes do `return`

- [ ] **Step 4.1: Ler arquivo atual pra confirmar estrutura**

Run: `cat /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/prompts/coleta/tattoo/regras.js | tail -10`

Expected: arquivo termina com:
```
  linhas.push('- Tatuagens em segundo plano = ignore.');

  return linhas.join('\n');
}
```

- [ ] **Step 4.2: Editar arquivo pra adicionar §4b ANTES do `return`**

Edit: `functions/_lib/prompts/coleta/tattoo/regras.js`

Localizar a linha `return linhas.join('\n');` e adicionar ANTES dela:

```javascript
  linhas.push('');
  linhas.push('# §4b TOOLS — QUANDO INVOCAR (interno, invisivel ao cliente)');
  linhas.push('**T1.** Tools NAO existem na conversa visivel. Cliente nunca ve "[chama X]", JSON, ou nome de tool. Se cliente perguntar como voce sabe X, responda como se fosse memoria sua ("Show, anotei aqui").');
  linhas.push('');
  linhas.push('**T2.** `dados_coletados` — chame APOS o cliente fornecer cada campo OBR (descricao_tattoo, tamanho_cm, local_corpo). Uma chamada por campo. Pode encadear varias chamadas no MESMO turno se cliente mandou multi-info ("rosa de 10cm no antebraco" = 3 chamadas).');
  linhas.push('');
  linhas.push('**T3.** Quando 3 OBR completos, `dados_coletados` retorna `{proxima_fase: "cadastro"}`. Confirme a coleta com validacao substantiva (NAO so "anotei") e peca os 2 OBR cadastro em texto corrido — JAMAIS lista bullet.');
  linhas.push('');
  linhas.push('**T4.** `acionar_handoff` — conforme R6/R7. Nunca por "caso complexo" — coleta da tattoo e SUA funcao.');
```

(Nota: usar caracteres ASCII puros — sem acento — pra alinhar com pattern do arquivo existente. Olhar `tattoo/regras.js` linha 18: `"sobre valor o tatuador confirma quando avaliar tua ideia"` sem acentos. Mesmo style).

- [ ] **Step 4.3: Validar sintaxe JS**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node -e "import('./functions/_lib/prompts/coleta/tattoo/regras.js').then(m => console.log(typeof m.regras === 'function' ? 'OK' : 'FAIL'))"
```

Expected: `OK`. Se erro de sintaxe, parar e fixar.

- [ ] **Step 4.4: Verificar §4b aparece no prompt gerado**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node --input-type=module <<'EOF'
import { generateSystemPrompt } from './functions/_lib/prompts/index.js';
import { TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO } from './tests/prompts/fixtures/tenant-canonico.mjs';
const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
console.log(out.includes('# §4b TOOLS — QUANDO INVOCAR') ? 'OK §4b presente' : 'FAIL: §4b ausente');
console.log('T1 presente:', out.includes('**T1.**'));
console.log('T2 presente:', out.includes('**T2.**'));
console.log('T3 presente:', out.includes('**T3.**'));
console.log('T4 presente:', out.includes('**T4.**'));
EOF
```

Expected:
```
OK §4b presente
T1 presente: true
T2 presente: true
T3 presente: true
T4 presente: true
```

- [ ] **Step 4.5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add functions/_lib/prompts/coleta/tattoo/regras.js && \
git commit -m "$(cat <<'EOF'
feat(prompts): adicionar §4b TOOLS QUANDO INVOCAR em tattoo/regras.js

Numera T1-T4 paralelamente a R1-R8 existentes. Cobre: invisibilidade ao
cliente (T1), gatilho dados_coletados (T2), conduta pos-resposta com
proxima_fase=cadastro (T3), handoff (T4 cross-ref R6/R7).

Parte do refator de 3 camadas pra eliminar anti-pattern "AGENTE: [chama X]"
em few-shots — ver spec 2026-05-06-refator-prompts-coleta-v2-design.md.
EOF
)"
```

---

## Task 5: Adicionar §4b TOOLS QUANDO INVOCAR a cadastro/regras.js

**Files:**
- Modify: `functions/_lib/prompts/coleta/cadastro/regras.js` — append no final da função `regras(tenant)` antes do `return`

- [ ] **Step 5.1: Ler arquivo atual**

Run: `cat /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/prompts/coleta/cadastro/regras.js | tail -5`

Expected: termina com:
```
  linhas.push('**R8.** Apos chamar `enviar_orcamento_tatuador` com sucesso, voce SAI da conversa (estado_agente passa pra aguardando_tatuador). NAO continue conversando, NAO chame tools, NAO acompanhe. O bot reentra automaticamente quando o tatuador devolver o valor pelo Telegram.');

  return linhas.join('\n');
}
```

- [ ] **Step 5.2: Editar arquivo pra adicionar §4b ANTES do `return`**

Edit: `functions/_lib/prompts/coleta/cadastro/regras.js`

Localizar `return linhas.join('\n');` e adicionar ANTES:

```javascript
  linhas.push('');
  linhas.push('# §4b TOOLS — QUANDO INVOCAR (interno, invisivel ao cliente)');
  linhas.push('**T1.** Tools NAO existem na conversa visivel. Cliente nunca ve pseudo-codigo.');
  linhas.push('');
  linhas.push('**T2.** `dados_coletados` — chame APOS cliente fornecer nome/data_nascimento/email. Uma chamada por campo. Pode encadear se cliente mandou multi-info ("Maria Silva, 12/03/1995").');
  linhas.push('');
  linhas.push('**T3.** Se `data_nascimento` retornar `gatilho="menor_idade"`, NAO chame `enviar_orcamento_tatuador`. Tool ja transicionou estado pra `aguardando_tatuador`. Responda com 1 frase educada de despedida (R7).');
  linhas.push('');
  linhas.push('**T4.** Se data retornar `gatilho="data_invalida"`, peca data em formato dia/mes/ano. NAO insista alem de 2 tentativas — apos 2a tentativa falha, chame `acionar_handoff(motivo="data_invalida_persistente")`.');
  linhas.push('');
  linhas.push('**T5.** Apos `enviar_orcamento_tatuador` sucesso (gatilho de invocacao esta em §0 item 5): cumpra R8 (sair da conversa) E formule a ultima msg em PRIMEIRA PESSOA. Use "vou enviar ao tatuador e te retorno em breve". NUNCA "vou passar pro tatuador" (viola tom.js). NAO prometa prazo especifico.');
```

- [ ] **Step 5.3: Validar sintaxe**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node -e "import('./functions/_lib/prompts/coleta/cadastro/regras.js').then(m => console.log(typeof m.regras === 'function' ? 'OK' : 'FAIL'))"
```

Expected: `OK`.

- [ ] **Step 5.4: Verificar §4b aparece no prompt gerado**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node --input-type=module <<'EOF'
import { generateSystemPrompt } from './functions/_lib/prompts/index.js';
import { TENANT_CANONICO, CONVERSA_COLETA_CADASTRO, CLIENT_CONTEXT_CANONICO } from './tests/prompts/fixtures/tenant-canonico.mjs';
const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_CADASTRO, CLIENT_CONTEXT_CANONICO);
console.log(out.includes('# §4b TOOLS — QUANDO INVOCAR') ? 'OK §4b presente' : 'FAIL: §4b ausente');
for (const t of ['T1','T2','T3','T4','T5']) {
  console.log(t, 'presente:', out.includes('**' + t + '.**'));
}
EOF
```

Expected: §4b presente + T1-T5 todos `true`.

- [ ] **Step 5.5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add functions/_lib/prompts/coleta/cadastro/regras.js && \
git commit -m "$(cat <<'EOF'
feat(prompts): adicionar §4b TOOLS QUANDO INVOCAR em cadastro/regras.js

Numera T1-T5. Cobre: invisibilidade ao cliente (T1), gatilho dados_coletados
(T2), gatilhos menor_idade (T3) e data_invalida (T4), formulacao da ultima
msg pos-enviar_orcamento em primeira pessoa (T5).

T5 cross-refs R8 (saida) + §0 item 5 do checklistCritico (ja cobre gatilho
de invocacao do enviar_orcamento_tatuador) — evita duplicacao.
EOF
)"
```

---

## Task 6: Adicionar §4b TOOLS QUANDO INVOCAR a proposta/regras.js

**Files:**
- Modify: `functions/_lib/prompts/coleta/proposta/regras.js` — append no final

- [ ] **Step 6.1: Ler arquivo atual**

Run: `cat /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/prompts/coleta/proposta/regras.js | tail -5`

Expected: termina com:
```
  linhas.push('**R9.** Mudanca de data de agendamento ja confirmado: handoff (`acionar_handoff(motivo="reagendamento")`). Voce nao reagenda nesta fase — alcada do tatuador.');

  return linhas.join('\n');
}
```

- [ ] **Step 6.2: Editar arquivo pra adicionar §4b ANTES do `return`**

Edit: `functions/_lib/prompts/coleta/proposta/regras.js`

Adicionar ANTES de `return linhas.join('\n');`:

```javascript
  linhas.push('');
  linhas.push('# §4b TOOLS — QUANDO INVOCAR (interno, invisivel ao cliente)');
  linhas.push('**T1.** Tools NAO existem na conversa visivel. Cliente nunca ve pseudo-codigo.');
  linhas.push('');
  linhas.push('**T2.** `consultar_proposta_tatuador` — chame se cliente perguntar status OU se voce precisa refresh do estado pra responder. Read-only, mas custoso — nao chame redundantemente.');
  linhas.push('');
  linhas.push('**T3.** `enviar_objecao_tatuador` — chame APENAS quando cliente pediu valor diferente do `valor_proposto` em fase `propondo_valor`. Requer `valor_pedido_cliente` numerico. NAO chame 2x pro mesmo orcid.');
  linhas.push('');
  linhas.push('**T4.** Apos `enviar_objecao_tatuador` sucesso, responda em PRIMEIRA PESSOA: "vou consultar com o tatuador e te retorno". NUNCA "vou passar pro tatuador" nem "vou levar pra ele" (este ultimo e excecao marginal de tom.js — conservadoramente NAO usamos). Voce SAI (R7).');
  linhas.push('');
  linhas.push('**T5.** `reservar_horario` + `gerar_link_sinal` — sequencia permitida no mesmo turno (R4). Use SOMENTE slots retornados por `consultar_horarios_livres` (R6). JAMAIS invente slot.');
```

- [ ] **Step 6.3: Validar sintaxe**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node -e "import('./functions/_lib/prompts/coleta/proposta/regras.js').then(m => console.log(typeof m.regras === 'function' ? 'OK' : 'FAIL'))"
```

Expected: `OK`.

- [ ] **Step 6.4: Verificar §4b aparece no prompt gerado**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node --input-type=module <<'EOF'
import { generateSystemPrompt } from './functions/_lib/prompts/index.js';
import { TENANT_CANONICO, CONVERSA_COLETA_PROPOSTA, CLIENT_CONTEXT_CANONICO } from './tests/prompts/fixtures/tenant-canonico.mjs';
const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_PROPOSTA, CLIENT_CONTEXT_CANONICO);
console.log(out.includes('# §4b TOOLS — QUANDO INVOCAR') ? 'OK §4b presente' : 'FAIL: §4b ausente');
for (const t of ['T1','T2','T3','T4','T5']) {
  console.log(t, 'presente:', out.includes('**' + t + '.**'));
}
EOF
```

Expected: §4b presente + T1-T5 todos `true`.

- [ ] **Step 6.5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add functions/_lib/prompts/coleta/proposta/regras.js && \
git commit -m "$(cat <<'EOF'
feat(prompts): adicionar §4b TOOLS QUANDO INVOCAR em proposta/regras.js

Numera T1-T5. Cobre: invisibilidade (T1), consultar_proposta_tatuador (T2),
enviar_objecao_tatuador (T3), formulacao pos-objecao em primeira pessoa
(T4), sequencia reservar_horario+gerar_link_sinal com cross-ref R4/R6 (T5).

T4 padroniza "vou consultar com o tatuador" — evita uso da excecao marginal
de tom.js permitindo "vou levar pra ele" em fase com valor ja orcado.
EOF
)"
```

---

## Task 7: Refatorar tattoo/few-shot.js (format A + tom B, 5 exemplos)

**Files:**
- Modify: `functions/_lib/prompts/coleta/tattoo/few-shot.js` — reescrever 5 exemplos (linhas 12-97 do arquivo atual)

**Contexto:** O arquivo atual tem 18 ocorrências de pseudo-código (`AGENTE: [chama X]` ou `[tool retorna]`). Spec §3.2-§3.6 tem antes/depois exato pra cada exemplo. Esta task aplica os 5 exemplos novos completos.

- [ ] **Step 7.1: Ler arquivo completo pra context**

Run: `cat /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/prompts/coleta/tattoo/few-shot.js`

Expected: arquivo de ~100 linhas com `export function fewShotBase(tenant)` retornando string.

- [ ] **Step 7.2: Substituir conteúdo completo do arquivo**

Write: `functions/_lib/prompts/coleta/tattoo/few-shot.js` (overwrite completo):

```javascript
// ── §7 FEW-SHOT BASE — modo Coleta v2, fase TATTOO ─────────────────────────
// Exemplos de conversa ideal pra fase de coleta da tattoo.
// Format A (canonical Anthropic Tool Use): conversa pura CLIENTE ↔ AGENTE,
// zero pseudo-codigo de tool. Tools sao invocadas pelo LLM com base nas
// descriptions do n8n + secao §4b TOOLS QUANDO INVOCAR em regras.js.
// Tom B: validacao substantiva 1× antes de pedir cadastro + cadastro em
// texto corrido (nao lista bullet).
export function fewShotBase(tenant) {
  const nomeAg = tenant.nome_agente || 'Lina';
  const nomeEst = tenant.nome_estudio || 'NomeEstudio';

  const linhas = ['# §7 EXEMPLOS DE CONVERSAS IDEAIS (fase Tattoo)'];
  linhas.push('');

  // Exemplo 1: fluxo completo, 3 OBR coletados, transicao pra cadastro
  linhas.push('## Exemplo 1 — Fluxo completo (3 OBR + transicao Cadastro)');
  linhas.push('```');
  linhas.push('CLIENTE: oi quero fazer uma rosa');
  linhas.push(`AGENTE: Oii, tudo bem? Aqui e ${nomeAg} do ${nomeEst}`);
  linhas.push('');
  linhas.push('AGENTE: Massa! Tem ideia de tamanho e onde no corpo?');
  linhas.push('CLIENTE: uns 10cm no antebraço');
  linhas.push('AGENTE: Rosa de 10cm no antebraco fica top — bem visivel, da pra trabalhar bons detalhes');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 2: cliente pergunta preço, agente deflete
  linhas.push('## Exemplo 2 — Cliente pergunta preco antes da coleta completa');
  linhas.push('```');
  linhas.push('CLIENTE: quanto fica uma rosa pequena?');
  linhas.push('AGENTE: Sobre valor o tatuador confirma quando avaliar tua ideia — segue comigo que a gente fecha rapidinho');
  linhas.push('');
  linhas.push('AGENTE: Tem ideia de tamanho e onde no corpo?');
  linhas.push('CLIENTE: 8cm no pulso');
  linhas.push('AGENTE: Rosa pequena no pulso fica delicada, combina muito com o local');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento personalizado, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 3: cover-up detectado por foto, handoff imediato
  linhas.push('## Exemplo 3 — Cover-up detectado por foto, handoff imediato');
  linhas.push('```');
  linhas.push('CLIENTE: queria uma tattoo nova aqui [foto: braço com tatuagem antiga grande]');
  linhas.push('AGENTE: Vi que ja tem tattoo nesse local. Seria pra cobertura?');
  linhas.push('CLIENTE: sim');
  linhas.push('AGENTE: Pra cobertura o tatuador avalia pessoalmente — ja sinalizei pra ele');
  linhas.push('```');
  linhas.push('');

  // Exemplo 4: cliente nao sabe tamanho, fallback altura
  linhas.push('## Exemplo 4 — Cliente nao sabe tamanho, fallback por altura');
  linhas.push('```');
  linhas.push('CLIENTE: quero um leao no peitoral');
  linhas.push('AGENTE: Massa! Tem ideia do tamanho?');
  linhas.push('CLIENTE: nao faço ideia, voce que sabe');
  linhas.push('AGENTE: Tranquilo. Manda tua altura (tipo 1.70m) que com a foto do peitoral consigo calcular a proporcao certinha');
  linhas.push('CLIENTE: 1.78m');
  linhas.push('AGENTE: Pelo peitoral em proporcao com 1.78m, leao em torno de 18cm fica bem encaixado');
  linhas.push('');
  linhas.push('AGENTE: Pra eu liberar teu orcamento, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 5: imagem com marcaçao de caneta indicando posicao/tamanho
  linhas.push('## Exemplo 5 — Imagem com marcacao de caneta indicando posicao/tamanho');
  linhas.push('```');
  linhas.push('CLIENTE: olha aqui [foto: antebraço com retangulo desenhado a caneta]');
  linhas.push('AGENTE: Vi a marcacao no antebraco. Qual a ideia da tattoo?');
  linhas.push('CLIENTE: uma frase em fineline, tamanho exato da marcacao');
  linhas.push('AGENTE: Frase em fineline nesse tamanho fica delicada e elegante');
  linhas.push('');
  linhas.push('AGENTE: Quantos cm tem a marcacao? Entre 8-12cm parece bater?');
  linhas.push('CLIENTE: 10cm');
  linhas.push('AGENTE: Pra eu liberar teu orcamento, me passa nome completo e data de nascimento (e-mail e opcional). Ai o tatuador olha e te retorna em breve');
  linhas.push('```');

  return linhas.join('\n');
}
```

- [ ] **Step 7.3: Validar sintaxe + ausência de pseudo-código**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node --input-type=module <<'EOF'
import { fewShotBase } from './functions/_lib/prompts/coleta/tattoo/few-shot.js';
const out = fewShotBase({ nome_agente: 'Lina', nome_estudio: 'Estudio Teste' });
const ANTI = [/AGENTE:\s*\[chama/i, /AGENTE:\s*\[tool retorna/i, /\[chama\s+\w+/i];
let ok = true;
for (const re of ANTI) {
  if (re.test(out)) { console.log('FAIL:', re, 'matched'); ok = false; }
}
console.log(ok ? 'OK: zero pseudo-codigo' : 'FAIL');
EOF
```

Expected: `OK: zero pseudo-codigo`.

- [ ] **Step 7.4: Verificar prompt completo gera sem erro**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node --input-type=module <<'EOF'
import { generateSystemPrompt } from './functions/_lib/prompts/index.js';
import { TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO } from './tests/prompts/fixtures/tenant-canonico.mjs';
const out = generateSystemPrompt(TENANT_CANONICO, CONVERSA_COLETA_TATTOO, CLIENT_CONTEXT_CANONICO);
console.log('Prompt length:', out.length);
console.log('Tem §4b:', out.includes('# §4b TOOLS'));
console.log('Tem Exemplo 1:', out.includes('## Exemplo 1 — Fluxo completo'));
console.log('Zero pseudo-codigo:', !/AGENTE:\s*\[chama/i.test(out));
EOF
```

Expected:
```
Prompt length: <numero positivo, ~5000-7000>
Tem §4b: true
Tem Exemplo 1: true
Zero pseudo-codigo: true
```

- [ ] **Step 7.5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add functions/_lib/prompts/coleta/tattoo/few-shot.js && \
git commit -m "$(cat <<'EOF'
refactor(prompts): tattoo few-shots format A + tom B

Reescreve os 5 exemplos da fase Tattoo:
- Format A: conversa pura CLIENTE ↔ AGENTE, zero pseudo-codigo de tool.
  Remove 18 ocorrencias de "AGENTE: [chama X]" e "[tool retorna]".
- Tom B: validacao substantiva 1× antes do cadastro ("rosa de 10cm fica top
  — bem visivel, da pra trabalhar bons detalhes" em vez de "Show, anotei
  tudo da tattoo!"). Cadastro em texto corrido (1 frase) em vez de lista
  bullet de 3 linhas.
- Exemplos preservados: cover-up handoff (3), fallback altura (4), imagem
  com marcacao (5) — todos em format A com validacao substantiva.
EOF
)"
```

---

## Task 8: Refatorar cadastro/few-shot.js (format A + tom B, 5 exemplos)

**Files:**
- Modify: `functions/_lib/prompts/coleta/cadastro/few-shot.js` — overwrite

- [ ] **Step 8.1: Ler arquivo atual**

Run: `cat /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/prompts/coleta/cadastro/few-shot.js | head -20`

Expected: arquivo começa com `// ── §7 FEW-SHOT BASE — modo Coleta v2, fase CADASTRO ──...`.

- [ ] **Step 8.2: Substituir conteúdo completo**

Write: `functions/_lib/prompts/coleta/cadastro/few-shot.js`:

```javascript
// ── §7 FEW-SHOT BASE — modo Coleta v2, fase CADASTRO ───────────────────────
// Format A (conversa pura, zero pseudo-codigo) + tom B (primeira pessoa em
// "vou enviar ao tatuador", NUNCA "vou passar pro tatuador" — viola tom.js).
export function fewShotBase(tenant) {
  const linhas = ['# §7 EXEMPLOS DE CONVERSAS IDEAIS (fase Cadastro)'];
  linhas.push('');

  // Exemplo 1: cliente manda tudo junto
  linhas.push('## Exemplo 1 — Cliente manda nome + data + email tudo junto');
  linhas.push('```');
  linhas.push('CLIENTE: Maria Silva, 12/03/1995, maria@gmail.com');
  linhas.push('AGENTE: Anotei tudo, Maria! Vou enviar ao tatuador agora e te retorno em breve com o valor');
  linhas.push('```');
  linhas.push('');

  // Exemplo 2: cliente manda nome + data, agente pergunta email, cliente recusa
  linhas.push('## Exemplo 2 — Cliente nao quer dar email');
  linhas.push('```');
  linhas.push('CLIENTE: Joao Pereira, 22/05/1998');
  linhas.push('AGENTE: Anotei. E-mail (opcional) tu prefere mandar ou pode seguir sem?');
  linhas.push('CLIENTE: nao tenho email pra passar agora');
  linhas.push('AGENTE: Tranquilo, Joao! Vou enviar ao tatuador agora e te retorno em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 3: dados parciais, agente pergunta o que falta
  linhas.push('## Exemplo 3 — Cliente manda so o nome, agente pede o resto');
  linhas.push('```');
  linhas.push('CLIENTE: meu nome e Ana Carolina');
  linhas.push('AGENTE: Show, Ana. E a data de nascimento?');
  linhas.push('CLIENTE: 14 de novembro de 2000');
  linhas.push('AGENTE: Anotei. E-mail (opcional) tu prefere mandar?');
  linhas.push('CLIENTE: ana@gmail.com');
  linhas.push('AGENTE: Anotei tudo, Ana! Vou enviar ao tatuador agora e te retorno em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 4: data invalida
  linhas.push('## Exemplo 4 — Data em formato nao reconhecido');
  linhas.push('```');
  linhas.push('CLIENTE: Pedro Santos, nasci no 91');
  linhas.push('AGENTE: Nao consegui ler a data, pode mandar dia/mes/ano? Tipo 15/06/1991');
  linhas.push('CLIENTE: 15/06/1991');
  linhas.push('AGENTE: Beleza. E-mail (opcional) tu prefere mandar?');
  linhas.push('CLIENTE: pedro91@email.com');
  linhas.push('AGENTE: Anotei tudo, Pedro! Vou enviar ao tatuador agora e te retorno em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 5: menor de idade
  linhas.push('## Exemplo 5 — Menor de idade detectado');
  linhas.push('```');
  linhas.push('CLIENTE: Lucas Rocha, 03/07/2010');
  linhas.push('AGENTE: Pra clientes com menos de 18 anos o tatuador conversa direto com responsavel legal. Ja sinalizei pra ele.');
  linhas.push('```');

  return linhas.join('\n');
}
```

- [ ] **Step 8.3: Validar sintaxe + ausência de pseudo-código**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node --input-type=module <<'EOF'
import { fewShotBase } from './functions/_lib/prompts/coleta/cadastro/few-shot.js';
const out = fewShotBase({});
const ANTI = [/AGENTE:\s*\[chama/i, /\[chama\s+\w+/i, /\[tool retorna/i];
let ok = true;
for (const re of ANTI) {
  if (re.test(out)) { console.log('FAIL:', re, 'matched'); ok = false; }
}
const FORBID = [/vou passar pro tatuador/i, /pra eu passar pro/i];
for (const re of FORBID) {
  if (re.test(out)) { console.log('FAIL: frase proibida tom.js:', re, 'matched'); ok = false; }
}
console.log(ok ? 'OK: zero pseudo-codigo + zero frase proibida' : 'FAIL');
EOF
```

Expected: `OK: zero pseudo-codigo + zero frase proibida`.

- [ ] **Step 8.4: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add functions/_lib/prompts/coleta/cadastro/few-shot.js && \
git commit -m "$(cat <<'EOF'
refactor(prompts): cadastro few-shots format A + tom B

Reescreve os 5 exemplos da fase Cadastro:
- Format A: remove 17 ocorrencias de "AGENTE: [chama X]".
- Tom B: 1a pessoa em "vou enviar ao tatuador agora" (4 instancias),
  removendo "vou passar pro tatuador" que violava tom.js linha 40 (proibe
  ele em fase de coleta). Personalizacao: usa primeiro nome ("Anotei tudo,
  Maria!") em confirmacao final.
- Exemplo 5 (menor_idade) preservado como single-turn handoff em format A.
EOF
)"
```

---

## Task 9: Refatorar proposta/few-shot.js (format A + tom B, 6 exemplos)

**Files:**
- Modify: `functions/_lib/prompts/coleta/proposta/few-shot.js` — overwrite

- [ ] **Step 9.1: Ler arquivo atual**

Run: `cat /Users/brazilianhustler/Documents/inkflow-saas/functions/_lib/prompts/coleta/proposta/few-shot.js | head -10`

Expected: arquivo começa com `// ── §7 FEW-SHOT BASE — modo Coleta v2, fase PROPOSTA ──...`.

- [ ] **Step 9.2: Substituir conteúdo completo**

Write: `functions/_lib/prompts/coleta/proposta/few-shot.js`:

```javascript
// ── §7 FEW-SHOT BASE — modo Coleta v2, fase PROPOSTA ───────────────────────
// Format A (conversa pura, zero pseudo-codigo) + tom B padronizado em
// "vou consultar com o tatuador" (alinhado tom.js, evita excecao marginal).
export function fewShotBase(tenant) {
  const linhas = ['# §7 EXEMPLOS DE CONVERSAS IDEAIS (fase Proposta)'];
  linhas.push('');

  // Exemplo 1: cliente aceita direto
  linhas.push('## Exemplo 1 — Caminho A (cliente aceita o valor)');
  linhas.push('```');
  linhas.push('AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?');
  linhas.push('CLIENTE: fechou, vamos marcar');
  linhas.push('AGENTE: Tenho disponivel: ter 14h, qui 10h, sex 16h. Qual prefere?');
  linhas.push('CLIENTE: qui');
  linhas.push('AGENTE: Pra agendar a gente trabalha com sinal de 30% do valor, fica em R$ 225');
  linhas.push('');
  linhas.push('https://link-pagamento-aqui');
  linhas.push('');
  linhas.push('AGENTE: O link tem validade de 24 horas. Se expirar, so me chamar que envio outro');
  linhas.push('```');
  linhas.push('');

  // Exemplo 2: cliente pede desconto sem dizer valor
  linhas.push('## Exemplo 2 — Caminho B (cliente pede desconto sem dizer quanto)');
  linhas.push('```');
  linhas.push('AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?');
  linhas.push('CLIENTE: ta um pouco caro');
  linhas.push('AGENTE: Quanto tu tava pensando?');
  linhas.push('CLIENTE: uns 600');
  linhas.push('AGENTE: Vou consultar com o tatuador — quem fecha o valor e ele. Te dou um retorno em breve');
  linhas.push('```');
  linhas.push('');

  // Exemplo 3: cliente pede desconto direto com valor
  linhas.push('## Exemplo 3 — Caminho B (cliente ja diz o valor que quer)');
  linhas.push('```');
  linhas.push('AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?');
  linhas.push('CLIENTE: consegue por 600?');
  linhas.push('AGENTE: Anotado! Vou consultar com o tatuador e te retorno com a resposta');
  linhas.push('```');
  linhas.push('');

  // Exemplo 4: tatuador aceitou desconto, bot reentra
  linhas.push('## Exemplo 4 — Reentrada apos tatuador aceitar desconto');
  linhas.push('```');
  linhas.push('// (contexto: decisao_desconto="aceito", valor_proposto agora = 600)');
  linhas.push('AGENTE: Show! Ele topou em R$ 600. Bora marcar?');
  linhas.push('CLIENTE: vamos');
  linhas.push('AGENTE: Tenho ter 14h, qui 10h, sex 16h. Qual prefere?');
  linhas.push('// (segue agendamento normal)');
  linhas.push('```');
  linhas.push('');

  // Exemplo 5: tatuador manteve valor, cliente recua
  linhas.push('## Exemplo 5 — Reentrada apos tatuador manter valor');
  linhas.push('```');
  linhas.push('// (contexto: decisao_desconto="recusado", valor_proposto = 750 [original])');
  linhas.push('AGENTE: Ele preferiu manter R$ 750. Ta fechado pra ti? Bora marcar?');
  linhas.push('CLIENTE: humm, vou pensar');
  linhas.push('AGENTE: Tranquilo! Qualquer coisa e so me chamar');
  linhas.push('// (estado vira lead_frio)');
  linhas.push('```');
  linhas.push('');

  // Exemplo 6: cliente adia (caminho C)
  linhas.push('## Exemplo 6 — Caminho C (cliente adia)');
  linhas.push('```');
  linhas.push('AGENTE: Show! Pelo trabalho ficou em R$ 750. Bora marcar?');
  linhas.push('CLIENTE: deixa eu pensar e te volto');
  linhas.push('AGENTE: Tranquilo! Qualquer coisa e so me chamar');
  linhas.push('// (estado vira lead_frio, bot nao responde mais)');
  linhas.push('```');

  return linhas.join('\n');
}
```

- [ ] **Step 9.3: Validar sintaxe + ausência de pseudo-código + ausência de "vou levar pra ele"**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node --input-type=module <<'EOF'
import { fewShotBase } from './functions/_lib/prompts/coleta/proposta/few-shot.js';
const out = fewShotBase({});
const ANTI = [/AGENTE:\s*\[chama/i, /\[chama\s+\w+/i];
const FORBID = [/vou levar pra ele/i, /vou passar pro tatuador/i];
let ok = true;
for (const re of ANTI) {
  if (re.test(out)) { console.log('FAIL pseudo:', re, 'matched'); ok = false; }
}
for (const re of FORBID) {
  if (re.test(out)) { console.log('FAIL frase proibida:', re, 'matched'); ok = false; }
}
console.log(ok ? 'OK: zero pseudo-codigo + zero frase proibida' : 'FAIL');
EOF
```

Expected: `OK: zero pseudo-codigo + zero frase proibida`.

- [ ] **Step 9.4: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add functions/_lib/prompts/coleta/proposta/few-shot.js && \
git commit -m "$(cat <<'EOF'
refactor(prompts): proposta few-shots format A + tom B

Reescreve os 6 exemplos da fase Proposta:
- Format A: remove 6 ocorrencias de pseudo-codigo (consultar_horarios_livres,
  reservar_horario, gerar_link_sinal, enviar_objecao_tatuador).
- Tom B: padroniza "vou consultar com o tatuador" em Exemplos 2 e 3 (em vez
  de "Vou levar pra ele analisar"). Alinhamento estrito tom.js — evita uso
  da excecao marginal "valor ja orcado".
- Pontuacao informal: remove pontos finais em frases curtas conforme
  tom.js linha 39.
EOF
)"
```

---

## Task 10: Auditar 3 few-shot-tenant.js (verificar se já estão limpos)

**Files:**
- Audit (read-only): `functions/_lib/prompts/coleta/tattoo/few-shot-tenant.js`
- Audit (read-only): `functions/_lib/prompts/coleta/cadastro/few-shot-tenant.js`
- Audit (read-only): `functions/_lib/prompts/coleta/proposta/few-shot-tenant.js`

**Contexto:** Explore agent reportou que os 3 few-shot-tenant.js já estão limpos (sem pseudo-código). Esta task confirma + faz mini-audit pra violações tom.js. Se zero violações, NÃO modifica nada (não cria commit fantasma).

- [ ] **Step 10.1: Audit script unificado**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node --input-type=module <<'EOF'
import { fewShotTenant as tattooT } from './functions/_lib/prompts/coleta/tattoo/few-shot-tenant.js';
import { fewShotTenant as cadastroT } from './functions/_lib/prompts/coleta/cadastro/few-shot-tenant.js';
import { fewShotTenant as propostaT } from './functions/_lib/prompts/coleta/proposta/few-shot-tenant.js';
import { TENANT_CANONICO } from './tests/prompts/fixtures/tenant-canonico.mjs';

const ANTI = [/AGENTE:\s*\[chama/i, /\[chama\s+\w+/i, /\[tool retorna/i];
const FORBID = [/vou passar pro tatuador/i, /pra eu passar pro/i, /vou levar pra ele/i];
const fases = [['tattoo', tattooT], ['cadastro', cadastroT], ['proposta', propostaT]];

let totalViolations = 0;
for (const [nome, fn] of fases) {
  const out = fn(TENANT_CANONICO);
  const violations = [];
  for (const re of ANTI) if (re.test(out)) violations.push(`pseudo: ${re}`);
  for (const re of FORBID) if (re.test(out)) violations.push(`frase: ${re}`);
  console.log(`[${nome}] violations: ${violations.length === 0 ? 'NONE ✓' : violations.join(', ')}`);
  totalViolations += violations.length;
}
console.log(`\nTotal violations: ${totalViolations}`);
console.log(totalViolations === 0 ? 'OK: nenhum few-shot-tenant precisa de mudanca' : 'WARN: editar arquivos com violation acima');
EOF
```

Expected case 1 (esperado): `Total violations: 0` + `OK: nenhum few-shot-tenant precisa de mudanca`. Pular Step 10.2 e Step 10.3, ir direto pra Task 11 (sem commit).

Expected case 2 (improvável): `Total violations: N` com N > 0 + lista de violações. Aplicar Step 10.2 + Step 10.3.

- [ ] **Step 10.2: (Conditional) Editar arquivo(s) com violação**

Apenas se Step 10.1 reportou violações. Aplicar fixes minimal:
- Remover pseudo-código `[chama X]` linha por linha
- Substituir "vou passar pro tatuador" → "vou enviar ao tatuador"
- Substituir "vou levar pra ele" → "vou consultar com o tatuador"

- [ ] **Step 10.3: (Conditional) Commit**

Apenas se Step 10.2 fez mudança:

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add functions/_lib/prompts/coleta/*/few-shot-tenant.js && \
git commit -m "$(cat <<'EOF'
refactor(prompts): audit few-shot-tenant.js — fix violations remanescentes

Audit pos-Task 9 detectou N violacoes em few-shot-tenant.js (pseudo-codigo
ou frases proibidas tom.js). Aplica fixes minimal pra alinhar com format A
e tom B.
EOF
)"
```

---

## Task 11: Adicionar 5 invariants tests a tests/prompts/invariants.test.mjs

**Files:**
- Modify: `tests/prompts/invariants.test.mjs` — append no final

- [ ] **Step 11.1: Ler arquivo atual pra confirmar imports + estrutura**

Run: `head -15 /Users/brazilianhustler/Documents/inkflow-saas/tests/prompts/invariants.test.mjs && echo "---" && tail -5 /Users/brazilianhustler/Documents/inkflow-saas/tests/prompts/invariants.test.mjs`

Expected: imports do topo incluem `generateSystemPrompt`, `TENANT_CANONICO`, `CONVERSA_COLETA_TATTOO`, `CONVERSA_COLETA_CADASTRO`, `CONVERSA_COLETA_PROPOSTA`, `CLIENT_CONTEXT_CANONICO`. Final do arquivo termina com `});` do último teste.

- [ ] **Step 11.2: Append 5 testes novos no fim do arquivo**

Edit: `tests/prompts/invariants.test.mjs` — append APÓS o último `});`:

```javascript

// ──────────────────────────────────────────────────────────────────────────
// REFATOR PROMPTS COLETA V2 (2026-05-06): invariants pra garantir que o
// anti-pattern "AGENTE: [chama X(...)]" foi extinto e que tom.js e respeitado
// pelos few-shots. Usa dispatcher + fixtures canonicos (mesmo pattern dos
// invariants ja existentes).
// ──────────────────────────────────────────────────────────────────────────

const COLETA_PROMPTS = [
  { nome: 'coleta-tattoo',   tenant: TENANT_CANONICO, conversa: CONVERSA_COLETA_TATTOO },
  { nome: 'coleta-cadastro', tenant: TENANT_CANONICO, conversa: CONVERSA_COLETA_CADASTRO },
  { nome: 'coleta-proposta', tenant: TENANT_CANONICO, conversa: CONVERSA_COLETA_PROPOSTA },
];

const ANTI_PATTERNS_PSEUDO = [
  /AGENTE:\s*\[chama\s+\w+/i,
  /AGENTE:\s*\[tool\s+retorna/i,
  /\[chama\s+dados_coletados/i,
  /\[chama\s+enviar_orcamento/i,
  /\[chama\s+enviar_objecao/i,
  /\[chama\s+consultar_proposta/i,
  /\[chama\s+acionar_handoff/i,
];

const FORBIDDEN_PHRASES_TOM = [
  /vou passar pro tatuador/i,
  /pra eu passar pro/i,
];

// Helper: extrai linhas iniciando por "AGENTE:" dentro de blocos ``` de few-shots.
function extractAgentTurns(promptText) {
  const lines = promptText.split('\n');
  const turns = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.trim() === '```') { inBlock = !inBlock; continue; }
    if (inBlock && /^AGENTE:/.test(line.trim())) {
      turns.push(line.replace(/^AGENTE:\s*/, '').trim());
    }
  }
  return turns;
}

test('invariante coleta v2: nenhum prompt contem pseudo-codigo de tool', () => {
  for (const { nome, tenant, conversa } of COLETA_PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    for (const pattern of ANTI_PATTERNS_PSEUDO) {
      assert.doesNotMatch(out, pattern,
        `[${nome}] anti-pattern de pseudo-codigo detectado (${pattern})`);
    }
  }
});

test('invariante coleta v2: nenhum turn AGENTE em few-shots usa frases proibidas tom.js', () => {
  for (const { nome, tenant, conversa } of COLETA_PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    const turns = extractAgentTurns(out);
    for (const turn of turns) {
      for (const pattern of FORBIDDEN_PHRASES_TOM) {
        assert.doesNotMatch(turn, pattern,
          `[${nome}] turn AGENTE com frase proibida: "${turn}"`);
      }
    }
  }
});

test('invariante coleta v2: nenhum turn AGENTE em few-shots excede 200 chars (tom.js)', () => {
  for (const { nome, tenant, conversa } of COLETA_PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    const turns = extractAgentTurns(out);
    for (const turn of turns) {
      if (turn.startsWith('http')) continue; // URLs de link-pagamento OK
      assert.ok(turn.length <= 200,
        `[${nome}] turn AGENTE excede 200 chars (${turn.length}): "${turn.slice(0, 100)}..."`);
    }
  }
});

test('invariante coleta v2: nenhum turn AGENTE em few-shots tem >1 pergunta (heuristica 1 pergunta/turno)', () => {
  for (const { nome, tenant, conversa } of COLETA_PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    const turns = extractAgentTurns(out);
    for (const turn of turns) {
      const qCount = (turn.match(/\?/g) || []).length;
      assert.ok(qCount <= 1,
        `[${nome}] turn AGENTE com ${qCount} perguntas: "${turn}"`);
    }
  }
});

test('invariante coleta v2: todos prompts coleta contem secao §4b TOOLS — QUANDO INVOCAR', () => {
  for (const { nome, tenant, conversa } of COLETA_PROMPTS) {
    const out = generateSystemPrompt(tenant, conversa, CLIENT_CONTEXT_CANONICO);
    assert.match(out, /# §4b TOOLS — QUANDO INVOCAR/,
      `[${nome}] sem secao §4b TOOLS — QUANDO INVOCAR (regressao!)`);
  }
});
```

- [ ] **Step 11.3: Rodar somente invariants.test.mjs pra verificar**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node --test tests/prompts/invariants.test.mjs 2>&1 | tail -20
```

Expected: TODOS os testes passam (existentes + 5 novos). Output mostra algo como:
```
ok N - invariante coleta v2: nenhum prompt contem pseudo-codigo de tool
ok N+1 - invariante coleta v2: nenhum turn AGENTE em few-shots usa frases proibidas tom.js
ok N+2 - invariante coleta v2: nenhum turn AGENTE em few-shots excede 200 chars (tom.js)
ok N+3 - invariante coleta v2: nenhum turn AGENTE em few-shots tem >1 pergunta (heuristica 1 pergunta/turno)
ok N+4 - invariante coleta v2: todos prompts coleta contem secao §4b TOOLS — QUANDO INVOCAR
# pass <total>
# fail 0
```

Se algum teste falhar, ler mensagem de erro e:
- "anti-pattern detectado" → re-checar Tasks 7-9 (algum few-shot ainda tem pseudo)
- "turn excede 200 chars" → encurtar mensagem específica em few-shot
- "turn com N perguntas" → quebrar em 2 turnos
- "sem secao §4b" → re-checar Tasks 4-6

- [ ] **Step 11.4: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add tests/prompts/invariants.test.mjs && \
git commit -m "$(cat <<'EOF'
test(prompts): 5 invariants para refator coleta v2

Adiciona 5 testes em invariants.test.mjs existente (sem criar arquivos novos):
- no-pseudocode: 7 patterns anti "AGENTE: [chama X]" / "[tool retorna]"
- forbidden-phrases: "vou passar pro tatuador" e variantes
- max-200-chars: regra tom.js por turn AGENTE em few-shots
- max-1-question: heuristica "1 pergunta por turno" tom.js
- §4b presence: detecta regressao se §4b for removido

Reusa imports existentes (generateSystemPrompt + fixtures canonicos).
Helper extractAgentTurns extrai turns AGENTE de blocos ``` em few-shots.
EOF
)"
```

---

## Task 12: Re-snapshot dos 3 snapshots Coleta

**Files:**
- Modify (via script): `tests/prompts/snapshots/coleta-tattoo.txt`
- Modify (via script): `tests/prompts/snapshots/coleta-cadastro.txt`
- Modify (via script): `tests/prompts/snapshots/coleta-proposta.txt`
- Não-modify: `tests/prompts/snapshots/exato.txt` (Modo Exato não tocado)

**Contexto:** Tasks 4-9 mudaram conteúdo dos prompts. `tests/prompts/snapshot.test.mjs` está vermelho agora. Re-snapshot via script existente. **Commit dedicado** pra diff humano-revisável no PR.

- [ ] **Step 12.1: Confirmar que `snapshot.test.mjs` está VERMELHO atualmente**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
node --test tests/prompts/snapshot.test.mjs 2>&1 | grep -E "^(ok|not ok)" | head -10
```

Expected: 3 dos 4 testes coleta falham (`not ok`). Snapshot Exato passa.

- [ ] **Step 12.2: Rodar script de regeneração**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && ./scripts/update-prompt-snapshots.sh`

Expected: script roda silenciosamente, regenera 4 arquivos em `tests/prompts/snapshots/`.

- [ ] **Step 12.3: Verificar diff humano**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && git diff --stat tests/prompts/snapshots/`

Expected: 3 arquivos coleta com mudanças significativas. Arquivo `exato.txt` SEM mudança.

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && git diff tests/prompts/snapshots/coleta-tattoo.txt | head -100`

Inspeção visual:
- Linhas removidas: pseudo-código `AGENTE: [chama dados_coletados...]`, `[tool retorna...]`, lista bullet "Nome completo / Data de nascimento / E-mail (opcional)"
- Linhas adicionadas: `# §4b TOOLS — QUANDO INVOCAR`, `**T1.**` a `**T4.**`, validação substantiva ("Rosa de 10cm fica top..."), cadastro em texto corrido

Se diff parece alinhado com o spec, prosseguir. Se ver coisa inesperada (ex: prompt com 2× tom.js, ou geração quebrada), parar e diagnosticar.

- [ ] **Step 12.4: Rodar bateria completa pra confirmar verde geral**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && npm test 2>&1 | tail -20`

Expected: TODOS os testes passam (snapshot.test.mjs + invariants.test.mjs + 49 backend tests).

- [ ] **Step 12.5: Commit**

```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
git add tests/prompts/snapshots/ && \
git commit -m "$(cat <<'EOF'
test(prompts): re-snapshot 3 snapshots Coleta v2 pos-refator

Regenera snapshots via ./scripts/update-prompt-snapshots.sh. Mudancas
refletem refator das Tasks 4-9:
- Adicao de secao §4b TOOLS — QUANDO INVOCAR (T1-T4/5/5) em cada fase
- Few-shots em format A (zero pseudo-codigo) com tom B (validacao
  substantiva, cadastro texto corrido, primeira pessoa)

snapshots/exato.txt INTOCADO (Modo Exato fora do escopo).
EOF
)"
```

---

## Task 13: Push branch + abrir PR

**Files:** N/A — git ops

- [ ] **Step 13.1: Confirmar bateria completa verde**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && npm test 2>&1 | grep -E "^(# (pass|fail|tests))"`

Expected:
```
# tests <N>
# pass <N>
# fail 0
```

Se `fail > 0`, parar e fixar antes de push.

- [ ] **Step 13.2: Confirmar estado da branch**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && git log --oneline main..HEAD`

Expected: 12-13 commits (depende se Task 10 fez commit ou não):
```
<sha> test(prompts): re-snapshot 3 snapshots Coleta v2 pos-refator
<sha> test(prompts): 5 invariants para refator coleta v2
<sha> refactor(prompts): proposta few-shots format A + tom B
<sha> refactor(prompts): cadastro few-shots format A + tom B
<sha> refactor(prompts): tattoo few-shots format A + tom B
<sha> feat(prompts): adicionar §4b TOOLS QUANDO INVOCAR em proposta/regras.js
<sha> feat(prompts): adicionar §4b TOOLS QUANDO INVOCAR em cadastro/regras.js
<sha> feat(prompts): adicionar §4b TOOLS QUANDO INVOCAR em tattoo/regras.js
<sha> feat(n8n): canonicalizar 4 tool descriptions Coleta v2
<sha> fix(n8n): documentar URL fix em consultar_proposta_tatuador (aplicado em prod)
<sha> docs(spec): consistencia T4 proposta com Exemplos 3.13/3.14
<sha> docs(spec): fixes pos-review (consistencia com codebase)
<sha> docs(spec): refator prompts coleta v2 - 3 camadas (n8n + regras + few-shots)
```

- [ ] **Step 13.3: Push branch pro remote**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && git push -u origin feat/refator-prompts-coleta-v2`

Expected: branch criada/atualizada no remote. URL do PR exibida.

- [ ] **Step 13.4: Criar PR via gh**

Run:
```bash
cd /Users/brazilianhustler/Documents/inkflow-saas && \
gh pr create --title "refator: prompts Coleta v2 — 3 camadas (n8n + regras + few-shots)" --body "$(cat <<'EOF'
## Summary

Refator pra eliminar bug de smoke E2E PR #27: bot imitava pseudo-código `[chama dados_coletados(...)]` no chat ao invés de invocar tools de verdade. 3 camadas atacadas:

1. **n8n tool descriptions** — 4 descriptions canonicalizadas (template 5-seções) + URL fix em `consultar_proposta_tatuador` (já aplicado em prod 2026-05-06)
2. **`regras.js` §4b TOOLS QUANDO INVOCAR** — adicionado a 3 fases (T1-T4/T5/T5)
3. **Few-shots format A + tom B** — 16 exemplos reescritos (5 tattoo + 5 cadastro + 6 proposta), zero pseudo-código, validação substantiva, cadastro em texto corrido, primeira pessoa em "vou enviar ao tatuador"

Spec: `docs/superpowers/specs/2026-05-06-refator-prompts-coleta-v2-design.md`

## Stats

- 41 ocorrências de pseudo-código removidas (18 tattoo + 17 cadastro + 6 proposta)
- 5 invariants tests novos em `invariants.test.mjs` (no-pseudocode + 3 tom-checks + §4b presence)
- 3 snapshots Coleta regenerados (exato.txt intocado)
- Bateria completa verde

## Test plan

- [ ] CI: `npm test` 100% verde (snapshot + invariants + 49 backend tests)
- [ ] Smoke E2E real WhatsApp Cenário A (rosa coleta → cadastro → orçamento via Telegram tatuador) — ver spec §"Smoke E2E"
- [ ] Smoke E2E Cenário B (menor de idade — handoff sem enviar_orcamento)
- [ ] Smoke E2E Cenário C (consultar_proposta após reentrada do tatuador — valida URL fix)
- [ ] Verificar via `tool_calls_log` Supabase: zero entries `tool='prompt'` em conversas com 3+ mensagens cliente

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL retornada pelo gh.

- [ ] **Step 13.5: Aguardar CI passar**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && gh pr checks --watch`

Expected: todos checks verdes (CF Pages preview build + tests).

---

## Task 14: Smoke E2E real (manual)

**Files:** N/A — verificação externa

**Contexto:** Antes de mergear, validar comportamento real do bot via WhatsApp + Telegram. **3 cenários do spec §"Smoke E2E"**.

- [ ] **Step 14.1: Cenário A — Coleta tattoo + cadastro feliz**

**MANUAL — instruções pro Leandro:**
1. Mandar WhatsApp pro `@inkflow_studio_bot`:
   - "oi, quero fazer uma rosa"
2. Bot responde saudação + 1 pergunta (tamanho/local). NÃO 2 perguntas no mesmo turno.
3. Mandar: "uns 10cm no antebraço"
4. Bot responde com **validação substantiva** (ex: "Rosa de 10cm no antebraço fica top — bem visível...") + pede cadastro em **texto corrido** (não bullet list)
5. Verificar via Supabase MCP `execute_sql`:
   ```sql
   SELECT tool, started_at, http_status FROM tool_calls_log
   WHERE tenant_id = '<dagobert-id>' AND telefone = '<leandro-tel>'
   ORDER BY started_at DESC LIMIT 10;
   ```
   Esperado: 3 entries com `tool='dados_coletados'` (descricao_tattoo, tamanho_cm, local_corpo) timestampadas dentro de 5s. ZERO entries com `tool='prompt'` apenas.
6. Verificar `conversas`:
   ```sql
   SELECT estado_agente, dados_coletados, dados_cadastro
   FROM conversas WHERE tenant_id = '<dagobert-id>' AND telefone = '<leandro-tel>';
   ```
   Esperado: `estado_agente='coletando_cadastro'`, `dados_coletados.descricao_tattoo='rosa'`, etc.
7. Mandar: "Maria Silva, 12/03/1995"
8. Bot pergunta email **opcional** em UM turno
9. Mandar: "maria@gmail.com"
10. Bot confirma com primeira pessoa: "Vou enviar ao tatuador agora..." (nunca "vou passar pro tatuador")
11. Verificar `tool_calls_log` tem 4 entries `dados_coletados` adicionais + 1 entry `enviar_orcamento_tatuador`
12. Verificar `conversas.estado_agente='aguardando_tatuador'`, `conversas.orcid` populado
13. Verificar Telegram do tatuador recebeu mensagem de orçamento com botões

Critério de PASS: zero pseudo-código no chat, 7 dados_coletados + 1 enviar_orcamento no log, Telegram recebido.

- [ ] **Step 14.2: Cleanup pós-Cenário A**

Run via Supabase MCP `execute_sql`:
```sql
DELETE FROM tool_calls_log WHERE tenant_id = '<dagobert-id>' AND telefone = '<leandro-tel>';
DELETE FROM conversas WHERE tenant_id = '<dagobert-id>' AND telefone = '<leandro-tel>';
DELETE FROM n8n_chat_histories WHERE session_id LIKE '<dagobert-id>_<leandro-tel>%';
```

- [ ] **Step 14.3: Cenário B — Menor de idade**

**MANUAL:**
1. Mandar: "oi, quero uma rosa de 8cm no pulso"
2. Bot coleta tattoo (3 dados_coletados log)
3. Mandar: "Lucas Rocha, 03/07/2010"
4. Bot responde despedida educada sobre menor de idade
5. Verificar `tool_calls_log` tem entry `dados_coletados` retornando `gatilho='menor_idade'`
6. Verificar `conversas.estado_agente='aguardando_tatuador'`
7. Verificar **NÃO há** entry `enviar_orcamento_tatuador` (bot respeitou T3)
8. Verificar Telegram tatuador recebeu **handoff** (não orçamento)

Critério de PASS: zero pseudo-código, gatilho menor_idade detectado, sem enviar_orcamento, Telegram handoff.

- [ ] **Step 14.4: Cleanup pós-Cenário B**

Run mesmas queries do Step 14.2.

- [ ] **Step 14.5: Cenário C — URL fix consultar_proposta**

Pré-condição: cenário A executado em ambiente separado (ou usar cenário A com cleanup atrasado). Estado `aguardando_tatuador` necessário.

**MANUAL:**
1. Tatuador (Leandro) responde no Telegram com valor R$ 750 (botão "Fechar valor")
2. Bot reentra (workflow detecta callback Telegram)
3. Cliente: "e ai, ele ja respondeu?"
4. Bot deve invocar `consultar_proposta_tatuador` (URL fix testado)
5. Verificar `tool_calls_log` tem entry `consultar_proposta_tatuador` retornando 200 (não 502/404)
6. Bot responde com valor proposto

Critério de PASS: invocação 200, valor exibido ao cliente.

- [ ] **Step 14.6: Cleanup pós-Cenário C**

Run mesmas queries do Step 14.2.

- [ ] **Step 14.7: Reportar resultado dos 3 cenários**

Comentar no PR:
```
Smoke E2E real concluído:
- ✅ Cenário A (coleta feliz): 7 dados_coletados + 1 enviar_orcamento, zero pseudo-código no chat, Telegram OK
- ✅ Cenário B (menor de idade): gatilho detectado, sem enviar_orcamento, Telegram handoff
- ✅ Cenário C (consultar_proposta): URL fix valida, 200 status

Pronto pra merge.
```

---

## Task 15: Merge PR

- [ ] **Step 15.1: Confirmar todos checks verdes + smoke OK**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && gh pr view --json statusCheckRollup,reviewDecision,mergeable`

Expected: `statusCheckRollup` SUCCESS, `mergeable=MERGEABLE`.

- [ ] **Step 15.2: Squash merge**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && gh pr merge --squash --delete-branch`

Expected: merge commit em `main`, branch local + remote deletadas.

- [ ] **Step 15.3: Verificar deploy CF Pages**

Run: `cd /Users/brazilianhustler/Documents/inkflow-saas && gh run list --branch main --limit 3`

Expected: GHA da merge commit em RUNNING/SUCCESS. Aguardar deploy completo (~3-5min).

- [ ] **Step 15.4: Smoke pós-merge final (sanity check)**

**MANUAL:**
1. Mandar WhatsApp: "oi"
2. Bot responde normal — confirma que prod está OK pós-merge

Se bot quebrar pós-merge, executar `gh pr revert` ou abrir hotfix branch.

- [ ] **Step 15.5: Atualizar memory anchors**

Atualizar:
- `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Painel.md` — empurrar estado atual pra histórico, adicionar novo "Onde estamos agora"
- `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Pendências (backlog).md` — mover entry P0 "Refator prompts Coleta v2" pra `[[InkFlow — Backlog histórico (resolvidos)]]`
- `~/.claude/projects/-Users-brazilianhustler/memory/InkFlow — Modo Coleta v2 principal (2026-05-02).md` — atualizar status (refator 3 camadas DONE)

Commit memory:
```bash
cd /Users/brazilianhustler/.claude/projects/-Users-brazilianhustler/memory && \
git add . && \
git commit -m "chore: refator-prompts-coleta-v2 MERGED — atualiza Painel + backlog + Modo Coleta v2"
```

---

## Self-Review (writing-plans skill)

**Spec coverage:** verifico cada seção do spec contra tasks:
- §Contexto (bug 1 + bug 2): coberto pelas Tasks 2 (URL fix doc) + 7-9 (anti-pattern fix). ✓
- §Goals: 4 goals todos refletidos em critérios de tasks 7-12 + smoke (Task 14). ✓
- §Out of scope: nenhuma task viola. ✓
- §Camada 1 (n8n): Tasks 2-3. ✓
- §Camada 2 (regras §4b): Tasks 4-6. ✓
- §Camada 3 (few-shots): Tasks 7-10. ✓
- §Tests: Task 11 (5 invariants) + Task 12 (re-snapshot). ✓
- §Smoke E2E (3 cenários): Task 14. ✓
- §Critérios de aceitação: cobertos por Tasks 4-12 + 14. ✓
- §Implementation strategy (12 commits): 1-2 commits diferem por causa do split (n8n URL fix em commit 1, descriptions em commit 2). Documentado em commit messages. ✓
- §Riscos & mitigações: smoke E2E cobre todos. ✓

**Placeholder scan:** zero "TBD", "TODO", "implement later". URLs e commits têm exemplos concretos. ✓

**Type consistency:** funções referenciadas (`generateSystemPrompt`, `fewShotBase`, `regras`) batem com imports reais verificados via leitura prévia. ✓

**Status:** plano completo. Pronto pra execução.

---

## Plan complete and saved to `docs/superpowers/plans/2026-05-06-refator-prompts-coleta-v2.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
