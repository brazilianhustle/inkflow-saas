---
last_reviewed: 2026-04-25
owner: leandro
status: stable
related: [README.md, db-indisponivel.md, ../stack.md]
---
# Runbook — Restore from backup (Supabase)

Restaurar banco a partir de backup quando dados foram corrompidos, perdidos, ou modificados por engano. Project alvo: `bfzuxxuscyplfoimvomh`.

⚠️ **OPERAÇÃO DESTRUTIVA.** Backup restore SOBRESCREVE dados atuais (parcial ou total). **Confirmar com founder via Telegram** antes de executar. Se houver dúvida sobre qual modo usar, consultar o founder ANTES de clicar.

## Sintomas / Quando usar

- `TRUNCATE` ou `DROP` acidental (pelo console, MCP, ou migration)
- Migration buggy corrompeu dados (UPDATE sem WHERE, DELETE em cascata indesejada)
- Suspeita de comprometimento (SQL injection, credencial vazada usada por terceiro)
- Founder pediu rollback de mudança recente que afetou dados (não só schema)
- Auditoria detectou dados inconsistentes em larga escala

## Pré-requisitos

- [ ] **Confirmação explícita do founder** via Telegram OU sessão presencial — registrada por escrito antes de tocar
- [ ] Acesso ao Supabase dashboard (Bitwarden item `supabase`)
- [ ] **Janela de manutenção combinada** (downtime esperado: 5-30 min dependendo do modo)
- [ ] **Plano com PITR ativo** (Pro+) OU backup recente disponível (Free só tem snapshots semanais com retenção curta — confirmar antes)
- [ ] Backup local recente do estado atual antes do restore (CYA — caso a decisão seja errada e precisar voltar)

## Diagnóstico — qual backup usar?

### Verificar backups disponíveis

Supabase dashboard → **Database** → **Backups** (em planos Pro+) ou **PITR**.

1. Identificar timestamp do **último estado bom conhecido** (antes da corrupção).
2. Comparar com a janela de retenção do plano:
   - **Free:** sem backup automático no plano — só snapshots manuais.
   - **Pro:** backup diário, retenção 7 dias.
   - **Pro+ (com PITR add-on):** Point-in-Time Recovery granular.
3. Anotar o ID/timestamp do backup escolhido.

Se necessitar backup mais antigo do que a retenção: contactar Supabase support (Pro+ pode ter retenção estendida via ticket).

### Decisão de escopo

Antes de escolher o modo, responder:

| Pergunta | Implicação |
|---|---|
| **Quais tabelas estão afetadas?** | Se só uma → modo 3 (parcial) é suficiente |
| **Há dados novos pós-corrupção que NÃO podem ser perdidos?** | Sim → modo 1 (PITR) ou 3 (parcial) |
| **A janela de corrupção é conhecida?** | Sim e <2h → PITR fino. Não → restore total |
| **Tem PITR no plano?** | Sim → modo 1 preferido. Não → modo 2 ou 3 |

## Ação — Restore

### Modo 1: PITR (Point-in-Time Recovery) — **PREFERIDO se disponível**

PITR cria branch nova com dados restaurados. Você valida na branch antes de promover.

1. Dashboard → **Database** → **Backups / PITR** (botão visível só em Pro+ com PITR ativo).
2. Selecionar timestamp exato (granularidade até 2 min).
3. Clicar **"Restore to new branch"** — Supabase cria branch `restore-<timestamp>`.
4. Aguardar branch ficar `READY` (~3-5 min).
5. **Validar dados na branch** antes de promover:
   ```sql
   -- Conectar via psql na branch (string de conexão da branch)
   SELECT count(*) FROM tenants;
   SELECT count(*) FROM payment_logs WHERE created_at > now() - interval '7 days';
   -- Confirmar que dados corrompidos NÃO estão lá e dados bons ESTÃO
   ```
6. Se branch tá OK: **promover pra production** via dashboard (downtime ~1 min).
7. Se branch não tá OK: ajustar timestamp e tentar de novo.

### Modo 2: Restore de backup completo — **destrutivo, sobrescreve tudo**

⚠️ **SOBRESCREVE banco inteiro.** Tudo que aconteceu desde o backup é PERDIDO.

1. Dashboard → **Database** → **Backups** → escolher backup pelo timestamp.
2. Clicar **"Restore"**.
3. Modal de confirmação aparece — RELER com cuidado.
4. Confirmar.
5. Aguardar restore (5-30 min, varia com tamanho do banco). Site fica indisponível durante.
6. Banco volta ao estado exato do backup.

⚠️ Após restore: **rodar smoke test completo** antes de declarar resolvido (ver Verificação).

### Modo 3: Restore parcial (apenas tabelas afetadas)

Se só algumas tabelas precisam restore (ex: `tenants` foi corrompido mas `payment_logs` tá íntegro), preserva o resto.

1. **Criar branch** Supabase a partir do backup (mesmo procedimento do modo 1, mas você não vai promover — vai extrair dados).
2. **Conectar via `psql`** na branch (string de conexão da branch — Supabase dashboard → Connect):
   ```bash
   psql "<branch-conn-string>"
   ```
3. **`pg_dump` da tabela específica** da branch:
   ```bash
   pg_dump -t tenants "<branch-conn-string>" --data-only --column-inserts > tenants_restore.sql
   ```
4. **Backup do estado atual** da production (pra rollback se errar):
   ```bash
   pg_dump -t tenants "<prod-conn-string>" --data-only --column-inserts > tenants_current_$(date +%s).sql
   ```
5. **Restore na production** (cuidado com FKs — pode precisar dropar constraints temporariamente):
   ```bash
   psql "<prod-conn-string>" <<SQL
   BEGIN;
   -- Opcional: desabilitar triggers durante restore
   ALTER TABLE tenants DISABLE TRIGGER ALL;
   -- Limpar dados afetados (com filtro!)
   DELETE FROM tenants WHERE <criterio-de-corrupcao>;
   -- Importar do dump
   \i tenants_restore.sql
   ALTER TABLE tenants ENABLE TRIGGER ALL;
   COMMIT;
   SQL
   ```
6. Validar contagens e relacionamentos antes de remover branch criada.

### Modo 4: Hotfix manual (sem restore)

Se a corrupção é pequena e identificável, pode ser mais barato corrigir via UPDATE direto. Exemplo: campo `status_pagamento` errado em N tenants conhecidos.

```sql
-- Backup CYA primeiro
CREATE TABLE tenants_backup_<timestamp> AS SELECT * FROM tenants WHERE id IN (...);

-- Hotfix
UPDATE tenants SET status_pagamento = 'authorized' WHERE id IN (...);

-- Validar
SELECT id, status_pagamento FROM tenants WHERE id IN (...);
```

⚠️ Documentar via SQL salvo + nota incidente. Não confiar em "lembrei depois".

## Verificação

```bash
# Conectar à production (ou ao banco recém-promovido)
psql "<prod-conn-string>"
```

Smoke queries:

```sql
-- 1. Counts de tabelas críticas batem com o esperado
SELECT
  (SELECT count(*) FROM tenants) AS tenants,
  (SELECT count(*) FROM tenants WHERE ativo = true) AS tenants_ativos,
  (SELECT count(*) FROM payment_logs) AS payment_logs,
  (SELECT count(*) FROM agendamentos WHERE status = 'confirmado') AS agendamentos_confirmados,
  (SELECT count(*) FROM conversas WHERE created_at > now() - interval '24 hours') AS conversas_24h;

-- 2. Constraint integrity (não há FKs órfãs)
SELECT count(*) FROM payment_logs p
LEFT JOIN tenants t ON p.tenant_id = t.id
WHERE t.id IS NULL;
-- Esperado: 0

-- 3. Último evento por categoria
SELECT max(created_at) FROM payment_logs;
SELECT max(created_at) FROM conversas;
```

Comparar com expectativa (founder confirma):
- Counts estão na ordem de grandeza esperada?
- Datas dos últimos eventos fazem sentido?
- Tenants do founder/internos estão presentes?

```bash
# Smoke test pelo app também
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://inkflowbrasil.com/api/public-start \
  -H "content-type: application/json" -d '{"plano":"trial"}'
# Esperado: 200
```

## Critério de "resolvido"

- ✅ Counts de tabelas críticas correspondem ao esperado (founder confirma)
- ✅ Smoke queries SQL retornam dados sãos (sem FKs órfãs)
- ✅ Endpoints CF Pages retornam 200 nos críticos (`/api/public-start`, `/api/get-tenant`)
- ✅ Bot WhatsApp respondendo normalmente em pelo menos 1 conversa de teste
- ✅ Founder confirma via Telegram que dados visíveis no painel batem com expectativa
- ✅ Se foi restore parcial: branch temporária deletada do Supabase

## Pós-incidente

- [ ] **Nota incidente DETALHADA** no vault: `incident_inkflow_<YYYY-MM-DD>_restore.md` com:
   - Causa-raiz da corrupção
   - Janela de dados perdidos (entre backup e momento do restore)
   - Modo escolhido e justificativa
   - Tenants/registros afetados
   - Tempo total de outage
- [ ] Se foi migration buggy: revert do commit que causou + escrever **teste de regressão** (preferencialmente via PR antes de re-aplicar a migration).
- [ ] Se foi credencial comprometida: rotacionar TODOS secrets que tocam Supabase (`SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`) — ver `../secrets.md`.
- [ ] Avaliar plano:
   - Foi PITR ou full restore? Se full e a janela de perda foi >1h, vale upgrade pra plano com PITR mais granular.
   - Backup mais frequente vale a pena? (Custo vs benefício.)
- [ ] Telegram: `[restore-complete] backup de <timestamp> restaurado. Modo: <PITR/full/parcial>. Dados perdidos: <janela ou "nenhum">. Causa: <breve>.`
- [ ] Atualizar `[[InkFlow — Painel]]` seção 🐛 Bugs / Incidentes.
- [ ] Se restore foi parcial via `pg_dump`: salvar os arquivos `.sql` em backup local seguro por 30+ dias (auditoria).
