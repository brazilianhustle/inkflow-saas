# Level 4B - Wave 35 - Revalidacao Historia De Vida Atual

## Objetivo

Revalidar a familia `historia_vida` em producao atual, garantindo acolhimento breve, preservacao do briefing emocional e retomada com pergunta util, sem transformar atendimento de tatuagem em terapia nem prometer preco, agenda ou sinal.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: evidencia real antiga nao fecha comportamento conversacional atual quando houve ondas recentes de voz/naturalidade
autonomy_level: 4B
level_4c: bloqueado
```

## Motivo Do Ataque

Historia de vida/homenagem e uma familia pequena, mas sensivel para o bot premium: se responder frio, fica robotico; se acolher demais, vira terapia; se esquecer a coleta, perde funcao. A validacao correta e provar o equilibrio atual via HTTP radar e WhatsApp real novo.

## Escopo

- `lateral-historia-vida-homenagem` HTTP radar;
- `whatsapp-real-lateral-historia-vida-homenagem` definitivo;
- observabilidade do Router `historia_vida`;
- Naturalness V2 nos artifacts atuais;
- registro curto de provas reais.

## Fora De Escopo

- mudar copy antes de falha atual;
- ampliar para luto complexo;
- criar regras deterministicas por frase;
- alterar prompt geral do Agent;
- mexer em preco, agenda, sinal ou pagamento;
- promover Level 4C.

## Micro-Slice 1 - Homenagem Emocional

```text
status: PASS
http_radar: scenario-lateral-historia-vida-homenagem-20260527T055922Z-24
whatsapp_real_novo: scenario-whatsapp-real-lateral-historia-vida-homenagem-20260527T055950Z-4219
estado_final: coletando_tattoo
orcid: null
copy_risk: baixo
router_intent: historia_vida
workflow_reason: state_preserved_by_router_policy
```

## Validacao Final

```text
codigo_alterado: nao
http_radar: PASS
whatsapp_real_novo: PASS
naturalness_v2: 2 PASS / 0 watchlist / 0 rework / 0 stop
estado_final: coletando_tattoo
orcid: null
```

## Provas Conclusivas Reais

```text
Cliente: "quero fazer uma homenagem pro meu pai que faleceu, pensei em passaros e uma frase"
Bot: "Oii, tudo bem. Entendi. Dá pra pensar em algo simbólico e delicado com essa ideia. Pra montar tua proposta certinho, preciso só de algumas infos. Tu imagina fazer em qual parte do corpo?"
```

## Decisao

```text
status: PASS
decisao: familia historia_vida atual validada em HTTP radar e WhatsApp real novo
mudanca_de_codigo: nao necessaria
proximo_ataque_sugerido: escolher nova familia lateral pequena ou consolidar cobertura da onda lateral atual
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real;
- WhatsApp real novo `central -> bot`;
- estado final `coletando_tattoo`;
- `orcid=null`;
- Router `historia_vida` observado;
- sem terapia, psicologo, luto prolongado ou condolencia pesada;
- sem preco fechado, agenda, sinal ou pagamento;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- WhatsApp real ausente;
- resposta fria/generica que ignora homenagem;
- resposta terapeutica;
- preco, agenda, sinal ou pagamento;
- estado incoerente;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
