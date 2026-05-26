# Multi-Agent Governance

Este protocolo define como usar agentes paralelos dentro da frente de atendimento premium sem perder rastreabilidade, seguranca operacional ou validade dos smokes.

## Objetivo

```text
Acelerar analise, preparo, auditoria e continuidade sem transformar Level 4B em paralelismo livre.
```

Multi-agentes sao uma ferramenta de Estado-Maior. Eles ajudam a pensar, auditar, preparar cenarios e investigar falhas. Eles nao substituem o comandante unico do ciclo.

## Veredito

```text
status: permitido_com_restricoes
modelo: commander + single-writer + reviewers
level_atual: 4B
4c: bloqueado
```

No Level 4B, multi-agentes podem apoiar a onda, mas nao podem fechar micro-slice, promover autonomia, rodar WhatsApp real concorrente ou editar arquivos de verdade operacional em paralelo.

## Papeis

### Commander / Integrador

Responsavel por:

- declarar a onda e o micro-slice atual;
- definir escopo, risco e arquivos provaveis;
- integrar qualquer patch;
- commitar, subir deploy e aguardar CI;
- rodar HTTP radar e WhatsApp real definitivo;
- registrar evidencias finais;
- decidir manter, pausar, rebaixar ou abortar.

Somente o Commander declara PASS final.

### Planner / Scout

Responsavel por:

- ler docs/codigo antes do ataque;
- mapear riscos e arquivos provaveis;
- propor cenarios e testes;
- revisar se a decisao arquitetural esta coerente.

Nao edita codigo nem docs canonicos.

### Implementer

Responsavel por:

- implementar um micro-slice com escopo fechado;
- tocar apenas os arquivos autorizados;
- rodar testes locais relevantes;
- informar exatamente o que mudou.

Nao faz deploy, nao roda WhatsApp real definitivo e nao fecha slice.

### Verifier

Responsavel por:

- revisar diff e testes;
- auditar artifacts de smoke;
- conferir `summary.md`, `transcript.md`, `judgment.md`, `poll.json` e `agent-turn-logs.json` quando existirem;
- classificar falhas por `triage.md` e `plan-review.md`.

Nao altera comportamento enquanto valida.

### Archivist / Continuity

Responsavel por:

- preparar atualizacao de `smoke-runs.md`;
- conferir `current-objective.md`, `09-session-handoff.md` e docs da onda;
- detectar divergencia entre run id, commit, evidence dir e registro.

A escrita final nos docs canonicos passa pelo Commander.

## Regras De Ouro

```text
1 micro-slice = 1 writer de codigo.
1 onda = 1 commander.
1 WhatsApp real definitivo por vez no telefone de teste.
1 fonte de verdade para status: repo versionado.
```

Paralelizar leitura, auditoria, preparo de cenarios e triage e permitido. Paralelizar side effects de producao nao e permitido.

## Fronteiras De Arquivos

| Area | Regra |
|---|---|
| `docs/atendimento-premium/autonomy-gate.env` | Commander only, commit proprio, promocao deliberada |
| `docs/atendimento-premium/current-objective.md` | Commander only |
| `docs/atendimento-premium/09-session-handoff.md` | Commander only |
| `docs/atendimento-premium/08-decision-log.md` | Commander only para decisao final |
| `docs/atendimento-premium/smoke-runs.md` | Commander/Archivist apos evidencia completa, nunca append paralelo |
| `docs/atendimento-premium/*wave*.md` | Commander define status; agentes podem sugerir |
| `docs/atendimento-premium/smoke-scenarios/*.env` | Um dono por scenario ou par HTTP/WhatsApp |
| `scripts/smoke/run-scenario.sh` | Infra de smoke; nao misturar com feature conversacional |
| `scripts/smoke/check-*.sh` e `wave-health.sh` | Read-only para agentes de feature |
| `.smoke-evidence/<run_id>/` | Um run id por execucao; nao corrigir evidencia manualmente |
| Runtime conversacional | Single-writer por camada e por micro-slice |

Se dois agentes precisam editar a mesma camada logica, o trabalho deve ser sequenciado.

## Onde Multi-Agentes Ajudam

- auditoria read-only por camada;
- preparo de contratos de scenario;
- revisao de regex, `EXPECTED_POLL_JQ_TRUE` e copy risk;
- auditoria de evidencia;
- triage de falhas;
- checagem de drift documental;
- revisao de diff antes do commit;
- investigacao em worktree separada quando a escrita for isolada.

## Onde Multi-Agentes Nao Devem Atuar

- WhatsApp real paralelo usando o mesmo telefone/setup;
- promocao de autonomia;
- `MAX_BATCH_SIZE`, Level 4C ou `autonomy-gate.env`;
- secrets, Evolution, Cloudflare bindings, Supabase service role ou `.dev.vars`;
- preco, sinal, pagamento, agenda ou tenant real amplo;
- rollback em producao;
- fechamento de micro-slice conversacional sem WhatsApp real;
- ajuste de smoke para esconder bug de comportamento.

## Stop Conditions Especificas

Parar a onda se ocorrer qualquer item:

- dois agentes editam a mesma camada logica na mesma janela;
- um agente altera comportamento enquanto outro altera o gate desse mesmo comportamento;
- smoke roda sobre commit diferente do deploy validado;
- ha divergencia entre `current-objective.md`, `smoke-runs.md`, doc da onda e `git head`;
- existe WIP nao commitado de outro agente no mesmo escopo;
- WhatsApp real definitivo foi pulado em comportamento conversacional;
- dois deploys sucessivos nao registram qual commit cada smoke validou;
- uma falha e corrigida antes de triage registrar causa e classe;
- evidencia fica nao reprodutivel: run id sem artifact, artifact sem commit, commit sem smoke ou smoke sem registro;
- o Commander nao consegue responder: quem e dono, qual commit, qual gate e qual prova real.

Quando uma stop condition ocorre, volta para triage. Nenhum novo micro-slice comeca ate o bloqueio ser resolvido.

## Ferramentas De Apoio

O ganho principal deve vir de orquestrar melhor ferramentas existentes:

- `scripts/smoke/run-scenario.sh`;
- `scripts/smoke/render-report.sh`;
- `scripts/smoke/render-triage.sh`;
- `scripts/smoke/render-plan-review.sh`;
- `scripts/smoke/check-slice-gate.sh`;
- `scripts/smoke/check-autonomy-gate.sh`;
- `scripts/smoke/wave-health.sh`;
- `scripts/smoke/evidence-index.sh`;
- `scripts/smoke/evidence-registrar.sh`;
- `scripts/smoke/wave-closeout-summarizer.sh`;
- `scripts/smoke/evidence-orphan-gate.sh`;
- `scripts/smoke/continuity-bundle.sh`;
- GitHub Actions de tests, prompts/evals e deploy.

Ferramentas candidatas futuras:

- `wave-runner`: orquestra preflight, dry-run, HTTP radar, WhatsApp real, gates e relatorio;
- dry-run de scenarios no CI;
- matriz executavel de risco para bloquear comandos fora da zona autorizada.

## Wave Runner

O `scripts/smoke/wave-runner.sh` e a primeira ferramenta metodologica desta governanca.

Na versao atual, ele executa apenas preflight seguro:

```bash
bash scripts/smoke/wave-runner.sh tattoo-multi-info-basic whatsapp-real-tattoo-multi-info-basic
```

Ele valida:

- `autonomy-gate.env`;
- limite de `MAX_BATCH_SIZE`;
- worktree;
- `git diff --check`;
- sintaxe dos scripts de smoke;
- dry-run dos scenarios informados;
- `check-autonomy-gate.sh`;
- `wave-health.sh`.

Ele nao executa:

- HTTP radar real;
- WhatsApp real;
- commit;
- push;
- deploy;
- edicao em `smoke-runs.md`;
- promocao de autonomia.

Durante desenvolvimento do proprio processo, pode ser usado com:

```bash
WAVE_RUNNER_ALLOW_DIRTY=1 bash scripts/smoke/wave-runner.sh <scenario>
```

Esse modo so permite worktree sujo para preflight. Ele nao autoriza fechar slice com worktree sujo.

## Evidence Registrar

O `scripts/smoke/evidence-registrar.sh` gera uma linha sugerida para `smoke-runs.md` a partir de um diretorio de evidencia.

Uso:

```bash
bash scripts/smoke/evidence-registrar.sh .smoke-evidence/<run_id>
```

Ele le:

- `summary.md`;
- `judgment.md`;
- `request.json`;
- `poll.json`;
- `scenario.env`.

Ele imprime:

- data UTC;
- run id;
- tipo;
- alvo;
- telefone;
- resultado;
- evidence dir;
- decisao resumida com estado, `orcid`, `copy_risk`, dados persistidos e ultima resposta do bot.

Ele nao edita `smoke-runs.md`. O Commander ainda revisa e cola a linha final.

## Wave Closeout Summarizer

O `scripts/smoke/wave-closeout-summarizer.sh` gera um bloco revisavel de fechamento de onda a partir de uma ou mais evidencias ja existentes.

Uso:

```bash
bash scripts/smoke/wave-closeout-summarizer.sh .smoke-evidence/<run_id> [...]
```

Ele consolida:

- Evidence Summary por run id;
- estado final, ORCID e copy risk;
- dados coletados/cadastro do ultimo step;
- provas conclusivas reais no formato Cliente/Bot para WhatsApp real;
- decisao sugerida para revisao do Commander.

Ele nao executa:

- HTTP smoke;
- WhatsApp real;
- edicao de `smoke-runs.md`;
- commit;
- push;
- deploy;
- promocao para Level 4C.

Regra operacional: usar este script para acelerar closeout e auditoria, mas nunca como substituto de `summary.md`, `transcript.md`, `judgment.md`, `poll.json` e `agent-turn-logs.json` quando aplicavel.

## Evidence Orphan Gate

O `scripts/smoke/evidence-orphan-gate.sh` detecta divergencias entre `.smoke-evidence` e `smoke-runs.md`.

Uso operacional:

```bash
bash scripts/smoke/evidence-orphan-gate.sh
```

Ele valida:

- registros em `smoke-runs.md` apontando para evidence dirs existentes;
- evidence dirs completos recentes sem registro;
- evidence dirs incompletos recentes quando o modo estrito estiver ativo.

Modo padrao:

- falha se um registro versionado aponta para artifact ausente;
- emite `WARN` para evidence recente completa sem registro;
- ignora evidence incompleta historica ou de tentativa abortada.

Modo estrito:

```bash
EVIDENCE_ORPHAN_STRICT=1 bash scripts/smoke/evidence-orphan-gate.sh
```

O modo estrito falha tambem para evidence recente nao registrada ou incompleta. Ele deve ser usado em auditoria/limpeza planejada, nao como bloqueio diario enquanto ha historico antigo de tentativas e controles nao registrados.

## Protocolo Por Micro-Slice

1. Commander declara micro-slice, risco, arquivos provaveis e dono.
2. Scout/Verifier podem analisar em paralelo sem editar.
3. Implementer, se usado, trabalha como single-writer.
4. Commander revisa e integra.
5. Rodar testes locais relevantes.
6. Commit pequeno.
7. Push, CI e deploy.
8. HTTP radar em producao.
9. WhatsApp real definitivo se conversacional.
10. Evidence index, slice gate e wave health.
11. Registrar docs.
12. Commit de evidencia.

## Elegibilidade Para 4C

Multi-agentes nao tornam 4C elegivel.

4C so pode ser discutido depois de:

- duas ondas 4B saudaveis sem stop condition;
- uma onda 4B usando esta governanca sem conflito;
- CI/deploy PASS;
- HTTP radar PASS;
- WhatsApp real PASS para todos comportamentos conversacionais;
- zero evidencia orfa;
- `wave-health.sh` PASS;
- worktree limpo;
- commit deliberado para promocao.

## Definicao De Pronto

Este protocolo esta pronto quando:

- esta referenciado no README;
- esta referenciado na politica Level 4;
- `wave-health.sh` continua PASS;
- nenhuma regra contradiz HTTP radar -> WhatsApp real definitivo;
- Level 4C continua bloqueado.
