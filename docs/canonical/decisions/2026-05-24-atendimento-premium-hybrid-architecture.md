---
last_reviewed: 2026-05-24
status: decided
related: [../../atendimento-premium/README.md, ../../atendimento-premium/07-arquitetura-prompt-premium.md, ../methodology/conversation-change-doctrine.md]
---

# Decisão arquitetural - Atendimento Premium Híbrido

**Data:** 2026-05-24
**Área:** InkFlow Agent / atendimento conversacional / WhatsApp

## Decisão

O atendimento premium do InkFlow será construído como arquitetura híbrida, não como prompt monolítico.

A cadeia oficial é:

```text
WhatsApp/Evolution
-> inbound
-> SessionQueue / debounce
-> whatsapp-pipeline
-> ConversationRouter
-> ConversationPolicy
-> ResponseComposer
-> Agent operacional, quando necessário
-> guardrails / post-processing
-> Supabase
-> Evolution outbound
```

O prompt continua importante, mas não será a única fonte de decisão. O sistema deve separar:

- agrupamento de mensagens;
- classificação de intenção;
- resolução de pergunta pendente;
- extração simples de dados;
- composição natural da resposta;
- raciocínio contextual do agent;
- persistência;
- proteção contra avanço indevido.

## Contexto

Durante os smokes de atendimento premium em 2026-05-24, o bot apresentou uma sequência de falhas que tinham a mesma raiz arquitetural:

- perguntava uma coisa nova por cima de pergunta pendente;
- respondia dúvida lateral, mas não retomava a coleta;
- retomava a coleta e ignorava dúvida lateral;
- repetia frases longas de forma mecânica;
- não reconhecia dados já informados no turno inicial;
- caía no agent operacional e voltava com resposta seca;
- podia enviar resposta antiga enquanto o cliente já tinha mandado nova mensagem.

A correção pontual por prompt/regex resolveria um smoke, mas criaria fragilidade para o próximo.

## Por Que Arquitetura Híbrida

Só prompt é imprevisível para side effects e estado.

Só regex é rígido e robótico.

Só state machine preserva segurança, mas cria atendimento seco.

Só LLM aumenta risco operacional em dinheiro, cadastro, handoff e proposta.

Só pós-processamento vira remendo se a decisão original continua errada.

A arquitetura híbrida permite:

- responder com naturalidade;
- preservar invariantes;
- manter fallback conservador;
- testar cada camada isoladamente;
- validar comportamento em smoke real;
- evoluir por slices sem reescrever tudo.

## Alternativas Rejeitadas

### A. Prompt monolítico

Rejeitado porque o prompt teria que decidir linguagem, intenção, extração, estado, ferramenta, persistência e segurança ao mesmo tempo.

Risco principal: regressões difíceis de isolar e comportamento correto apenas no smoke recém-testado.

### B. Router gigante por regex

Rejeitado como arquitetura final.

Regex e aliases são aceitáveis como vocabulário de domínio dentro de uma camada com contrato, mas não como cérebro inteiro do atendimento.

Risco principal: acumular exceções, falsos positivos e ordem de regras difícil de manter.

### C. Deixar tudo no agent operacional

Rejeitado porque o agent operacional foi desenhado para cumprir fase/estado. Quando toda mensagem entra como mensagem da fase atual, dúvida lateral tende a ser tratada como coleta.

Risco principal: resposta tecnicamente válida, mas desatenta ao turno humano.

### D. Corrigir somente por guardrails

Rejeitado porque guardrails devem impedir desastre, não compensar arquitetura sem entendimento de turno.

## Consequências

Toda mudança conversacional deve primeiro responder:

```text
Isto é linguagem, decisão de fluxo, extração de dado, persistência ou segurança?
```

Direcionamento oficial:

| Tipo de mudança | Camada preferencial |
|---|---|
| Agrupar balões humanos | SessionQueue |
| Evitar resposta velha | Pipeline / stale guard |
| Detectar intenção lateral simples | ConversationRouter |
| Resolver pergunta pendente | ConversationPolicy |
| Extrair dado simples | ConversationPolicy |
| Montar resposta natural | ResponseComposer |
| Raciocínio contextual complexo | Agent operacional |
| Impedir avanço perigoso | Guardrails / invariants |
| Persistir estado | Pipeline / tools |

## Estado Da Implementação Em 2026-05-24

Implementado em worktree local, com mudanças ainda não necessariamente commitadas no momento desta decisão:

- `functions/_lib/conversation-policy.js`
- `functions/_lib/conversation-response-composer.js`
- ajustes em `functions/_lib/conversation-router.js`
- ajustes em `functions/_lib/whatsapp-pipeline.js`
- ajustes em `functions/api/agent/route.js`
- testes de policy, router, pipeline e agent.

Último deploy de referência observado nesta frente:

```text
https://0585e72c.inkflow-saas.pages.dev
```

Último smoke analisado indicou PASS para a etapa de atendimento lateral + retomada em tattoo, com dados finais:

```json
{
  "estado_agente": "coletando_tattoo",
  "dados_coletados": {
    "descricao_curta": "foguinho",
    "local_corpo": "virilha",
    "altura_cm": 160,
    "estilo": "fineline"
  },
  "dados_cadastro": {},
  "valor_proposto": null
}
```

## Dívidas Aceitas

- intent detection ainda usa regex dentro do `ConversationRouter`;
- `cleanDescricao` ainda tem lista textual de locais;
- cadastro ainda não tem `QuestionPolicy` completa;
- estilos e locais podem precisar de catálogo por tenant;
- composer ainda tem variação limitada de copy;
- prompt operacional ainda pode ficar seco se o turno cair fora do router.

Essas dívidas são aceitas apenas como transição. Elas devem ser atacadas por slices.

## Próximos Slices Canônicos

1. Formalizar decision log e handoff do atendimento premium.
2. Estabilizar `QuestionPolicy` para cadastro.
3. Criar camada de intent resolver com `confidence` e `reason`.
4. Revisar prompt operacional para trabalhar em harmonia com router/policy/composer.
5. Adicionar observabilidade: intent, pending question, resolver, confidence, stale batch.

## Regra De Continuidade

Ao iniciar nova sessão de trabalho em atendimento premium, ler nesta ordem:

1. `docs/canonical/decisions/2026-05-24-atendimento-premium-hybrid-architecture.md`
2. `docs/atendimento-premium/07-arquitetura-prompt-premium.md`
3. `docs/atendimento-premium/08-decision-log.md`
4. `docs/atendimento-premium/09-session-handoff.md`
5. `docs/canonical/methodology/conversation-change-doctrine.md`

Se houver divergência entre estes documentos e o código atual, o código é a verdade técnica e os documentos devem ser atualizados antes de avançar.
