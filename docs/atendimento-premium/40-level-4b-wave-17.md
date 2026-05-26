# Level 4B Wave 17 - Naturalidade Audit

## Objetivo

Criar uma auditoria objetiva de naturalidade usando evidencias reais ja validadas, antes de alterar linguagem do bot.

Esta onda existe para separar diagnostico de execucao: primeiro identificar repeticao, rigidez e risco de copy; depois escolher micro-slices de linguagem com HTTP radar e WhatsApp real definitivo quando houver mudanca conversacional.

## Escopo

- Criar ferramenta read-only `scripts/smoke/naturalness-audit.sh`.
- Analisar amostra inicial de evidencias WhatsApp real ja aprovadas.
- Classificar sinais objetivos:
  - resposta longa demais para WhatsApp;
  - perguntas demais na mesma bolha;
  - linguagem interna/sistemica;
  - termos rigidos de template;
  - aberturas formulaicas;
  - repeticao exata dentro do run ou na amostra.
- Registrar achados e proximo slice recomendado.

## Fora De Escopo

- alterar copy do bot nesta primeira passada;
- usar score LLM continuo como criterio primario;
- executar WhatsApp real novo apenas para diagnostico read-only;
- mexer em preco, agenda, pagamento, sinal, secrets ou tenant real amplo;
- promover para 4C.

## Criterio De Pronto

```text
script_read_only: PASS
bash_n: PASS
amostra_real_existente: PASS
achados_registrados: PASS
proximo_slice_definido: PASS
```

## Stop Conditions

- qualquer tentativa de aprovar mudanca de linguagem sem WhatsApp real definitivo;
- usar naturalidade subjetiva como gate primario sem contrato binario;
- confundir diagnostico read-only com validacao conversacional nova;
- promover 4C.

## Plano De Ataque

1. Declarar a Wave 17 como auditoria, nao como mudanca de comportamento.
2. Criar ferramenta read-only para consolidar transcript/judgment ja existentes.
3. Rodar amostra mista de WhatsApp real: lateral, cadastro, midia, handoff e menoridade.
4. Registrar os principais padroes de risco.
5. Escolher o proximo micro-slice de linguagem com validação completa.

## Decisao Metodologica

Naturalidade nao deve virar score continuo primario neste momento. O processo premium continua usando invariantes binarios como gate principal. A auditoria de naturalidade entra como radar de melhoria e priorizacao.

## Micro-Slice 1 - Auditoria Read-Only

PASS: ferramenta `scripts/smoke/naturalness-audit.sh` criada e validada com amostra de 10 evidencias WhatsApp real ja aprovadas.

```text
bash_n: PASS
amostra: 10 evidencias WhatsApp real
alto: 0
medio: 9
baixo: 1
decisao: watchlist
whatsapp_real_novo: nao aplicavel; auditoria read-only sobre evidencias reais existentes
```

### Evidencias Analisadas

```text
scenario-whatsapp-real-lateral-preco-generico-20260525T191651Z-20855
scenario-whatsapp-real-lateral-tempo-sessao-20260525T193654Z-8352
scenario-whatsapp-real-lateral-processo-tatuagem-20260525T193747Z-10247
scenario-whatsapp-real-lateral-portfolio-disponivel-20260525T204606Z-651
scenario-whatsapp-real-cadastro-handoff-20260525T222253Z-9952
scenario-whatsapp-real-cadastro-email-refusal-channel-handoff-20260526T090215Z-18284
scenario-whatsapp-real-cadastro-idade-17-handoff-humano-20260526T171946Z-31823
scenario-whatsapp-real-cadastro-menoridade-pais-handoff-humano-20260526T175152Z-23494
scenario-whatsapp-real-tattoo-media-ambiguous-confirm-local-20260526T070618Z-15645
scenario-whatsapp-real-tattoo-media-reference-then-local-20260526T071915Z-30812
```

### Achado Principal

Nao houve risco alto nem repeticao exata global na amostra. O risco medio veio de dois padroes:

- bolhas laterais iniciais com mais de uma pergunta;
- termos rigidos de template em cadastro, midia e menoridade.

### Provas Conclusivas Reais - Amostra

Cliente: `quanto fica uma rosa fineline no braco?`

Bot: `Oii, tudo bem? Me chamo Assistente, muito prazer. O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia. Pra montar tua ...`

Cliente: `tenho autorizacao dos meus pais`

Bot: `Como a pessoa que vai tatuar tem menos de 18 anos, vou acionar o tatuador para orientar com segurança sobre responsável legal.`

Cliente: `prefiro falar por aqui`

Bot: `Fechado, Joao! O tatuador vai avaliar com calma e eu te retorno em breve com o valor certinho.`

## Decisao Apos Micro-Slice 1

Wave 17 deve continuar como frente de linguagem controlada. O proximo micro-slice recomendado e reduzir rigidez de copy em uma familia pequena, com contrato binario e validacao completa:

```text
familia_recomendada: fechamento de cadastro / handoff de orcamento
risco: amarelo baixo
validacao_obrigatoria: testes focados, CI/deploy, HTTP radar e WhatsApp real definitivo
nao_atacar_agora: menoridade legal ampla, preco, agenda, pagamento, 4C
```
