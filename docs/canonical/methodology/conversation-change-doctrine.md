---
last_reviewed: 2026-05-24
owner: leandro
status: stable
related: [index.md, eval-comparative-strategy.md, release-protocol.md, ../../atendimento-premium/01-doutrina.md]
---

# Conversation Change Doctrine

Doutrina para qualquer mudança em atendimento conversacional do InkFlow Agent.

## Tese

Mudança conversacional não pode virar acúmulo infinito de prompt, regex e exceções.

O padrão correto é:

```text
observar -> classificar -> decidir se é regra, substituição ou redesenho -> validar -> registrar
```

Adicionar regra é permitido quando o problema é localizado. Se o padrão de falha se repetir, a obrigação é parar e repensar a camada, não continuar empilhando ruído.

## Triagem Obrigatória

Antes de alterar prompt, router, regex, schema, agent ou pipeline, responder:

1. A falha é local ou sistêmica?
2. A causa é classificação, extração, estado, tom, batching, prompt ou ferramenta?
3. A correção deve adicionar uma regra, substituir uma regra existente ou redesenhar a camada?
4. Qual risco novo essa mudança introduz?
5. Qual teste prova o comportamento sem depender de interpretação subjetiva?
6. Qual smoke real confirma que o cliente percebe melhoria?

## Classificação De Mudança

### 1. Correção Local

Use quando:

- o bug tem causa clara;
- o padrão é pequeno e observável;
- a regra nova é curta, testável e diretamente ligada ao smoke;
- não altera estado crítico, dinheiro, agenda ou handoff.

Exemplos:

- aceitar `opa` como saudação;
- tolerar typo frequente como `qnto tempo`;
- extrair `leao no braço` quando aparece no mesmo turno de `quanto fica?`.

Gate:

- teste unitário do caso;
- teste de integração se tocar pipeline;
- smoke real monitorado depois do deploy.

### 2. Substituição

Use quando:

- existe regra antiga que está errada ou ampla demais;
- o problema é conflito entre regras;
- corrigir adicionando outra exceção deixaria o sistema mais ambíguo.

Exemplos:

- trocar uma regex genérica que captura `valor` em contexto emocional por classificação mais restrita;
- substituir retomada fixa por retomada derivada dos dados já persistidos.

Gate:

- teste do caso novo;
- teste de não regressão do caso antigo;
- evidência de que a regra antiga não deve sobreviver.

### 3. Redesenho

Use quando:

- a mesma classe de falha exige várias exceções sucessivas;
- regras começam a competir entre si;
- o prompt fica longo e contraditório;
- o router passa a carregar lógica de agent;
- a mudança depende de contexto, estado, imagem, histórico ou intenção ao mesmo tempo;
- o erro é de arquitetura, não de frase.

Exemplos:

- criar uma camada `TurnUnderstanding` para intenção + dados explícitos + retomada;
- mover decisão de batching para o pipeline;
- separar atendimento consultivo de operação de coleta;
- usar classificador estruturado em vez de regex quando a variação humana ficar alta.

Gate:

- plano técnico antes de código;
- contrato de input/output;
- fallback e kill switch;
- testes de invariantes;
- smoke real monitorado antes de avançar de slice.

## Sinais De Alerta

Parar e reavaliar se acontecer qualquer um:

- terceira exceção nova para a mesma intent;
- regex com muitos sinônimos sem teste de falso positivo;
- prompt crescendo para compensar falha de estado ou pipeline;
- mudança que melhora um smoke e piora outro;
- resposta correta tecnicamente, mas desatenta ao que o cliente já disse;
- dado explícito do cliente ignorado;
- ordem de resposta estranha por debounce/batching;
- necessidade de explicar o comportamento como "tecnicamente correto" embora soe ruim para cliente.

## Regra Do General

O agente deve escolher uma das três ordens:

```text
ADICIONAR regra   -> se a falha é pequena, clara, testável e reversível.
SUBSTITUIR regra  -> se há regra existente competindo ou criando ruído.
REDESENHAR camada -> se a variação humana já excedeu o modelo de regras.
```

Se a decisão for "adicionar", registrar por que ainda não é caso de redesenho.

## Limite De Complexidade

Uma camada de regras só continua saudável enquanto:

- cada regra cabe em uma intenção clara;
- cada regra tem teste;
- cada regra tem evidência de smoke ou bug real;
- a ordem das regras é compreensível;
- fallback para camada operacional continua simples.

Se a regra precisa conhecer muitos detalhes de estado, histórico e mídia, ela provavelmente pertence a uma camada mais estruturada, não a um patch.

## Como Validar

### Mudanças Determinísticas

Use invariantes binárias:

- classificou ou não classificou;
- persistiu ou não persistiu;
- mudou estado ou preservou;
- chamou ferramenta ou não chamou;
- retomou com o campo correto.

### Mudanças De Tom

Não declarar vitória por impressão isolada. Usar:

- smoke humano;
- exemplos comparáveis;
- A/B quando houver avaliação por juiz LLM;
- critério de não regressão.

## Aplicação Ao Atendimento Premium

Para cada slice:

1. Implementar pequeno.
2. Smoke real monitorado.
3. Se falhar, classificar a falha.
4. Corrigir localmente só se for localizado.
5. Se a mesma família falhar de novo, abrir plano de redesenho.
6. Só avançar para o próximo slice quando o slice atual estiver estável em teste e smoke.

## Smoke Monitorado Obrigatorio

Smoke conversacional real deve usar o processo padrao:

```bash
BASE_URL=https://inkflowbrasil.com EXPECTED_STATE=<estado_esperado> \
  bash scripts/smoke/run-inbound.sh "<mensagem>" 5521970789797
```

Esse runner e obrigatorio porque garante:

- tail Cloudflare ativa antes do inbound remoto;
- `SMOKE_RUN_ID` como correlation id;
- snapshot Supabase antes/depois;
- polling ate resposta AI, estado esperado ou timeout;
- pacote de evidencia em `.smoke-evidence/<run_id>/`.

Chamada manual direta para `scripts/smoke-inbound.sh` e permitida apenas para debug isolado. Para validar slice, regression fix ou deploy, usar o runner completo.

## Checkpoint Operacional

Antes de iniciar outro slice conversacional, fechar o estado atual:

1. `git status --short` revisado.
2. Arquivos novos/modificados entendidos.
3. Testes relevantes rodados ou exceção registrada.
4. Handoff/decision log atualizado quando houver mudança de direção.
5. Commit feito automaticamente quando o checkpoint estiver saudável.

Não iniciar nova frente sobre mudanças fundacionais soltas no worktree. Se a mudança passa a ser base para próximos prompts, router, policy, composer ou guardrails, ela deve virar checkpoint no git antes do próximo ataque.

### Regra De Commit Automático

Quando o agent fecha um slice coerente, deve commitar sem pedir confirmação extra se todos os critérios abaixo forem verdadeiros:

- a mudança resolve uma ideia inteira e explicável em uma frase;
- os testes relevantes passaram, ou a exceção foi registrada de forma explícita;
- o diff foi revisado e está focado;
- não há mistura de assuntos independentes;
- não há arquivos desconhecidos ou mudanças de outro autor misturadas ao mesmo commit;
- o commit torna o próximo passo mais seguro e reversível.

Evitar commit automático e parar para alinhamento quando:

- algum teste relevante está quebrando;
- a mudança está no meio de uma refatoração;
- o diff mistura código funcional, config de deploy, docs aleatórios ou outro assunto independente;
- o agent não consegue explicar com precisão o que mudou;
- há mudanças não relacionadas feitas pelo usuário no mesmo arquivo ou no mesmo escopo;
- o estado local não roda ou depende de artefato temporário;
- há risco operacional alto que exigiria deploy, segredo, migration ou rollback coordenado.

Commits devem ser checkpoints pequenos, revisáveis e fáceis de reverter. "Salvar progresso" sem estado saudável é WIP, não checkpoint.

## Frase De Controle

Antes de mergear qualquer mudança conversacional:

```text
Esta mudança reduz complexidade ou só esconde complexidade nova?
```

Se a resposta for "só esconde", não mergear como regra. Redesenhar.
