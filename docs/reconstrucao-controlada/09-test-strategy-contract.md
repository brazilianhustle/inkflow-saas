# Test Strategy Contract

Data: 2026-05-27

Objetivo: definir a estrategia de testes da futura plataforma InkFlow antes de criar o novo repo.

Este contrato garante que cada frente tenha validacao proporcional ao risco, sem falsa sensacao de seguranca e sem substituir conversa real por teste artificial quando o comportamento e conversacional.

## Regra Central

```text
unit testa regra.
contract testa fronteira.
integration testa costura.
HTTP smoke testa radar.
WhatsApp real testa conversa.
Telegram real testa handoff/orcamento.
security gate testa dano.
```

Nenhum slice conversacional pode ser considerado concluido apenas com HTTP production smoke.

## Niveis De Teste

### Unit

Proposito:

- validar funcao/regra isolada;
- rodar rapido;
- detectar regressao local.

Obrigatorio para:

- dominio;
- policy;
- workflow;
- pricing;
- redaction;
- tenant config;
- media classification deterministica.

Nao prova:

- conversa real;
- integracao externa;
- timing de WhatsApp;
- Telegram real;
- UX do painel.

### Contract

Proposito:

- validar schema e fronteira entre modulos;
- impedir payload ambiguo;
- garantir nomes canonicos.

Obrigatorio para:

- TenantConfig;
- BudgetRequest/BudgetItem/BudgetSession;
- DecisionEvent;
- DataSubjectRequest;
- webhook payload;
- panel config patch;
- Telegram callback.

Nao prova:

- qualidade de resposta do bot;
- provedor externo real;
- deploy.

### Integration

Proposito:

- validar costura entre modulos com mock/sandbox;
- testar side effects esperados.

Obrigatorio para:

- billing;
- Telegram callback;
- Evolution gateway mock;
- Supabase repository;
- notification service;
- onboarding provisioning.

Nao substitui:

- WhatsApp real;
- Telegram real quando o humano precisa interagir;
- security review.

### HTTP Production Smoke

Proposito:

- radar inicial de producao;
- validar endpoint, deploy e regressao grosseira;
- acelerar ciclo antes do teste real.

Uso correto:

```text
primeiro sinal -> nunca prova final de conversa
```

Obrigatorio para:

- bot endpoint;
- webhook path;
- scenario rapido antes do WhatsApp real;
- health check pos-deploy.

Nao pode:

- fechar comportamento conversacional sozinho;
- substituir envio central -> bot;
- substituir prova visual/transcript real.

### WhatsApp Real

Proposito:

- validar a conversa como usuario final realmente vive;
- testar batching, delay, contexto, continuidade, midia e resposta real.

Obrigatorio quando a mudanca tocar:

- resposta do bot;
- fluxo de coleta;
- router/policy/workflow conversacional;
- media recebida pelo WhatsApp;
- orcamento ao cliente;
- naturalidade;
- retomada de conversa;
- multiplas bolhas;
- mudanca de ideia;
- handoff percebido pelo cliente.

Requisitos minimos:

- envio pela instancia real configurada;
- recebimento pelo bot real;
- transcript Cliente/Bot;
- evidence summary curto;
- DecisionEvent ou log equivalente;
- criterio PASS/FAIL explicito.

Prova curta padrao para reportar:

```text
Provas conclusivas reais:
Cliente: "..."
Bot: "..."
Resultado: PASS/FAIL - motivo.
```

### Telegram Real

Proposito:

- validar handoff/orcamento com tatuador;
- provar que mensagem chegou e callback funciona.

Obrigatorio quando tocar:

- handoff humano;
- orcamento;
- multiplos itens;
- multiplas sessoes;
- resposta de valor pelo tatuador;
- recusa/aprovacao;
- envio de midia ao tatuador.

Requisitos:

- mensagem Telegram real;
- trace/ref visivel;
- callback ou resposta processada;
- resposta final coerente ao cliente quando aplicavel.

### Eval / Prompt

Proposito:

- avaliar naturalidade, invariantes e comportamento semantico;
- proteger prompt de regressao;
- simular casos amplos.

Obrigatorio para:

- prompt premium;
- naturalidade;
- intents laterais;
- media reasoning;
- policy language.

Nao substitui:

- WhatsApp real em fluxo conversacional;
- unit/contract para regra critica.

### Security Gate

Proposito:

- impedir dano operacional;
- validar auth, RLS, secrets, headers e permissoes.

Obrigatorio para:

- auth/RBAC;
- Supabase;
- admin;
- billing;
- webhooks;
- dados/LGPD;
- deploy/infra.

## Matriz Por Tipo De Mudanca

| Tipo De Mudanca | Unit | Contract | Integration | HTTP Smoke | WhatsApp Real | Telegram Real | Security |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dominio puro | Obrigatorio | Obrigatorio | Opcional | Nao | Nao | Nao | Nao |
| Tenant Config | Obrigatorio | Obrigatorio | Fixture | Nao | Se afetar bot | Nao | Redaction |
| Workflow | Obrigatorio | Obrigatorio | Opcional | Obrigatorio | Obrigatorio se conversa | Se handoff | Nao |
| Router/Policy | Obrigatorio | Obrigatorio | Opcional | Obrigatorio | Obrigatorio | Nao | Nao |
| Media Intelligence | Obrigatorio | Obrigatorio | Eval media | Obrigatorio | Obrigatorio | Se envia Telegram | Redaction |
| Budget/Proposal | Obrigatorio | Obrigatorio | Obrigatorio | Obrigatorio | Obrigatorio | Obrigatorio | Nao |
| Telegram/Handoff | Obrigatorio | Obrigatorio | Obrigatorio | Opcional | Se cliente percebe | Obrigatorio | Nao |
| Billing | Obrigatorio | Obrigatorio | Obrigatorio | Opcional | Nao | Nao | Obrigatorio |
| Supabase/Schema | Obrigatorio se lib | Obrigatorio | Migration test | Nao | Nao | Nao | Obrigatorio |
| Painel | Obrigatorio | Obrigatorio | E2E/component | Nao | Nao | Nao | RBAC |
| Onboarding | Obrigatorio | Obrigatorio | Obrigatorio | Obrigatorio | Se provisiona WA | Nao | Obrigatorio |
| Legal/Data | Obrigatorio | Obrigatorio | Operational | Nao | Nao | Nao | Obrigatorio |
| Deploy/Infra | Nao | Opcional | Health | Obrigatorio | Nao | Nao | Obrigatorio |
| Docs only | Nao | Nao | Nao | Nao | Nao | Nao | Nao |

## Gates De Promocao

### Gate A - Docs/Arquitetura

Pode fechar com:

- revisao de escopo;
- links de retomada;
- changelog;
- commit limpo.

Nao exige:

- tests;
- deploy;
- smoke.

### Gate B - Dominio Sem Side Effect

Pode fechar com:

- unit;
- contract;
- fixtures;
- docs.

Nao exige:

- WhatsApp real;
- Telegram real.

### Gate C - Integracao Mockada/Sandbox

Pode fechar com:

- unit;
- contract;
- integration;
- logs de teste;
- rollback local.

Exige security se envolver auth, dados, billing ou webhooks.

### Gate D - Conversa Real

Pode fechar somente com:

- unit/contract relevantes;
- HTTP radar;
- WhatsApp real;
- transcript;
- evidence summary;
- julgamento PASS/FAIL;
- DecisionEvent/logs quando disponivel.

### Gate E - Handoff/Orcamento Real

Pode fechar somente com:

- unit/contract;
- integration;
- Telegram real;
- WhatsApp real se cliente recebe resposta;
- trace/ref;
- prova de mensagem agregada quando houver multiplos itens/sessoes.

### Gate F - Security/Compliance

Pode fechar somente com:

- auth/RBAC/RLS/secrets checks;
- redaction;
- audit event;
- negative tests;
- rollback/incident note quando aplicavel.

## Regra De Evidencia

Toda frente deve produzir evidencia proporcional.

Formato minimo:

```text
Scope:
Arquivos:
Gate:
Validacoes:
Resultado:
Risco residual:
Provas conclusivas reais: quando aplicavel
```

Para WhatsApp real:

```text
Cliente: "mensagem enviada"
Bot: "resposta recebida"
Resultado: PASS/FAIL
```

Para Telegram real:

```text
Telegram: "trecho da mensagem"
Callback/Resposta: "acao processada"
Resultado: PASS/FAIL
```

## Stop Conditions

Parar imediatamente se:

- HTTP smoke passou, mas WhatsApp real falhou;
- bot reiniciou contexto como conversa nova sem motivo;
- resposta real contradiz policy;
- Telegram duplicou orcamento;
- media classification alucinou em caso claro;
- estado mudou sem WorkflowManager;
- dado sensivel apareceu em log;
- teste exige secret nao documentado;
- deploy seria necessario para docs/contrato;
- evidencia nao consegue provar o PASS.

## Politica De Micro Slice

Micro slice continua valido quando:

- altera superficie pequena;
- risco e isolado;
- gate e claro;
- evidencia e curta;
- rollback e simples.

Micro slice deve ser agrupado em slice maior quando:

- 3 ou mais micro slices tocam mesmo contrato sem mudar risco;
- todos usam mesma matriz de teste;
- nao ha falhas recentes;
- WhatsApp real permanece obrigatorio no final do agrupamento;
- contexto/handoff esta documentado.

Nao agrupar quando:

- houver regressao recente;
- tocar billing/dados/security;
- envolver media intelligence nova;
- envolver Telegram/orcamento novo;
- conversa real ainda nao foi provada.

## Politica Para Reconstrucao Controlada

Enquanto estiver em fase docs/contratos:

- nao rodar tests;
- nao rodar smoke;
- nao rodar deploy;
- nao mexer em secrets;
- commitar apenas docs.

Quando novo repo existir:

- primeiro CI deve testar apenas scaffold;
- primeiro dominio implementavel deve ser Tenant Config;
- primeiro gate funcional deve ser Unit + Contract;
- WhatsApp real so entra quando bot runtime ou gateway for implementado.

## Ordem Recomendada De Testes No Futuro Novo Repo

1. `unit`;
2. `contract`;
3. `fixtures`;
4. `integration`;
5. `security`;
6. `eval`;
7. `HTTP smoke`;
8. `WhatsApp real`;
9. `Telegram real`;
10. `evidence summary`.

Nem todo slice usa todos os niveis. A matriz decide.

## Criterio De Pronto Do Contrato

Este contrato esta pronto quando:

- tipos de teste estao definidos;
- matriz por mudanca esta definida;
- WhatsApp real esta preservado como prova definitiva;
- Telegram real esta preservado para handoff/orcamento;
- stop conditions estao claras;
- docs-only nao exige execucao desnecessaria;
- proximo passo pode decidir stack/repo novo sem lacuna metodologica.

## Proximo Artefato

Criar:

```text
10-decisao-stack-novo-repo.md
```

Objetivo:

- decidir stack e formato do novo repo;
- comparar opcoes;
- definir primeiro slice mecanico;
- garantir que criar repo novo seja reversivel e sem impacto na producao atual.

