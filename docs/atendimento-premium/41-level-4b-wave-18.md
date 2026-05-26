# Level 4B - Wave 18 - Cadastro After Media Naturalness

## Objetivo

Abrir uma onda pequena depois do fechamento da Wave 17 para revalidar a naturalidade de fechamento de cadastro apos midia, sem mexer em menoridade legal, preco fechado, agenda, pagamento, secrets ou 4C.

## Hipotese

Evidencias historicas antigas ainda registram copy como `Fechado` e `valor certinho` em fluxos de cadastro completo. A Wave 17 provou que parte disso era historico e que a copy atual ja esta limpa para e-mail recusado. A proxima confirmacao mais util e o caminho de e-mail valido apos midia.

## Escopo Inicial

```text
wave_id: level4b-wave-18-cadastro-after-media-naturalness
autonomy_level: 4B
tipo: revalidacao primeiro, codigo apenas se necessario
primeiro_cenario_http: cadastro-after-media-email-valido-handoff
primeiro_cenario_whatsapp_real: whatsapp-real-cadastro-after-media-email-valido-handoff
mensagem_alvo: joao@example.com
risco: amarelo baixo
```

## Gates Obrigatorios

- `wave-health` PASS antes de tocar codigo;
- testes focados se houver mudanca de codigo;
- `npm test` se houver mudanca funcional;
- CI/deploy PASS antes de smoke de producao quando houver codigo;
- HTTP radar antes de WhatsApp real;
- WhatsApp real definitivo pela instancia `central`;
- registrar `Provas Conclusivas Reais` no fechamento.

## Stop Conditions

- WhatsApp real FAIL;
- HTTP radar mostrar copy rigida atual (`Fechado`, `valor certinho`, `avaliar com calma`);
- perda de `foto_local_msg_id` ou `refs_imagens_msg_ids`;
- falta de `orcid` no handoff valido;
- qualquer envio indevido de agenda, pagamento, sinal ou preco fechado;
- falha Supabase preflight;
- CI/deploy FAIL.

## Primeiro Ataque

Revalidar `cadastro-after-media-email-valido-handoff` sem alteracao de codigo.

Se PASS com copy atual baixa:

```text
decisao: fechar micro-slice como revalidacao sem codigo
```

Se FAIL por copy rigida:

```text
decisao: corrigir na familia central de voz/handoff, com teste local e ciclo completo
```

## Micro-Slice 1 - E-mail Valido Apos Midia

PASS sem mudanca de codigo: a evidencia historica de fechamento pos-midia com e-mail valido tambem era antiga. O codigo atual ja usa a copy centralizada de handoff e nao voltou para `Fechado`, `valor certinho` ou `avaliar com calma`.

Validacao:

```text
mudanca_de_codigo: nao
wave_health_pre: PASS
http_radar: scenario-cadastro-after-media-email-valido-handoff-20260526T202208Z-30399 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-after-media-email-valido-handoff-20260526T202325Z-13097 PASS
estado_final: aguardando_tatuador
orcid_http: orc_8pq2ko
orcid_real: orc_0cse9z
foto_local_msg_id: 12632
refs_imagens_msg_ids: [11951]
copy_risk: baixo
observabilidade: Router pending_email_answered + Workflow Manager cadastro_and_tattoo_complete + handoff_package_v1
```

Auditoria de naturalidade:

```text
evidencia_nova: baixo
amostra_expandida: 13 evidencias
baixo: 9
medio: 4
alto: 0
decisao: watchlist
observacao: o medio adicional vem de `scenario-whatsapp-real-cadastro-handoff-20260525T222253Z-9952`, evidencia historica com `Fechado`/`valor certinho`; nao e regressao do fluxo pos-midia atual.
```

### Provas Conclusivas Reais - Micro-Slice 1

Cliente: `joao@example.com`

Bot: `Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`

Estado final: `aguardando_tatuador`, `orcid=orc_0cse9z`, `copy_risk=baixo`.

## Decisao Apos Micro-Slice 1

Manter Level 4B. O caminho pos-midia com e-mail valido esta limpo na producao atual e passou no WhatsApp real definitivo pela `central`. Proximo ataque recomendado: revalidar a familia `cadastro-handoff` basica que ainda aparece com evidencia historica media, antes de qualquer nova mudanca de codigo. Nao subir para 4C.

## Micro-Slice 2 - Cadastro Handoff Basico

PASS sem mudanca de codigo: a evidencia historica media do `cadastro-handoff` basico tambem era antiga. O fluxo atual responde a pergunta lateral de tempo e fecha o handoff com a copy centralizada atual.

Validacao:

```text
mudanca_de_codigo: nao
wave_health_pre: PASS
http_radar: scenario-cadastro-handoff-email-recusado-20260526T203228Z-29078 PASS
whatsapp_real: scenario-whatsapp-real-cadastro-handoff-20260526T203258Z-19586 PASS
estado_final: aguardando_tatuador
orcid_http: orc_4h39n6
orcid_real: orc_24av8g
email_recusado: true
copy_risk: baixo
observabilidade: Workflow Manager cadastro_and_tattoo_complete + handoff_package_v1 + trace hp_*
```

Fortalecimento de contrato:

```text
cadastro-handoff-email-recusado: EXPECTED_COPY_RISK_MAX=baixo
whatsapp-real-cadastro-handoff: EXPECTED_COPY_RISK_MAX=baixo
forbidden_copy: Fechado, valor certinho, avaliar com calma, orcamento liberado, preco fechado, agenda, sinal, pagamento
http_contrato_fortalecido: PASS, copy_risk actual=baixo max=baixo, bot text gate PASS
whatsapp_real_contrato_fortalecido: PASS, copy_risk actual=baixo max=baixo, bot text gate PASS
bash_n_envs: PASS
```

Auditoria de naturalidade:

```text
amostra_expandida_com_evidencia_nova: 13 evidencias
baixo: 10
medio: 3
alto: 0
decisao: watchlist
observacao: os 3 medios restantes sao apenas menoridade legal por termos de seguranca/responsavel legal.
```

### Provas Conclusivas Reais - Micro-Slice 2

Cliente: `pode seguir sem email`

Cliente: `quanto tempo demora?`

Bot: `O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.`

Bot: `Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`

Estado final: `aguardando_tatuador`, `orcid=orc_24av8g`, `copy_risk=baixo`.

## Decisao Apos Micro-Slice 2

Manter Level 4B. A Wave 18 removeu os residuos historicos nao-legais de fechamento/handoff da amostra atual. O residual medio ficou restrito a menoridade legal e permanece como watchlist aceitavel por seguranca. Proximo ataque recomendado: fechar Wave 18 ou abrir uma nova onda pequena fora de menoridade, sem subir para 4C.

## Closeout Da Wave 18

Status: PASS.

Resumo:

```text
onda: level4b-wave-18-cadastro-after-media-naturalness
escopo: revalidar fechamento/handoff atual contra evidencias historicas com copy rigida
mudanca_funcional: nao
mudanca_de_contrato: sim, cadastro-handoff agora exige copy_risk=baixo e bloqueia copy antiga/promessas indevidas
http_radar_final: scenario-cadastro-handoff-email-recusado-20260526T203228Z-29078 PASS
whatsapp_real_final: scenario-whatsapp-real-cadastro-handoff-20260526T203258Z-19586 PASS
resultado_final_auditoria: 13 evidencias, 10 baixo, 3 medio, 0 alto
residual_medio: menoridade legal por termos de seguranca/responsavel legal
regressao_aberta: nenhuma
autonomy_level: manter 4B
promocao_4C: bloqueada
```

Entregas:

- e-mail valido apos midia revalidado com HTTP radar e WhatsApp real definitivo;
- cadastro-handoff basico revalidado com HTTP radar e WhatsApp real definitivo;
- residuos historicos nao-legais de `Fechado`, `valor certinho` e `avaliar com calma` removidos da amostra atual;
- contratos `cadastro-handoff-email-recusado` e `whatsapp-real-cadastro-handoff` fortalecidos para impedir retorno da copy antiga;
- auditoria de naturalidade consolidada em `10 baixo`, `3 medio`, `0 alto`.

### Provas Conclusivas Reais - Closeout

Cliente: `joao@example.com`

Bot: `Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`

Cliente: `pode seguir sem email`

Cliente: `quanto tempo demora?`

Bot: `O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.`

Bot: `Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor.`

Decisao final: encerrar a Wave 18. A proxima onda deve continuar em Level 4B, pequena e fora de menoridade legal. Caminhos preferenciais: pos-handoff leve ou lateral/portfolio. Nao subir para 4C.
