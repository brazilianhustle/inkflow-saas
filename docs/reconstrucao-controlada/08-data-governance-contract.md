# Data Governance Contract

Data: 2026-05-27

Objetivo: definir o contrato de governanca de dados, privacidade e LGPD para o futuro InkFlow Platform antes de criar o novo repo.

Este documento nao substitui revisao juridica. Ele define requisitos tecnicos e operacionais que o SaaS deve suportar para tratar dados pessoais com rastreabilidade, minimizacao e controle.

Referencias de base:

- LGPD / Lei 13.709/2018;
- ANPD: direitos dos titulares;
- ANPD: agentes de tratamento e encarregado;
- ANPD: seguranca e incidentes;
- WhatsApp Business Platform: consentimento, opt-out e qualidade de mensagens;
- OWASP ASVS: seguranca, logging e protecao de dados.

## Regra Central

```text
dado pessoal nao e apenas campo de banco; e ativo operacional com finalidade, acesso, retencao e direito do titular.
```

Nenhuma frente do novo repo deve tratar dados pessoais sem declarar:

- categoria;
- finalidade;
- base/razao operacional;
- origem;
- destino;
- retencao;
- acesso;
- exclusao/exportacao;
- observabilidade segura.

## Papeis De Tratamento

### InkFlow

Papel esperado:

```text
operador ou controlador conforme desenho contratual final.
```

Decisao pendente:

- definir juridicamente se InkFlow atua como operador do estudio para dados dos clientes finais;
- definir quando InkFlow atua como controlador para dados do proprio cliente SaaS, billing, suporte e marketing.

Regra tecnica:

```text
o sistema deve suportar separacao entre dados do estudio, dados do cliente final e dados internos do InkFlow.
```

### Estudio/Tatuador

Papel esperado:

```text
controlador dos dados dos clientes finais atendidos pelo estudio.
```

Responsabilidades operacionais no produto:

- configurar atendimento;
- responder pedidos sensiveis quando necessario;
- receber dados minimos para orcamento;
- respeitar politicas de uso e privacidade.

### Suboperadores

Categorias:

- Cloudflare;
- Supabase;
- Evolution/VPS;
- OpenAI;
- Telegram;
- Mercado Pago;
- email/marketing provider;
- observabilidade/analytics quando ativado.

Regra:

```text
lista de suboperadores deve estar documentada e refletir ferramentas reais em uso.
```

## Categorias De Dados

### Dados Do Tenant

Exemplos:

- nome do estudio;
- nome/legal name do responsavel;
- email;
- telefone;
- endereco publico;
- cidade/estado;
- plano;
- status de assinatura;
- configuracoes operacionais.

Finalidade:

- prestar o servico SaaS;
- billing;
- suporte;
- provisionamento;
- comunicacao operacional.

Retencao inicial:

```text
enquanto conta ativa + periodo pos-cancelamento definido em politica.
```

### Dados Do StudioUser

Exemplos:

- nome;
- email;
- role;
- login;
- acoes administrativas;
- audit events.

Finalidade:

- autenticacao;
- autorizacao;
- auditoria;
- suporte.

Invariantes:

- roles controlam acesso;
- acoes sensiveis geram AuditEvent;
- logs nao devem expor segredo.

### Dados Do Cliente Final

Exemplos:

- telefone WhatsApp;
- nome;
- data de nascimento;
- email opcional;
- conversa;
- preferencias de tattoo;
- fotos enviadas;
- status de orcamento;
- agendamento.

Finalidade:

- atendimento do estudio;
- orcamento;
- agendamento;
- handoff humano;
- historico operacional.

Risco:

- fotos podem conter caracteristicas fisicas identificaveis;
- data de nascimento exige cuidado;
- conversa pode conter dados sensiveis espontaneos.

Invariantes:

- coletar apenas o necessario para atendimento;
- menoridade deve ter tratamento especial;
- foto deve ter classificacao e retencao;
- dados de um tenant nunca vazam para outro.

### Dados De Conversa

Exemplos:

- mensagens inbound/outbound;
- batch id;
- intents;
- estados;
- respostas do bot;
- anexos;
- traces.

Finalidade:

- continuidade do atendimento;
- auditoria de decisao;
- suporte;
- melhoria de qualidade quando permitido.

Retencao:

```text
definir por TenantConfig/legal_policy e politica global.
```

### Dados De Midia

Exemplos:

- fotos de local do corpo;
- referencias de desenho;
- fotos com tattoo existente;
- documentos enviados por engano.

Finalidade:

- avaliar orcamento;
- identificar local/referencia/cobertura;
- enviar briefing ao tatuador.

Invariantes:

- armazenar com escopo tenant/conversation;
- classificar tipo de midia;
- evitar logs com URL publica permanente;
- permitir exclusao conforme politica.

### Dados De Billing

Exemplos:

- plano;
- subscription id;
- payment id;
- status de pagamento;
- valores;
- datas de cobranca;
- eventos Mercado Pago.

Finalidade:

- cobrar assinatura;
- liberar entitlements;
- suporte financeiro;
- auditoria.

Invariantes:

- InkFlow nao deve armazenar dados de cartao;
- usar provedor de pagamento para dados financeiros sensiveis;
- eventos financeiros geram AuditEvent.

### Dados De Observabilidade

Exemplos:

- DecisionEvent;
- AuditEvent;
- health checks;
- errors;
- traces;
- smoke evidence summaries.

Finalidade:

- diagnostico;
- seguranca;
- qualidade;
- auditoria;
- rollback.

Invariantes:

- redaction obrigatorio;
- segredo nunca entra em log;
- snapshot de tenant config deve ser resumido;
- logs devem ser suficientes para explicar decisao sem expor dado excessivo.

### Dados De Marketing

Exemplos:

- email do tenant;
- status de lead;
- opt-in;
- origem de campanha;
- tags de lifecycle.

Finalidade:

- comunicacao comercial;
- onboarding;
- reativacao;
- relacionamento.

Invariantes:

- separar comunicacao operacional de marketing;
- opt-out deve ser respeitado;
- cliente final do estudio nao deve virar lead de marketing do InkFlow sem base apropriada.

## Inventario Minimo

| Categoria | Exemplos | Dono Operacional | Retencao Inicial | Exportavel | Excluivel |
| --- | --- | --- | --- | --- | --- |
| Tenant | estudio, plano, config | InkFlow | conta ativa + politica | Sim | Parcial/apos obrigacoes |
| StudioUser | nome, email, role | InkFlow | conta ativa + auditoria | Sim | Parcial |
| ClientContact | telefone, nome, nascimento | Estudio/InkFlow | politica tenant/global | Sim | Sim, salvo obrigacoes |
| Conversation | mensagens, estados | Estudio/InkFlow | politica tenant/global | Sim | Sim, salvo auditoria minima |
| MediaAsset | fotos/anexos | Estudio/InkFlow | menor possivel por finalidade | Sim | Sim |
| Budget | itens, valores, sessoes | Estudio/InkFlow | ciclo comercial + politica | Sim | Sim/parcial |
| Appointment | horarios, status | Estudio/InkFlow | ciclo agenda + politica | Sim | Sim/parcial |
| Payment | ids/status/valor | InkFlow/provedor | obrigacao fiscal/contratual | Sim | Limitado |
| AuditEvent | acoes sensiveis | InkFlow | seguranca/auditoria | Parcial | Limitado |
| DecisionEvent | traces de bot | InkFlow | qualidade/auditoria | Parcial | Reduzivel/anonimizavel |

## Direitos Do Titular

O sistema deve suportar fluxo para:

- confirmacao de tratamento;
- acesso;
- correcao;
- exportacao;
- exclusao;
- revogacao de consentimento quando aplicavel;
- informacao sobre compartilhamento/suboperadores;
- revisao de decisoes automatizadas quando aplicavel.

Entidade:

```text
DataSubjectRequest
```

Estados:

```text
received
validating_identity
in_progress
waiting_controller
completed
rejected
cancelled
```

Regra:

```text
pedido de cliente final pode exigir acao do estudio controlador. O produto precisa registrar isso.
```

## Retencao

Politica inicial recomendada para contrato tecnico:

| Dado | Retencao Tecnica Inicial |
| --- | --- |
| Conversa ativa | enquanto atendimento estiver aberto |
| Conversa encerrada | politica global/tenant, com prazo configuravel |
| Fotos de briefing | prazo minimo necessario para orcamento/agendamento |
| DecisionEvent | prazo operacional para auditoria e melhoria |
| AuditEvent | prazo maior por seguranca e accountability |
| Billing | conforme obrigacoes contratuais/fiscais |
| Marketing | ate opt-out ou fim da finalidade |

Regra:

```text
retencao precisa virar job, nao promessa em termos.
```

## Consentimento E Opt-Out

Separar:

- atendimento operacional via WhatsApp;
- notificacoes transacionais;
- marketing do InkFlow;
- marketing do estudio.

Requisitos:

- registrar origem do consentimento quando aplicavel;
- registrar opt-out;
- impedir mensagem de marketing sem base apropriada;
- manter canal de solicitacao de direitos.

## Decisoes Automatizadas

O bot pode:

- classificar intent;
- coletar dados;
- responder perguntas;
- montar briefing;
- encaminhar ao tatuador;
- sugerir proximo passo.

O bot nao deve, sem regra explicita:

- tomar decisao financeira final fora da policy;
- aceitar caso sensivel sem handoff;
- ignorar pedido humano;
- tratar menoridade como lead comum;
- usar dado para finalidade nova sem base.

Regra:

```text
DecisionEvent deve permitir explicar criterios principais da resposta automatizada.
```

## Suboperadores E Compartilhamento

Cada integracao deve registrar:

- nome do fornecedor;
- finalidade;
- tipo de dado enviado;
- se armazena dado;
- regiao/transferencia quando conhecido;
- base contratual;
- link de politica;
- status ativo/inativo.

Exemplos:

- OpenAI: interpretacao/geracao;
- Supabase: banco/storage;
- Cloudflare: hosting/edge;
- Evolution/VPS: gateway WhatsApp;
- Telegram: notificacao interna ao tatuador;
- Mercado Pago: pagamentos;
- Mailer/marketing provider: lifecycle email.

## Seguranca Minima

Controles obrigatorios:

- RLS por tenant;
- RBAC no painel;
- secrets fora do repo;
- redaction de logs;
- audit trail;
- rate limiting onde aplicavel;
- backup/restore;
- incident runbook;
- least privilege para service keys;
- separacao de ambientes.

## Incidentes

Evento de incidente deve registrar:

- `incident_id`;
- tipo;
- descoberta;
- sistemas afetados;
- categorias de dados afetadas;
- tenants afetados;
- medidas de contencao;
- avaliacao de risco;
- comunicacoes necessarias;
- resolucao;
- acoes preventivas.

Estados:

```text
detected
triage
contained
investigating
notified_if_required
resolved
postmortem_done
```

Regra:

```text
incidente com risco relevante exige fluxo de comunicacao e registro, nao apenas log tecnico.
```

## Contrato Com TenantConfig

`TenantConfig.legal_policy` deve apontar para:

- `privacy_policy_version`;
- `terms_version`;
- `data_retention_days`;
- `consent_required`;
- `marketing_opt_in_required`;
- `data_subject_request_channel`.

Regra:

```text
bot e painel devem respeitar legal_policy quando coletarem, responderem ou reterem dados.
```

## Testes Obrigatorios

### Unit

- redaction remove telefone quando nivel strict;
- redaction remove secrets sempre;
- retention calcula vencimento;
- DataSubjectRequest muda estado corretamente;
- opt-out bloqueia marketing;
- DecisionEvent nao carrega payload bruto sensivel.

### Contract

- exportacao inclui dados do titular por tenant;
- exclusao remove/anonimiza dados permitidos;
- AuditEvent limitado nao e apagado indevidamente;
- media asset e removivel por politica;
- TenantConfig legal_policy valida.

### Security

- RLS impede acesso cross-tenant;
- role sem permissao nao exporta dados;
- service key nao aparece em log;
- webhook invalido nao cria dado pessoal.

### Operational

- job de retencao simulado;
- incidente fake percorre estados;
- suboperator registry esta atualizado;
- privacy/terms version aparece no tenant.

## Fora De Escopo Nesta Fase

Ainda nao definir:

- texto final de Politica de Privacidade;
- texto final de Termos;
- parecer juridico;
- prazo definitivo de retencao;
- contrato comercial final;
- DPA final com clientes;
- implementacao tecnica.

Esses itens exigem revisao juridica e decisao de produto.

## Proximo Artefato

Criar:

```text
09-test-strategy-contract.md
```

Objetivo:

- definir estrategia de testes da plataforma;
- preservar WhatsApp real como validacao definitiva;
- separar unit, contract, integration, eval, real smoke e security gate.

