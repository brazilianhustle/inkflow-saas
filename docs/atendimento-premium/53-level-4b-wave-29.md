# Level 4B - Wave 29 - Auditoria Cadastro/Handoff

## Objetivo

Auditar a familia de cadastro e handoff com Naturalness Audit V2 antes de qualquer nova mudanca de copy ou comportamento. A onda existe para descobrir watchlists reais atuais e evitar remendos por sensacao.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: evidencia real -> auditoria V2 -> familia definida -> mudanca somente se justificada
autonomy_level: 4B
level_4c: bloqueado
```

## Escopo

- cadastro pendente com lateral;
- retomada nome/data;
- e-mail opcional;
- recusa de e-mail;
- e-mail valido;
- handoff de orcamento;
- jornada longa com cadastro + handoff;
- pos-handoff sem nova IA quando aplicavel.

## Fora De Escopo

- mudar copy antes da auditoria;
- alterar menoridade legal sem frente dedicada;
- tocar preco fechado, agenda, pagamento ou sinal;
- mexer em secrets;
- promover Level 4C;
- executar WhatsApp real novo nesta primeira etapa read-only.

## Micro-Slice 1 - Auditoria Read-Only

```text
tipo: diagnostico
ferramenta: scripts/smoke/naturalness-audit-v2.sh
entrada: evidencias WhatsApp real recentes ja aprovadas
status: PASS_WITH_HISTORICAL_WATCHLIST
evidencias_analisadas: 27
pass: 24
watchlist: 3
rework: 0
stop: 0
media_geral: 2.82
```

Achado:

```text
As 3 watchlists eram historicas, todas ligadas a "Me chamo Assistente"/"muito prazer" em primeiro contato.
A familia ja foi atacada nas Waves 24/25 e precisava de revalidacao atual, nao de nova mudanca de codigo.
```

## Micro-Slice 2 - Revalidacao Atual

```text
http_radar: long-journey-naturalidade-cadastro-handoff
whatsapp_real: whatsapp-real-long-journey-naturalidade-cadastro-handoff
status: PASS
http_run_id: scenario-long-journey-naturalidade-cadastro-handoff-20260527T050246Z-25883
whatsapp_real_run_id: scenario-whatsapp-real-long-journey-naturalidade-cadastro-handoff-20260527T050444Z-12046
naturalness_v2_atual: PASS 7/7, watchlist=0, rework=0, stop=0, media=2.86
```

Provas conclusivas reais:

```text
Cliente: "quero uma borboleta fineline na perna, tenho 1.70"
Bot: "Oii, tudo bem.

Boa, ja peguei a ideia principal. Consegue mandar uma foto do local onde tu quer tatuar?"

Cliente: "12/03/1995"
Bot: "Se quiser, me passa teu e-mail. Se preferir seguir só por aqui, tudo certo."

Cliente: "por aqui mesmo"
Bot: "Boa, Joao. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor."

Cliente: "lembrei que queria pequeno"
Bot: sem nova IA apos handoff; mensagem encaminhada ao humano.
```

## Gates

- usar apenas evidencias reais ja aprovadas;
- nao alterar codigo nesta etapa;
- registrar PASS/WATCHLIST/REWORK/STOP;
- se houver REWORK/STOP, travar e diagnosticar;
- se houver apenas PASS/watchlist leve, decidir proximo micro-slice por familia.

## Stop Conditions

- Naturalness V2 STOP;
- Naturalness V2 REWORK sem causa clara;
- evidencia incompleta ou sem artifacts;
- achado funcional que contradiga smoke-runs;
- tentativa de corrigir copy sem familia/escopo.

## Resultado

```text
status: PASS
decisao: nao alterar codigo agora
motivo: watchlists da auditoria ampla eram historicas; evidencia atual passou em HTTP radar, WhatsApp real e Naturalness V2
estado_final: aguardando_tatuador
orcid: orc_scfzj3
email_recusado: true
pos_handoff: sem nova IA
level_4b: manter
level_4c: bloqueado
```

