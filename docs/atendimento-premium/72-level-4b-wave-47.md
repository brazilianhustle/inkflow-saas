# Level 4B - Wave 47 - Replanejamento E Novo Pedido

## Objetivo

Provar que o bot lida com mudanca de ideia, novo pedido ou complemento relevante depois de conversa avancada/terminal sem grudar no orcamento antigo, sem criar duplicidade e sem reabrir IA quando o humano ja assumiu.

## Status

```text
status: pausada_antes_da_execucao
motivo: regressao organica identificada em teste manual WhatsApp real antes do primeiro micro-slice
decisao: executar Organic Conversation Sentinel Pack com 2 e 3 bolhas reais antes de qualquer smoke conversacional novo desta Wave
```

## Nota De Replanejamento

O teste manual real mostrou que a conversa organica pode degradar para coleta de formulario mesmo quando os micro-slices controlados passam. Esta Wave continua correta como frente de risco operacional, mas nao deve iniciar enquanto a metodologia nao provar o comportamento organico basico de primeiro contato e consolidacao multi-bolha.

Proxima acao antes do Micro-Slice 1:

```text
1. rodar `whatsapp-real-organic-burst-3-bubbles`;
2. rodar `whatsapp-real-organic-burst-2-bubbles`;
3. registrar transcript, tail, agent logs, estado final e julgamento;
4. atualizar active context;
5. so entao retomar o contrato pos-handoff desta Wave.
```

## Strategic Slice Gate

```text
hipotese_estrategica: o bot preserva seguranca operacional quando o cliente muda de direcao depois de handoff ou em conversa antiga
tipo: produto + risco
risco_principal: duplicar orcamento, reabrir coleta indevidamente, misturar novo pedido com ORCID antigo ou responder IA depois de handoff humano
evidencia_minima: pelo menos 1 cenario terminal pos-handoff com texto de novo pedido/mudanca de ideia, HTTP radar + WhatsApp real, ai_messages_after_last_human=0 e estado terminal preservado
whatsapp_real_obrigatorio: sim, porque e comportamento conversacional e operacional percebido pelo cliente/tatuador
criterio_de_fechamento: mensagem nova do cliente chega ao humano sem IA nova, sem novo ORCID, sem mudanca de estado e com evidencia legivel
decisao_liberada_se_passar: separar replanejamento terminal como coberto por handoff humano; proximo gap passa a ser replanejamento antes do handoff ou conversa antiga nao-terminal
```

## Terreno Atual

O sistema ja tem defesa forte para pos-handoff:

- `aguardando_tatuador` e estado terminal;
- encaminhamento de texto e midia ao humano;
- `SMOKE_REQUIRE_AI_RESPONSE=0` em cenarios pos-handoff;
- Naturalness V2 calibrado para tratar ausencia de IA como sucesso operacional;
- evidencias previas de texto/midia pos-handoff.

O gap desta Wave nao e "qualquer pos-handoff". O gap e semantico: mensagem que parece novo pedido, mudanca de ideia ou alteracao de briefing depois que o humano ja assumiu.

## Fora De Escopo

```text
financeiro: fora
agenda/pagamento/sinal: fora
novo motor automatico de replanejamento: fora
criar novo ORCID automatico: fora
responder com IA depois de handoff: fora neste primeiro corte
```

## Micro-Slice 1 - Novo Pedido Depois Do Handoff

```text
status: bloqueado_ate_organic_sentinel_passar
tipo: regressao forte + risco operacional
setup: seed_pos_handoff_aguardando_tatuador
mensagem: "mudei de ideia, queria uma caveira na perna"
contrato: encaminhar ao tatuador sem IA nova, manter aguardando_tatuador, preservar orcid existente, nao criar novo orcamento
```

## Gates

```text
http_radar: obrigatorio
whatsapp_real: obrigatorio
expected_state: aguardando_tatuador
require_ai_response: 0
orcid: preservado
novo_orcid: proibido
ai_messages_after_last_human: 0
tail: pos-handoff-mensagem-encaminhada
forbidden_tail: enviar-orcamento|runAgent|openai|pipeline batch failed|unhandled
```

## Criterios De Parada

```text
qualquer IA nova depois do humano
estado sair de aguardando_tatuador
novo ORCID criado
mensagem nao encaminhada ao humano
tail com runAgent/openai/enviar-orcamento
WhatsApp real ausente
```

## Proxima Decisao Apos Micro-Slice 1

Se passar sem mudanca de codigo, registrar como cobertura terminal de novo pedido pos-handoff e decidir:

- atacar replanejamento antes do handoff, quando ainda ha coleta ativa;
- ou atacar conversa antiga nao-terminal/retomada;
- ou fechar a frente se o risco terminal era o principal alvo.
