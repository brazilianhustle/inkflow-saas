# Level 4B - Wave 20 - Cadastro Lateral Recovery

## Objetivo

Validar que duvidas laterais durante cadastro pendente sao respondidas sem perder a pergunta operacional pendente e sem promover handoff antes da hora.

## Hipotese

O cliente real no WhatsApp frequentemente interrompe o cadastro com duvidas simples, como tempo de sessao. O bot premium precisa responder a duvida, preservar o estado `coletando_cadastro` e retomar exatamente o dado que faltava. Depois, quando o cliente responde esse dado, o fluxo deve continuar sem repetir pergunta ja resolvida e sem criar orcamento prematuro.

## Escopo Inicial

```text
wave_id: level4b-wave-20-cadastro-lateral-recovery
autonomy_level: 4B
tipo: funcional leve
primeiro_cenario_http: cadastro-lateral-data-recovery
primeiro_cenario_whatsapp_real: whatsapp-real-cadastro-lateral-data-recovery
risco: amarelo baixo
```

## Gates Obrigatorios

- `wave-health` PASS antes de tocar codigo;
- se houver mudanca funcional, testes focados e CI/deploy PASS antes de smoke de producao;
- HTTP radar antes de WhatsApp real;
- WhatsApp real definitivo pela instancia `central`;
- estado final permanece `coletando_cadastro`;
- `orcid=null`;
- nome existente preservado;
- data de nascimento persistida apenas no turno da data;
- resposta lateral nao pede e-mail antes da data;
- resposta apos data pede e-mail sem repetir data;
- Workflow Manager registra preservacao por policy em pergunta lateral;
- ConversationRouter registra resposta de data pendente;
- registrar `Provas Conclusivas Reais` no fechamento.

## Stop Conditions

- WhatsApp real FAIL;
- estado sair indevidamente de `coletando_cadastro`;
- criacao de `orcid` antes de cadastro completo;
- e-mail ser pedido antes da data;
- data nao persistir apos resposta `12/03/1995`;
- repeticao da pergunta de data depois que a data ja foi persistida;
- resposta com preco, agenda, pagamento ou sinal;
- falha Supabase preflight;
- CI/deploy FAIL quando houver codigo.

## Primeiro Ataque

Executar `cadastro-lateral-data-recovery` e `whatsapp-real-cadastro-lateral-data-recovery` sem alterar codigo.

Se PASS:

```text
decisao: fechar micro-slice como revalidacao funcional e escolher proxima variacao pequena da mesma familia
```

Se FAIL:

```text
decisao: travar execucao, gerar triage/plan-review e corrigir o ponto minimo antes de qualquer novo slice
```

## Micro-Slice 1 - Lateral Durante Cadastro Pendente De Data

PASS sem mudanca de codigo: pergunta lateral de tempo durante cadastro pendente de data preservou a fase, respondeu a duvida e retomou a data. No turno seguinte, a data foi persistida e o fluxo avancou para e-mail opcional sem repetir data e sem criar orcamento.

Validacao:

```text
mudanca_funcional_bot: nao
http_radar: scenario-cadastro-lateral-data-recovery-20260526T211602Z-31472 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-lateral-data-recovery-20260526T211646Z-28418 PASS
estado_final: coletando_cadastro
orcid: null
nome: Joao Silva
data_nascimento: 1995-03-12
step_1_workflow_reason: state_preserved_by_router_policy
step_2_router_reason: pending_data_nascimento_answered
copy_risk_step_1: baixo
copy_risk_step_2: medio
```

### Provas Conclusivas Reais - Micro-Slice 1

Cliente: `quanto tempo demora?`

Bot: `O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.`

Cliente: `12/03/1995`

Bot: `E o e-mail? Se preferir seguir sem, me avisa`

Estado final: `coletando_cadastro`, `orcid=null`, `dados_cadastro.nome=Joao Silva`, `dados_cadastro.data_nascimento=1995-03-12`.

## Decisao Apos Micro-Slice 1

Manter Level 4B. O comportamento atual esta funcional e foi validado em WhatsApp real. O risco medio do segundo turno e esperado pelo julgador deterministico porque a resposta menciona e-mail; nao e regressao, pois e-mail e exatamente o proximo campo opcional do cadastro.

Proximo ataque recomendado: escolher uma segunda variacao pequena da mesma familia, preferencialmente cadastro pendente de nome com duvida lateral ou cadastro vazio retomando nome/data, sem alterar preco, agenda, pagamento, secrets ou 4C.

## Micro-Slice 2 - Lateral Durante Cadastro Vazio

PASS sem mudanca de codigo: pergunta lateral de tempo durante cadastro ainda sem nome preservou a fase, respondeu a duvida e retomou nome completo + data de nascimento sem pedir e-mail antes da hora e sem criar orcamento.

Validacao:

```text
mudanca_funcional_bot: nao
http_radar: scenario-cadastro-resume-nome-data-natural-20260526T213201Z-8633 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-resume-nome-data-natural-20260526T213232Z-28275 PASS
estado_final: coletando_cadastro
orcid: null
dados_cadastro: {}
workflow_reason: state_preserved_by_router_policy
copy_risk: baixo
```

### Provas Conclusivas Reais - Micro-Slice 2

Cliente: `quanto tempo demora?`

Bot: `O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.`

Retomada operacional no mesmo turno: `Pra montar teu cadastro, me passa teu nome completo e data de nascimento?`

Estado final: `coletando_cadastro`, `orcid=null`, `dados_cadastro={}`.

## Decisao Apos Micro-Slice 2

Manter Level 4B. A Wave 20 ja cobriu dois pontos da familia: cadastro pendente de data com recuperacao multi-turn e cadastro vazio com retomada nome/data. Proximo ataque recomendado: escolher uma terceira variacao estreita se houver ganho claro, ou fechar Wave 20 para evitar repeticao de revalidacoes ja saudaveis.

## Closeout - Wave 20

PASS. A onda validou recuperacao de cadastro apos duvida lateral sem alterar codigo funcional. Os dois pontos principais da familia passaram em HTTP radar e WhatsApp real definitivo:

```text
cadastro pendente de data:
- HTTP: scenario-cadastro-lateral-data-recovery-20260526T211602Z-31472 PASS
- WhatsApp real: scenario-whatsapp-real-cadastro-lateral-data-recovery-20260526T211646Z-28418 PASS
- estado_final: coletando_cadastro
- orcid: null
- data_nascimento: 1995-03-12 apos o segundo turno

cadastro vazio:
- HTTP: scenario-cadastro-resume-nome-data-natural-20260526T213201Z-8633 PASS
- WhatsApp real: scenario-whatsapp-real-cadastro-resume-nome-data-natural-20260526T213232Z-28275 PASS
- estado_final: coletando_cadastro
- orcid: null
- dados_cadastro: {}
```

Provas conclusivas reais:

```text
Cliente: quanto tempo demora?
Bot: O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.

Cliente: 12/03/1995
Bot: E o e-mail? Se preferir seguir sem, me avisa

Cliente: quanto tempo demora?
Bot: O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.
Retomada: Pra montar teu cadastro, me passa teu nome completo e data de nascimento?
```

Gates finais:

```text
wave_health: PASS
autonomy_gate: keep
security_gate: PASS
dependabot: 0 alertas abertos
evidence_orphan_gate: PASS com WARNs historicos nao bloqueantes
worktree: clean antes do closeout doc
```

Decisao:

```text
wave_status: closed_pass
autonomy_level: manter 4B
level_4c: bloqueado
proximo_ataque: abrir nova onda leve fora de preco/agenda/pagamento/secrets
```
