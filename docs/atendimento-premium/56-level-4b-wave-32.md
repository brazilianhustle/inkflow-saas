# Level 4B - Wave 32 - Revalidacao Lateral Tempo/Processo

## Objetivo

Revalidar a familia lateral de primeiro contato para tempo de sessao e processo de tatuagem, garantindo que o comportamento atual nao usa apresentacao mecanica antiga e continua seguro em HTTP radar e WhatsApp real.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: evidencia antiga com duvida de validade exige WhatsApp real novo
autonomy_level: 4B
level_4c: bloqueado
```

## Motivo Do Ataque

Evidencias historicas de `whatsapp-real-lateral-tempo-sessao` e `whatsapp-real-lateral-processo-tatuagem` ainda mostram a apresentacao antiga `Me chamo Assistente, muito prazer`.

Como waves posteriores corrigiram a voz em outros caminhos de primeiro contato, nao e profissional fechar essa familia apenas reaproveitando evidencia antiga. A regra correta e gerar validacao atual.

## Escopo

- `lateral-tempo-sessao` HTTP radar;
- `whatsapp-real-lateral-tempo-sessao` definitivo;
- `lateral-processo-tatuagem` HTTP radar;
- `whatsapp-real-lateral-processo-tatuagem` definitivo;
- Naturalness V2 nos novos artifacts;
- registro curto de provas reais.

## Fora De Escopo

- mudar copy antes de evidencia atual falhar;
- mexer em Router, Policy, Workflow, Handoff ou Tenant;
- ampliar para portfolio, imagem, historia de vida ou preco;
- promover Level 4C.

## Micro-Slice 1 - Tempo De Sessao Atual

```text
status: PASS
http_radar: scenario-lateral-tempo-sessao-20260527T052810Z-18380
whatsapp_real_novo: scenario-whatsapp-real-lateral-tempo-sessao-20260527T052844Z-22092
estado_final: coletando_tattoo
orcid: null
copy_risk: baixo
naturalness_v2: PASS
```

## Micro-Slice 2 - Processo De Tatuagem Atual

```text
status: PASS
http_radar: scenario-lateral-processo-tatuagem-20260527T052909Z-8541
whatsapp_real_novo: scenario-whatsapp-real-lateral-processo-tatuagem-20260527T052933Z-10010
estado_final: coletando_tattoo
orcid: null
copy_risk: baixo
naturalness_v2: PASS
```

## Naturalness V2

```text
evidencias_analisadas: 4
pass: 4
watchlist: 0
rework: 0
stop: 0
media_geral: 2.88
decisao: PASS
```

## Provas Conclusivas Reais

```text
Cliente: "quanto tempo demora pra fazer uma tattoo no braço?"
Bot: "Oii, tudo bem. O tempo de sessão depende do tamanho, detalhe e local do corpo..."

Cliente: "como funciona pra fazer uma tattoo?"
Bot: "Oii, tudo bem. Funciona assim: eu entendo tua ideia, junto as infos principais..."
```

## Decisao

```text
status: PASS
decisao: familia lateral tempo/processo atual validada
codigo_alterado: nao
whatsapp_real_novo: sim
motivo: evidencia antiga tinha duvida de validade por copy mecanica pre-Voice Policy
proximo_ataque_sugerido: portfolio ou imagem/historia de vida, usando a mesma regra de validade de evidencia
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real;
- WhatsApp real novo `central -> bot`;
- estado final `coletando_tattoo`;
- `orcid=null`;
- sem preco fechado, agenda, sinal, pagamento ou promessa operacional;
- sem `Me chamo` e sem `muito prazer`;
- agent logs confirmando Router lateral com `can_mutate_state=false`;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- resposta com apresentacao mecanica antiga;
- WhatsApp real ausente;
- estado incoerente;
- mutacao indevida de fluxo;
- promessa de tempo exato, preco, agenda, sinal ou pagamento;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
