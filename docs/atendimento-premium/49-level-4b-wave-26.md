# Level 4B - Wave 26 - Auditoria Estrategica De Naturalidade

## Objetivo

Transformar a auditoria de naturalidade de um detector simples de copy rigida em uma leitura estrategica de atendimento premium: contexto, timing, progressao, densidade, seguranca, variacao e personalizacao.

## Hipotese

As Waves 23, 24 e 25 melhoraram pontos reais de naturalidade, especialmente abertura, primeiro contato, midia e backstops deterministicos. A auditoria atual (`naturalness-audit.sh`) ja ajuda a capturar riscos obvios, mas ainda pode aprovar respostas que soam aceitaveis isoladamente e fracas como atendimento completo.

## Escopo

```text
wave_id: level4b-wave-26-naturalness-strategic-audit
autonomy_level: 4B
tipo: auditoria read-only + plano metodologico
risco: baixo
zona: metodologia, evidencias, rubricas e priorizacao
whatsapp_real_novo: nao obrigatorio para diagnostico read-only
mudanca_conversacional: proibida nesta fase
level_4c: bloqueado
```

## Fora De Escopo

- alterar prompt LLM;
- alterar copy do bot;
- criar frases alternativas soltas;
- executar WhatsApp real novo apenas para diagnostico read-only;
- aprovar naturalidade por gosto subjetivo;
- promover Level 4C.

## Terreno Atual

A auditoria read-only existente foi rodada em 10 evidencias WhatsApp real recentes:

```text
scenario-whatsapp-real-voice-policy-first-contact-image-question-20260527T020943Z-26087
scenario-whatsapp-real-voice-policy-pure-greeting-20260527T015732Z-10191
scenario-whatsapp-real-voice-policy-first-contact-multi-info-20260527T014315Z-1134
scenario-whatsapp-real-voice-policy-first-contact-preco-20260527T013647Z-2248
scenario-whatsapp-real-long-journey-naturalidade-cadastro-handoff-20260527T002948Z-21390
scenario-whatsapp-real-long-journey-naturalidade-abertura-retomada-20260527T001212Z-6052
scenario-whatsapp-real-long-journey-cadastro-lateral-handoff-20260526T231029Z-8936
scenario-whatsapp-real-long-journey-lateral-media-cadastro-handoff-20260526T221935Z-11804
scenario-whatsapp-real-cadastro-batch-nome-data-lateral-20260526T214404Z-5218
scenario-whatsapp-real-cadastro-resume-nome-data-natural-20260526T213232Z-28275
```

Resultado:

```text
evidencias_analisadas: 10
baixo: 10
medio: 0
alto: 0
decisao: pass
repeticao_exata_global: 0
```

## Leitura Critica

O resultado PASS e bom, mas insuficiente como auditoria premium.

O script atual detecta bem:

- respostas longas demais;
- excesso de perguntas por bolha;
- linguagem interna;
- termos rigidos conhecidos;
- repeticao exata.

Mas ainda nao mede bem:

- se o bot respondeu a duvida antes de avancar;
- se a pergunta seguinte foi a melhor pergunta naquele contexto;
- se a resposta tem progressao real ou apenas formulario maquiado;
- se a densidade do WhatsApp esta equilibrada por turno, nao so por texto final;
- se a conversa longa mantem ritmo humano;
- se a ausencia de IA pos-handoff e sucesso operacional, nao `sem_resposta_ai` generico;
- se a naturalidade e personalizada ao dominio/tenant ou apenas neutra.

## Rubrica Estrategica V2

Cada evidencia deve ser lida por eixos, com nota de 0 a 3:

```text
contexto: lembra e usa o que o cliente ja disse
timing: pergunta na hora certa, sem antecipar nem atrasar
resposta_lateral: responde duvida real antes de retomar coleta
progressao: aproxima o cliente do proximo estado correto
voz: soa como atendimento de estudio, sem template mecanico
densidade: tamanho e numero de baloes adequados ao WhatsApp
seguranca: sem preco fechado, agenda, pagamento, orcid ou promessa indevida
personalizacao: respeita dominio/tenant quando aplicavel
```

Classificacao:

```text
0 = falha
1 = tecnico aceitavel, atendimento fraco
2 = bom, mas com rigidez ou oportunidade clara
3 = premium
```

Gate recomendado:

```text
seguranca: sempre 3
nenhum eixo critico com 0
media_minima_para_pass: 2.4
qualquer eixo 1 vira watchlist
qualquer seguranca < 3 vira stop
```

## Taxonomia De Falhas

```text
copy_rigida
resposta_generica
pergunta_repetida
pergunta_precoce
pergunta_tardia
ignora_contexto
ignora_midia
responde_sem_avancar
avanca_sem_responder
excesso_de_texto
tom_inadequado
risco_operacional
estado_incoerente
handoff_incorreto
latencia_por_llm_desnecessario
natural_robotizado
```

## Plano De Ataque

### Micro-Slice 1 - Baseline Read-Only

Status:

```text
naturalness_audit_v1: PASS
amostra: 10 WhatsApp real recentes
alto: 0
medio: 0
baixo: 10
decisao: PASS tecnico; insuficiente para premium
```

Decisao:

```text
nao corrigir copy ainda
fortalecer a auditoria antes de escolher a proxima familia
```

### Micro-Slice 2 - Rubrica V2

Objetivo:

```text
oficializar uma rubrica de naturalidade premium com eixos, scores e taxonomia de falhas
```

Status:

```text
PASS metodologico
documento: docs/atendimento-premium/naturalness-rubric-v2.md
mudanca_conversacional: nenhuma
whatsapp_real_novo: nao aplicavel
```

Saida esperada:

```text
documento de rubrica versionado
criterios de pass/watchlist/stop
formato padrao de relatorio por evidencia
```

### Micro-Slice 3 - Auditor V2 Read-Only

Objetivo:

```text
evoluir naturalness-audit.sh ou criar wrapper complementar para produzir tabela por eixos
```

Regras:

- read-only;
- nao executa smoke;
- nao envia WhatsApp;
- nao edita evidencias;
- aceita lista de evidence dirs;
- trata `sem_resposta_ai` como sucesso quando estado final e terminal pos-handoff sem nova IA esperada.

### Micro-Slice 4 - Reaudit Das Jornadas Longas

Objetivo:

```text
rodar Rubrica V2 nas evidencias das Waves 22, 23, 24 e 25 e escolher proxima familia de ataque
```

Familias candidatas:

```text
retomada de cadastro apos lateral
primeiro contato com preco
handoff de cadastro
midia/cadastro
jornadas longas com multiplos turnos
menoridade/responsavel legal
```

## Criterio De Pronto Da Wave

```text
baseline_v1_registrado: PASS
rubrica_v2_documentada: PASS
auditor_v2_read_only: pending
reaudit_recente: pending
proxima_wave_recomendada_com_evidencia: pending
```

## Stop Conditions

- qualquer proposta de alterar copy antes da Rubrica V2;
- qualquer mudanca conversacional sem HTTP radar + WhatsApp real definitivo;
- usar score subjetivo sem evidencia;
- misturar mais de uma familia de linguagem na mesma correcao;
- promover 4C.

## Proximo Passo

```text
Implementar Micro-Slice 3: criar Auditor V2 read-only ou wrapper complementar para aplicar a Rubrica V2 em evidencias existentes.
```
