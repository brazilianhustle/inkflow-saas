# Governanca E Versionamento Da Reconstrucao Controlada

Data: 2026-05-27

Objetivo: garantir que a reconstrucao controlada evolua com rastreabilidade, sem contaminar o ambiente operacional do InkFlow atual.

## Regra Principal

O repo atual continua sendo producao/legado operacional. A reconstrucao controlada, nesta fase, e apenas arquitetura, inventario e plano.

```text
permitido agora: documentar, inventariar, classificar, decidir
proibido agora: migrar codigo, mudar runtime, deployar, mexer em secrets
```

## Versionamento Da Frente

Cada mudanca desta frente deve atualizar pelo menos um destes arquivos:

- `00-session-handoff.md` para estado atual e proximo passo;
- `01-mapa-extracao-repo-atual.md` para classificacao do repo;
- `02-arquitetura-total-alvo.md` para arquitetura alvo;
- `03-governanca-versionamento.md` para regras de processo;
- `CHANGELOG.md` para historico objetivo.

## Escopos De Commit

Escopos recomendados:

```text
docs(reconstrucao): cria mapa de extracao
docs(reconstrucao): define governanca de versionamento
docs(reconstrucao): atualiza arquitetura alvo
docs(reconstrucao): registra decisao de migracao
```

Nao misturar no mesmo commit:

- docs de reconstrucao + codigo de bot;
- docs de reconstrucao + secrets;
- docs de reconstrucao + smoke scripts;
- docs de reconstrucao + painel legado;
- docs de reconstrucao + migrations.

## Ambientes E Fronteiras

### Repo Atual

Funcao:

- producao atual;
- fonte de extracao;
- vault historico;
- referencia de testes reais.

Nao deve receber reescrita ampla durante a fase de arquitetura.

### Novo Repo Futuro

Funcao:

- fonte da verdade futura;
- plataforma SaaS limpa;
- arquitetura schema-first;
- bot premium como modulo/vault.

Ainda nao deve ser criado sem plano aprovado.

### Produção

Funcao:

- manter atendimento atual rodando.

Nao tocar sem necessidade funcional separada desta frente.

## Politica De Arquivos

Durante a fase atual:

| Area | Pode Alterar? | Condicao |
| --- | --- | --- |
| `docs/reconstrucao-controlada/` | Sim | Sempre manter handoff/changelog coerentes. |
| `docs/atendimento-premium/` | Nao por padrao | So se a reconstrucao descobrir decisao que afeta bot premium. |
| `docs/canonical/` | Nao por padrao | So apos decisao de consolidar canonical da plataforma nova. |
| `functions/` | Nao | Fora de escopo nesta fase. |
| `supabase/` | Nao | Fora de escopo nesta fase. |
| `scripts/` | Nao | Fora de escopo nesta fase. |
| `web/` | Nao | Fora de escopo nesta fase. |
| HTML raiz | Nao | Sera reescrito no novo desenho, nao mexido agora. |
| secrets/env | Nao | Proibido nesta frente. |

## Gates Antes De Criar O Novo Repo

Nao criar novo repo enquanto nao houver:

1. mapa de extracao revisado;
2. arquitetura alvo aceita;
3. plano de acao faseado;
4. criterio de migracao do bot premium;
5. criterio de congelamento do legado;
6. matriz de testes obrigatorios;
7. decisao de stack do painel;
8. politica de dados/LGPD minima;
9. plano de rollback mental: como parar sem afetar producao.

## Definicao De Pronto Para Esta Fase

A fase de arquitetura/extracao termina quando existir:

- mapa de extracao completo por area;
- arquitetura total alvo aprovada;
- plano de acao da reconstrucao;
- ledger de decisoes;
- escopo do primeiro slice do novo repo;
- lista do que nao migrar;
- regra de validacao antes de qualquer cutover.

## Stop Conditions

Parar e reavaliar se:

- algum passo exigir alterar producao;
- aparecer dependencia de secret;
- houver risco de quebrar bot atual;
- a reconstrucao comecar a virar refator do repo legado;
- uma decisao de produto estiver ambigua;
- o plano tentar migrar tudo de uma vez.

