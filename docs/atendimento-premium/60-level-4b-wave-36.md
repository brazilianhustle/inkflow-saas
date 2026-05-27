# Level 4B - Wave 36 - Revalidacao Midia Ambigua Atual

## Objetivo

Revalidar o corte atual de imagem ambigua sem legenda durante a coleta de tattoo, garantindo que o bot pede classificacao entre referencia e local do corpo sem perder dados ja coletados e sem avancar para cadastro cedo demais.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: WhatsApp real novo fecha comportamento conversacional quando a familia pode impactar jornadas longas
autonomy_level: 4B
level_4c: bloqueado
```

## Escopo

- `tattoo-media-ambiguous-photo-clarification` HTTP radar;
- `whatsapp-real-tattoo-media-ambiguous-photo-clarification` definitivo;
- imagem real via Evolution `central`;
- persistencia de `refs_imagens_msg_ids`;
- preservacao de dados ja coletados;
- Naturalness V2 nos artifacts atuais.

## Fora De Escopo

- alterar classificacao visual automatica;
- interpretar a imagem como arte real;
- mexer em prompt geral;
- cobrir todos os subcasos de midia nesta wave;
- promover Level 4C.

## Micro-Slice 1 - Foto Ambigua Sem Legenda

```text
status: PASS
http_radar: scenario-tattoo-media-ambiguous-photo-clarification-20260527T060355Z-554
whatsapp_real_novo: scenario-whatsapp-real-tattoo-media-ambiguous-photo-clarification-20260527T060430Z-14319
estado_final: coletando_tattoo
orcid: null
copy_risk: baixo
foto_local_msg_id: null
refs_imagens_msg_ids: 1 item
dados_preservados: descricao_curta/local_corpo/altura_cm
```

## Validacao Final

```text
codigo_alterado: nao
http_radar: PASS
whatsapp_real_novo: PASS
naturalness_v2: 2 PASS / 0 watchlist / 0 rework / 0 stop
estado_final: coletando_tattoo
orcid: null
```

## Provas Conclusivas Reais

```text
Cliente: imagem sem legenda
Bot: "Vi a imagem, mas fiquei em dúvida se ela é referência do desenho ou o local do corpo. Qual dos dois fica valendo?"
```

## Decisao

```text
status: PASS
decisao: corte atual de midia ambigua sem legenda validado em HTTP radar e WhatsApp real novo
mudanca_de_codigo: nao necessaria
proximo_ataque_sugerido: avaliar se deve revalidar confirmacao de midia ambigua como local/referencia ou encerrar frente media por cobertura recente suficiente
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real;
- WhatsApp real novo `central -> bot`;
- estado final `coletando_tattoo`;
- `orcid=null`;
- `foto_local_msg_id=null`;
- `refs_imagens_msg_ids` com 1 item;
- dados existentes preservados;
- sem pedir cadastro antes de esclarecer imagem;
- sem preco, agenda, sinal ou pagamento;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- WhatsApp real ausente;
- imagem ambigua classificada definitivamente sem confirmacao;
- perda de dados ja coletados;
- avanco indevido para cadastro;
- preco, agenda, sinal ou pagamento;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
