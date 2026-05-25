# Arquitetura Do Prompt Premium - Visão De General

## Objetivo Da Guerra

O objetivo não é criar "um prompt melhor". O objetivo é construir uma arquitetura de atendimento premium para SaaS, onde o bot se comporta como atendente de estúdio e não como formulário disfarçado.

O bot premium precisa:

- entender o que o cliente está tentando fazer no turno;
- responder dúvidas e objeções antes de continuar a coleta;
- não perguntar informação já respondida;
- capturar dados quando o cliente entrega informação de forma natural;
- manter estado consistente no Supabase;
- evitar resposta antiga quando o cliente manda nova mensagem durante o processamento;
- não avançar para orçamento, Telegram, cadastro ou pagamento antes da hora;
- usar prompt/LLM para linguagem e raciocínio contextual, mas não como única fonte de segurança operacional.

## Princípio Central

Atendimento premium nasce da combinação:

```text
Queue correta
+ estado confiável
+ policy tipada
+ router leve
+ prompt com schema
+ composer natural
+ guardrails
= experiência humana com segurança de sistema
```

Se uma camada tenta fazer tudo sozinha, o sistema quebra:

- só prompt: imprevisível;
- só regex: robótico;
- só router: limitado;
- só LLM: arriscado;
- só state machine: seco;
- só pós-processamento: vira remendo.

A arquitetura correta é híbrida.

## Terreno Atual

Fluxo simplificado atual:

```text
WhatsApp/Evolution
-> inbound
-> conversa_mensagens(status=received)
-> SessionQueue / debounce
-> whatsapp-pipeline
-> ConversationRouter, quando aplicável
-> runAgent operacional, quando necessário
-> guardrails / post-processing
-> persistência em conversas
-> insert mensagem AI
-> Evolution outbound
-> conversa_mensagens(status=processed)
```

O ponto de virada desta frente foi separar "atendimento humano" de "execução operacional".

Antes, o sistema pensava principalmente:

```text
Estou em qual estado e qual campo falta?
```

Agora, a direção correta é:

```text
O que o cliente está tentando fazer neste turno?
```

Só depois disso o sistema decide se deve responder, coletar, persistir, retomar, chamar LLM ou acionar ferramenta.

## Camadas Do Atendimento Premium

### 1. Entrada WhatsApp / Evolution

Responsabilidade:

- receber payload da Evolution;
- parsear texto e mídia;
- persistir cada mensagem humana como `conversa_mensagens`;
- manter idempotência por `evo_message_id`;
- não tentar "atender" dentro do inbound.

Regra estratégica:

```text
Inbound persiste rápido e sai. Atendimento acontece depois.
```

### 2. SessionQueue / Debounce

Responsabilidade:

- agrupar balões próximos do mesmo cliente;
- evitar que `opa`, `quero uma tattoo`, `quanto fica` sejam tratados como três turnos isolados;
- respeitar janela de silêncio e teto de espera;
- preservar mensagens que chegaram durante um POST em andamento.

Valor premium:

Cliente de WhatsApp escreve em rajadas. O bot precisa esperar o turno humano terminar antes de responder.

Exemplo:

```text
opa
quero fazer um foguinho na virilha
quanto que é
```

Isto deve virar um turno único.

### 3. Pipeline

Responsabilidade:

- carregar tenant;
- carregar conversa;
- carregar histórico processado;
- montar o texto do lote;
- enviar imagens ao fluxo correto;
- decidir se o router pode responder;
- chamar agent operacional quando necessário;
- persistir dados;
- enviar resposta;
- marcar mensagens como processed/failed.

Nova proteção importante:

```text
StaleBatchError
```

Se o cliente manda nova mensagem enquanto o bot ainda está calculando uma resposta antiga, o pipeline aborta antes de:

- atualizar conversa;
- inserir AI;
- enviar WhatsApp;
- marcar mensagens como processed/failed.

Isso impede o bot de mandar uma pergunta velha por cima de uma dúvida nova.

### 4. ConversationRouter

Responsabilidade:

- interceptar intents laterais simples e seguras;
- responder sem chamar LLM quando o comportamento é determinístico;
- preservar estado;
- retornar output compatível com `runAgent`.

Intents atuais do Slice 1:

- `preco_generico`;
- `tempo_sessao`;
- `processo_tatuagem`.

Exemplo:

```text
Cliente: quanto que é?
Router: preco_generico
```

O router evita que uma pergunta simples caia no agent operacional e receba uma resposta seca ou fora do contrato de primeiro contato.

Limite estratégico:

O router não deve virar um mega-agent por regex. Ele é uma camada rápida para intents estáveis e de baixo risco.

### 5. ConversationPolicy

Responsabilidade:

- detectar qual pergunta de formulário está pendente;
- resolver se o cliente respondeu essa pergunta;
- extrair valor com tipo, confiança e motivo;
- impedir que uma side quest atropele uma pergunta pendente;
- permitir que uma resposta + side quest no mesmo turno sejam processadas juntas.

Esta camada é o coração da experiência premium.

Resolvedores tipados atuais:

```text
resolveShortName
resolveHeightCm
resolveBodyLocation
resolveTattooStyle
```

Contrato conceitual:

```json
{
  "answered": true,
  "value": "Paola",
  "confidence": 0.86,
  "reason": "short_name_suffix"
}
```

Exemplos:

```text
Pergunta pendente: Como posso te chamar?
Cliente: Paola aqui
Resultado: nome_curto = Paola
```

```text
Pergunta pendente: Me diz tua altura?
Cliente: tenho 160
Resultado: altura_cm = 160
```

```text
Pergunta pendente: Tu imagina fazer em qual parte do corpo?
Cliente: bunda
Resultado: local_corpo = glúteo
```

Regra de ouro:

```text
Listas de aliases podem existir como vocabulário de domínio.
Elas não devem ser a arquitetura principal.
```

### 6. Response Composer

Responsabilidade:

- montar a resposta final;
- combinar resposta lateral + retomada de coleta;
- evitar repetição mecânica;
- controlar introdução de primeiro contato;
- usar retomadas curtas quando a frase longa já apareceu;
- manter a pergunta importante no final da última bolha.

Exemplo correto:

```text
Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário.

Boa, Paola. Me diz tua altura?
```

Exemplo que queremos evitar:

```text
Boa, Paola. Me diz tua altura?

Funciona assim...
```

O composer é onde a experiência vira "humana". O router decide o que fazer; o composer decide como falar.

### 7. Agent Operacional / Prompt LLM

Responsabilidade:

- lidar com turnos que exigem raciocínio contextual;
- seguir schema estrito;
- extrair dados complexos;
- lidar com imagens quando necessário;
- continuar fluxos de tattoo, cadastro, proposta, portfolio etc.

O prompt fica nesta camada, mas não pode carregar sozinho responsabilidades críticas.

O prompt deve receber:

- estado atual;
- dados já coletados;
- histórico relevante;
- tenant/config;
- objetivo do estado;
- regras de negócio;
- exemplos/few-shots;
- schema esperado.

O prompt deve devolver:

- `resposta_cliente`;
- `dados_persistidos`;
- `campos_faltando`;
- `campos_conflitantes`;
- `proxima_acao`;
- `estado_novo`;
- flags/side effects quando aplicável.

### 8. Guardrails / Post-Processing

Responsabilidade:

- corrigir falhas previsíveis do LLM;
- impedir avanço perigoso;
- preservar invariantes;
- recuperar dados simples do texto se o agent esquecer;
- forçar pergunta coerente quando resposta vem inválida;
- impedir handoff sem pré-requisitos.

Exemplos atuais:

- não perguntar altura se altura já está persistida;
- recuperar local do corpo do texto quando o agent não persistiu;
- impedir handoff sem foto do local ao menos pedida;
- lidar com imagem ambígua;
- impedir data de nascimento inventada a partir de idade.

Regra estratégica:

```text
Guardrail não deve ser desculpa para prompt ruim.
Prompt bom reduz guardrail; guardrail impede desastre.
```

### 9. Persistência / Supabase

Responsabilidade:

- manter `conversas` como estado consolidado;
- manter `conversa_mensagens` como histórico bruto/processado;
- separar `dados_coletados` de `dados_cadastro`;
- preservar status das mensagens;
- permitir análise pós-smoke.

Critérios de saúde:

- nenhuma mensagem humana deve ficar `received` presa depois do processamento;
- mensagem AI só deve ser inserida se realmente foi enviada;
- estado não deve avançar sem pré-requisito;
- dados coletados não devem ser apagados por respostas vazias.

### 10. Evolution Outbound

Responsabilidade:

- enviar bolhas ao cliente;
- respeitar split por `\n\n`;
- aplicar typing delay;
- não enviar resposta antiga se stale guard abortou.

Valor premium:

O envio em bolhas e com pausa controlada faz o bot parecer menos robótico, mas só funciona se a ordem e o conteúdo estiverem corretos.

## Anatomia Do Prompt Premium

O "prompt premium" não é um bloco único. Ele deve ser composto por camadas.

### Camada A - Persona

Define tom:

- atendente de estúdio;
- humano;
- direto;
- consultivo;
- sem jargão técnico;
- sem soar como formulário.

Exemplo:

```text
Fale como atendente de estúdio de tatuagem. Responda com naturalidade, sem parecer formulário.
```

### Camada B - Objetivo Do Estado

Define missão do momento.

No estado `tattoo`, a missão é coletar:

- `descricao_curta`;
- `local_corpo`;
- `altura_cm`;
- `estilo`;
- foto do local.

No estado `cadastro`, a missão muda:

- nome completo;
- data de nascimento;
- email opcional/recusável;
- liberar orçamento.

### Camada C - Regras De Atendimento

Define etiqueta humana:

- responda dúvida lateral antes de retomar coleta;
- não faça duas perguntas novas ao mesmo tempo;
- não repita campo já respondido;
- se o cliente respondeu e perguntou algo, reconheça a resposta, responda a dúvida e retome;
- mantenha a pergunta de continuidade no final da última bolha.

### Camada D - Regras De Negócio

Define limites do estúdio/SaaS:

- não dar valor fechado sem avaliação;
- tatuador confirma valor e horário;
- foto do local ajuda a avaliar espaço;
- não acionar tatuador antes dos dados necessários;
- não entrar em pagamento/sinal sem proposta.

### Camada E - Contexto

Inclui:

- dados já coletados;
- histórico recente;
- pergunta pendente;
- fotos/imagens;
- configuração do tenant;
- portfolio, quando disponível;
- proposta, quando aplicável.

Sem contexto, o bot repete pergunta.

### Camada F - Output Estruturado

O agent não deve devolver só texto livre.

Precisa devolver estrutura para o sistema validar:

```json
{
  "resposta_cliente": "...",
  "dados_persistidos": {},
  "campos_faltando": [],
  "campos_conflitantes": [],
  "proxima_acao": "pergunta",
  "estado_novo": "tattoo"
}
```

### Camada G - Exemplos / Few-Shots

Few-shots devem ensinar padrões de atendimento, não decorar casos.

Exemplo de padrão:

```text
Cliente responde campo + faz pergunta lateral.
Agente persiste campo, responde lateral, retoma próximo campo.
```

Exemplo ruim:

```text
Cliente diz exatamente "Paola aqui".
Agente faz X.
```

O exemplo bom ensina comportamento; o ruim ensina string.

## Fluxo Ideal De Turno

### Turno 1 - Primeiro contato com dúvida de preço

Cliente:

```text
opa
quero fazer um foguinho na virilha
quanto que é
```

Fluxo:

```text
SessionQueue agrupa
-> Pipeline monta turno
-> Router detecta preco_generico
-> Policy/Router extraem descricao_curta + local_corpo
-> Composer aplica primeiro contato
-> Persistência salva dados
-> WhatsApp envia resposta
```

Resposta esperada:

```text
Oii, tudo bem? Me chamo Assistente, muito prazer.

O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.

Pra montar tua proposta certinho, como posso te chamar?
```

### Turno 2 - Nome + side quest

Cliente:

```text
Paola aqui
como funciona o orçamento?
```

Fluxo:

```text
Policy detecta pergunta pendente: nome_curto
-> resolveShortName extrai Paola
-> Router detecta processo_tatuagem
-> Composer responde lateral e retoma
```

Resposta esperada:

```text
Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário.

Boa, Paola. Me diz tua altura?
```

### Turno 3 - Altura + sessões

Cliente:

```text
tenho 160
sao quantas sessoes pra fazer?
```

Fluxo:

```text
Policy detecta pergunta pendente: altura_cm
-> resolveHeightCm extrai 160
-> Router detecta tempo_sessao
-> Composer responde e retoma estilo
```

Resposta esperada:

```text
O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.

Perfeito. Tu prefere qual estilo pra essa tattoo?
```

### Turno 4 - Estilo + preço repetido

Cliente:

```text
fineline
quanto fica
```

Fluxo:

```text
Policy detecta pergunta pendente: estilo
-> resolveTattooStyle extrai fineline
-> Router detecta preco_generico
-> Composer usa resposta curta porque preço já foi respondido
-> Retoma pedindo foto
```

Resposta esperada:

```text
Isso, o valor fecha depois da avaliação do tatuador.

Com isso já ajuda bastante. Consegue mandar uma foto do local?
```

## Critérios De Atendimento Premium

### PASS Operacional

O fluxo está operacionalmente correto quando:

- todas as mensagens humanas estão `processed`;
- dados obrigatórios da etapa foram persistidos;
- estado não avançou indevidamente;
- não houve handoff prematuro;
- não houve valor inventado;
- não houve mensagem AI não enviada;
- não há `received` preso.

### PASS Conversacional

O fluxo está conversacionalmente correto quando:

- dúvida lateral é respondida antes da retomada;
- a última bolha termina com a pergunta de continuidade;
- não há pergunta em cima de pergunta;
- o bot não repete frase longa sem necessidade;
- o bot reconhece dados dados naturalmente;
- o cliente sente continuidade humana.

### PASS Premium

O fluxo começa a parecer premium quando:

- o bot entende variações naturais;
- o bot não parece formulário;
- o bot mantém contexto entre turnos;
- o bot sabe quando não avançar;
- o bot responde com sobriedade e confiança;
- a segurança operacional não depende de sorte do LLM.

## O Que É Estrutural Versus Pontual

### Estrutural

- `ConversationPolicy` com resolvedores tipados;
- `ResponseComposer` separado;
- aliases de local centralizados;
- `ConversationRouter` antes do agent;
- stale guard no pipeline;
- testes de policy, router, pipeline e agent;
- smoke com validação em Supabase.

### Pontual, Mas Aceitável

- variações de intent como `quanto que é`;
- aliases de nome como `me chama de`;
- aliases de local como `bunda -> glúteo`, `virilha`;
- frases compactas de retomada.

Esses itens são aceitáveis quando vivem dentro da camada certa.

O problema não é ter vocabulário estático. O problema seria espalhar vocabulário estático em várias camadas sem contrato.

### Dívidas Controladas

- intent detection ainda é regex dentro do router;
- `cleanDescricao` ainda possui lista textual de locais;
- cadastro ainda não tem resolvedores tipados completos;
- estilos e locais podem precisar de catálogo mais amplo por estúdio;
- composer ainda tem pouca variação de copy;
- prompt operacional ainda pode responder seco se cair fora do router.

## Plano De Evolução Para Bot Premium

### Slice 1 - Atendimento Lateral Seguro

Status: implementado e validado em smoke.

Inclui:

- preço genérico;
- tempo/sessões;
- processo/orçamento;
- primeiro contato com introdução;
- pergunta de nome antes de formulário técnico;
- resposta lateral antes de retomada.

### Slice 2 - Question Policy Tipada

Status: implementado para campos principais de tattoo.

Inclui:

- nome curto;
- altura;
- local;
- estilo;
- confiança/motivo;
- prevenção de falsos positivos.

### Slice 3 - Naturalidade E Repetição

Status: implementado em primeira versão.

Inclui:

- composer separado;
- retomadas curtas;
- preço repetido com resposta curta;
- fim da última bolha com pergunta de continuidade.

### Slice 4 - Concorrência / Stale Response

Status: implementado.

Inclui:

- detecção de mensagem humana nova durante processamento;
- abort sem update/AI/envio/status;
- retry pelo Durable Object.

### Slice 5 - Cadastro Premium

Próximo território natural, ainda não executar sem plano.

Objetivo:

- aplicar a mesma `QuestionPolicy` para:
  - nome completo;
  - data de nascimento;
  - email;
  - recusa de email;
  - dúvidas laterais durante cadastro.

### Slice 6 - Intent Resolver

Objetivo:

- tirar regex solta de intent do router;
- criar resolvedores de intenção com confidence/reason;
- aproximar intent detection da arquitetura da policy.

### Slice 7 - Prompt Operacional Premium

Objetivo:

- revisar prompts dos agents para trabalhar em harmonia com router/policy/composer;
- reduzir respostas secas quando o agent for chamado;
- reforçar output estruturado e exemplos de turnos humanos.

### Slice 8 - Observabilidade

Objetivo:

- logar intent detectada;
- logar pending question;
- logar resolver usado;
- logar confidence/reason;
- sinalizar stale batch;
- facilitar auditoria pós-smoke.

## Onde Cada Decisão Deve Viver

| Decisão | Camada Correta |
|---|---|
| Agrupar balões humanos | SessionQueue |
| Evitar resposta antiga | Pipeline / stale guard |
| Detectar preço/sessões/processo | ConversationRouter / futuro IntentPolicy |
| Entender resposta para campo pendente | ConversationPolicy |
| Extrair nome/altura/local/estilo simples | ConversationPolicy |
| Montar resposta natural | ResponseComposer |
| Fazer raciocínio contextual complexo | Agent operacional |
| Impedir avanço perigoso | Guardrails / invariants |
| Persistir estado | Pipeline |
| Enviar WhatsApp | Evolution outbound |

## Regras Para Claude Code / Codex

Antes de mexer em prompt, pergunte:

```text
Isto é linguagem, decisão de fluxo, extração de dado, persistência ou segurança?
```

Se for linguagem:

- mexer no prompt ou composer.

Se for decisão de fluxo:

- mexer no router/policy.

Se for extração simples:

- mexer nos resolvers tipados.

Se for persistência:

- mexer no pipeline/tools.

Se for segurança:

- mexer em guardrails/invariants/testes.

Evitar:

- adicionar regex em prompt;
- duplicar alias em várias camadas;
- deixar LLM decidir side effect financeiro;
- corrigir smoke sem teste de regressão;
- avançar etapa sem analisar Supabase.

## Definição De Pronto Para Uma Frente

Uma frente só está pronta quando:

- passou em teste unitário da camada tocada;
- passou em teste de pipeline quando afeta WhatsApp;
- foi deployada;
- smoke real foi rodado;
- Supabase confirmou estado e histórico;
- não há mensagens `received` presas;
- comportamento conversacional foi avaliado, não só estado técnico;
- gaps foram classificados como bloqueadores ou dívidas controladas.

## Leitura Final De General

O bot premium não será vencido com um prompt monolítico.

A vitória vem de uma cadeia de comando:

```text
Mensagem humana
-> turno humano
-> intenção
-> política
-> resposta
-> retomada
-> persistência segura
-> validação
```

O prompt é uma tropa importante, mas não é o general.

O general é a arquitetura.
