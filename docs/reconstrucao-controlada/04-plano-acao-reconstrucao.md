# Plano De Acao - Reconstrucao Controlada

Data: 2026-05-27

Objetivo: transformar o mapa de extracao e a arquitetura alvo em uma sequencia executavel, sem contaminar o repo atual, sem quebrar producao e sem criar um novo repo antes dos gates corretos.

## Doutrina De Avanco

Esta reconstrucao nao deve ser um "big bang".

Linha correta:

```text
inventariar -> decidir contratos -> criar novo repo -> importar vault curado -> criar base testavel -> migrar por dominio -> validar -> cutover controlado
```

Cada fase deve produzir um artefato versionado. Nenhuma fase avanca por sensacao.

## Fase 0 - Controle Do Terreno

Status: em andamento.

Objetivo: garantir que a frente esteja rastreavel e isolada.

Escopo:

- criar trilha `docs/reconstrucao-controlada/`;
- registrar handoff;
- registrar mapa de extracao;
- registrar arquitetura alvo;
- registrar governanca/versionamento;
- registrar plano de acao.

Fora de escopo:

- codigo;
- deploy;
- secrets;
- smoke real;
- migrations;
- criacao do novo repo.

Criterio de pronto:

- arquivos de retomada existem;
- changelog atualizado;
- commit proprio de docs;
- `git status --short` limpo apos commit.

Gate de saida:

```text
PASS se a frente puder ser retomada lendo apenas docs/reconstrucao-controlada.
```

## Fase 1 - Matriz De Extracao Completa

Objetivo: transformar o mapa executivo em matriz operacional por area.

Escopo:

- detalhar origem atual;
- definir destino novo;
- classificar como COPIAR, REESCREVER, ARQUIVAR, REFERENCIAR ou INVESTIGAR;
- mapear risco;
- mapear teste obrigatorio;
- mapear criterio de pronto;
- mapear dependencia.

Artefato:

```text
05-matriz-extracao-operacional.md
```

Frentes obrigatorias:

- Bot Premium;
- Tenant Config;
- Painel do Estudio;
- Onboarding;
- Admin;
- Billing;
- Dados/LGPD;
- Observabilidade/Auditoria;
- Media Intelligence;
- Orçamento/Proposta;
- WhatsApp/Evolution;
- Telegram;
- Supabase;
- CI/CD;
- Smoke real;
- Vault/Docs.

Criterio de pronto:

- nenhuma frente critica sem destino;
- nenhum modulo marcado como COPIAR sem teste associado;
- nenhum HTML legado marcado como base ativa;
- n8n marcado apenas como legado/arquivo;
- riscos criticos listados.

Gate de saida:

```text
PASS se cada frente tiver origem, destino, decisao, risco, teste e pronto.
```

## Fase 2 - Contratos Da Plataforma

Objetivo: definir os contratos antes de implementar.

Escopo:

- entidades de dominio;
- tenant config schema;
- estados de workflow;
- eventos de observabilidade;
- contratos de orçamento;
- contratos de media intelligence;
- contratos de billing;
- contratos LGPD;
- matriz de permissao/RBAC.

Artefatos:

```text
06-contratos-plataforma.md
07-tenant-config-contract.md
08-data-governance-contract.md
09-test-strategy-contract.md
```

Criterio de pronto:

- bot, painel e banco falam os mesmos nomes;
- config do estudio tem schema e versionamento;
- orçamento suporta 1/N tattoos e 1/N sessoes;
- media classification tem categorias explicitas;
- observabilidade tem evento minimo padronizado;
- dados pessoais tem retencao e direitos definidos.

Gate de saida:

```text
PASS se seria possivel criar testes de contrato sem UI.
```

## Fase 3 - Decisao De Stack E Repo Novo

Objetivo: decidir formato tecnico do novo repo antes de cria-lo.

Escopo:

- nome do repo;
- monorepo ou multi-repo;
- package manager;
- framework do painel;
- Cloudflare Pages/Workers layout;
- Supabase migration strategy;
- secrets strategy;
- CI base;
- convencao de paths;
- convencao de commits;
- politica de ambientes.

Artefato:

```text
10-decisao-stack-novo-repo.md
```

Criterio de pronto:

- decisao de stack documentada;
- riscos comparados;
- primeiro slice definido;
- rollback mental definido;
- nada depende de copiar producao inteira.

Gate de saida:

```text
PASS se criar o repo novo for uma acao mecanica e reversivel.
```

## Fase 4 - Criacao Do Novo Repo Sem Produto

Objetivo: criar a base tecnica sem migrar comportamento ainda.

Escopo permitido:

- estrutura de pastas;
- README;
- docs base;
- lint/test empty scaffold;
- CI minimo;
- vault placeholder;
- contracts placeholder.

Fora de escopo:

- bot funcional;
- painel funcional;
- billing real;
- secrets reais;
- deploy production.

Criterio de pronto:

- repo novo existe;
- CI roda;
- docs explicam objetivo;
- nenhum segredo inserido;
- nenhum comportamento real migrado.

Gate de saida:

```text
PASS se o repo novo puder ser deletado sem impacto em producao.
```

## Fase 5 - Vault Curado Do Bot Premium

Objetivo: levar conhecimento, nao sujeira.

Escopo:

- copiar docs essenciais do bot premium;
- copiar metodologia de teste real;
- copiar contratos de prompt/eval relevantes;
- criar indice executivo de waves;
- arquivar evidencias brutas fora do caminho principal.

Fora de escopo:

- copiar todos os logs;
- copiar `.smoke-evidence` bruto;
- alterar bot atual.

Criterio de pronto:

- nova aba consegue entender o bot premium pelo vault;
- provas reais importantes estao resumidas;
- metodologia WhatsApp real esta preservada;
- gaps conhecidos estao listados.

Gate de saida:

```text
PASS se o vault ensina o estado do bot sem consumir contexto excessivo.
```

## Fase 6 - Primeiro Dominio Implementavel

Objetivo: escolher o primeiro slice de implementacao com baixo risco.

Recomendacao inicial:

```text
Tenant Config Contract + Domain Types
```

Motivo:

- nao toca producao;
- destrava painel;
- destrava bot;
- reduz JSON livre;
- cria base para personalizacao premium;
- e testavel sem WhatsApp real.

Alternativas:

- Observability Contract;
- Budget Domain Contract;
- Media Intelligence Contract.

Criterio de pronto:

- pacote ou modulo com schemas;
- testes de contrato;
- exemplos fixtures;
- docs;
- sem side effects reais.

Gate de saida:

```text
PASS se o dominio for usavel por bot e painel sem depender de UI.
```

## Fase 7 - Migracao Por Dominios

Objetivo: migrar partes reais apenas depois da fundacao.

Ordem recomendada:

1. Tenant Config;
2. Domain/Data Models;
3. Observability;
4. Budget/Proposal;
5. Media Intelligence;
6. Bot Runtime;
7. Studio Panel;
8. Billing;
9. Onboarding;
10. Admin;
11. Operations/Cutover.

Regra:

```text
cada dominio precisa de tests + docs + migration note + rollback antes do proximo
```

## Fase 8 - Validacao Profissional

Objetivo: impedir regressao e falsa sensacao de pronto.

Gates obrigatorios por tipo:

| Mudanca | Validacao minima |
| --- | --- |
| Dominio puro | unit + contract |
| Tenant config | unit + contract + fixture |
| Bot conversacional | unit + HTTP radar + WhatsApp real |
| Telegram/orcamento | integration + Telegram real |
| Billing | unit + integration sandbox/mock + auditoria |
| Supabase | migration test + RLS check + rollback |
| Painel | component/e2e + auth/RBAC |
| Legal/dados | checklist LGPD + data flow + retention |
| Deploy/infra | CI + preview + rollback |

## Fase 9 - Cutover Controlado

Objetivo: trocar partes da producao apenas quando o novo sistema provar superioridade.

Pre-condicoes:

- staging real;
- tenant piloto;
- rollback;
- smoke real;
- auditoria limpa;
- logs decisorios;
- plano de comunicacao;
- criterios de abortar.

Gate de saida:

```text
PASS se o novo sistema puder atender um tenant piloto melhor que o legado, com rollback.
```

## Ordem Imediata Recomendada

Proximo ataque, ainda sem codigo:

1. Criar `05-matriz-extracao-operacional.md`.
2. Completar matriz por frente.
3. Criar `06-contratos-plataforma.md`.
4. Definir contrato de Tenant Config.
5. So entao decidir stack/repo novo.

## Stop Conditions Globais

Parar se:

- a frente tentar resolver bug do bot atual junto com reconstrucao;
- surgir pressa para criar repo sem contratos;
- algum passo exigir secret;
- algum passo tocar producao;
- houver divergencia entre bot, painel e banco;
- a validacao real for substituida por teste artificial em fluxo conversacional.

## Prova De Disciplina

Esta fase so pode alterar:

```text
docs/reconstrucao-controlada/
```

Qualquer excecao precisa de decisao registrada antes.

