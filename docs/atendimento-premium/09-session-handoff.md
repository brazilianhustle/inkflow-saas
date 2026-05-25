# Session Handoff - Atendimento Premium

Este arquivo é o ponto de retomada para próximas sessões em Claude Code, Codex ou NotebookLM.

Ele não substitui o git status nem os testes. Ele registra o estado operacional da frente.

## Como Retomar Uma Nova Sessão

Ler nesta ordem:

1. `docs/atendimento-premium/current-objective.md`
2. `docs/atendimento-premium/smoke-runs.md`
3. `docs/atendimento-premium/12-loop-continuity-protocol.md`
4. `docs/canonical/decisions/2026-05-24-atendimento-premium-hybrid-architecture.md`
5. `docs/atendimento-premium/07-arquitetura-prompt-premium.md`
6. `docs/atendimento-premium/08-decision-log.md`
7. este arquivo
8. `docs/canonical/methodology/conversation-change-doctrine.md`

Depois rodar:

```bash
git status --short
```

Se houver mudanças não commitadas, entender antes de editar.

Para retomada rapida apos compactacao, os tres primeiros arquivos acima sao suficientes na maioria dos casos.

## Estado Atual Em 2026-05-25

Branch observada:

```text
main
```

Último commit observado após checkpoint:

```text
conferir `git log --oneline -1`
```

Último deploy de referência da frente:

```text
https://inkflowbrasil.com
```

Status estratégico:

```text
Atendimento premium esta em Autonomy Gate Level 3, com smoke loop real/HTTP monitorado, transcript, julgamento, tail e gates por slice.
Level 3 foi promovido deliberadamente apos recomendacao objetiva do gate (40 scenarios PASS, 18 WhatsApp reais PASS, gates criticos PASS). A janela atual permite mini-campanha de ate 4 micro-slices da mesma familia, com parada obrigatoria em qualquer falha. O gate tambem ja define criterios futuros para recomendar Level 4: 70 scenarios PASS, 35 WhatsApp reais PASS, gates criticos PASS e docs de rollback/staging + politica de loop Level 4.
O cadastro-handoff esta funcionalmente protegido: cadastro completo promove para aguardando_tatuador, handoff exige orcid nos smokes de orcamento, idade isolada nao persiste data/email vazios e menoridade explicita aciona handoff humano sem criar orcamento.
Escalation Manager existe como primeira camada formal para handoff humano: menoridade gera `reason_code=minor_age`, cobertura textual gera `reason_code=cover_up`, pedido humano gera `reason_code=human_requested` e cliente irritado gera `reason_code=client_upset`; todos com `requires_orcid=false`, texto Telegram rastreavel e row propria em `agent_turn_logs` via `agent_name=escalation_manager`.
O smoke registry agora consegue transformar essa observabilidade em gate automatico com `EXPECTED_AGENT_LOG_JQ_TRUE`.
O Router tambem comecou a expor explicabilidade: `ConversationRouter` retorna `reason` e `can_mutate_state`, e o pipeline registra `router_reason`/`router_can_mutate_state` em `agent_turn_logs`. Os scenarios HTTP e WhatsApp real de preco generico, tempo de sessao, processo de tatuagem, pergunta de imagem sem midia e historia de vida passaram exigindo esses campos.
Context/Tenant Manager foi iniciado: `runAgent` agora usa `tenant-context-manager.js` para montar o `clientContext` efetivo com portfolio, regras operacionais do tenant e contexto de proposta antes dos agents operacionais. O comportamento foi validado por teste local e pelo fluxo `portfolio_disponivel` em HTTP e WhatsApp real, com tail confirmando `enviar-portfolio`. A camada tambem ficou observavel em `agent_turn_logs.context_metadata`, com gate exigindo `tenant_context_layer=tenant_context_manager`, `tenant_context_state=tattoo` e `tenant_context_portfolio_disponivel=true`. Em seguida, regras de tenant (`aceita_cobertura`, gatilhos de handoff) foram expostas tambem no `ConversationRouter`, cobrindo intents interceptados antes do Agent operacional; cobertura passou em HTTP e WhatsApp real exigindo contexto de tenant no router e `cover_up` no Escalation Manager.
Context/Tenant Manager 2.0 foi iniciado como nova familia Level 3: Tenant Rules Snapshot v1 registra versao, origem dos gatilhos de handoff, presenca de gatilhos, catalogo de estilos, estilos aceitos/recusados e ativos sem vazar listas, URLs ou nomes literais. HTTP radar e WhatsApp real `central -> bot` passaram no fluxo `lateral-portfolio-disponivel`.
Context/Tenant Manager 2.0 tambem passou a aplicar gatilhos de handoff do tenant no Router deterministico: mensagem real `quero tatuar no rosto quanto fica?` foi classificada como `tenant_handoff_trigger`, saiu para `aguardando_tatuador`, manteve `orcid=null`, nao respondeu preco, nao seguiu formulario e registrou cadeia `conversation_router -> workflow_manager -> escalation_manager` com `source=tenant_rules`. HTTP radar e WhatsApp real passaram.
Context/Tenant Manager 2.0 tambem passou a registrar o gatilho exato que bateu no `context_metadata` do Router: `router_has_matched_tenant_trigger=true` e `router_matched_tenant_trigger="rosto"`. HTTP radar e WhatsApp real passaram exigindo esse traço.
Context/Tenant Manager 2.0 fechou a rodada Level 3 propagando o gatilho exato ate o Escalation Manager: `escalation_matched_tenant_trigger="rosto"` aparece em `agent_turn_logs` e no Telegram interno como `Gatilho tenant: rosto`. HTTP radar e WhatsApp real `central -> bot` passaram.
Handoff Package / Telegram Premium foi iniciado como nova familia Level 3: Escalation Manager agora monta `handoff_package_v1`, inclui resumo operacional/flags no Telegram ao humano e registra metadados do pacote em `agent_turn_logs`. HTTP radar e WhatsApp real `central -> bot` passaram no fluxo `tattoo-cliente-irritado-handoff`.
Workflow Manager entrou como proxima familia Level 3: cadastro completo com recusa de email agora registra row propria em `agent_turn_logs` via `agent_name=workflow_manager`, com `workflow_from_state=cadastro`, `workflow_to_state=aguardando_tatuador`, `workflow_transition_allowed=true` e `workflow_reason=cadastro_and_tattoo_complete`. HTTP radar e WhatsApp real `central -> bot` passaram exigindo essa observabilidade.
Workflow Manager tambem virou autoridade de nao-mutacao para intents laterais do Router: quando `can_mutate_state=false`, preserva o estado atual e registra `workflow_reason=state_preserved_by_router_policy` ou `mutation_blocked_by_router_policy`. O fluxo de preco generico passou em HTTP radar e WhatsApp real exigindo `conversation_router` + `workflow_manager` no mesmo turno.
Workflow Manager tambem passou a explicar bloqueios de cadastro incompleto com faltantes exatos: idade isolada preserva `estado=coletando_cadastro`, nao persiste `data_nascimento`, nao cria `orcid` e registra `workflow_reason=requirements_missing`, `workflow_missing_cadastro_count=2` e `workflow_missing_tattoo_count=0`. HTTP radar e WhatsApp real `central -> bot` passaram no fluxo `cadastro-data-idade-nao-persiste`.
Workflow Manager tambem passou a oficializar transicoes de escalation/handoff humano: cliente irritado sai para `aguardando_tatuador`, sem `orcid`, sem orcamento automatico e com `workflow_reason=escalation_required` vinculado ao `EscalationManager`. HTTP radar e WhatsApp real `central -> bot` passaram no fluxo `tattoo-cliente-irritado-handoff`.
Politica corrigida: HTTP production smoke e radar inicial; WhatsApp real e validacao definitiva por micro-slice conversacional. Nao declarar slice fechado sem scenario `whatsapp_real` correspondente ou rehearsal real equivalente no gate.
O compact integrado foi corrigido na arquitetura: existe hook Claude Code, mas a retomada oficial agora e portavel via `bash scripts/smoke/continuity-bundle.sh --force`, adequado para Codex/API.
Achado de linguagem da idade isolada foi corrigido para pedir data completa com seguranca e registro de maioridade.
```

## Mudanças Funcionais Do Checkpoint

Arquivos funcionais incluídos no checkpoint:

```text
functions/_lib/conversation-router.js
functions/_lib/whatsapp-pipeline.js
functions/api/agent/route.js
tests/_lib/conversation-router.test.mjs
tests/_lib/whatsapp-pipeline.test.mjs
tests/agent/route-runagent.test.mjs
functions/_lib/conversation-policy.js
functions/_lib/conversation-response-composer.js
tests/_lib/conversation-policy.test.mjs
```

Arquivos funcionais adicionados/alterados no checkpoint de cadastro premium:

```text
functions/_lib/conversation-policy.js
functions/_lib/conversation-router.js
tests/_lib/conversation-policy.test.mjs
tests/_lib/conversation-router.test.mjs
tests/_lib/whatsapp-pipeline.test.mjs
```

Arquivos funcionais adicionados/alterados nas correções de smoke de 2026-05-25:

```text
functions/_lib/conversation-policy.js
functions/_lib/conversation-response-composer.js
functions/_lib/whatsapp-pipeline.js
functions/api/agent/route.js
functions/_lib/prompts/coleta/tattoo/contexto.js
functions/_lib/prompts/coleta/tattoo/decisao.js
functions/_lib/prompts/coleta/tattoo/exemplos.js
tests/_lib/conversation-policy.test.mjs
tests/_lib/conversation-router.test.mjs
tests/_lib/whatsapp-pipeline.test.mjs
tests/agent/route-runagent.test.mjs
tests/prompts/snapshots/coleta-tattoo.txt
```

Arquivos de documentação incluídos no checkpoint:

```text
docs/atendimento-premium/07-arquitetura-prompt-premium.md
docs/atendimento-premium/08-decision-log.md
docs/atendimento-premium/09-session-handoff.md
docs/canonical/decisions/2026-05-24-atendimento-premium-hybrid-architecture.md
docs/atendimento-premium/README.md
docs/canonical/index.md
```

Arquivos de documentação alterados no checkpoint de metodologia/commit automático:

```text
docs/canonical/methodology/conversation-change-doctrine.md
docs/atendimento-premium/01-doutrina.md
```

Arquivos de processo/smoke adicionados ou alterados nesta sessão:

```text
.claude/settings.json
scripts/smoke/continuity-bundle.sh
scripts/smoke/run-inbound.sh
scripts/smoke/run-real-whatsapp.sh
scripts/smoke/render-report.sh
scripts/smoke/render-triage.sh
functions/_lib/escalation-manager.js
docs/atendimento-premium/12-loop-continuity-protocol.md
docs/atendimento-premium/17-context-compact-architecture.md
docs/atendimento-premium/current-objective.md
docs/atendimento-premium/smoke-runs.md
docs/atendimento-premium/autonomy-gate.env
docs/atendimento-premium/slice-gates/cadastro-handoff.env
docs/atendimento-premium/smoke-scenarios/cadastro-menoridade-handoff-humano.env
```

Skills de continuidade ajustadas fora do repo ativo:

```text
~/.codex/skills/session-start/SKILL.md
~/.codex/skills/session-end/SKILL.md
~/.codex/skills/daily-start/SKILL.md
```

Contrato atual:

- `session-end` atualiza handoff/decision log/canonical quando a frente envolve atendimento premium.
- `session-start` consome handoff/decision log/canonical de forma enxuta entre sessões.
- `daily-start` continua sendo abertura ampla do dia e só lê handoff premium quando o foco pedir.

Antes de continuar, conferir `git status --short`. A expectativa após este checkpoint é worktree limpo.

## Último Smoke Considerado PASS Nesta Frente

### Smoke monitorado atual - 2026-05-25

Run de referência:

```text
scenario-whatsapp-real-tattoo-cliente-irritado-handoff-20260525T212423Z-21065
```

Alvo:

```text
https://inkflowbrasil.com
```

Resultado:

```text
PASS
estado_agente: aguardando_tatuador
orcid: null
copy_risk: baixo
copy: pede desculpa pela frustracao e aciona pessoa do estudio, sem formulario, preco, agenda ou sinal
escalation: client_upset high sem orcid
workflow: escalation_required para aguardando_tatuador
observability: agent_turn_logs agent_name=escalation_manager reason_code=client_upset + agent_name=workflow_manager workflow_reason=escalation_required
observability_gate: EXPECTED_AGENT_LOG_JQ_TRUE PASS
chain: Evolution central -> WhatsApp real -> bot -> webhook -> pipeline -> resposta
```

Decisão:

```text
O Workflow Manager agora tambem oficializa saidas para humano por escalation, sem transformar isso em orcamento automatico.
O monitoramento consegue validar a decisao completa: Router detecta, Escalation Manager classifica, Workflow Manager muda a fase.
```

### Correções de smoke - 2026-05-25

Deploy validado:

```text
https://3ff8fcec.inkflow-saas.pages.dev
```

Telefone de smoke limpo ao fim da sessão:

```text
5521970789797
```

Casos corrigidos e cobertos por teste:

```text
1. pergunta de estilo: "old school" nao vira nome curto "old";
2. foto do local pendente: "agora nao consigo" nao trava a conversa e orienta mandar depois;
3. primeiro contato misto: "oi" + "quero fazer uma tatuagem no braço" deve apresentar antes de coletar;
4. cadastro pendente: nome/data/email/recusa sao resolvidos pelo router antes da lateral intent.
```

Smoke manual historico sugerido na epoca para validar escrevendo:

```text
oi
quero fazer uma tatuagem no braço
```

Esperado:

```text
O bot se apresenta primeiro ("Me chamo ...") e depois segue a coleta aproveitando o dado "braço".
```

Status atual:

```text
Coberto por teste automatizado do primeiro contato misto; nao e bloqueador ativo do handoff atual.
```

### Cadastro premium - QuestionPolicy

Deploy validado:

```text
https://b59bf5bc.inkflow-saas.pages.dev
```

Setup controlado:

```text
tenant teste: db686ef2-ca42-43e4-a831-808984d8d6c6
telefone: 5521970789797
estado inicial: coletando_cadastro
pergunta pendente no histórico: "Pra liberar teu orçamento, me passa nome completo e data de nascimento?"
```

Fluxo validado:

```text
Joao Silva
12/03/1995
como funciona o orçamento?

pode seguir sem email
quanto tempo demora?
```

Estado final observado:

```json
{
  "estado_agente": "coletando_cadastro",
  "dados_cadastro": {
    "nome": "Joao Silva",
    "email": null,
    "email_recusado": true,
    "data_nascimento": "1995-03-12"
  },
  "valor_proposto": null,
  "orcid": null
}
```

Critério aplicado:

- persistiu nome completo e data ISO;
- respondeu dúvida lateral sobre orçamento antes de retomar;
- pediu email após nome/data;
- persistiu recusa de email;
- respondeu dúvida lateral sobre tempo;
- não insistiu no email;
- não criou agendamento/Pix indevido.

Achado residual historico:

- cadastro ficou completo em `dados_cadastro`, mas o estado permaneceu `coletando_cadastro`;
- a última resposta foi "Confirmo por aqui e sigo com teu orçamento";
- próximo slice deve decidir/implementar transição segura quando o router completa cadastro.

Status atual:

```text
Resolvido pelo Workflow Manager / cadastro-handoff. Gate atual `cadastro-handoff` PASS e smoke real `whatsapp-real-cadastro-handoff` validado.
```

### Tattoo - lateral + retomada

Fluxo validado:

```text
opa
quero fazer um foguinho na virilha
quanto que é
Paola aqui
como funciona o orçamento?
tenho 160
sao quantas sessoes pra fazer?
fineline
quanto fica
```

Estado final esperado/observado:

```json
{
  "estado_agente": "coletando_tattoo",
  "dados_coletados": {
    "descricao_curta": "foguinho",
    "local_corpo": "virilha",
    "altura_cm": 160,
    "estilo": "fineline"
  },
  "dados_cadastro": {},
  "valor_proposto": null
}
```

Critério aplicado:

- respondeu lateral;
- retomou coleta;
- não avançou indevidamente;
- não acionou handoff;
- não propôs valor;
- manteve estado em `coletando_tattoo`.

## Testes Relevantes

Rodar antes de qualquer deploy desta frente:

```bash
node --test tests/_lib/conversation-policy.test.mjs tests/_lib/conversation-router.test.mjs tests/_lib/whatsapp-pipeline.test.mjs tests/agent/route-runagent.test.mjs
```

Rodar subset menor quando mexer apenas em policy/router:

```bash
node --test tests/_lib/conversation-policy.test.mjs tests/_lib/conversation-router.test.mjs
```

Quando mexer em prompt de tattoo, rodar tambem:

```bash
node --test tests/prompts/invariants.test.mjs tests/prompts/snapshot.test.mjs tests/prompts/contracts/coleta-tattoo.mjs
```

Ultima execucao local registrada em 2026-05-25:

```text
109 testes agent/router/pipeline PASS
26 testes prompt/snapshot PASS
```

Ultima execucao de processo registrada em 2026-05-25:

```text
bash -n scripts/smoke/continuity-bundle.sh PASS
bash scripts/smoke/continuity-bundle.sh --force PASS
hook SessionStart simulado PASS
bash scripts/smoke/check-autonomy-gate.sh PASS
bash scripts/smoke/check-slice-gate.sh cadastro-handoff PASS
GitHub Actions Tests PASS
GitHub Actions Deploy to Cloudflare Pages PASS
```

Ultimo micro-slice validado em Level 3:

```text
Handoff Package / Telegram Premium - Handoff Package v1
commit: 2923620 feat: add escalation handoff package
local: node --test tests/**/*.test.mjs PASS (1169)
ci: Tests e Deploy PASS
http radar: scenario-tattoo-cliente-irritado-handoff-20260525T221506Z-24583 PASS
whatsapp real: scenario-whatsapp-real-tattoo-cliente-irritado-handoff-20260525T221534Z-612 PASS
prova real: Cliente "voces demoram demais, ninguem responde" -> Bot "Entendi, desculpa pela frustração. Vou acionar uma pessoa do estúdio para assumir por aqui e te ajudar direto."
telemetria: escalation_manager client_upset com handoff_package_version=handoff_package_v1, handoff_package_has_summary=true e handoff_package_missing_fields_count=1; workflow_manager escalation_required; orcid=null.
rodada: Level 3 familia Handoff Package / Telegram Premium; 1 de ate 4 micro-slices concluidos, parar em qualquer falha.
```

## Próxima Ação Recomendada

Antes de codar nova frente:

1. Confirmar worktree.
2. Rodar `bash scripts/smoke/continuity-bundle.sh --force` se o contexto estiver abaixo de 20% ou a sessao tiver sido compactada.
3. Confirmar Autonomy Gate Level 3 e gate do slice relacionado.
4. Atacar no maximo 4 micro-slices da mesma familia por rodada; a rodada atual e Handoff Package / Telegram Premium e esta em 1/4.
5. Registrar smoke em `smoke-runs.md` e atualizar o gate do slice antes de ampliar autonomia.

Minha recomendação estratégica:

```text
Nao avançar para IntentPolicy ampla antes de consolidar os proximos micro-slices de fundacao com smoke real/HTTP e gate por slice.
```

Depois disso, o próximo melhor ataque é:

```text
Proximo micro-slice recomendado: aplicar pacote operacional ao handoff de cadastro completo/orcamento, garantindo briefing rico e rastreavel para o tatuador sem alterar decisao de cliente.
```

Motivo: snapshot observavel ja existe; o proximo passo premium e fazer uma regra do tenant influenciar decisao de atendimento com HTTP radar e WhatsApp real.

## Checklist De Fechamento De Sessão

Antes de encerrar a sessão:

1. Rodar `git status --short`.
2. Rodar testes relevantes ou registrar explicitamente que não rodou.
3. Atualizar este handoff com:
   - último deploy;
   - último smoke;
   - próximo passo;
   - bloqueios;
   - arquivos tocados.
4. Atualizar `08-decision-log.md` se alguma decisão nova foi tomada.
5. Se a frente estiver pronta, fazer commit separado de docs ou commit único coerente com código + docs.
6. Enviar resumo final com:
   - o que mudou;
   - o que foi validado;
   - o que falta;
   - onde retomar.

## Frase De Controle Para Próxima Sessão

```text
Continue a frente de atendimento premium lendo o handoff em docs/atendimento-premium/09-session-handoff.md e respeitando a decisão canônica de arquitetura híbrida.
```
