# Plataforma de Login do Cliente — Plano Futuro

**Status:** PENDENTE · Não implementar ainda
**Criado em:** 2026-04-21
**Trigger pra priorizar:** qualquer um dos abaixo

## Quando fazer

Só vale a pena quando pelo menos UM destes gatilhos for real:

1. **Escala** — 50+ tenants ativos pagando
2. **Pedido explícito** — um estúdio pediu multi-usuário (tatuadores separados do dono)
3. **Incidente** — token de um cliente vazou / foi compartilhado sem querer
4. **Compliance** — cliente enterprise pediu SSO, SOC2, ou alguma auditoria formal de acesso
5. **Multi-dispositivo** — dono do estúdio reclamou de não conseguir deslogar dispositivo antigo

## Por que não agora (2026-04-21)

- Ganho de segurança marginal vs custo de engenharia alto (2-4 semanas)
- Base instalada pequena (3-5 tenants) — magic link atual cobre o caso
- Zero-friction do magic link ainda compensa na conversão
- Tem melhorias incrementais baratas antes de partir pra login completo

## Arquitetura recomendada quando for hora

### Passkey/WebAuthn (passwordless)

Pular senha tradicional direto pra biometria/device-auth:

- **Bibliotecas**: `@simplewebauthn/server` (Cloudflare Workers compatible)
- **Fluxo**: primeiro acesso do cliente cria passkey vinculada ao device → próximos acessos só biometria (Touch ID, Face ID, Windows Hello)
- **Fallback email**: OTP de 6 dígitos enviado via MailerLite pra novo device
- **Sem password reset flow** (não tem senha), sem dependência SMS, sem leak

### Estrutura de dados

```sql
-- Nova tabela pra passkeys (1 tenant pode ter N)
CREATE TABLE client_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  credential_id text NOT NULL UNIQUE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0,
  device_name text,  -- "Chrome no MacBook de Leandro"
  created_at timestamptz DEFAULT NOW(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- Nova tabela pra sessões
CREATE TABLE client_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  passkey_id uuid REFERENCES client_passkeys(id),
  session_token text NOT NULL UNIQUE,  -- hashed, nunca em plaintext
  user_agent text,
  ip_country text,
  created_at timestamptz DEFAULT NOW(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
```

### Endpoints novos

- `POST /api/auth/passkey-register` — inicia challenge de registro (1º acesso)
- `POST /api/auth/passkey-verify-register` — valida e persiste passkey
- `POST /api/auth/passkey-login` — inicia challenge de autenticação
- `POST /api/auth/passkey-verify-login` — valida e cria sessão (cookie HttpOnly)
- `POST /api/auth/sessions` — lista sessões ativas (pra UI "Meus dispositivos")
- `DELETE /api/auth/sessions/:id` — revoga sessão específica
- `POST /api/auth/logout` — encerra sessão atual

### Multi-usuário por estúdio (Fase 2)

- Nova tabela `studio_members` com `role: owner | artist | view_only`
- Owner pode convidar artistas via email — eles recebem magic link de primeiro-login, aí cadastram própria passkey
- RLS no Supabase scopeia queries por `studio_members.tenant_id`

## Melhorias incrementais ANTES de login completo

Estas são baratas (horas, não semanas) e cobrem 80% do risco:

### 1. URL de uso único → cookie de sessão (~1 dia)

Mudar `/studio?token=<uuid>` pra fluxo de 2 passos:

- Token na URL é **one-time** (flag `used=true` no DB após primeiro uso)
- Servidor troca por cookie `studio_session` (HttpOnly, Secure, SameSite=Lax, TTL 7d)
- Cliente compartilhar URL não dá acesso (já foi consumida)
- Refresh do cookie via endpoint renova TTL

Ganho: elimina risco de "reenvio da mensagem dá acesso" sem reengenharia completa.

### 2. Email de alerta em acesso novo (~4h)

- Na validação do token, capturar IP → país via CF header `CF-IPCountry`
- Se IP ou país diferente do last_access do tenant → envia email automático:
  _"Alguém acessou seu painel InkFlow de um novo lugar (Brasil, Chrome). Foi você? Se não foi, clica aqui pra desativar o token."_
- Link de "desativar" rotaciona o `studio_token` e força novo onboarding

Ganho: detecção de token vazado em até minutos.

### 3. Expiração de token após inatividade (~2h)

- Se `last_access_at` > 30 dias → força renovação via email/WhatsApp
- Reduz janela de exposição de tokens antigos esquecidos

## Custo estimado

| Fase | Escopo | Esforço |
|---|---|---|
| Quick wins (itens 1-3 acima) | URL one-time + alertas + expiração | ~2 dias |
| MVP Passkey (single user) | Register + login + 1 sessão | ~1 semana |
| Multi-usuário + gerência | Roles, convites, RLS | +3 dias |
| UI dashboard sessions/devices | "Meus dispositivos" + revoke | +2 dias |
| **Total plataforma completa** | — | **~2-3 semanas** |

## Decisões ainda abertas (quando for a hora)

1. **Gateway de auth**: DIY com `@simplewebauthn/server` ou usar Clerk/Supabase Auth?
   - Clerk: caro ($$$), overkill pra scale atual
   - Supabase Auth: de graça, integra com RLS. **Recomendado.**
   - DIY: mais controle mas mais manutenção
2. **Email OTP fallback**: MailerLite transactional ou integrar provider separado (Postmark, Resend)?
3. **Mobile app**: se InkFlow virar app nativo, precisa de OAuth PKCE — considerar agora o design pra não refatorar depois

## Referências

- Schema atual: `tenants.studio_token`, validado em `functions/api/validate-studio-token.js`
- Magic link atual: `/studio?token=<uuid>` com sliding TTL
- WebAuthn spec: https://www.w3.org/TR/webauthn-2/
- SimpleWebAuthn lib: https://simplewebauthn.dev/
- Supabase Auth docs: https://supabase.com/docs/guides/auth
