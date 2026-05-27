# Frentes Finais Para Bot Premium

## Objetivo

Registrar o mapa atual depois do fechamento da Wave 43 e definir quais frentes ainda faltam para concluir o bot premium com qualidade profissional.

## Veredito Atual

```text
status_geral: fundacao operacional muito avancada
familia_midia_cadastro: fechada na cobertura atual
autonomy_level: 4B
level_4c: bloqueado
decisao: continuar por frentes finais, nao por subcasos aleatorios
```

## Familias Cobertas Na Cobertura Atual

```text
primeiro_contato: coberto por Voice Policy e jornadas atuais
atendimento_lateral: coberto para preco generico, tempo, processo, portfolio, imagem e historia/homenagem
coleta_tattoo: coberta para multi-info, respostas pendentes e retomada apos lateral
midia_classificacao: fechada pela Wave 43
cadastro_pos_midia: fechado pela Wave 43
email_opcional: coberto, com excecao metodologica copy_risk=medio para pedido opcional
handoff_orcamento: coberto com orcid, Workflow Manager e handoff_package_v1
telegram_handoff_midia: coberto com file_ids e tail fotos-orcamento-enviadas
pos_handoff: coberto para texto e midia sem reabrir IA
menoridade_risco: coberto para data, texto natural, responsavel, cobertura, pedido humano e cliente irritado
tenant_context: coberto para portfolio, estilos, identidade, modo atendimento e cobertura
observabilidade_smoke: coberta com tail, transcript, judgment, agent logs e wave-health
```

## Frentes Que Ainda Faltam

### Frente 1 - Auditoria Final De Jornada Premium

Objetivo: provar o bot como experiencia completa, nao apenas familias isoladas.

Escopo recomendado:

- 2 a 3 jornadas longas WhatsApp real;
- uma jornada simples ate handoff;
- uma jornada com lateral no meio;
- uma jornada com portfolio/imagem;
- uma jornada com risco/humano, sem orcamento;
- Naturalness V2 sobre todas.

Gate:

```text
HTTP radar PASS
WhatsApp real PASS
Naturalness V2 sem REWORK/STOP
sem regressao de estado, orcid, midia, cadastro ou handoff
```

Prioridade: alta.

### Frente 2 - Naturalidade Premium Por Familia

Objetivo: sair de "funcional correto" para "atendente premium consistente".

Familias para auditoria final:

- abertura;
- retomada de coleta;
- pedido de midia;
- classificacao de imagem;
- cadastro;
- e-mail opcional;
- fechamento/handoff;
- risco/humano;
- pos-handoff.

Regra: read-only primeiro. So mexer em VoicePolicy/Composer/Policy se a evidencia atual mostrar watchlist real.

Prioridade: alta.

### Frente 3 - Tenant/Config Em Modo Produto

Objetivo: garantir que o bot muda corretamente por estudio, sem ficar generico.

Pontos faltantes ou ainda pouco provados:

- tenant sem portfolio: fechado na Wave 46 micro-slice 1 com HTTP radar + WhatsApp real + restore automatico;
- estilos aceitos vs estilo fora do escopo;
- menoridade/cobertura por regra especifica do estudio;
- vocabulario e identidade do estudio sem vazar configuracao;
- multiplos perfis de estudio quando houver base para isso.

Prioridade: media-alta.

### Frente 4 - Replanejamento E Novo Pedido

Objetivo: cliente depois do handoff ou em conversa antiga mudar ideia, tamanho, local, referencia ou abrir novo pedido.

Riscos:

- grudar novo pedido no orcamento antigo;
- criar orcamento duplicado;
- reabrir IA em estado terminal;
- perder historico util para humano.

Prioridade: media-alta.

### Frente 5 - Financeiro/Agenda/Pagamento

Objetivo: preparar a proxima camada operacional depois do atendimento/orcamento.

Itens:

- negociacao/desconto;
- sinal/pagamento;
- comprovante;
- remarcacao;
- agenda;
- cancelamento.

Decisao estrategica: nao atacar ainda como fluxo automatizado amplo. Esta e zona vermelha e exige protocolo proprio, staging/rollback e criterios de produto.

Prioridade: futura, alta criticidade.

### Frente 6 - Prontidao Para Level 4C

Objetivo: decidir se existe ganho real em aumentar automacao.

Conservadoramente, 4C continua bloqueado enquanto:

- ainda ha frentes finais a auditar;
- WhatsApp real precisa continuar serial;
- financeiro/agenda ainda nao tem protocolo proprio;
- naturalidade premium ainda pode revelar watchlists por familia.

Prioridade: baixa agora.

## Proximo Ataque Recomendado

```text
wave: Wave 46
frente: Tenant/Config em modo produto
tipo: read-only + HTTP radar + WhatsApp real quando houver comportamento conversacional/produto
objetivo: provar que o bot nao e apenas bom no tenant atual; ele respeita variacoes de estudio de forma segura
escopo_maximo_4B: ate 8 micro-slices da mesma familia, com WhatsApp real serial
primeiro_passo: concluido na Wave 46 micro-slice 1; proximo corte recomendado e estilo fora do catalogo aceito
```

## Definition Of Done Para Conclusao Do Bot Premium

```text
1. Fundacao operacional coberta
2. Familias criticas com WhatsApp real atual
3. Jornadas longas reais PASS
4. Naturalness V2 final sem REWORK/STOP
5. Tenant/config validado como produto, nao apenas um estudio fixo
6. Risco/humano e pos-handoff sem regressao
7. Mapa de financeiro/agenda separado como proxima fase, sem automacao prematura
8. Documentacao e smoke-runs fechados
9. wave-health limpo
10. commit validado por CI/deploy
```

## Decisao

```text
familia_midia_cadastro: fechada na cobertura atual
frente_1_auditoria_final_jornada: fechada_pass_na_wave_44
frente_2_naturalidade_por_familia: fechada_pass_na_wave_45
proxima_frente: Wave 46 - Tenant/Config em modo produto
nao_fazer_agora: financeiro/agenda/pagamento amplo
```
