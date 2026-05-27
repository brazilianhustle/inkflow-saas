# Level 4B - Wave 37 - Revalidacao Confirmacao De Midia Ambigua

## Objetivo

Revalidar os dois caminhos apos uma imagem ambigua: quando o cliente confirma que a imagem e local do corpo, e quando confirma que e referencia do desenho.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: HTTP radar antes de WhatsApp real definitivo para cada micro-slice conversacional
autonomy_level: 4B
level_4c: bloqueado
```

## Escopo

- `tattoo-media-ambiguous-confirm-local` HTTP radar;
- `whatsapp-real-tattoo-media-ambiguous-confirm-local` definitivo;
- `tattoo-media-ambiguous-confirm-reference` HTTP radar;
- `whatsapp-real-tattoo-media-ambiguous-confirm-reference` definitivo;
- Naturalness V2 nos artifacts atuais;
- registro curto de provas reais.

## Fora De Escopo

- mudar copy antes de falha atual;
- revalidar todos os subcasos de midia;
- mexer em preco, agenda, sinal ou pagamento;
- promover Level 4C.

## Micro-Slice 1 - Confirmar Como Local

```text
status: PASS
http_radar: scenario-tattoo-media-ambiguous-confirm-local-20260527T061557Z-16380
whatsapp_real_novo: scenario-whatsapp-real-tattoo-media-ambiguous-confirm-local-20260527T061627Z-26510
estado_final: coletando_cadastro
orcid: null
foto_local_msg_id: 11951
```

## Micro-Slice 2 - Confirmar Como Referencia

```text
status: PASS
http_radar: scenario-tattoo-media-ambiguous-confirm-reference-20260527T061657Z-12050
whatsapp_real_novo: scenario-whatsapp-real-tattoo-media-ambiguous-confirm-reference-20260527T061729Z-23089
estado_final: coletando_tattoo
orcid: null
foto_local_msg_id: null
refs_imagens_msg_ids: 1 item
tentativas_foto_local: 1
```

## Validacao Final

```text
codigo_alterado: nao
http_radar_local: PASS
whatsapp_real_local: PASS
http_radar_referencia: PASS
whatsapp_real_referencia: PASS
naturalness_v2: 4 PASS / 0 watchlist / 0 rework / 0 stop
```

## Provas Conclusivas Reais

```text
Confirmacao como local:
Cliente: "é local do corpo"
Bot: "Perfeito, vou usar essa imagem como foto do local. Me passa nome completo e data de nascimento pra eu montar o cadastro?"

Confirmacao como referencia:
Cliente: "é referência do desenho"
Bot: "Perfeito, deixei essa imagem como referência do desenho. Agora me manda a foto do local onde tu quer tatuar."
```

## Decisao

```text
status: PASS
decisao: caminhos de confirmacao de midia ambigua validados em HTTP radar e WhatsApp real novo
mudanca_de_codigo: nao necessaria
proximo_ataque_sugerido: voltar para jornada maior de midia + cadastro + handoff ou abrir auditoria de cobertura restante
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real de cada caminho;
- WhatsApp real novo `central -> bot`;
- confirmacao como local promove `foto_local_msg_id`;
- confirmacao como referencia preserva `foto_local_msg_id=null` e pede foto do local;
- dados ja coletados preservados;
- `orcid=null`;
- sem preco, agenda, sinal ou pagamento;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- WhatsApp real ausente;
- caminho local e referencia confundidos;
- perda de dados ja coletados;
- criacao indevida de orcamento;
- preco, agenda, sinal ou pagamento;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
