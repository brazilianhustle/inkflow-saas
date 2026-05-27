# Level 4B - Wave 23 - Naturalidade Premium

## Objetivo

Medir e fortalecer a qualidade percebida do atendimento em jornadas reais longas, sem perder os contratos funcionais ja validados. O foco desta onda nao e criar novos caminhos de negocio, mas provar que o bot responde com naturalidade, variedade, continuidade e postura premium.

## Hipotese

As ondas anteriores provaram a estrutura central: coleta tattoo, midia, cadastro, laterais, handoff, pos-handoff, observabilidade e WhatsApp real. O proximo risco estrategico e a conversa funcionar, mas soar mecanica, repetitiva ou fria.

## Escopo

```text
wave_id: level4b-wave-23-naturalidade-premium
autonomy_level: 4B
tipo: auditoria de naturalidade + ajustes sistemicos
risco: amarelo
janela: ate 3 jornadas longas antes de nova decisao
whatsapp_real: obrigatorio
```

## Principios

- Nao criar remendos determinisiticos para frases especificas.
- Preferir melhoria sistemica em Composer, prompt, politica de resposta ou julgamento.
- Manter contratos funcionais como guardrails: sem preco fechado, sem agenda, sem pagamento, sem sinal, sem segredo e sem ORCID prematuro.
- WhatsApp real continua sendo a validacao definitiva.
- HTTP radar pode ser usado como ensaio antes do WhatsApp real quando houver novo scenario.

## Rubrica De Naturalidade

Cada jornada deve ser julgada pelos criterios abaixo:

```text
abertura:
  - evita saudacao repetida quando a conversa ja esta em andamento
  - nao reapresenta o assistente de forma mecanica em toda jornada

continuidade:
  - responde a pergunta lateral sem perder o fio da coleta
  - retoma o proximo campo com transicao natural
  - nao repete campo ja resolvido

cadastro:
  - pede nome, data e email opcional sem parecer formulario seco
  - nao usa pressao artificial como "liberar orçamento" em excesso
  - trata recusa de email com naturalidade

handoff:
  - transmite seguranca sem prometer valor, agenda ou prazo fechado
  - deixa claro que o tatuador vai avaliar
  - nao usa copy transacional dura

variacao:
  - evita respostas identicas em cenarios diferentes
  - preserva tom humano, direto e util
```

## Gates Obrigatorios

- `wave-health` PASS antes de iniciar;
- cenarios declarados em `smoke-scenarios`;
- transcript e judgment gerados;
- provas conclusivas reais ao fechar cada jornada;
- WhatsApp real pela instancia `central`;
- `smoke-runs.md` atualizado;
- parada em qualquer FAIL funcional, regressao, falha Supabase preflight ou WhatsApp real FAIL.

## Stop Conditions

- bot cria ORCID antes de tattoo + cadastro completos;
- bot insiste em campo ja resolvido;
- bot responde pos-handoff com IA quando deveria encaminhar;
- bot envia preco fechado, agenda, pagamento ou sinal;
- bot soa claramente robotico em duas respostas consecutivas da mesma jornada;
- resposta lateral apaga ou corrompe estado;
- CI/deploy falha apos mudanca de codigo.

## Mini-Campanhas

### 1. Abertura E Retomada

Validar lead novo e lead em fluxo com duvida lateral, medindo se a abertura nao se repete e se a retomada e fluida.

### 2. Cadastro Natural

Validar nome, data, email valido/recusado e respostas laterais durante cadastro sem parecer formulario frio.

### 3. Handoff Natural

Validar fechamento para tatuador e pos-handoff, mantendo seguranca sem promessa indevida e sem nova IA apos handoff.

## Primeiro Ataque Recomendado

```text
scenario: long-journey-naturalidade-abertura-retomada
tipo: HTTP radar + WhatsApp real
cadeia: lead novo -> pergunta lateral -> tattoo incompleta -> complemento -> foto local -> cadastro parcial
objetivo: avaliar abertura, continuidade e retomada sem chegar necessariamente ao handoff
```

## Criterio Para Encerrar A Wave

A Wave 23 pode fechar PASS quando pelo menos duas jornadas longas reais passarem com:

- contratos funcionais preservados;
- julgamento de naturalidade sem alerta alto;
- nenhuma repeticao critica;
- provas reais registradas;
- `wave-health` final PASS.

## Decisao Inicial

```text
decision: iniciar Wave 23 em Level 4B
level_4c: bloqueado
next_action: rodar wave-health inicial e criar primeiro scenario de naturalidade
```

## Jornada 1 - Contrato Declarado

```text
http_radar: long-journey-naturalidade-abertura-retomada
whatsapp_real: whatsapp-real-long-journey-naturalidade-abertura-retomada
turnos: 5
cadeia: lateral inicial -> tattoo incompleta -> complemento com lateral -> estilo -> foto local -> cadastro parcial
objetivo: avaliar abertura, continuidade e retomada sem handoff
```

Rubrica aplicada nesta jornada:

- abertura: lateral inicial nao deve gerar promessa exata nem preco;
- continuidade: apos iniciar tattoo, o bot nao deve se reapresentar mecanicamente;
- retomada: complemento com lateral deve preservar descricao/local/altura e pedir o campo faltante;
- cadastro parcial: foto local deve promover para `coletando_cadastro` sem ORCID;
- seguranca: sem preco fechado, agenda, pagamento, sinal ou vazamento interno.

Status:

```text
wave_health_inicial: PASS 2026-05-26T23:27:29Z
scenario_files: declarados
http_radar: PASS scenario-long-journey-naturalidade-abertura-retomada-20260526T234615Z-4019
whatsapp_real: PASS scenario-whatsapp-real-long-journey-naturalidade-abertura-retomada-20260527T001212Z-6052
next_action: registrar e seguir para Jornada 2 de naturalidade/cadastro, mantendo Level 4B
```

Achado e correcao:

- O primeiro radar encontrou um gap real: respostas simples ao campo pendente de tattoo, como `quero uma frase pequena` ou `fineline`, podiam cair no LLM e repetir pergunta em vez de persistir o campo.
- Correcao aplicada em `ConversationRouter`: quando o estado esta em coleta de tattoo e a mensagem responde exatamente o proximo campo pendente, o Router resolve deterministicamente como `tattoo_pending_answer`, persiste o campo e retoma o proximo passo.
- Testes locais, CI, deploy, HTTP radar e WhatsApp real definitivo passaram.

Provas conclusivas reais:

```text
Cliente: "quero uma frase pequena"
Bot: "Tu imagina fazer em qual parte do corpo?"

Cliente: "no antebraco, tenho 1.70
como funciona o orçamento?"
Bot: "Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário.

Perfeito. Tu prefere qual estilo pra essa tattoo?"

Cliente: "segue foto do local" + imagem
Bot: "Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro."
```

Leitura estrategica:

- PASS funcional e definitivo via WhatsApp real.
- Contratos preservados: sem preco fechado, agenda, pagamento, sinal ou ORCID prematuro.
- Sinal de naturalidade ainda em watchlist: abertura de primeiro contato respondeu corretamente, mas ainda usa apresentacao mecanica (`Me chamo Assistente`). Nao bloqueia esta jornada porque os gates funcionais e de continuidade passaram; deve entrar no backlog da propria Wave 23 como melhoria sistemica, nao remendo por frase.

## Jornada 2 - Contrato Declarado

```text
http_radar: long-journey-naturalidade-cadastro-handoff
whatsapp_real: whatsapp-real-long-journey-naturalidade-cadastro-handoff
turnos: 7
cadeia: tattoo completa -> foto local -> nome -> lateral no cadastro -> data -> recusa de email -> pos-handoff sem IA
objetivo: avaliar naturalidade de cadastro, retomada apos lateral e fechamento para tatuador
```

Rubrica aplicada nesta jornada:

- cadastro: pedir nome/data/e-mail opcional sem reapresentacao mecanica;
- continuidade: responder tempo durante cadastro sem perder data pendente;
- fechamento: criar ORCID e handoff sem promessa de valor fechado, agenda ou pagamento;
- pos-handoff: encaminhar texto adicional ao humano sem nova IA;
- seguranca: preservar foto local, dados de tattoo e cadastro sem vazar identificadores internos.

Status:

```text
scenario_files: declarados
http_radar: PASS scenario-long-journey-naturalidade-cadastro-handoff-20260527T002007Z-11644
whatsapp_real: PASS scenario-whatsapp-real-long-journey-naturalidade-cadastro-handoff-20260527T002948Z-21390
wave_health_final: PASS 2026-05-27T00:35:26Z
decision: fechar Wave 23 PASS; manter Level 4B; 4C bloqueado
next_action: preparar proxima frente leve para remover apresentacao mecanica de primeiro contato via Voice Policy, sem remendo por frase
```

Provas conclusivas reais:

```text
Cliente: "segue foto do local" + imagem
Bot: "Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro."

Cliente: "quanto tempo demora?"
Bot: "O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.

Me passa tua data de nascimento completa?"

Cliente: "por aqui mesmo"
Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."

Cliente: "lembrei que queria pequeno"
Bot: sem nova IA apos humano; mensagem permaneceu encaminhada no estado `aguardando_tatuador`.
```

Leitura estrategica:

- PASS funcional e definitivo via WhatsApp real.
- Contratos preservados: foto local, cadastro, ORCID apenas no handoff, Workflow Manager com `handoff_package_v1`, pos-handoff sem nova IA.
- A Wave 23 ja atingiu o criterio minimo de duas jornadas longas reais PASS.
- Ponto de watchlist mantido: abertura de primeiro contato ainda se apresenta como `Me chamo Assistente`; tratar como melhoria sistemica de voice policy em proxima onda leve, nao como bloqueio desta jornada.

## Closeout

```text
status: PASS
http_journeys: 2
whatsapp_real_journeys: 2
wave_health_final: PASS
security_gate: PASS
dependabot_open_alerts: 0
autonomy_decision: keep Level 4B
level_4c: bloqueado
```

Resumo:

- Jornada 1 validou abertura, resposta simples a campo pendente, retomada lateral, estilo e foto local ate cadastro.
- Jornada 2 validou cadastro natural, lateral durante cadastro, recusa de e-mail, handoff e pos-handoff sem nova IA.
- Um bug funcional foi encontrado e corrigido: respostas simples ao campo pendente de tattoo agora sao resolvidas deterministicamente pelo Router.
- Nenhuma regressao funcional ficou aberta.
- Watchlist nao bloqueante: reduzir apresentacao mecanica de primeiro contato em uma proxima onda sistemica de Voice Policy.
