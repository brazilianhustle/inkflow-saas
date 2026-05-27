# Level 4B - Wave 33 - Revalidacao Portfolio Atual

## Objetivo

Revalidar o fluxo lateral de portfolio em producao atual, com HTTP radar e WhatsApp real novo, garantindo que o bot responde sem URL manual, aciona a ferramenta de portfolio, preserva estado seguro e nao reintroduz copy mecanica antiga.

## Base Metodologica

```text
documento_canonico: docs/atendimento-premium/52-premium-operational-chain.md
regra: evidencia antiga com duvida de validade exige WhatsApp real novo
autonomy_level: 4B
level_4c: bloqueado
```

## Motivo Do Ataque

Portfolio tem evidencias reais aprovadas, mas a familia principal e de 2026-05-25. Como houve waves recentes de voz/naturalidade e metodologia, nao e profissional fechar a familia atual apenas por reaproveitamento. O caminho seguro e revalidar a cadeia real.

## Escopo

- `lateral-portfolio-disponivel` HTTP radar;
- `whatsapp-real-lateral-portfolio-disponivel` definitivo;
- tail confirmando `enviar-portfolio`/portfolio;
- Tenant Context Manager observado;
- Naturalness V2 nos artifacts atuais;
- registro curto de provas reais.

## Fora De Escopo

- mudar copy antes de evidencia atual falhar;
- mudar catalogo do tenant;
- alterar Context/Tenant Manager;
- alterar ferramenta de envio de portfolio;
- ampliar para imagem/historia de vida nesta wave;
- promover Level 4C.

## Micro-Slice 1 - Portfolio Atual

```text
status: PASS
http_radar: scenario-lateral-portfolio-disponivel-20260527T053411Z-14040 FAIL util
http_radar_final: scenario-lateral-portfolio-disponivel-20260527T054628Z-21697
whatsapp_real_novo: scenario-whatsapp-real-lateral-portfolio-disponivel-20260527T054656Z-28618
estado_final: coletando_tattoo
orcid: null
copy_risk: baixo
naturalness_v2: PASS
```

## Validacao Final

```text
commit_funcional: b54f085 fix: route portfolio requests deterministically
ci: PASS 26493282715
deploy: PASS 26493282734
http_radar: PASS
whatsapp_real_novo: executado
whatsapp_real_final: PASS
tail: PASS
agent_log_gate: PASS
naturalness_v2: 2 PASS / 0 watchlist / 0 rework / 0 stop
```

### Falha Util Inicial

```text
run_id: scenario-lateral-portfolio-disponivel-20260527T053411Z-14040
failure_class: agent_no_response / resposta tardia incorreta
estado_final: coletando_tattoo
orcid: null
cliente: "tem exemplos de fineline?"
bot_tardio: "Me conta o que tu quer tatuar?"
latency_total_ms: 83836
```

Diagnostico:

```text
Context/Tenant Manager estava correto:
- tenant_context_portfolio_disponivel=true
- tenant_context_portfolio_urls_count=3
- tenant_context_layer=tenant_context_manager

Falha real:
- Agent LLM ignorou pedido claro de portfolio;
- respondeu como retomada generica;
- nao acionou enviar_portfolio;
- estourou tempo util do smoke.
```

Contramedida:

```text
ConversationRouter agora reconhece portfolio_requested deterministicamente.
Pipeline executa ferramenta enviar-portfolio quando Router retorna proxima_acao=enviar_portfolio.
Smokes de portfolio passam a exigir agent_name=conversation_router com tenant context observado.
```

Validacao local:

```text
node --test tests/_lib/conversation-router.test.mjs: PASS
node --test tests/_lib/whatsapp-pipeline.test.mjs: PASS
npm test: 1219 PASS / 0 FAIL
npm run build: nao aplicavel no root; script inexistente
```

## Provas Conclusivas Reais

```text
Cliente: "tem exemplos de fineline?"
Bot: "Claro, te mando alguns exemplos de fineline."
Side effect: tail confirmou portfolio/enviar-portfolio e envio de midias.
```

## Decisao

```text
status: PASS
decisao: familia portfolio atual validada em HTTP radar e WhatsApp real novo
codigo_alterado: sim
motivo: remover dependencia do LLM em intent operacional clara
proximo_ataque_sugerido: pergunta de imagem ou historia de vida com WhatsApp real novo se evidencia antiga nao for suficiente
```

## Gates

- tail ativo pelo runner;
- HTTP radar PASS antes do WhatsApp real;
- WhatsApp real novo `central -> bot`;
- estado final `coletando_tattoo`;
- `orcid=null`;
- `copy_risk` no maximo medio;
- resposta sem URL manual;
- sem preco fechado, agenda, sinal ou pagamento;
- tail confirma portfolio/ferramenta;
- Tenant Context Manager observado em `agent_turn_logs`;
- Naturalness V2 PASS ou diagnostico antes de avancar.

## Stop Conditions

- WhatsApp real ausente;
- ferramenta de portfolio nao acionada quando esperada;
- URL manual exposta na resposta;
- estado incoerente;
- promessa de preco, agenda, sinal ou pagamento;
- Naturalness V2 REWORK/STOP;
- divergencia HTTP vs WhatsApp real.
