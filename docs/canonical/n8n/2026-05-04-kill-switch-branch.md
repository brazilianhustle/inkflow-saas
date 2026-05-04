# n8n workflow update — kill-switch branch

**Data:** 2026-05-04
**Workflow:** `MEU NOVO WORK - SAAS` (id: `PmCMHTaTi07XGgWh`)
**PR:** #TBD (PR 3 — Agente + kill-switch backend)

## Status

**⏸ NÃO APLICADO AINDA.** Documentado pra aplicação manual ou via MCP em sessão dedicada.

**Bloqueado por:** Leandro precisa setar `KILL_SWITCH_SECRET` em CF Pages env vars (production + preview) antes de testar.

## Setup pré-aplicação

### 1. Gerar secret

```bash
openssl rand -hex 32
# Ex output: 9f3b2a1e7c8d4f6a0b1c5e8d2f9a3b7c4d6e1a8b2c5f9e7d3a6b4c1f8e5d2a7b
```

### 2. Salvar no Bitwarden Secrets

```bash
bws secret create INKFLOW_KILL_SWITCH_SECRET <SECRET> --project-id inkflow
```

### 3. Setar no CF Pages

Cloudflare Dashboard → Pages → `inkflow-saas` → Settings → Environment variables:
- Production: `KILL_SWITCH_SECRET = <SECRET>`
- Preview: mesmo valor

Trigger redeploy (push ou retry build) pra propagar.

### 4. Setar no n8n credentials

Credentials → New → "Header Auth":
- Name: `KILL_SWITCH_SECRET`
- Header Name: `Authorization`
- Header Value: `Bearer <SECRET>`

## Mudanças no workflow

Adicionar **HTTP Request** node + **Switch** node ANTES do nó LLM (provavelmente OpenAI/Anthropic) no fluxo principal.

### Nó 1: HTTP Request "kill-switch-detect"

- **URL:** `https://inkflowbrasil.com/api/kill-switch-detect`
- **Method:** POST
- **Authentication:** Header Auth → `KILL_SWITCH_SECRET` (credential criada acima)
- **Body Content Type:** JSON
- **Body:**

```json
{
  "tenant_id": "={{ $json.tenant_id }}",
  "conversa_id": "={{ $json.conversa_id }}",
  "mensagem": "={{ $json.mensagem }}",
  "from_me": "={{ $json.from_me }}",
  "estado_atual": "={{ $json.estado_agente }}",
  "config_agente": "={{ $json.config_agente }}"
}
```

(Ajustar paths conforme nomes reais das vars no workflow — `$json` vs `$('Input').item.json`, etc.)

### Nó 2: Switch baseado em `{{ $node["kill-switch-detect"].json.action }}`

3 outputs:

#### Output A: `pause`
Conecta em DOIS nós paralelos:

**A1. Supabase: UPDATE conversas (PATCH)**
- URL: `https://bfzuxxuscyplfoimvomh.supabase.co/rest/v1/conversas?id=eq.{{ $json.conversa_id }}`
- Method: PATCH
- Auth: Service Role Key (existing credential)
- Body:
```json
{
  "estado_agente": "pausada_tatuador",
  "estado_agente_anterior": "{{ $json.estado_agente }}",
  "pausada_em": "{{ $now.toISO() }}"
}
```

**A2. Evolution sendText (ack ao tatuador)**
- URL: `{{ $('GetTenant').item.json.evo_base_url }}/message/sendText/{{ $('GetTenant').item.json.evo_instance }}`
- Method: POST
- Auth: Header `apikey: {{ $('GetTenant').item.json.evo_apikey }}`
- Body:
```json
{
  "number": "{{ $('GetTenant').item.json.tatuador_telefone }}",
  "text": "{{ $node['kill-switch-detect'].json.ack_message }}"
}
```

**SHORT-CIRCUIT:** Após A1+A2, NÃO continua pro fluxo LLM. Para aqui.

#### Output B: `resume`
Análogo a A, mas:

**B1. Supabase PATCH:** estado_agente=`{{ $json.estado_agente_anterior || 'ativo' }}`, estado_agente_anterior=null, pausada_em=null
**B2. Evolution sendText (mensagem ao cliente):**
- number: `{{ $('Conversa').item.json.telefone }}` (cliente, não tatuador)
- text: `{{ $node['kill-switch-detect'].json.mensagem_ao_retomar }}`

**SHORT-CIRCUIT:** após B1+B2, para.

#### Output C: `noop`
Conecta no fluxo LLM existente (sem mudança).

## Como testar (pós-aplicação)

Pré-condição: workflow publicado + secret setado.

1. **Pause via frase:** No WhatsApp do tatuador, mandar `/eu assumo` numa conversa ativa.
   - Esperado: msg ack `🔇 Bot pausado. Você está no comando.` aparece no chat.
   - DB: `conversas.estado_agente = 'pausada_tatuador'`, `pausada_em` setado.
   - Cliente manda msg seguinte → bot ignora (n8n para no kill-switch).

2. **Resume via frase:** Tatuador manda `/bot volta` na mesma conversa.
   - Esperado: ack `✅ Bot retomou.` no chat do tatuador + `Voltei! Alguma dúvida sobre o orçamento?` (ou config) chega ao cliente.
   - DB: estado_agente restaurado, estado_agente_anterior=null, pausada_em=null.

3. **Auto-retomar:** Pausar conversa, esperar > config.auto_retomar_horas (default 6h, ou setar pra 2h via Painel Agente).
   - Cron `*/15 * * * *` deve disparar e retomar automaticamente.
   - Logs em CF Worker `inkflow-cron` → `auto-retomar: N pausadas total, M pra retomar`.

## Rollback

Se quebrar:
1. Desconectar o nó HTTP "kill-switch-detect" do fluxo (passa direto pra LLM como antes).
2. Republish workflow.
3. Endpoint `/api/kill-switch-detect` continua existindo mas ninguém chama — sem efeito colateral.

## Próxima sessão (quando aplicar)

Comando de retomada:

> "Aplica n8n workflow update do PR 3 — `docs/canonical/n8n/2026-05-04-kill-switch-branch.md`. KILL_SWITCH_SECRET já setado em CF Pages + n8n credentials. Use MCP n8n: `get_workflow_details` em `PmCMHTaTi07XGgWh`, monta SDK code com novos nodes (HTTP Request + Switch) antes do LLM, `validate_workflow` → `update_workflow` → `publish_workflow`."
