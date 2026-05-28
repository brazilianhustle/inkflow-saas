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
6. `CHANGELOG.md`
7. `docs/canonical/stack.md`
8. `docs/atendimento-premium/09-session-handoff.md`

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

Status: arquitetura total e plano de acao inicial registrados antes de qualquer repo novo.

Proxima decisao: completar a matriz de extracao operacional por frente.

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
