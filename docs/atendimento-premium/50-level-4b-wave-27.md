# Level 4B - Wave 27 - Revalidacao Long Journey Pos-Voice Policy

## Objetivo

Provar em jornada longa atual que a Voice Policy corrigida nas Waves 24 e 25 removeu a apresentacao mecanica tambem dentro do fluxo completo, nao apenas em micro-slices isolados de primeiro contato.

## Hipotese

A Wave 26 encontrou `WATCHLIST` apenas em steps historicos das Waves 22 e 23, com `Me chamo Assistente, muito prazer`. Como as Waves 24 e 25 corrigiram os caminhos atuais de primeiro contato, a proxima acao correta e reexecutar uma jornada longa agora, antes de alterar copy novamente.

## Escopo

```text
wave_id: level4b-wave-27-long-journey-post-voice-policy
autonomy_level: 4B
tipo: revalidacao funcional + naturalidade
risco: amarelo
zona: smoke real, evidencia, transcript e julgamento
whatsapp_real: obrigatorio
mudanca_conversacional: nenhuma prevista
level_4c: bloqueado
```

## Fora De Escopo

- alterar prompt LLM;
- alterar copy antes da evidencia atual;
- criar novo fluxo de negocio;
- ampliar autonomia para 4C;
- substituir WhatsApp real por HTTP smoke.

## Gates Obrigatorios

- `wave-health` PASS antes do smoke;
- HTTP radar em `long-journey-naturalidade-abertura-retomada`;
- WhatsApp real definitivo em `whatsapp-real-long-journey-naturalidade-abertura-retomada`;
- `tail` ativo pelo processo de smoke;
- transcript e judgment completos;
- `naturalness-audit-v2.sh` aplicado nos steps do WhatsApp real final;
- ausencia de `Me chamo` e `muito prazer`;
- sem preco fechado, agenda, pagamento, sinal, segredo ou ORCID prematuro;
- estado final coerente;
- registro em `smoke-runs.md` se a validacao definitiva passar.

## Stop Conditions

- HTTP radar FAIL;
- WhatsApp real FAIL;
- Supabase preflight FAIL persistente;
- `naturalness-audit-v2` retornar STOP ou REWORK;
- qualquer resposta com `Me chamo` ou `muito prazer`;
- perda de estado em jornada multi-turn;
- copy risk alto;
- criacao de ORCID antes de cadastro + tattoo completos.

## Plano

### Micro-Slice 1 - HTTP Radar

```text
scenario: long-journey-naturalidade-abertura-retomada
objetivo: confirmar contrato atual sem gastar WhatsApp real se houver regressao basica
status: PASS
run_id: scenario-long-journey-naturalidade-abertura-retomada-20260527T043220Z-8605
estado_final: coletando_cadastro
orcid: null
copy_risk: baixo
me_chamo_muito_prazer: ausente
```

### Micro-Slice 2 - WhatsApp Real Definitivo

```text
scenario: whatsapp-real-long-journey-naturalidade-abertura-retomada
objetivo: validar cadeia real central -> bot com midia e steps completos
status: PASS
run_id: scenario-whatsapp-real-long-journey-naturalidade-abertura-retomada-20260527T043349Z-9767
estado_final: coletando_cadastro
orcid: null
copy_risk: baixo
foto_local_msg_id: 13019
me_chamo_muito_prazer: ausente
```

### Micro-Slice 3 - Auditoria V2 Dos Steps

```text
auditor: scripts/smoke/naturalness-audit-v2.sh
objetivo: confirmar que os steps atuais nao repetem a watchlist historica
status: PASS
evidencias_analisadas: 5
pass: 5
watchlist: 0
rework: 0
stop: 0
media_geral: 2.88
```

## Provas Conclusivas Reais

```text
Cliente: "quanto tempo demora uma tattoo pequena?"
Bot: "Oii, tudo bem.

O tempo de sessão depende do tamanho, detalhe e local do corpo. Pode ser uma sessão ou mais, e o tatuador confirma melhor depois de avaliar tua ideia.

Pra montar tua proposta certinho, como posso te chamar?"

Cliente: "segue foto do local" + image/png
Bot: "Recebi a foto do local. Agora me passa teu nome completo pra eu montar o cadastro."
```

## Leitura Estrategica

```text
A watchlist historica da Wave 26 foi resolvida no fluxo atual: a jornada longa real nao reintroduziu "Me chamo" ou "muito prazer". Nao ha motivo para novo corte de copy nesta familia agora.
```

## Criterio De Pronto

```text
http_radar: PASS
whatsapp_real: PASS
naturalness_v2_steps: PASS
me_chamo_muito_prazer: ausente
copy_risk_alto: ausente
wave_health_final: PASS
proxima_familia_recomendada: PASS
```

## Proximo Passo

```text
Fechar a Wave 27 como PASS. Proxima frente recomendada: auditoria naturalidade de cadastro/e-mail opcional ou handoff, fora da familia de primeiro contato mecanico.
```

## Fechamento

```text
decision: PASS
final_commit_docs: fdcbeb4 docs: validate wave 27 long journey
wave_health_final: PASS
scenario_pass_count: 198
real_whatsapp_pass_count: 97
level_4b: mantido
level_4c: bloqueado
```

Veredito:

- A apresentacao mecanica historica nao apareceu na jornada longa atual.
- A cadeia real WhatsApp validou 5 turns com midia.
- O fluxo preservou estado, dados coletados e seguranca operacional.
- Nao ha necessidade de novo corte de copy em primeiro contato agora.
