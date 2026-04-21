# Email Remetente com Marca (oi@inkflowbrasil.com)

**Status:** PENDENTE · Prioridade média · Executar antes de campaigns em escala
**Criado em:** 2026-04-21

## Problema atual

Emails automáticos do MailerLite saem com `lmf4200@gmail.com` como sender:
- Parece amador pro cliente ("por que uma empresa me manda email do gmail?")
- Deliverability menor (gmail.com como domínio de envio em massa tá sujeito a rate limits e filtros de Promotions)
- Quebra a percepção de marca construída na landing/emails
- Reply-to vai pra inbox pessoal — mistura com vida pessoal

## Meta

Sender = `oi@inkflowbrasil.com` (ou escolha equivalente com domínio próprio).

## Caminho recomendado: Cloudflare Email Routing + MailerLite verified sender

**Custo total:** R$ 0/mês
**Setup:** ~30 min spread em 3 passos

### Passo 1 — Cloudflare Email Routing (10 min)

Recebe emails direcionados a `*@inkflowbrasil.com` e redireciona pro gmail.

1. Cloudflare dashboard → domínio `inkflowbrasil.com` → Email → Email Routing
2. Enable Email Routing (adiciona automaticamente MX + TXT records)
3. Add destination address: `lmf4200@gmail.com` (verifica por email de confirmação)
4. Create routing rule:
   - Match: `oi@inkflowbrasil.com`
   - Action: Send to `lmf4200@gmail.com`
5. (Opcional) Catch-all: qualquer outro `*@inkflowbrasil.com` → `lmf4200@gmail.com`

Resultado: cliente manda email pra `oi@inkflowbrasil.com` → chega no gmail.

### Passo 2 — MailerLite verified sender (10 min)

MailerLite precisa provar que você é dono do domínio antes de mandar em nome dele.

1. MailerLite dashboard → Account settings → Domains → Add domain
2. Digita `inkflowbrasil.com`
3. MailerLite gera 3 DNS records pra você adicionar no Cloudflare:
   - SPF (TXT) — autoriza MailerLite a enviar em nome do domínio
   - DKIM (CNAME x2) — assinatura criptográfica dos emails
   - (opcional) DMARC — política de validação
4. Volta no Cloudflare → DNS → adiciona os 3 records
5. Volta no MailerLite → clica "Verify" → aguarda propagação (5-60 min, geralmente 10)
6. Quando verificado: Sender settings → Add sender → `oi@inkflowbrasil.com` → confirma via email que vai chegar no gmail

Resultado: MailerLite manda como `oi@inkflowbrasil.com` e passa nos filtros anti-spoofing (SPF+DKIM+DMARC alignment).

### Passo 3 — Gmail "Send as" pra responder com o mesmo remetente (10 min)

Pra quando um cliente responder um email do bot, você poder responder DE VOLTA como `oi@inkflowbrasil.com` direto do Gmail em vez de `lmf4200@gmail.com`.

1. Gmail → Settings (⚙️) → See all settings → **Accounts and Import**
2. **Send mail as** → Add another email address
3. Name: `InkFlow` (ou `Leandro · InkFlow`)
4. Email address: `oi@inkflowbrasil.com`
5. Check "Treat as an alias" → Next
6. SMTP server: `smtp.mailerlite.com` (pega da configuração do MailerLite)
7. Port: 587 · TLS · Username + senha gerada no dashboard MailerLite em Domains → SMTP credentials
8. Save → Gmail manda email de confirmação pra `oi@inkflowbrasil.com` → chega via Cloudflare Routing no próprio gmail → clica confirmação

Resultado: ao responder, Gmail abre dropdown de From e você escolhe `oi@inkflowbrasil.com`.

### Passo 4 — Atualizar automations existentes pra usar o novo sender

No MailerLite:
1. Automations → cada uma das 4 (IDs `185331384158520593`, `185331388712486190`, `185331393176274482`, `185331397115774135`)
2. Edit sender → trocar pra `oi@inkflowbrasil.com`
3. Save

## Custo e manutenção

| Item | Custo | Manutenção |
|---|---|---|
| Cloudflare Email Routing | R$ 0 | Zero — é só redirect |
| MailerLite free tier (até 1k subs, 12k emails/mês) | R$ 0 | Zero |
| Renovação DKIM keys | R$ 0 | Raríssimo — se MailerLite rotar, eles avisam |
| Gmail "Send as" | R$ 0 | Zero |

## Armadilhas a evitar

1. **Não criar o domain `contato.com`** (usuário mencionou esse nome por engano — esse domínio já existe e não é seu). Use `inkflowbrasil.com` ou registre um domínio novo.
2. **Não enviar antes de verificar DKIM/SPF**: emails de domínio não-verificado caem DIRETO em spam. Se a verificação ainda tá pendente, não ative automations.
3. **Não esquecer do DMARC policy** depois de 30 dias: começa com `p=none` (monitoramento), depois de confirmar que nada legítimo tá falhando, muda pra `p=quarantine` ou `p=reject` pra proteger contra phishing.
4. **Evitar `noreply@`**: cliente responde querendo atendimento e bate em buraco. Se quiser sinalizar "automático", use `nao-responda@` em PORTUGUÊS, ou melhor ainda, aceite reply (como hoje — cliente responde pro bot de trial e você lê).

## Quando executar

- ✅ **Antes de passar de 50 subscribers** no MailerLite — domain warming importa
- ✅ **Antes do primeiro email pago** (campaign paga, não automation) — tráfego pra inbox vs spam faz diferença grande
- ❌ **Não urgente agora** — 4 subscribers, baixíssimo risco de classificação spam

## Alternativas consideradas

| Solução | Custo | Quando vale |
|---|---|---|
| **Cloudflare + MailerLite** (escolhida) | R$ 0 | Sempre — default |
| Google Workspace | ~R$ 30/mês | Quando time crescer (2+ devs) ou precisar Drive/Meet |
| Resend/Postmark transactional | ~$10-20/mês | >10k emails/mês ou deliverability crítica |
| Outlook 365 personal | ~R$ 20/mês | Se preferir Outlook ao Gmail |

## Decisão aberta

Qual endereço EXATO usar de default:
- `oi@inkflowbrasil.com` — casual, combina com o bot
- `contato@inkflowbrasil.com` — neutro corporativo
- `leandro@inkflowbrasil.com` — pessoal (1 pessoa só)
- `atendimento@inkflowbrasil.com` — formal

Recomendação: **`oi@inkflowbrasil.com`** pra automations + **`leandro@inkflowbrasil.com`** como alternativa pra quando responder manualmente a dúvidas específicas. Dois senders verificados = flexibilidade sem confusão.
