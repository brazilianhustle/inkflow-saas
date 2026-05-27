# Level 4B - Wave 44 - Auditoria Final De Jornada Premium

## Objetivo

Provar a experiencia completa do bot premium depois da limpeza final de midia/cadastro, usando jornadas longas atuais em HTTP radar e WhatsApp real.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/68-frentes-finais-bot-premium.md
autonomy_level: 4B
level_4c: bloqueado
regra: jornada conversacional nao fecha sem WhatsApp real quando houver duvida de validade
```

## Escopo

1. `long-journey-lateral-media-cadastro-handoff`
   - lateral inicial de orcamento;
   - coleta de tattoo;
   - foto local;
   - cadastro;
   - recusa de e-mail;
   - handoff com `orcid`.

2. `long-journey-cadastro-lateral-handoff`
   - coleta de tattoo;
   - foto local;
   - cadastro;
   - lateral de tempo durante cadastro;
   - handoff;
   - pos-handoff sem nova IA.

3. `long-journey-naturalidade-abertura-retomada`
   - abertura com duvida lateral;
   - retomada de tattoo;
   - complemento com lateral;
   - estilo;
   - foto local;
   - entrada em cadastro.

## Fora De Escopo

- nova copy sem evidencia;
- financeiro, agenda, pagamento ou sinal;
- promocao para Level 4C;
- nova automacao de produto.

## Gates

```text
http_radar: obrigatorio antes do WhatsApp real
whatsapp_real: obrigatorio para cada jornada
naturalness_v2: obrigatorio no pacote final
estado: coerente por step
orcid: criado somente nos handoffs
pos_handoff: sem nova IA apos complemento
copy_antiga: bloqueada quando o contrato da familia exigir
```

## Micro-Slices

```text
1. jornada lateral + midia + cadastro + handoff: PASS
2. jornada cadastro + lateral + handoff + pos-handoff: PASS
3. jornada abertura + retomada sem handoff: PASS
```

## Evidencias

### Jornada 1 - lateral + midia + cadastro + handoff

```text
http_radar: PASS
http_run_id: scenario-long-journey-lateral-media-cadastro-handoff-20260527T073849Z-1996
whatsapp_real: PASS
whatsapp_real_run_id: scenario-whatsapp-real-long-journey-lateral-media-cadastro-handoff-20260527T074039Z-30126
estado_final: aguardando_tatuador
orcid: orc_yvxnwa
midia: foto_local_msg_id=13254, foto_local_file_id presente
cadastro: nome=Joao Silva, data_nascimento=1995-03-12, email_recusado=true
workflow_manager: cadastro_and_tattoo_complete + handoff_package_v1 PASS
```

Provas conclusivas reais: Cliente: "pode seguir sem email" -> Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."

Observacao: a abertura lateral ainda tende a perguntar nome antes de pedir ideia quando o cliente pergunta apenas "como funciona o orçamento?". Como a jornada fechou funcionalmente e a Naturalness V2 retornou PASS, fica como radar de refinamento futuro, nao bloqueio.

### Jornada 2 - cadastro + lateral + handoff + pos-handoff

```text
http_radar: PASS
http_run_id: scenario-long-journey-cadastro-lateral-handoff-20260527T074242Z-27305
whatsapp_real: PASS
whatsapp_real_run_id: scenario-whatsapp-real-long-journey-cadastro-lateral-handoff-20260527T074445Z-26553
estado_final: aguardando_tatuador
orcid: orc_ao93kh
midia: foto_local_msg_id=13277, foto_local_file_id presente
lateral_cadastro: tempo_sessao respondeu e preservou estado/dados
pos_handoff: Cliente "lembrei que queria pequeno" sem nova IA
workflow_manager: cadastro_and_tattoo_complete + handoff_package_v1 PASS
```

Provas conclusivas reais: Cliente: "prefiro falar por aqui" -> Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."; Cliente: "lembrei que queria pequeno" -> Bot: sem nova resposta automatica apos o humano.

### Jornada 3 - abertura + retomada sem handoff

```text
http_radar: PASS
http_run_id: scenario-long-journey-naturalidade-abertura-retomada-20260527T074704Z-13873
whatsapp_real: PASS
whatsapp_real_run_id: scenario-whatsapp-real-long-journey-naturalidade-abertura-retomada-20260527T074830Z-497
estado_final: coletando_cadastro
orcid: null
midia: foto_local_msg_id=13306
dados_coletados: frase pequena, antebraco, altura_cm=170, estilo=fineline
retomada: respondeu duvidas laterais e continuou coleta sem repetir campos ja dados
```

Provas conclusivas reais: Cliente: "no antebraco, tenho 1.70\ncomo funciona o orçamento?" -> Bot: "Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário. Perfeito. Tu prefere qual estilo pra essa tattoo?"; Cliente: "segue foto do local" + imagem -> Bot: "Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro."

## Naturalness V2

```text
auditor: scripts/smoke/naturalness-audit-v2.sh
evidencias: 3 WhatsApp real
resultado: PASS
pass: 3
watchlist: 0
rework: 0
stop: 0
media_geral: 2.88
```

## Stop Conditions

- qualquer FAIL em HTTP radar;
- qualquer FAIL em WhatsApp real;
- Naturalness V2 REWORK/STOP;
- `orcid` criado antes da hora;
- IA responder no pos-handoff onde nao deve;
- perda de midia/cadastro;
- preco fechado, agenda, sinal ou pagamento;
- divergencia entre HTTP e WhatsApp real.

## Status

```text
status: fechada_pass
decisao: Wave 44 concluiu auditoria final de jornadas premium atuais dentro do Level 4B
proxima_frente: abrir Wave 45 para Naturalidade Premium por familia ou Tenant/Config modo produto, sem promover 4C ainda
```
