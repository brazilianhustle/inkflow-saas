# Contratos Da Plataforma

Data: 2026-05-27

Objetivo: definir os contratos compartilhados da futura plataforma InkFlow antes de criar novo repo, painel, schema ou runtime.

Este documento e o acordo de linguagem entre bot, painel, banco, billing, legal, observabilidade e operacao.

## Regra Central

Nenhum modulo novo deve inventar nomes ou estados proprios para conceitos de negocio.

```text
dominio primeiro -> schema depois -> UI depois -> runtime depois
```

## Entidades Canonicas

### Tenant

Representa o estudio/conta cliente do InkFlow.

Campos conceituais:

- `id`;
- `display_name`;
- `legal_name`;
- `owner_user_id`;
- `status`;
- `plan_id`;
- `billing_status`;
- `default_locale`;
- `timezone`;
- `created_at`;
- `updated_at`.

Estados:

- `draft`;
- `trial`;
- `active`;
- `past_due`;
- `suspended`;
- `cancelled`;
- `deleted`.

Regra:

```text
Tenant nao deve carregar regras soltas sem schema. Toda regra operacional entra por TenantConfig.
```

### StudioUser

Representa uma pessoa com acesso ao painel.

Campos conceituais:

- `id`;
- `tenant_id`;
- `name`;
- `email`;
- `role`;
- `status`;
- `last_login_at`.

Roles iniciais:

- `owner`;
- `admin`;
- `artist`;
- `support`;
- `readonly`.

Regra:

```text
acao sensivel exige role explicita e AuditEvent.
```

### TenantConfig

Representa a configuracao versionada usada por bot e painel.

Blocos obrigatorios:

- `identity`;
- `voice_policy`;
- `service_policy`;
- `style_policy`;
- `pricing_policy`;
- `schedule_policy`;
- `handoff_policy`;
- `channel_policy`;
- `legal_policy`;
- `automation_flags`;
- `observability_policy`.

Regra:

```text
TenantConfig e contrato compartilhado. Painel escreve, bot le, testes validam.
```

Detalhamento especifico fica em `07-tenant-config-contract.md`.

### ClientContact

Representa a pessoa atendida no WhatsApp.

Campos conceituais:

- `id`;
- `tenant_id`;
- `phone`;
- `name`;
- `birth_date`;
- `email`;
- `consent_status`;
- `created_at`;
- `updated_at`.

Regra:

```text
telefone identifica o contato dentro de um tenant, nao globalmente.
```

### Conversation

Representa uma conversa operacional entre cliente e estudio.

Campos conceituais:

- `id`;
- `tenant_id`;
- `client_contact_id`;
- `channel`;
- `state`;
- `workflow_state`;
- `last_message_at`;
- `assigned_to`;
- `created_at`;
- `updated_at`.

Estados canonicos:

- `new`;
- `collecting_tattoo`;
- `collecting_registration`;
- `waiting_artist`;
- `quoting`;
- `waiting_client`;
- `scheduling`;
- `waiting_deposit`;
- `closed_won`;
- `closed_lost`;
- `human_handoff`;
- `paused`;

Regra:

```text
state muda somente por WorkflowManager ou rotina administrativa auditada.
```

### Message

Representa uma mensagem individual ou bolha recebida/enviada.

Campos conceituais:

- `id`;
- `tenant_id`;
- `conversation_id`;
- `channel`;
- `direction`;
- `message_type`;
- `text`;
- `media_asset_id`;
- `provider_message_id`;
- `batch_id`;
- `created_at`.

Direcoes:

- `inbound`;
- `outbound`;
- `internal`.

Tipos:

- `text`;
- `image`;
- `audio`;
- `video`;
- `document`;
- `button`;
- `system`.

Regra:

```text
varias bolhas podem formar um TurnContext, mas nao perdem identidade individual.
```

### MediaAsset

Representa midia recebida ou enviada.

Campos conceituais:

- `id`;
- `tenant_id`;
- `conversation_id`;
- `source`;
- `media_type`;
- `storage_uri`;
- `caption`;
- `classification`;
- `classification_confidence`;
- `created_at`.

Classificacoes alvo:

- `body_location_clean`;
- `body_location_with_existing_tattoo`;
- `tattoo_reference`;
- `possible_cover_up`;
- `ambiguous`;
- `irrelevant`.

Regra:

```text
foto nao deve ser tratada apenas por caption. Classificacao visual precisa ser contrato.
```

### BudgetRequest

Representa um pedido de orcamento.

Campos conceituais:

- `id`;
- `tenant_id`;
- `conversation_id`;
- `client_contact_id`;
- `status`;
- `source`;
- `created_at`;
- `updated_at`.

Estados:

- `draft`;
- `collecting`;
- `ready_for_artist`;
- `waiting_artist`;
- `quoted`;
- `sent_to_client`;
- `accepted`;
- `declined`;
- `expired`;

Regra:

```text
um BudgetRequest pode ter 1 ou N BudgetItems.
```

### BudgetItem

Representa uma tattoo individual dentro do orcamento.

Campos conceituais:

- `id`;
- `budget_request_id`;
- `idea`;
- `body_location`;
- `style`;
- `size_hint`;
- `color_mode`;
- `detail_level`;
- `local_photo_asset_id`;
- `reference_asset_ids`;
- `status`.

Regra:

```text
troca de ideia nao apaga item anterior automaticamente. O bot deve confirmar se substitui ou soma.
```

### BudgetSession

Representa uma sessao de uma tattoo quando o tatuador orca por etapas.

Campos conceituais:

- `id`;
- `budget_item_id`;
- `session_number`;
- `description`;
- `price_amount`;
- `currency`;
- `estimated_duration_minutes`;

Regra:

```text
orcamento pode ser por item unico ou por sessoes. Ambos precisam gerar resposta agregada.
```

### BudgetQuote

Representa o retorno do tatuador.

Campos conceituais:

- `id`;
- `budget_request_id`;
- `artist_user_id`;
- `quote_type`;
- `total_amount`;
- `currency`;
- `items`;
- `notes`;
- `created_at`.

Tipos:

- `single_total`;
- `per_item`;
- `per_session`;
- `custom`;

Regra:

```text
Telegram deve coletar valores estruturados, nao texto solto impossivel de reconciliar.
```

### Proposal

Representa a proposta enviada ao cliente.

Campos conceituais:

- `id`;
- `budget_quote_id`;
- `conversation_id`;
- `message_text`;
- `status`;
- `sent_at`;

Estados:

- `draft`;
- `sent`;
- `accepted`;
- `rejected`;
- `needs_review`.

Regra:

```text
resposta ao cliente deve conter intro, valores e CTA quando houver quote valida.
```

### Appointment

Representa agendamento.

Campos conceituais:

- `id`;
- `tenant_id`;
- `client_contact_id`;
- `budget_request_id`;
- `start_at`;
- `end_at`;
- `status`;
- `deposit_payment_id`.

Estados:

- `offered`;
- `reserved`;
- `confirmed`;
- `rescheduled`;
- `cancelled`;
- `completed`;

### Payment

Representa pagamento, assinatura ou sinal.

Campos conceituais:

- `id`;
- `tenant_id`;
- `payment_provider`;
- `provider_payment_id`;
- `payment_type`;
- `status`;
- `amount`;
- `currency`;
- `related_entity_type`;
- `related_entity_id`;
- `created_at`;
- `updated_at`.

Tipos:

- `subscription`;
- `deposit`;
- `one_off`.

Estados:

- `pending`;
- `approved`;
- `rejected`;
- `refunded`;
- `cancelled`;
- `chargeback`;

### Entitlement

Representa permissao de uso por plano/status.

Campos conceituais:

- `tenant_id`;
- `feature_key`;
- `allowed`;
- `limit`;
- `reason`;

Regra:

```text
bot, painel e onboarding consultam entitlement, nao status de pagamento cru.
```

### ConsentRecord

Representa consentimento/registro legal.

Campos conceituais:

- `id`;
- `tenant_id`;
- `client_contact_id`;
- `purpose`;
- `legal_basis`;
- `status`;
- `source`;
- `created_at`;
- `revoked_at`.

Regra:

```text
mensageria, retencao e uso de dados precisam ser rastreaveis.
```

### DataSubjectRequest

Representa pedido LGPD.

Campos conceituais:

- `id`;
- `tenant_id`;
- `client_contact_id`;
- `request_type`;
- `status`;
- `requested_at`;
- `resolved_at`.

Tipos:

- `access`;
- `export`;
- `delete`;
- `correct`;
- `revoke_consent`;

### AuditEvent

Representa evento auditavel.

Campos conceituais:

- `id`;
- `tenant_id`;
- `actor_type`;
- `actor_id`;
- `action`;
- `entity_type`;
- `entity_id`;
- `risk_level`;
- `metadata`;
- `created_at`.

Regra:

```text
mudanca sensivel no painel, billing, tenant config e workflow precisa AuditEvent.
```

### DecisionEvent

Representa decisao do bot/runtime.

Campos conceituais:

- `trace_id`;
- `tenant_id`;
- `conversation_id`;
- `turn_id`;
- `router_intent`;
- `router_confidence`;
- `router_reason`;
- `policy_decision`;
- `workflow_from`;
- `workflow_to`;
- `resolver`;
- `media_classification`;
- `side_effects`;
- `response_summary`;
- `created_at`.

Regra:

```text
toda resposta relevante do bot precisa ser explicavel por DecisionEvent.
```

## Contratos De Estado

### Conversation State

Estados permitidos:

```text
new
collecting_tattoo
collecting_registration
waiting_artist
quoting
waiting_client
scheduling
waiting_deposit
closed_won
closed_lost
human_handoff
paused
```

Transicao valida somente por:

- `WorkflowManager`;
- job administrativo auditado;
- acao humana auditada.

### Budget State

Estados permitidos:

```text
draft
collecting
ready_for_artist
waiting_artist
quoted
sent_to_client
accepted
declined
expired
```

### Tenant State

Estados permitidos:

```text
draft
trial
active
past_due
suspended
cancelled
deleted
```

## Contratos Entre Modulos

### Bot Runtime -> Tenant Config

Entrada:

- `tenant_id`;
- `conversation_id`;
- `turn_context`.

Saida:

- `effective_config`;
- `config_version`;
- `config_snapshot_summary`.

Regra:

```text
bot nunca consulta JSON cru sem validacao.
```

### Bot Runtime -> Workflow

Entrada:

- estado atual;
- intent;
- policy decision;
- dados extraidos;
- risco.

Saida:

- estado final;
- transicao aplicada ou bloqueada;
- motivo;
- efeitos colaterais permitidos.

### Bot Runtime -> Observability

Entrada:

- TurnContext;
- decisoes;
- resposta;
- side effects.

Saida:

- `DecisionEvent`;
- `trace_id`.

### Telegram -> Budget

Entrada:

- callback ou texto do tatuador;
- referencia de BudgetRequest;
- valores estruturados;
- observacoes.

Saida:

- `BudgetQuote`;
- `Proposal` pronta ou `needs_review`.

Regra:

```text
se houver N itens, a resposta deve mapear valor para cada item ou pedir correcao estruturada.
```

### Panel -> Tenant Config

Entrada:

- usuario autenticado;
- patch de config;
- config version atual.

Saida:

- config validada;
- nova versao;
- AuditEvent.

Regra:

```text
painel nao salva configuracao que o bot nao sabe interpretar.
```

### Billing -> Entitlements

Entrada:

- eventos Mercado Pago;
- plano;
- status de assinatura.

Saida:

- entitlements atualizados;
- AuditEvent;
- notificacao quando aplicavel.

## Contratos De Validacao

| Contrato | Teste Minimo |
| --- | --- |
| Entidades de dominio | Unit + contract |
| TenantConfig | Contract + fixtures |
| Workflow state | Unit + transition table |
| Budget multi-item | Unit + Telegram integration |
| Budget multi-session | Unit + Telegram integration + WhatsApp real proposta |
| Media classification | Eval media + WhatsApp real media |
| DecisionEvent | Unit + smoke evidence |
| Billing entitlement | Unit + integration mock/sandbox |
| LGPD data flow | Checklist + retention/export/delete tests |
| Panel config patch | Component/e2e + contract |

## Fora Do Contrato Nesta Fase

Ainda nao definir:

- stack final do painel;
- tecnologia exata de monorepo;
- migrations finais;
- design visual;
- implementacao de componentes;
- secrets reais;
- cutover.

Esses pontos dependem de:

- `07-tenant-config-contract.md`;
- `08-data-governance-contract.md`;
- `09-test-strategy-contract.md`;
- `10-decisao-stack-novo-repo.md`.

## Proximo Artefato

Criar:

```text
07-tenant-config-contract.md
```

Objetivo:

- detalhar o contrato de configuracao do estudio;
- preparar o primeiro dominio implementavel no novo repo;
- garantir que bot e painel usem a mesma fonte de verdade.

