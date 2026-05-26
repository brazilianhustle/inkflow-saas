# Level 4A Wave 1

Esta onda inaugura o Level 4A sem abrir superficie vermelha. O objetivo e fortalecer monitoramento, smoke e higiene operacional antes de voltar para comportamento conversacional amplo.

## Declaracao

```text
onda_id: level4a-wave-1-monitoring-security
objetivo: reduzir risco operacional antes de novos slices conversacionais
familia: monitoramento, smoke, seguranca operacional
risco: verde/amarelo
janela: Level 4A, ate 6 micro-slices
```

## Escopo

Dentro do escopo:

- gates de seguranca e Dependabot;
- melhorias de smoke/monitoramento;
- melhorias de continuidade e retomada;
- documentacao operacional de gates;
- ajustes que nao alterem resposta do bot ao cliente.

Fora do escopo:

- preco, sinal, pagamento ou agenda;
- secrets;
- tenant real amplo;
- zona vermelha sem staging/preview;
- alterar linguagem conversacional sem WhatsApp real definitivo;
- promover para 4B/4C.

## Micro-Slices Planejados

1. `security-gate`: tornar `npm audit` + Dependabot aberto um gate reproduzivel.
2. `wave-health-summary`: consolidar status de gate/autonomia/seguranca em comando unico.
3. `smoke-evidence-index`: facilitar leitura das provas reais recentes.
4. `level4a-stop-audit`: validar que stop conditions continuam visiveis no bundle.

Os itens 2-4 so devem ser executados se o item anterior terminar com CI/deploy PASS e sem blocker.

## Criterios De Pronto

- `check-autonomy-gate.sh` PASS em Level 4A;
- `check-security-gate.sh` PASS;
- CI PASS;
- deploy PASS;
- worktree limpo;
- nenhum alerta Dependabot aberto;
- nenhum smoke WhatsApp real exigido, salvo se a onda passar a alterar comportamento conversacional.

## Stop Conditions

Parar a onda se ocorrer:

- qualquer alerta Dependabot aberto apos a correcao;
- `npm audit` com vulnerabilidade;
- CI ou deploy FAIL;
- necessidade de tocar comportamento conversacional;
- necessidade de mexer em secrets, pagamento, agenda, preco ou tenant real amplo;
- divergencia entre gate local e GitHub.

## Resultado Atual

```text
status: em-andamento
micro_slice_1: security-gate PASS
micro_slice_2: wave-health-summary PASS
micro_slice_3: smoke-evidence-index PASS
micro_slice_atual: level4a-stop-audit
```
