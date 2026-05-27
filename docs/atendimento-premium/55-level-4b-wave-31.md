# Level 4B - Wave 31 - Auditoria Pos-Handoff

## Objetivo

Auditar a familia pos-handoff texto/midia para confirmar que, depois do handoff humano, mensagens adicionais sao encaminhadas ao tatuador sem reabrir IA, coleta, orcamento automatico ou estado indevido.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: pos-handoff sem IA e sucesso operacional quando o contrato exige encaminhamento humano
autonomy_level: 4B
level_4c: bloqueado
```

## Escopo

- texto adicional depois de `aguardando_tatuador`;
- midia adicional depois de `aguardando_tatuador`;
- jornadas longas com mensagem posterior ao handoff;
- ausencia de nova IA apos humano;
- estado terminal preservado;
- evidencias de encaminhamento/tail quando aplicavel.

## Fora De Escopo

- mudar resposta ao cliente;
- alterar Telegram;
- mexer em handoff package;
- mudar regras de Workflow Manager;
- tocar preco, agenda, pagamento ou sinal;
- promover Level 4C.

## Micro-Slice 1 - Auditoria Read-Only

```text
tipo: diagnostico
ferramenta: scripts/smoke/naturalness-audit-v2.sh
entrada: evidencias WhatsApp real recentes ja aprovadas de pos-handoff
status: PASS
```

### Evidencias Auditadas

```text
.smoke-evidence/scenario-whatsapp-real-post-handoff-text-forwarding-20260526T210016Z-26317
.smoke-evidence/scenario-whatsapp-real-post-handoff-media-forwarding-20260526T210550Z-4850
.smoke-evidence/scenario-whatsapp-real-post-handoff-text-forwarding-20260526T084232Z-15708
.smoke-evidence/scenario-whatsapp-real-post-handoff-media-forwarding-20260526T083424Z-5240
.smoke-evidence/scenario-whatsapp-real-long-journey-naturalidade-cadastro-handoff-20260527T050444Z-12046/steps/7
.smoke-evidence/scenario-whatsapp-real-long-journey-naturalidade-cadastro-handoff-20260527T002948Z-21390/steps/7
.smoke-evidence/scenario-whatsapp-real-long-journey-cadastro-lateral-handoff-20260526T231029Z-8936/steps/7
```

### Resultado

```text
evidencias_analisadas: 7
pass: 7
watchlist: 0
rework: 0
stop: 0
media_geral: 2.88
decisao: PASS
tag_dominante: pos_handoff_sem_ia_ok
```

### Calibragem Metodologica

A primeira leitura revelou um gap do avaliador, nao do bot: em evidencias pos-handoff com seed ou IA anterior ao ultimo humano, o auditor podia enxergar a ultima IA historica e julgar o caso como resposta do bot, mesmo quando o contrato exigia `SMOKE_REQUIRE_AI_RESPONSE=0`.

Correcao aplicada em `scripts/smoke/naturalness-audit-v2.sh`:

```text
quando final_state=aguardando_tatuador e require_ai_response=0,
avaliar apenas mensagens AI criadas depois da ultima mensagem human.
```

Isso torna a validacao alinhada ao contrato operacional: depois do handoff, sucesso e nao responder com IA e manter encaminhamento humano.

## Provas Conclusivas Reais

```text
Cliente: "lembrei de mais um detalhe"
Bot: sem nova IA; mensagem ficou em pos-handoff para humano.

Cliente: "mais uma referencia" + midia
Bot: sem nova IA; estado permaneceu aguardando_tatuador.
```

## Gates

- usar evidencias reais aprovadas;
- considerar ausencia de IA como sucesso quando `SMOKE_REQUIRE_AI_RESPONSE=0`;
- nao alterar codigo sem watchlist atual real;
- se houver STOP/REWORK, travar e diagnosticar;
- se houver PASS, registrar e seguir para proxima familia.

## Stop Conditions

- qualquer IA nova depois do humano pos-handoff;
- estado sair de `aguardando_tatuador`;
- reabrir coleta de tattoo/cadastro;
- criar novo ORCID indevido;
- falhar encaminhamento/tail em evidencia atual;
- Naturalness V2 STOP/REWORK.
