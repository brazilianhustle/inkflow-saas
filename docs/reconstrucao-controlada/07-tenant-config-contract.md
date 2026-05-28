# Tenant Config Contract

Data: 2026-05-27

Objetivo: definir o contrato de configuracao do estudio usado por painel, bot, billing, legal, observabilidade e testes.

Este contrato substitui a ideia de JSON livre como fonte de regra operacional. A configuracao deve ser versionada, validada e consumida do mesmo jeito por todos os modulos.

## Regra Central

```text
Painel escreve TenantConfig.
Bot le TenantConfig.
Testes validam TenantConfig.
Observabilidade registra snapshot seguro de TenantConfig.
```

Nenhuma regra premium deve ficar escondida apenas em prompt, HTML ou campo JSON sem schema.

## Estrutura Canonica

```text
TenantConfig
  schema_version
  identity
  voice_policy
  service_policy
  style_policy
  pricing_policy
  schedule_policy
  handoff_policy
  channel_policy
  legal_policy
  automation_flags
  observability_policy
```

## Campos Raiz

### `schema_version`

Tipo conceitual:

```text
string
```

Valor inicial:

```text
tenant_config_v1
```

Regra:

```text
toda mudanca incompativel exige nova versao e migracao declarada.
```

### `identity`

Define quem e o estudio.

Campos:

- `studio_display_name`;
- `studio_legal_name`;
- `city`;
- `state`;
- `country`;
- `timezone`;
- `public_address`;
- `private_notes`;

Regras:

- `studio_display_name` e obrigatorio para painel.
- `timezone` e obrigatorio para agenda.
- `private_notes` nunca entra em prompt do cliente.

### `voice_policy`

Define como o bot fala.

Campos:

- `assistant_name`;
- `tone`;
- `formality`;
- `emoji_policy`;
- `greeting_policy`;
- `brevity_level`;
- `forbidden_phrases`;
- `preferred_phrases`;

Valores recomendados:

```text
tone: friendly | direct | premium | neutral
formality: informal | balanced | formal
emoji_policy: none | restrained | expressive
greeting_policy: first_contact_only | every_new_flow | never
brevity_level: short | medium | detailed
```

Invariantes:

- saudacao completa nao deve repetir em conversa continua;
- bot nao deve soar como formulario quando o cliente manda contexto rico;
- linguagem pode variar, mas regra operacional nao depende de estilo textual.

### `service_policy`

Define o que o estudio atende.

Campos:

- `accepted_services`;
- `rejected_services`;
- `cover_up_policy`;
- `minor_policy`;
- `body_area_policy`;
- `requires_artist_review_services`;

Valores de `accepted_services`:

- `tattoo`;
- `cover_up`;
- `retouch`;
- `piercing`;
- `consultation`;

`cover_up_policy`:

```text
accepted | artist_review | rejected
```

`minor_policy`:

```text
accepted_with_guardian | rejected | artist_review
```

Invariantes:

- cobertura nao e sempre handoff; depende de policy;
- menoridade explicita nunca deve seguir como orcamento normal sem regra definida;
- servico recusado deve gerar resposta segura ou handoff, nao coleta cega.

### `style_policy`

Define estilos aceitos, recusados e foco comercial.

Campos:

- `accepted_styles`;
- `rejected_styles`;
- `focus_styles`;
- `out_of_catalog_behavior`;
- `style_question_policy`;

`out_of_catalog_behavior`:

```text
allow | ask_artist | reject
```

`style_question_policy`:

```text
ask_when_missing | infer_if_clear | optional
```

Invariantes:

- por padrao, todos os estilos sao aceitos se nao houver rejeicao explicita;
- `focus_styles` nao significa bloqueio;
- estilo recusado deve ser tratado por policy, nao por alucinacao do modelo;
- bot nao deve inventar que realismo nao esta no foco se nao houver config recusando ou bloqueando.

### `pricing_policy`

Define como o orcamento deve ser tratado.

Campos:

- `pricing_mode`;
- `currency`;
- `deposit_policy`;
- `budget_item_policy`;
- `session_pricing_policy`;
- `max_auto_quote_amount`;
- `artist_review_thresholds`;

`pricing_mode`:

```text
artist_quote_only | auto_estimate | hybrid
```

`budget_item_policy`:

```text
single_item | multi_item_allowed
```

`session_pricing_policy`:

```text
single_total | per_item | per_session | artist_decides
```

Invariantes:

- multiplas tattoos devem ser BudgetItems, nao conversas separadas;
- varias sessoes devem ser BudgetSessions, nao texto solto;
- resposta ao cliente deve agregar valores quando pertencem ao mesmo BudgetRequest;
- bot nao deve dar valor final se policy exigir artista.

### `schedule_policy`

Define agenda.

Campos:

- `working_hours`;
- `blocked_dates`;
- `appointment_duration_defaults`;
- `booking_mode`;
- `reschedule_policy`;
- `timezone`;

`booking_mode`:

```text
manual | assisted | automatic
```

Invariantes:

- agenda nao pode usar timezone implicito;
- booking automatico exige entitlement e configuracao completa;
- remarcacao precisa regra clara antes de virar fluxo automatico.

### `handoff_policy`

Define quando humano entra.

Campos:

- `handoff_triggers`;
- `risk_triggers`;
- `artist_review_triggers`;
- `human_summary_template`;
- `auto_resume_policy`;

Triggers canonicos:

- `minor_age`;
- `cover_up`;
- `aggressive_client`;
- `confused_client`;
- `financial_risk`;
- `out_of_scope_service`;
- `artist_required`;
- `manual_request`;

Invariantes:

- handoff deve gerar resumo operacional;
- handoff nao deve criar orcamento falso;
- handoff nao deve apagar contexto;
- se for orcamento de multiplos itens, Telegram precisa explicitar cada item.

### `channel_policy`

Define canais e provedores.

Campos:

- `whatsapp`;
- `telegram`;
- `email`;
- `internal_alerts`;

`whatsapp`:

- `provider`;
- `instance_name`;
- `phone_number`;
- `webhook_status`;
- `central_instance_allowed`;

`telegram`:

- `artist_chat_id`;
- `alerts_chat_id`;
- `callback_mode`;

Invariantes:

- dados sensiveis de credenciais nao fazem parte do config publico;
- painel pode exibir status, mas nao segredo;
- bot nao deve depender de chat id ausente sem fallback.

### `legal_policy`

Define regras de dados e consentimento.

Campos:

- `privacy_policy_version`;
- `terms_version`;
- `data_retention_days`;
- `consent_required`;
- `marketing_opt_in_required`;
- `data_subject_request_channel`;

Invariantes:

- retencao precisa ser conhecida;
- uso de dados para atendimento e marketing devem ser separados;
- opt-out precisa ser respeitado onde aplicavel;
- termos/politica devem refletir ferramentas reais em uso.

### `automation_flags`

Define capacidade de automacao.

Campos:

- `bot_enabled`;
- `auto_handoff_enabled`;
- `auto_quote_enabled`;
- `auto_booking_enabled`;
- `real_whatsapp_validation_required`;
- `artist_reply_aggregation_enabled`;

Invariantes:

- flag nao substitui entitlement;
- fluxo conversacional premium deve manter WhatsApp real como gate quando alterado;
- automacao financeira precisa limite e audit event.

### `observability_policy`

Define o que registrar.

Campos:

- `decision_logging_enabled`;
- `tenant_snapshot_logging`;
- `media_classification_logging`;
- `telegram_trace_enabled`;
- `redaction_level`;

`redaction_level`:

```text
minimal | standard | strict
```

Invariantes:

- snapshot de config em logs nao deve vazar listas sensiveis ou secrets;
- logs precisam explicar decisao sem expor dados desnecessarios;
- toda mudanca relevante de config deve gerar AuditEvent.

## Defaults MVP

Config padrao para novo tenant:

```text
schema_version = tenant_config_v1
voice_policy.tone = friendly
voice_policy.formality = informal
voice_policy.greeting_policy = first_contact_only
service_policy.accepted_services = [tattoo]
service_policy.cover_up_policy = artist_review
service_policy.minor_policy = artist_review
style_policy.accepted_styles = []
style_policy.rejected_styles = []
style_policy.focus_styles = []
style_policy.out_of_catalog_behavior = allow
pricing_policy.pricing_mode = artist_quote_only
pricing_policy.budget_item_policy = multi_item_allowed
pricing_policy.session_pricing_policy = artist_decides
schedule_policy.booking_mode = manual
automation_flags.bot_enabled = true
automation_flags.auto_quote_enabled = false
automation_flags.auto_booking_enabled = false
automation_flags.artist_reply_aggregation_enabled = true
observability_policy.decision_logging_enabled = true
observability_policy.redaction_level = standard
```

Regra importante:

```text
lista vazia de accepted_styles nao significa "nenhum estilo aceito"; significa "sem restricao declarada".
```

## Snapshot Seguro Para O Bot

O bot nao precisa receber tudo.

Snapshot permitido:

- `schema_version`;
- `studio_display_name`;
- resumo de voz;
- servicos aceitos/recusados;
- cobertura/minoridade;
- estilos aceitos/recusados/foco como resumo;
- pricing mode;
- handoff triggers;
- automation flags relevantes;
- observability policy relevante.

Snapshot proibido:

- secrets;
- tokens;
- chat ids completos em prompt;
- private notes;
- informacoes legais internas;
- dados de outros tenants.

## Snapshot Para Observabilidade

Evento de decisao deve registrar:

- `tenant_config_version`;
- `tenant_config_source`;
- `service_policy_summary`;
- `style_policy_summary`;
- `pricing_policy_summary`;
- `handoff_policy_summary`;
- `automation_flags_summary`;

Regra:

```text
log deve indicar a regra usada, nao necessariamente a lista completa.
```

## Invariantes Globais

- TenantConfig deve validar antes de salvar.
- Painel nao salva campo desconhecido sem migracao.
- Bot nao le config sem `schema_version`.
- Prompt nao e fonte primaria de regra.
- Entitlement pode bloquear feature mesmo se flag estiver ativa.
- Alteracao de config sensivel gera AuditEvent.
- Toda mudanca de config que afeta atendimento exige teste de contrato.

## Testes Obrigatorios

### Unit

- defaults validos;
- style policy com lista vazia aceita todos;
- estilo recusado bloqueia ou aciona behavior correto;
- focus style nao bloqueia;
- cover up respeita policy;
- budget multi-item permitido por default;
- session pricing aceita artist_decides;
- redaction remove secrets.

### Contract

- painel gera TenantConfig valido;
- bot consome snapshot derivado;
- config invalida falha com erro claro;
- unknown field falha ou entra em migration path;
- schema_version obrigatorio.

### Fixture

Fixtures obrigatorias:

- `tenant_default_tattoo_studio`;
- `tenant_style_restricted`;
- `tenant_cover_up_artist_review`;
- `tenant_auto_booking_disabled`;
- `tenant_multi_item_budget`;
- `tenant_strict_observability_redaction`.

### Smoke Futuro

Quando houver implementacao funcional:

- alteracao de estilo no painel deve refletir no bot;
- estilo aceito nao deve ser recusado;
- estilo recusado deve seguir policy;
- multiplas tattoos devem virar BudgetItems;
- valores de multiplos itens devem voltar agregados;
- snapshot observavel deve explicar regra aplicada.

## Criterio De Pronto

Este contrato fica pronto para virar codigo quando:

- todos os blocos tiverem schema;
- defaults estiverem definidos;
- invariantes estiverem testaveis;
- redaction estiver definida;
- fixtures estiverem listadas;
- relacao com entitlements estiver clara;
- nenhum campo depender de prompt para ter significado.

## Proximo Artefato

Criar:

```text
08-data-governance-contract.md
```

Objetivo:

- definir inventario de dados;
- mapear finalidade, retencao e direitos do titular;
- preparar base legal/LGPD antes do repo novo.
