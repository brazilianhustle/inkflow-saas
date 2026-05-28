# Arquitetura Total Alvo - InkFlow Platform

Data: 2026-05-27

Este documento define a arquitetura alvo antes do plano de acao da reconstrucao controlada.

## Principio Central

O InkFlow deve ser uma plataforma SaaS, nao apenas um bot.

```text
Bot premium = modulo de atendimento
Painel = control plane do estudio
Banco = fonte de verdade operacional
Billing = permissao economica do produto
Legal/LGPD = contrato de confianca
Observabilidade = inteligencia de guerra
Testes reais = prova definitiva
```

## Estrutura Alvo Do Novo Repo

```text
inkflow-platform/
  apps/
    public-site/
    studio-panel/
    admin-console/
    onboarding/
  services/
    bot-gateway/
    bot-runtime/
    billing/
    notifications/
    scheduler/
    audit-worker/
  packages/
    domain/
    tenant-config/
    conversation-engine/
    workflow/
    pricing/
    media-intelligence/
    security-auth/
    observability/
    integrations/
      evolution/
      telegram/
      mercadopago/
      openai/
      supabase/
  infra/
    cloudflare/
    supabase/
    evolution/
  vault/
    bot-premium/
    legacy-current-repo/
  docs/
    architecture/
    product/
    legal/
    security/
    operations/
    decisions/
  tests/
    unit/
    contract/
    integration/
    whatsapp-real/
    evals/
```

## Dominios Da Plataforma

### 1. Atendimento Premium

Responsavel por:

- entrada WhatsApp;
- batching/debounce;
- entendimento de turno;
- coleta de dados;
- orcamento;
- handoff;
- proposta;
- agendamento;
- naturalidade;
- validacao por WhatsApp real.

Camadas:

```text
Inbound WhatsApp
-> SessionQueue / Debounce
-> TurnContext
-> TenantConfig Manager
-> Media Intelligence
-> ConversationRouter
-> ConversationPolicy
-> WorkflowManager
-> Skill/Agent Runtime
-> Tool Orchestrator
-> ResponseComposer
-> Persistence
-> Observability
-> Escalation/Handoff
```

### 2. Control Plane Do Estudio

Responsavel por tudo que o tatuador configura:

- identidade do estudio;
- horarios;
- locais;
- estilos;
- servicos;
- politica de cobertura;
- precificacao;
- agenda;
- Telegram;
- WhatsApp;
- sinal;
- tom de voz;
- regras de handoff;
- permissao de automacao.

Regra: configuracao deve ser schema-first e validada.

### 3. Data Plane

Entidades principais:

- `Tenant`
- `StudioUser`
- `ClientContact`
- `Conversation`
- `Message`
- `MediaAsset`
- `BudgetRequest`
- `BudgetItem`
- `BudgetQuote`
- `Proposal`
- `Appointment`
- `Payment`
- `ConsentRecord`
- `DataSubjectRequest`
- `AuditEvent`
- `BotConfig`
- `WorkflowState`

Regra: nenhum dado importante deve existir apenas como texto solto em prompt ou log.

### 4. Billing E Entitlements

Responsavel por:

- trial;
- assinatura ativa;
- falha de pagamento;
- cancelamento;
- bloqueio;
- plano;
- limites;
- funcionalidades disponiveis;
- sinal de agendamento.

Regra: o bot e o painel devem consultar entitlements, nao apenas `status_pagamento` solto.

### 5. Legal E Governanca De Dados

Responsavel por:

- termos;
- privacidade;
- consentimento;
- direito do titular;
- exportacao;
- exclusao;
- retencao;
- suboperadores;
- incidente;
- logs de tratamento.

Regra: LGPD deve ser implementacao operacional, nao apenas pagina de texto.

### 6. Observabilidade

Responsavel por responder:

- por que o bot respondeu isso?
- qual intent foi detectada?
- qual regra bloqueou ou liberou?
- qual estado mudou?
- qual agente/tool foi usado?
- qual tenant config estava ativa?
- qual evidencia provou o comportamento?

Evento minimo por turno:

```text
trace_id
tenant_id
conversation_id
message_batch_id
router_intent
router_reason
policy_decision
workflow_from
workflow_to
agent_or_resolver
media_classification
side_effects
telegram_trace
response_summary
```

### 7. Operacao

Responsavel por:

- deploy;
- staging;
- rollback;
- health checks;
- secrets;
- rotacao de chaves;
- CI;
- auditorias;
- runbooks;
- backup/restore;
- incident response.

## Contratos De Teste

Niveis obrigatorios:

```text
unitario        = regra local
contract        = schema/API/evento
integration     = integracao mockada ou sandbox
http production = radar inicial
whatsapp real   = validacao definitiva conversacional
telegram real   = validacao definitiva de orcamento/handoff
eval/prompt     = linguagem, invariantes e regressao semantica
security gate   = auth, secrets, RLS, headers e permissoes
```

Regra: comportamento conversacional nao fecha sem WhatsApp real quando tocar fluxo do cliente.

## Padroes Externos De Referencia

- OWASP ASVS: requisitos de seguranca de aplicacao.
- NIST CSF 2.0: governanca, risco, protecao, deteccao, resposta e recuperacao.
- LGPD/ANPD: dados pessoais, direitos do titular, encarregado, seguranca e incidente.
- WhatsApp Business Platform: consentimento, opt-out e qualidade de mensageria.
- Supabase RLS: isolamento multi-tenant.
- PCI/Mercado Pago: nao manipular dados de cartao diretamente.

## Fronteiras Arquiteturais

Nao fazer:

- prompt decidir regra critica sozinho;
- painel escrever config sem schema;
- bot depender de dado nao versionado do tenant;
- Telegram receber multiplos orcamentos sem agregacao;
- WhatsApp real ser substituido por smoke HTTP em fluxo conversacional;
- nova plataforma herdar n8n como base;
- legal ficar para o final.

Fazer:

- dominio primeiro;
- contratos antes de UI;
- UI guiada por schema;
- bot guiado por policy/workflow;
- smoke real como prova;
- logs decisorios;
- migracao por ledger.

## Proximo Passo Apos Validacao

Criar plano de acao faseado:

1. completar matriz de extracao por arquivo/dominio;
2. definir novo repo e estrutura inicial;
3. criar contratos de dominio;
4. criar tenant config schema;
5. importar vault curado do bot premium;
6. montar CI/test scaffold;
7. iniciar primeiro slice de reconstrucao.

