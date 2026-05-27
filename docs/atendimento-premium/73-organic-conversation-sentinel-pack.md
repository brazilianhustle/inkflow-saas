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

whatsapp-real-organic-continuous-burst-3-bubbles:
  bolhas: repeticao organica em conversa existente, sem cleanup
  prova: nao pode reabrir com "Oii, tudo bem"; deve agir como continuidade

whatsapp-real-organic-continuous-burst-2-bubbles:
  bolhas: repeticao curta em conversa existente, sem cleanup
  prova: continuidade sem saudacao e sem tratar como lead novo
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
proibido_em_modo_continuo: "Oii", "tudo bem", "me chamo", qualquer saudacao de primeiro contato
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

## Resultado - 2026-05-27

Primeira execucao real falhou e validou o valor do sentinel:

```text
run_id: scenario-whatsapp-real-organic-burst-3-bubbles-20260527T163151Z-11946
resultado: FAIL
cliente: "opa" / "quero fzr uma tattoo" / "na perna um dragao bolado grandao"
bot: "Oii, tudo bem.\n\nQual tua altura?"
causa: Router gravou descricao_curta="fzr" e nao substituiu por "dragao bolado grandao"; resposta nao reagiu ao briefing
decisao: parar testes, corrigir parser/resposta estrutural e repetir sentinel
```

Fix:

```text
commit: 1374747 fix: handle organic tattoo burst briefing
mudanca: parser deixa de aceitar "fzr" como descricao, extrai descricao apos local ("na perna um dragao...") e resposta multi-info reconhece briefing antes da proxima pergunta
testes: npm test PASS 1226/1226
ci: Tests PASS 26524748769
deploy: Deploy PASS 26524751150
```

Validacao definitiva:

```text
3_bolhas: scenario-whatsapp-real-organic-burst-3-bubbles-20260527T163643Z-11019 PASS
2_bolhas: scenario-whatsapp-real-organic-burst-2-bubbles-20260527T163821Z-10923 PASS
naturalness_v2: 2 PASS / 0 watchlist / 0 rework / 0 stop / media 2.88
decisao: sentinel organico vira linha principal para validar experiencia real; Wave 47 pode ser retomada
```

Provas conclusivas reais:

```text
3 bolhas:
Cliente: "opa" / "quero fzr uma tattoo" / "na perna um dragao bolado grandao"
Bot: "Oii, tudo bem. Boa, peguei a ideia do dragao bolado grandao na perna. Qual tua altura?"

2 bolhas:
Cliente: "quero fzr uma tattoo" / "um dragao grandao na perna"
Bot: "Oii, tudo bem. Boa, peguei a ideia do dragao grandao na perna. Qual tua altura?"
```

## Comandos

```bash
BASE_URL=https://inkflowbrasil.com bash scripts/smoke/run-scenario.sh whatsapp-real-organic-burst-3-bubbles
BASE_URL=https://inkflowbrasil.com bash scripts/smoke/run-scenario.sh whatsapp-real-organic-burst-2-bubbles
BASE_URL=https://inkflowbrasil.com bash scripts/smoke/run-scenario.sh whatsapp-real-organic-continuous-burst-3-bubbles
BASE_URL=https://inkflowbrasil.com bash scripts/smoke/run-scenario.sh whatsapp-real-organic-continuous-burst-2-bubbles
```
