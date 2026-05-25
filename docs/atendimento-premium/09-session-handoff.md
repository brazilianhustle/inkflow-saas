# Session Handoff - Atendimento Premium

Este arquivo é o ponto de retomada para próximas sessões em Claude Code, Codex ou NotebookLM.

Ele não substitui o git status nem os testes. Ele registra o estado operacional da frente.

## Como Retomar Uma Nova Sessão

Ler nesta ordem:

1. `docs/canonical/decisions/2026-05-24-atendimento-premium-hybrid-architecture.md`
2. `docs/atendimento-premium/07-arquitetura-prompt-premium.md`
3. `docs/atendimento-premium/08-decision-log.md`
4. este arquivo
5. `docs/canonical/methodology/conversation-change-doctrine.md`

Depois rodar:

```bash
git status --short
```

Se houver mudanças não commitadas, entender antes de editar.

## Estado Atual Em 2026-05-25

Branch observada:

```text
main
```

Último commit observado após checkpoint:

```text
987646e fix: ensure first contact intro in tattoo flow
```

Último deploy de referência da frente:

```text
https://3ff8fcec.inkflow-saas.pages.dev
```

Status estratégico:

```text
Atendimento premium avançou para correção de regressões encontradas em smoke real manual.
O eixo estratégico é híbrido: orientar o modelo no prompt e usar guardrails pequenos fora do prompt apenas onde o comportamento precisa ser garantido.
Foram corrigidos: cadastro pendente via router, estilo "old school" virando nome, adiamento da foto do local e primeiro contato misto pulando apresentação.
Achado residual ainda válido: ao completar cadastro via router com recusa de email + dúvida lateral, o bot diz que segue com o orçamento, mas o estado permanece em coletando_cadastro. Próximo slice deve fechar a transição/handoff de cadastro completo depois dos smokes manuais atuais.
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

Smoke manual pendente para o usuario validar escrevendo:

```text
oi
quero fazer uma tatuagem no braço
```

Esperado:

```text
O bot se apresenta primeiro ("Me chamo ...") e depois segue a coleta aproveitando o dado "braço".
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

Achado residual:

- cadastro ficou completo em `dados_cadastro`, mas o estado permaneceu `coletando_cadastro`;
- a última resposta foi "Confirmo por aqui e sigo com teu orçamento";
- próximo slice deve decidir/implementar transição segura quando o router completa cadastro.

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

## Próxima Ação Recomendada

Antes de codar nova frente:

1. Confirmar worktree.
2. Rodar testes relevantes.
3. Rodar smoke manual do primeiro contato misto no WhatsApp.
4. Validar tambem os casos `old school`, `agora nao consigo` e cadastro com recusa de email.
5. Confirmar o achado residual do smoke de cadastro.

Minha recomendação estratégica:

```text
Se os smokes manuais passarem, nao avançar para IntentPolicy antes de fechar a transição de cadastro completo quando a completude veio pelo router.
```

Depois disso, o próximo melhor ataque é:

```text
CadastroCompletePolicy / handoff seguro após router completar cadastro
```

Motivo: o smoke real provou coleta e recusa de email, mas revelou que a fala de "sigo com teu orçamento" ainda não corresponde a uma transição operacional. Antes de ampliar intents, fechar essa fronteira evita conversa travada em cadastro completo.

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
