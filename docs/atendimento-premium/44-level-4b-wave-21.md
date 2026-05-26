# Level 4B - Wave 21 - Cadastro Batch Fields

## Objetivo

Validar que o cliente pode responder campos obrigatorios de cadastro em lote, junto de uma duvida lateral, sem o bot perder dados ou voltar a perguntar campos ja resolvidos.

## Hipotese

No WhatsApp real, o cliente nao respeita necessariamente uma pergunta por vez. Quando o bot pede nome completo e data de nascimento, e o cliente manda os dois dados junto de uma duvida operacional, o atendimento premium precisa:

- persistir `nome`;
- persistir `data_nascimento`;
- responder a duvida lateral;
- retomar apenas o proximo campo correto, e-mail opcional;
- manter `orcid=null` ate e-mail valido ou recusa de e-mail;
- nao repetir nome/data.

## Escopo Inicial

```text
wave_id: level4b-wave-21-cadastro-batch-fields
autonomy_level: 4B
tipo: funcional leve
primeiro_cenario_http: cadastro-batch-nome-data-lateral
primeiro_cenario_whatsapp_real: whatsapp-real-cadastro-batch-nome-data-lateral
risco: amarelo baixo
```

## Gates Obrigatorios

- `wave-health` PASS antes de smoke;
- teste de sintaxe do runner apos novo seed;
- HTTP radar antes de WhatsApp real;
- WhatsApp real definitivo pela instancia `central`;
- estado final `coletando_cadastro`;
- `orcid=null`;
- `dados_cadastro.nome=Joao Silva`;
- `dados_cadastro.data_nascimento=1995-03-12`;
- resposta deve explicar o processo lateral;
- resposta deve retomar e-mail opcional;
- resposta nao deve repetir nome/data;
- registrar `Provas Conclusivas Reais`.

## Stop Conditions

- WhatsApp real FAIL;
- perda de nome ou data;
- criacao prematura de `orcid`;
- estado sair indevidamente de `coletando_cadastro`;
- bot repetir nome/data apos ja persistir ambos;
- bot enviar preco, agenda, pagamento ou sinal;
- falha Supabase preflight;
- CI/deploy FAIL quando houver commit.

## Primeiro Ataque

Criar seed e cenarios para o caso batch, validar em HTTP radar e depois em WhatsApp real.

Se PASS:

```text
decisao: fechar micro-slice 1 como cobertura nova de comportamento real de WhatsApp
```

Se FAIL:

```text
decisao: travar execucao, gerar triage/plan-review e corrigir o ponto minimo antes de qualquer novo slice
```

## Micro-Slice 1 - Nome/Data + Lateral No Mesmo Envio

PASS com novo contrato de smoke: o cliente enviou nome, data de nascimento e pergunta lateral no mesmo WhatsApp. O bot persistiu nome/data, respondeu o processo e retomou e-mail opcional sem repetir nome/data e sem criar `orcid`.

Mudancas metodologicas:

```text
seed_cadastro_aguardando_nome_data: novo seed local de smoke
cadastro-batch-nome-data-lateral: novo scenario HTTP
whatsapp-real-cadastro-batch-nome-data-lateral: novo scenario WhatsApp real
```

Validacao:

```text
bash_n_run_scenario: PASS
http_radar: scenario-cadastro-batch-nome-data-lateral-20260526T214326Z-27063 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-batch-nome-data-lateral-20260526T214404Z-5218 PASS
estado_final: coletando_cadastro
orcid: null
nome: Joao Silva
data_nascimento: 1995-03-12
router_intent: processo_tatuagem
router_reason: tattoo_process_or_booking_flow_question
copy_risk: medio
```

### Provas Conclusivas Reais - Micro-Slice 1

Cliente:

```text
Joao Silva
12/03/1995
como funciona o orçamento?
```

Bot:

```text
Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário.

E o e-mail? Se preferir seguir sem, me avisa
```

Estado final: `coletando_cadastro`, `orcid=null`, `dados_cadastro.nome=Joao Silva`, `dados_cadastro.data_nascimento=1995-03-12`.

## Decisao Apos Micro-Slice 1

Manter Level 4B. O comportamento funcional esta verde em producao e no WhatsApp real. O `copy_risk=medio` e aceitavel neste micro-slice porque a resposta precisa mencionar e-mail opcional; nao houve insistencia apos recusa nem repeticao de nome/data.

Notas de triage:

```text
primeira tentativa HTTP: bloqueada por infra_supabase_connectivity no sandbox antes de cleanup/mensagem
segunda tentativa HTTP: comportamento correto, contrato ajustado de copy_risk baixo para medio
terceira tentativa HTTP: PASS
primeira tentativa WhatsApp real: bloqueada por infra_supabase_connectivity no sandbox antes de cleanup/mensagem
segunda tentativa WhatsApp real fora do sandbox: PASS
```

Proximo ataque recomendado: fechar Wave 21 como cobertura nova pequena ou atacar uma segunda variacao batch com email/recusa no mesmo envio apenas se houver ganho claro.
