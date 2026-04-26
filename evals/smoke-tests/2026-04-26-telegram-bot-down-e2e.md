---
date: 2026-04-26
status: prepared (awaiting user E2E)
related:
  - docs/superpowers/plans/2026-04-26-telegram-bot-down.md (Task 9)
  - docs/superpowers/specs/2026-04-26-telegram-bot-down-design.md
  - docs/canonical/runbooks/telegram-bot-down.md
---

# Smoke Test E2E — `telegram-bot-down`

## Status

**Subagent steps:** COMPLETE
- Test suite passing (`node --test tests/*.mjs` — 15/15 green)
- Endpoint syntax valid (`node --check functions/api/approvals/decide.js`)
- admin.html script blocks syntactically valid
- Smoke approval row inserted in Supabase: `70c710a0-4f25-4fe4-b3dd-a5f3e50cfcd9`

**User E2E steps:** AWAITING USER
- Push branch + merge PR (or wait for deploy preview)
- Dispatch real Pushover with deep-link URL
- Tap URL on phone → login → approve → verify status changed
- Cleanup test row

## Subagent verification log

### Test suite

```
$ node --test tests/*.mjs

✔ returns 405 on GET (19.032833ms)
✔ returns 401 without Authorization header (0.195875ms)
✔ returns 401 when JWT user email does not match ADMIN_EMAIL (0.157ms)
✔ returns 400 on invalid action (0.402833ms)
✔ returns 400 on missing id (0.22325ms)
✔ returns 200 + approved row on successful approve (0.694083ms)
✔ returns 409 when row already decided (PATCH returns empty array) (0.24225ms)
✔ returns 200 + rejected status on action=reject (0.197458ms)
telegram: env vars ausentes, pulando alert
telegram: send failed: network
✔ sendTelegramAlert posts to Bot API with correct payload (0.758292ms)
✔ sendTelegramAlert returns skipped when env vars missing (0.311583ms)
✔ sendTelegramAlert fails open on fetch error (0.211333ms)
moveToMailerLiteGroup: MAILERLITE_API_KEY ausente
✔ calculateTrialEnd returns ISO string 7 days in the future (1.295375ms)
✔ calculateTrialEnd defaults to current time if no arg (0.073334ms)
✔ moveToMailerLiteGroup unassigns from old and assigns to new (0.14325ms)
✔ moveToMailerLiteGroup skips when MAILERLITE_API_KEY missing (0.3055ms)
ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 78.402291
```

Nota: comando do plano original era `node --test tests/`, mas Node 25 interpreta sem glob como módulo CJS. Usado `tests/*.mjs` para resolver.

### Syntax checks

```
$ node --check functions/api/approvals/decide.js
SYNTAX OK

$ node -e "<admin.html script blocks check>"
Block 1: OK
Block 2: OK
```

### Smoke row inserted

```
INSERT id: 70c710a0-4f25-4fe4-b3dd-a5f3e50cfcd9
severity: P0
status: pending
expires_at: 2026-04-26 18:15:53.515997+00
```

Created via Supabase MCP `execute_sql` against project `bfzuxxuscyplfoimvomh`.

Use this row id for manual E2E:
- URL prod: `https://inkflowbrasil.com/admin.html#approvals/70c710a0-4f25-4fe4-b3dd-a5f3e50cfcd9` (após deploy)
- URL local: `http://localhost:8788/admin.html#approvals/70c710a0-4f25-4fe4-b3dd-a5f3e50cfcd9` (após `wrangler pages dev`)

## User E2E protocol (when ready)

1. Confirmar endpoint deployed:
   ```bash
   curl -I https://inkflowbrasil.com/api/approvals/decide
   # Esperado: 405 (POST only) ou 401 — confirma que a rota existe
   ```

2. Confirmar credenciais Pushover no Bitwarden (`inkflow-pushover`):
   - PUSHOVER_APP_TOKEN
   - PUSHOVER_USER_KEY

3. Dispatch Pushover com a smoke row:
   ```bash
   PUSHOVER_USER_KEY="<from-bitwarden>"
   PUSHOVER_APP_TOKEN="<from-bitwarden>"
   APPROVAL_ID="70c710a0-4f25-4fe4-b3dd-a5f3e50cfcd9"
   curl -s -F "token=$PUSHOVER_APP_TOKEN" \
        -F "user=$PUSHOVER_USER_KEY" \
        -F "priority=1" \
        -F "title=E2E test — Task 9" \
        -F "message=Smoke test do runbook telegram-bot-down" \
        -F "url=https://inkflowbrasil.com/admin.html#approvals/$APPROVAL_ID" \
        -F "url_title=Aprovar / Rejeitar" \
        https://api.pushover.net/1/messages.json
   ```
   (priority=1 em vez de 2 pra evitar a sirene — isso é só teste, não é P0 real)

4. No celular:
   - Receber notificação Pushover
   - Tocar na URL
   - Autenticar via Supabase Auth (admin email + senha)
   - Verificar que a section de approval mostra o payload de teste (`action: e2e_smoke_test`)
   - Digitar uma nota tipo "task9 e2e from <device>"
   - Clicar "Aprovar"
   - Verificar mensagem de confirmação aparece

5. Verificar DB:
   ```sql
   SELECT id, status, approved_at, approved_by, notes
   FROM approvals
   WHERE id = '70c710a0-4f25-4fe4-b3dd-a5f3e50cfcd9';
   ```
   Esperado: `status='approved'`, `approved_by='lmf4200@gmail.com'`, `notes` inclui "task9 e2e", `approved_at` recente.

6. Cleanup:
   ```sql
   DELETE FROM approvals WHERE id = '70c710a0-4f25-4fe4-b3dd-a5f3e50cfcd9';
   ```

## Acceptance criteria

E2E passa se:
- Notificação Pushover chega no celular em <10s
- Tocar URL abre admin.html com tela de login
- Após login, section de approval mostra payload correto
- Botão Aprovar muta DB (status=approved, approved_by=admin email)
- Página mostra confirmação
- Botões somem após sucesso

Se algum critério falhar: abrir issue, NÃO marcar E2E como completo.

## Issues found

(populate during user E2E run)

## Latency observations

- Push notification → tap: ___ s
- Tap → admin loaded: ___ s
- Click approve → DB updated: ___ s
