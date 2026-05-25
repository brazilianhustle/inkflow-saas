# Decision Log - Atendimento Premium

Este arquivo registra decisões técnicas e estratégicas da frente de atendimento premium.

Uso esperado em novas sessões:

```text
ler decision log
-> entender decisões vivas
-> conferir session handoff
-> só então mexer em código, prompt ou smoke
```

## 2026-05-24 - Atendimento premium não será prompt monolítico

**Status:** decidido.

**Decisão:** construir o atendimento premium como arquitetura híbrida: `SessionQueue`, `Pipeline`, `ConversationRouter`, `ConversationPolicy`, `ResponseComposer`, agent operacional e guardrails.

**Motivo:** os smokes mostraram que prompt sozinho não controla bem ordem, estado, dados pendentes e side quests. A falha era estrutural, não só de frase.

**Alternativas rejeitadas:**

- aumentar prompt com mais regras;
- adicionar regex solta para cada print;
- deixar o agent operacional resolver toda dúvida lateral;
- usar guardrail como correção principal.

**Impacto:** toda nova mudança deve ser classificada por camada antes de implementação.

**Documento canônico:** `docs/canonical/decisions/2026-05-24-atendimento-premium-hybrid-architecture.md`.

## 2026-05-24 - Side quest deve ser respondida antes da retomada

**Status:** decidido.

**Decisão:** quando o cliente faz uma dúvida lateral e também existe coleta em andamento, o bot deve:

1. responder a dúvida/objeção;
2. reconhecer dados úteis do turno;
3. retomar a coleta com uma única pergunta no final da última bolha.

**Exemplo:**

```text
Cliente:
Paola aqui
como funciona o orçamento?

Bot:
Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário.

Boa, Paola. Me diz tua altura?
```

**Motivo:** atendimento humano não ignora pergunta lateral nem atropela o cliente com formulário.

**Camadas responsáveis:**

- `ConversationPolicy`: resolver pergunta pendente;
- `ConversationRouter`: detectar lateral simples;
- `ResponseComposer`: montar resposta + retomada.

## 2026-05-24 - Pergunta pendente precisa sobreviver a turnos laterais

**Status:** decidido.

**Decisão:** a pergunta de formulário pendente deve ser buscada no histórico recente de mensagens do bot, não apenas na última mensagem do assistant.

**Motivo:** se o cliente responde uma dúvida lateral antes de responder o formulário, a última mensagem do bot pode não conter a pergunta original. Mesmo assim, a pergunta continua pendente.

**Exemplo:**

```text
Bot: Como posso te chamar?
Cliente: como funciona o orçamento?
Bot: Funciona assim...
Cliente: Paola aqui
```

O sistema ainda deve entender que `Paola` responde `Como posso te chamar?`.

**Camada responsável:** `ConversationPolicy`.

## 2026-05-24 - Vocabulário estático é aceitável como domínio, não como arquitetura

**Status:** decidido.

**Decisão:** aliases como `virilha`, `bunda -> glúteo`, `quanto que é`, `me chama de` são aceitáveis quando ficam dentro de resolvedores com contrato, teste e escopo claro.

**Motivo:** atendimento real precisa entender vocabulário humano. O problema não é lista estática; o problema é lista estática espalhada em prompt, router e agent sem autoridade única.

**Regra:** se o alias extrai dado simples, ele pertence à `ConversationPolicy`; se classifica intenção lateral, pertence ao router ou futuro `IntentPolicy`.

## 2026-05-24 - ResponseComposer é camada própria

**Status:** decidido.

**Decisão:** a montagem final da fala do bot deve ser isolada em `ResponseComposer`, não misturada com detecção de intenção ou extração de dados.

**Motivo:** o bot precisa controlar:

- introdução de primeiro contato;
- resposta lateral;
- retomada de coleta;
- pergunta no final;
- redução de repetição;
- naturalidade de bolhas.

Misturar isso no router aumenta acoplamento e dificulta teste.

## 2026-05-24 - Stale batch deve abortar antes de side effect

**Status:** decidido.

**Decisão:** se uma nova mensagem humana chega enquanto o batch atual ainda está sendo processado, o pipeline deve abortar antes de atualizar conversa, inserir AI, enviar WhatsApp ou marcar mensagens.

**Motivo:** sem isso, o bot pode responder com uma pergunta antiga por cima de uma pergunta nova do cliente.

**Camada responsável:** `whatsapp-pipeline`.

**Comportamento esperado:** `StaleBatchError` causa retry pelo Durable Object com o lote reagrupado.

## 2026-05-24 - PASS operacional não é igual a PASS premium

**Status:** decidido.

**Decisão:** validação deve separar três níveis:

- `PASS operacional`: estado, dados, mensagens, side effects;
- `PASS conversacional`: ordem, naturalidade, não repetição, pergunta final;
- `PASS premium`: robustez com variações humanas e segurança sem depender de sorte do LLM.

**Motivo:** um fluxo pode estar tecnicamente correto e ainda parecer ruim para o cliente.

## 2026-05-25 - Autonomia Level 2 exige evidência e checkpoints por micro-slice

**Status:** decidido.

**Decisão:** promover o Autonomy Gate de Level 1 para Level 2, permitindo até 2 micro-slices relacionados por rodada.

**Motivo:** a frente atingiu evidência operacional suficiente: `cadastro-handoff` e `atendimento-lateral` passaram nos slice gates, com 14 cenários recentes e 7 smokes WhatsApp reais. Manter Level 1 nesse ponto reduz velocidade sem aumentar segurança de forma proporcional.

**Alternativas rejeitadas:**

- manter Level 1 apesar de `promote_available`;
- liberar batch amplo sem limite;
- promover automaticamente sem commit deliberado.

**Camada responsável:** processo de smoke/autonomia, documentado em `autonomy-gate.env`, `current-objective.md` e `smoke-runs.md`.

**Impacto:** cada rodada pode executar até 2 micro-slices relacionados, mas cada micro-slice ainda precisa ter validação, registro e checkpoint saudável. Qualquer falha de smoke real, deploy, cleanup ou gate interrompe a rodada e volta para triage.

## 2026-05-25 - Compactação precisa ser bundle portátil, não só hook local

**Status:** decidido.

**Decisão:** a retomada após compactação deve usar um bundle versionado e executável por comando explícito: `bash scripts/smoke/continuity-bundle.sh --force`.

**Motivo:** o hook `SessionStart` em `.claude/settings.json` é útil no Claude Code, mas não dispara em Codex/API. O loop estava documentado, mas a continuidade ainda dependia do chat lembrar de comandos quando o contexto já estava baixo.

**Alternativas rejeitadas:**

- depender somente do hook Claude Code;
- tentar controlar a compactação interna do cliente;
- manter a retomada apenas como lista manual de arquivos;
- deixar script local sem versionamento.

**Camada responsável:** processo de smoke/continuidade, documentado em `12-loop-continuity-protocol.md` e `17-context-compact-architecture.md`.

**Impacto:** abaixo de 20% de contexto, a operação padrão é gerar o bundle portátil, confirmar gates e seguir pelo repo como fonte de verdade. Nenhum script local promete forçar a compactação interna do Codex; ele torna a retomada determinística.

## 2026-05-25 - Menoridade explícita é handoff humano, não orçamento

**Status:** decidido.

**Decisão:** quando uma data de nascimento explícita indica menor de 18 anos, o cadastro deve acionar handoff humano seguro, persistir a data válida e manter `orcid=null`. Esse caminho não deve chamar `enviar-orcamento-tatuador` nem exigir `orcid` no smoke, porque não é handoff de orçamento.

**Motivo:** o primeiro smoke de menoridade mostrou um risco real: o LLM podia reconhecer a situação, mas não persistir `data_nascimento`, gerando estado final inseguro ou copy incorreta. A defesa precisa existir no servidor, usando a mensagem humana como fonte adicional, não só no prompt.

**Alternativas rejeitadas:**

- depender do LLM para sempre persistir a data;
- tratar menoridade como orçamento normal;
- exigir `orcid` em todo `aguardando_tatuador`, mesmo quando o motivo é risco humano;
- aceitar copy genérica de data inválida quando a data explícita é parsável.

**Camada responsável:** guardrail de cadastro em `enforce-menor-idade`, workflow no `runAgent`, pipeline de handoff humano e smoke harness com `SMOKE_REQUIRE_ORCID`.

**Impacto:** o scenario `cadastro-menoridade-handoff-humano` passou em produção (`scenario-cadastro-menoridade-handoff-humano-20260525T170936Z-8596`) com `estado=aguardando_tatuador`, `orcid=null`, `data_nascimento=2015-03-12`, copy segura e tail gate sem envio de orçamento.

## Decisões Em Aberto

### Cadastro premium

Ainda falta decidir e implementar a extensão da `QuestionPolicy` para:

- nome completo;
- data de nascimento;
- email;
- recusa de email;
- dúvidas laterais durante cadastro.

### Copy premium de maioridade e menoridade

Resolvido para idade isolada em 2026-05-25:

- frase fria evitada;
- data completa explicada como seguranca e registro de maioridade;
- smoke `cadastro-data-idade-nao-persiste` passou em producao.

Resolvido para menoridade explicita em 2026-05-25:

- data explícita de menor extrai/persiste `data_nascimento`;
- estado final vira `aguardando_tatuador`;
- `orcid` permanece `null`;
- smoke `cadastro-menoridade-handoff-humano` passou em producao.

Ainda falta, em slice futuro, ampliar variações conversacionais de menoridade e oficializar `EscalationManager` como camada dedicada.

### IntentPolicy

Ainda falta decidir formato final do resolvedor de intenção com:

- `intent`;
- `confidence`;
- `reason`;
- `risk`;
- `can_mutate_state`.

### Catálogo por tenant

Ainda falta decidir se estilos, locais e vocabulário de atendimento serão:

- hardcoded global;
- configuráveis por tenant;
- híbridos com vocabulário base + override por tenant.

## Regra De Atualização

Toda vez que uma nova decisão mudar direção de arquitetura, fluxo, prompt, policy, router, composer, guardrails ou smoke, adicionar uma entrada aqui.

Cada entrada precisa responder:

```text
Decisão:
Motivo:
Alternativas rejeitadas:
Camada responsável:
Impacto:
Status:
```
