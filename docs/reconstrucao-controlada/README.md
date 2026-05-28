# Reconstrucao Controlada InkFlow

Esta pasta e a trilha oficial para planejar a reconstrucao controlada do InkFlow SaaS.

Objetivo: transformar o repo atual em fonte de extracao, memoria e validacao, enquanto um novo repo nasce como plataforma SaaS limpa, com bot premium como modulo/vault e nao como unico centro do sistema.

## Como Retomar A Frente

Ler nesta ordem:

1. `00-session-handoff.md`
2. `01-mapa-extracao-repo-atual.md`
3. `02-arquitetura-total-alvo.md`
4. `03-governanca-versionamento.md`
5. `04-plano-acao-reconstrucao.md`
6. `05-matriz-extracao-operacional.md`
7. `06-contratos-plataforma.md`
8. `07-tenant-config-contract.md`
9. `08-data-governance-contract.md`
10. `09-test-strategy-contract.md`
11. `10-decisao-stack-novo-repo.md`
12. `11-primeiro-slice-novo-repo.md`
13. `CHANGELOG.md`
14. `docs/canonical/stack.md`
15. `docs/atendimento-premium/09-session-handoff.md`

Depois rodar:

```bash
git status --short
```

Se houver mudancas nao commitadas, entender antes de editar.

## Contrato Da Frente

- O repo atual continua operacional ate a nova arquitetura estar pronta para migracao controlada.
- Nada e copiado para o novo repo sem classificacao: copiar, reescrever, arquivar ou referenciar.
- O bot premium vira modulo/vault dentro da plataforma, mantendo metodologia de WhatsApp real como validacao definitiva.
- Static HTML legado nao vira base do painel novo sem decomposicao.
- Configuracao de tenant precisa virar contrato, nao JSON livre espalhado.
- Legal, dados, billing, seguranca, operacao e observabilidade sao partes do produto, nao tarefas finais.

## Estado Atual

Status: novo repo `inkflow-platform` criado localmente com `packages/tenant-config`, `packages/domain` e `packages/workflow` implementados como pacotes funcionais isolados, sem bot runtime, sem painel, sem secrets e sem deploy.

Local:

```text
/Users/brazilianhustler/Documents/inkflow-platform
```

Commit inicial:

```text
b815ccb chore: scaffold inkflow platform monorepo
```

Commits principais do novo repo:

```text
23a00ef feat: implement workflow transitions
266fb02 feat: implement domain contracts
2dbccef feat: implement tenant config contract
b815ccb chore: scaffold inkflow platform monorepo
```

Validacoes atuais:

- `npm test` PASS, 35/35;
- `npm run typecheck` PASS placeholder;
- `npm run lint` PASS placeholder;
- git limpo no repo novo.

Proxima decisao: definir o proximo dominio implementavel no novo repo. Recomendacao: `packages/pricing`/budget foundation ou `packages/observability`; a rota mais coerente agora e budget/pricing, porque tenant-config, domain e workflow ja sustentam orcamentos multi-item/multi-session.

## Limite De Ambiente

Enquanto esta frente estiver em fase de arquitetura:

- nao alterar codigo de producao;
- nao alterar secrets;
- nao rodar deploy;
- nao alterar smoke real;
- nao mover arquivos legados;
- nao criar repo novo sem plano aprovado.

Mudancas permitidas agora:

- docs dentro de `docs/reconstrucao-controlada/`;
- inventarios read-only;
- commits de documentacao da frente.
