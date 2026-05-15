# TattooAgent — Audit Baseline 2026-05-15

**Escopo:** comparar prompts atuais (`functions/_lib/prompts/coleta/tattoo/decisao.js` — 182 linhas, refator 2026-05-13; `functions/_lib/prompts/coleta/tattoo/exemplos.js` — 92 linhas, 8 few-shots refator 2026-05-13) com os 8 failure modes do catálogo (Phase 0) que tocam o TattooAgent, sob lente do manifesto canônico (`docs/manifesto-tatuador-bot.md`).

**Método:** para cada FM, identificar gatilho persona, regra/exemplo atual no prompt (link a linha) ou ausência, gap observado (discrepância prompt↔manifesto/FM, sem prescrever fix), e sugestão acionável (genérica) pra Sub 1.B.

**Não-Goal:** propor mudança específica de wording — isso sai do baseline empírico da Task 9 + brainstorm da Sub 1.B.

**FMs em escopo (8):** FM-0001, FM-0003, FM-0004, FM-0005, FM-0008, FM-0009, FM-0011, FM-0012.
**FMs fora de escopo nesta auditoria (não tocam TattooAgent diretamente OU não rodam no Tattoo):** FM-0002 (pressão fechamento — proposta), FM-0006 (desconto unilateral — proposta), FM-0007 (data BR — cadastro), FM-0010 (cadastro menor — cadastro).

---

## FM-0001 — modo consultor não acionado

- **Gatilho persona:** PER-002 (indeciso-explorando), PER-009. Cliente diz variantes de "não sei o que tatuar" / "me ajuda a escolher" nos 1-2 primeiros turns.
- **Prompt atual:** `decisao.js:157-181` (§4.6 "Modo coletor vs consultor — Manifesto P6") com detector explícito de frases-trigger e fluxo do funil (perguntar local+estilo, sugerir Pinterest, transicionar a coletor quando referência chegar). Few-shot `exemplos.js:65-74` (Exemplo 6, modo consultor). Trigger "cliente nao consegue definir intencao mesmo guiado" listado em `decisao.js:181`.
- **Gap observado:** detector existe e tem few-shot, mas a janela está cravada em "**avalie nos primeiros 1-2 turnos**" (`decisao.js:159`). Cliente que começa parecendo decidido e revela indecisão a partir do turn 3+ não tem branch claro — fluxo cai no §4.1 normal (coletor) e o R3 só protege contra invenção de dados, não força mudança de modo. A lista de frases-trigger (`decisao.js:163-167`) é fechada e não cobre indecisão tardia ("ah, na real não sei", "to em dúvida").
- **Sugestão 1.B:** considerar reavaliação do modo a cada turno (não só nos 1-2 primeiros) e ampliar repertório de frases-trigger pra cobrir indecisão emergente. Validar empiricamente na baseline run.

## FM-0003 — bot sugere tamanho

- **Gatilho persona:** PER-001, PER-009, PER-010. Cliente diz "não sei o tamanho" OU manda descrição sem tamanho.
- **Prompt atual:** múltiplas camadas — R8 em `decisao.js:103-108` ("NUNCA SUGIRA TAMANHO AO CLIENTE" + 3 exemplos PROIBIDOS); R6 em `decisao.js:94-99` (conflito → pede foto referência, "NAO CONFRONTE"); `tamanho_cm` marcado como opcional em `decisao.js:53` ("NAO PERGUNTE proativamente — Manifesto P1"); few-shot `exemplos.js:23-28` (Exemplo 2 — bot não persegue cm) e `exemplos.js:43-50` (Exemplo 4 — conflito, pede foto). R7 (`decisao.js:101`) bloqueia handoff com conflito não resolvido.
- **Gap observado:** cobertura forte e redundante (regra + few-shot + invariante via OBR sem `tamanho_cm`). Status `mitigated` no catálogo se confirma no código. Possível ponto residual: R8 lista 3 exemplos PROIBIDOS mas não enumera o caso "cliente PEDE explicitamente sugestão" ("me dá uma ideia de tamanho?"), o que pode deixar zona cinza pro modelo.
- **Sugestão 1.B:** confirmar empiricamente regressão zero na baseline run (cenários MAN-1/2/3 já cobrem). Considerar few-shot explícito pro caso "cliente pede sugestão de tamanho" se a baseline detectar drift.

## FM-0004 — cover-up sem foto da tatuagem antiga

- **Gatilho persona:** PER-004. Cliente menciona "cover-up", "cobrir tattoo antiga", "tribal que quero cobrir".
- **Prompt atual:** cover-up listado como **trigger de erro** em `decisao.js:62` ("Cover-up: cliente menciona 'cobrir/tapar/disfarcar' OU foto mostra pele tatuada no local pretendido"). R5 (`decisao.js:89-92`) define resposta condicional ao `tenant.config_agente.aceita_cobertura` — se aceita, responde "tatuador avalia pessoalmente, já sinalizei", `proxima_acao='erro'`. Few-shot `exemplos.js:83-90` (Exemplo 8) confirma esse padrão. R4 (`decisao.js:84-87`) reconhece "pele TATUADA" como cobertura ou referência.
- **Gap observado:** prompt trata cover-up como **terminate-with-handoff-cego** — `proxima_acao='erro'` sai sem coletar foto da tatuagem antiga. Tatuador recebe handoff sem o artefato visual mais importante pra o caso técnico (a tattoo que vai ser coberta). Isso é discrepância direta entre a contramedida prescrita no FM ("quando detecta, pede foto da tatuagem atual além das 4 OBR padrão") e o comportamento codificado (curto-circuito em erro). Nada no prompt instrui a pedir a foto da tatuagem antiga antes do erro/handoff.
- **Sugestão 1.B:** considerar um sub-fluxo cover-up que peça foto da tatuagem atual 1x antes de transicionar a `erro`/handoff (análogo à mensagem-ponte de §4.4 pedindo `foto_local`). Validar com baseline se o erro seco é mesmo o comportamento desejado ou se um pedido de foto extra agrega.

## FM-0005 — bot repergunta info já fornecida

- **Gatilho persona:** PER-001, PER-006. Conversa de 4+ turns com info espalhada por várias mensagens.
- **Prompt atual:** R3 em `decisao.js:75-81` orienta persistir "APENAS valores REAIS" e adicionar campos faltantes em `campos_faltando`, mas não tem o complemento simétrico ("se já em `dados_persistidos`, NÃO repergunte"). §4.5 menciona "Dados ja coletados" no `dados_persistidos.estilo` para escolha de portfolio (`decisao.js:145`). §2 CONTEXTO (não está nesse arquivo) injeta `Dados ja coletados` — referenciado em `decisao.js:145` ("ver §2 CONTEXTO -> 'Dados ja coletados'"). Few-shots `exemplos.js:30-41` (Exemplo 3 — coleta progressiva) mostram acúmulo, mas nenhum exemplo demonstra cliente fornecendo info repetida ou bot tendo que ignorar pergunta porque já tem o campo.
- **Gap observado:** sem regra explícita anti-repergunta. Cobertura indireta via R3 (persistência) e §2 CONTEXTO (que mostra os dados já coletados ao modelo), mas o comportamento "consulte `dados_persistidos` antes de perguntar" não é codificado como regra positiva. Risco aumenta com `campos_faltando` mal-sincronizado entre turns.
- **Sugestão 1.B:** confirmar primeiro empiricamente (na baseline run) se o problema realmente ocorre — o FM nota "validar com eval real antes de assumir frequência". Se reproduzir, considerar regra explícita "antes de perguntar campo X, verifique `dados_persistidos.X` — se preenchido, skip". Também investigar se `dados_persistidos` chega íntegro ao prompt (camada upstream, fora do escopo desta auditoria de prompt).

## FM-0008 — bot insiste em cliente intencionalmente vago

- **Gatilho persona:** PER-008. Cliente dá 2+ respostas seguidas sem informação acionável ("uma tatuagem normal", "qualquer coisa", "depois eu vejo").
- **Prompt atual:** trigger "Cliente evasivo (3 vezes sem responder OBR mesmo reformulando)" listado em `decisao.js:67`. Linhas 2/5/7/9/11 da tabela (`decisao.js:28-36`) mapeiam trigger → `proxima_acao='erro'`. **Sem few-shot dedicado** ao caso "vagueza intencional" em `exemplos.js` (8 exemplos, nenhum cobre PER-008). Modo consultor (§4.6) parcialmente sobrepõe mas só dispara em frases-trigger explícitas de indecisão, não em vaguidade do tipo "qualquer coisa".
- **Gap observado:** existe a trigger com limiar 3 mas (a) nenhum few-shot ensina o modelo o que conta como "evasivo" vs "indeciso" vs "ainda pensando" — fronteiras borradas; (b) limiar 3 pode ser alto pra UX do FM que reclama de "5+ turns"; (c) não há orientação sobre **handoff humano** especificamente — o trigger sai como `erro` genérico, e a contramedida do FM fala em "propor handoff". Falta diferenciar "erro técnico/policy" vs "rendição educada com handoff" no output.
- **Sugestão 1.B:** baseline run confirma frequência e turn-count típico. Considerar few-shot dedicado PER-008 e revisar se "evasivo" precisa de tratamento separado de "erro" (sugestão de handoff humano com mensagem própria).

## FM-0009 — bot confunde mudança de decisão

- **Gatilho persona:** PER-009. Cliente disse "rosa" no turn 2, no turn 4 muda pra "leão" ("esquece a rosa, leão").
- **Prompt atual:** **sem cobertura explícita no prompt** para semântica de substituição. R3 (`decisao.js:75-81`) instrui persistir valores reais e usar defaults pra "nao tenho", mas nada sobre overwrite quando cliente troca explicitamente. R6 (`decisao.js:94-99`) cobre conflito intra-mensagem ("rosa pequena de 25cm") mas não conflito **inter-turn** (mudança de decisão entre mensagens). Nenhum dos 8 few-shots em `exemplos.js` demonstra cliente trocando de tema/estilo/local entre turns. Sem regra dizendo "substituir, não somar" em `dados_persistidos` quando cliente apresenta alternativa.
- **Gap observado:** comportamento de `dados_persistidos` em caso de mudança fica delegado ao default do modelo (LLM tende a aditivo). Sem few-shot, sem regra. O catálogo nota "pode estar OK no prompt atual — eval real em Phase 1 valida" — auditoria confirma a lacuna formal.
- **Sugestão 1.B:** validar empiricamente. Se reproduzir, considerar regra explícita pra overwrite quando cliente sinaliza substituição ("ah não, prefiro X", "esquece Y, é Z") + few-shot dedicado.

## FM-0011 — bot frio em momento emocional

- **Gatilho persona:** PER-012. Cliente menciona luto, divórcio, doença, "momento difícil".
- **Prompt atual:** **sem cobertura explícita no prompt**. Nenhuma regra em `decisao.js` aborda registro emocional do cliente — R1-R8 são puramente operacionais (valor, dados, conflito, output). Nenhum dos 8 few-shots em `exemplos.js` cobre contexto emocional/luto. §3 IDENTIDADE (em `identidade.js`, fora do escopo desta auditoria) pode ter tom mas decisao.js+exemplos.js não. Modelo entra no fluxo §4.1 comercial padrão por default.
- **Gap observado:** sem instrução de acolhimento + sem demonstração via few-shot. Risco direto do FM (bot soa robô em luto). Conflito potencial: prompt pede mensagem-ponte com "validação substantiva concreta da tattoo" (`decisao.js:125-129`) — em contexto emocional, esse tom pode soar especialmente frio se não tiver acolhimento prévio.
- **Sugestão 1.B:** considerar few-shot emocional (1 frase de acolhimento + segue flow, conforme contramedida do FM e nota "bot não vira terapeuta, mas não pode ser robô"). Possivelmente alinhar com pattern transversal cross-agent (FM lista 3 agents afetados).

## FM-0012 — bot aceita estilo indisponível

- **Gatilho persona:** PER-014. Cliente pede estilo fora de `tenant.config_agente.estilos_oferecidos` (ex: "realismo colorido" em estúdio blackwork-only).
- **Prompt atual:** **sem cobertura no prompt e sem leitura do campo `estilos_oferecidos`**. `decisao.js:14-15` lê apenas `tenant.config_agente?.aceita_cobertura` — é o único campo de config consumido em todo o arquivo. OBR `estilo` (`decisao.js:50`) aceita "fineline / realismo / blackwork / tradicional / aquarela / etc" como texto livre, sem validação contra catálogo do tenant. Nenhum few-shot em `exemplos.js` cobre rejeição de estilo. Trigger não inclui "estilo fora do catálogo".
- **Gap observado:** falha estrutural — campo do schema `config_agente.estilos_oferecidos` não é injetado no prompt nem usado em decisão. Qualquer estilo passa, gerando handoff falso. FM nota dependência: "Depende de `config_agente.estilos_oferecidos` ser canônico. Verificar schema atual antes de implementar".
- **Sugestão 1.B:** auditar (fora do prompt) se `estilos_oferecidos` existe e é canônico no schema antes de pedir o prompt pra validar. Se sim, considerar injeção do catálogo em §2 CONTEXTO + regra/trigger pra estilo fora-de-catálogo (resposta honesta + handoff). Eventualmente integração com PortfolioAgent (Phase 4, conforme FM).

---

## Failure modes adicionais descobertos (não previstos)

Nenhum failure mode novo foi identificado durante a leitura desta baseline. Algumas **observações marginais** (não promovidas a FM, sem evidência empírica suficiente):

- **§4.4 (mensagem-ponte) — risco de tom genérico:** prompt proíbe "Show, anotei tudo" mas a "validação substantiva" de UMA característica concreta pode soar formulaica se o modelo repete o pattern em PER-012/luto (overlap com FM-0011, não novo).
- **R3 defaults assimétricos:** `tamanho_cm: null` vs `local_corpo: ""` vs `refs_imagens: []` — três tipos de default pra "sem valor". Não é falha funcional, só inconsistência estilística (não promovido a FM).
- **R6 instrução "Caso atipico — tatuador resolve depois" (`decisao.js:99`):** quando cliente nega ter foto referência em conflito, prompt manda seguir fluxo normal. Risco residual: handoff sai com info conflitante implícita (campos_conflitantes não-vazio bloqueia handoff por R7 — então provavelmente OK, mas vale verificar no smoke).

Nenhum desses justifica novo FM antes do baseline empírico.

## Sumário pro brainstorm da Sub 1.B

**Top-3 FMs prováveis de reproduzir empiricamente** (ordem de prioridade pro baseline run da Task 9 confirmar):

1. **FM-0012 (estilo indisponível)** — gap estrutural confirmado: campo `estilos_oferecidos` não consumido em nenhum lugar do prompt. Reprodução determinística esperada (basta um tenant com catálogo restrito + cliente pedindo estilo fora). Alto valor diagnóstico.
2. **FM-0011 (bot frio em momento emocional)** — ausência total de cobertura (regra + few-shot). Reprodução esperada em qualquer cenário onde cliente menciona luto/contexto pesado. Persona PER-012 isola bem.
3. **FM-0001 (modo consultor não acionado em turn 3+)** — cobertura parcial (detector existe mas janela 1-2 turnos). Reprodução depende de simular indecisão tardia. Vale priorizar pra distinguir entre "detector OK" (status quo) e "detector com janela errada" (gap real).

**FMs prováveis NÃO reproduzir empiricamente** (cobertura forte pode segurar):

- **FM-0003** (bot sugere tamanho) — `mitigated`, cobertura tripla (R8 + R6 + invariante). Baseline mostra zero regressão se prompts não regrediram.
- **FM-0005** (repergunta info já dada) — cobertura indireta via §2 CONTEXTO + R3. Pode passar ou falhar dependendo de `dados_acumulados` chegar íntegro (camada upstream).

**FMs com gap conhecido mas reprodução incerta:**

- **FM-0004** (cover-up sem foto) — comportamento atual (erro seco) pode ser tecnicamente aceitável pra alguns tenants; gap é de produto, não de policy. Reprodução determinística mas valor depende da decisão de produto.
- **FM-0008** (cliente vago) — trigger existe com limiar 3; baseline confirma se limiar é alto demais.
- **FM-0009** (mudança de decisão) — catálogo já marca "pode estar OK no prompt atual"; baseline necessário pra confirmar.
