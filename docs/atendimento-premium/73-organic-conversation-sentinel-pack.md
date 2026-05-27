# Organic Conversation Sentinel Pack

## Objetivo

Tornar WhatsApp real organico a linha principal de validacao do bot premium. O pacote prova se o bot entende bolhas reais de cliente, consolida contexto e responde como atendimento humano assistido, nao como formulario.

## Hipotese Estrategica

```text
hipotese: quando o cliente envia 2 ou 3 bolhas seguidas com saudacao, intencao e briefing, o bot deve esperar/consolidar o turno e responder ao contexto completo
tipo: produto + regressao + metodologia
risco_principal: micro-slices controlados passarem enquanto a conversa real vira formulario
evidencia_minima: WhatsApp real central -> bot com 2-bubbles e 3-bubbles, transcript, tail, poll, agent_turn_logs e judgment
criterio_de_fechamento: uma unica resposta AI apos a ultima bolha, estado seguro, dados principais persistidos e bot reagindo ao briefing real
decisao_liberada_se_passar: retomar Wave 47
decisao_se_falhar: parar plano funcional e corrigir falha estrutural de batching/router/contexto/voice antes de novos slices
```

## Cenários

```text
whatsapp-real-organic-burst-3-bubbles:
  bolhas: "opa" / "quero fzr uma tattoo" / "na perna um dragao bolado grandao"
  prova: saudacao + intencao + local + ideia + tamanho em 3 bolhas reais

whatsapp-real-organic-burst-2-bubbles:
  bolhas: "quero fzr uma tattoo" / "um dragao grandao na perna"
  prova: intencao + briefing condensado em 2 bolhas reais
```

## Gates

```text
origem: Evolution central -> bot oficial
tipo: whatsapp_real_burst
respostas_entre_bolhas: proibidas
ai_messages_total: 1
estado_final: coletando_tattoo
orcid: null
dados_obrigatorios: descricao_curta contem dragao; local_corpo contem perna
resposta_obrigatoria: mencionar/reagir a dragao, perna ou grandao
proibido: perguntar parte do corpo ja informada, perguntar apenas altura como resposta inteira, preco, agenda, sinal, ORCID ou apresentacao mecanica
```

## Decisão Operacional

```text
PASS nos dois cenarios:
  seguir para Wave 47.

FAIL em qualquer cenario:
  nao continuar teste funcional.
  abrir triage estrutural.
  classificar causa entre batching/debounce, Router, parser de campos, VoicePolicy, Workflow ou persistencia.
  corrigir a camada causal e repetir o mesmo sentinel antes de qualquer nova onda.
```

## Comandos

```bash
BASE_URL=https://inkflowbrasil.com bash scripts/smoke/run-scenario.sh whatsapp-real-organic-burst-3-bubbles
BASE_URL=https://inkflowbrasil.com bash scripts/smoke/run-scenario.sh whatsapp-real-organic-burst-2-bubbles
```
