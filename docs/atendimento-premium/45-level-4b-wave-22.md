# Level 4B - Wave 22 - Long Journey Real Audit

## Objetivo

Validar jornadas reais mais longas no WhatsApp, com 6 a 10 turnos, para medir coerencia, naturalidade, preservacao de estado e robustez do processo de handoff em conversas mais proximas do uso real.

## Hipotese

Os micro-slices ja provaram comportamentos isolados com alta seguranca. O proximo salto de qualidade do bot premium depende de campanhas maiores que combinem:

- duvidas laterais;
- coleta de tattoo;
- midia;
- cadastro;
- e-mail valido ou recusado;
- handoff para tatuador;
- ausencia de repeticao mecanica;
- ausencia de preco, agenda, pagamento ou sinal inventado.

## Escopo Inicial

```text
wave_id: level4b-wave-22-long-journey-real-audit
autonomy_level: 4B
tipo: auditoria funcional + naturalidade
risco: amarelo
janela: ate 3 jornadas longas antes de nova decisao
whatsapp_real: obrigatorio
```

## Gates Obrigatorios

- `wave-health` PASS antes de iniciar;
- HTTP radar pode ser usado como ensaio quando houver novo scenario;
- WhatsApp real definitivo pela instancia `central`;
- transcript completo por jornada;
- judgment estruturado por jornada;
- provas conclusivas reais no fechamento;
- nenhum envio de preco fechado, agenda, pagamento ou sinal;
- nenhum vazamento de segredo, URL interna ou detalhe de sistema;
- estado final coerente com a jornada;
- evidencias registradas em `smoke-runs.md`;
- parada em qualquer FAIL funcional, regressao ou falha de WhatsApp real.

## Stop Conditions

- WhatsApp real FAIL;
- perda de estado em conversa multi-turn;
- bot repetir campo ja resolvido de forma clara;
- `orcid` criado antes de tattoo + cadastro completos;
- handoff ausente quando os criterios forem atingidos;
- resposta robotica com risco alto no julgamento;
- falha de CI/deploy se houver mudanca de codigo;
- falha Supabase preflight.

## Primeiro Ataque Recomendado

Jornada 1: lead novo faz pergunta lateral de processo, informa tattoo, envia midia, completa cadastro, recusa e-mail e chega ao handoff.

```text
decisao: iniciar read-only/contract-first
objetivo_do_primeiro_round: criar ou selecionar scenario longo, rodar HTTP radar se necessario e fechar WhatsApp real definitivo
```

## Criterio Para Encerrar A Wave

A Wave 22 pode ser encerrada com PASS quando pelo menos uma jornada longa passar em WhatsApp real com transcript e judgment completos. A extensao para duas ou tres jornadas so deve acontecer se a primeira revelar sinais de rigidez, repeticao ou lacunas de estado que precisem de contraste.
