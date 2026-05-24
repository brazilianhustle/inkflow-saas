---
last_reviewed: 2026-05-24
owner: leandro
status: stable
related: [matrix.md, incident-response.md, release-protocol.md, eval-comparative-strategy.md, conversation-change-doctrine.md, ../index.md, ../runbooks/README.md]
---

# Methodology — Index

Doctrine de como agents+humano operam no InkFlow.

## Documentos

- [matrix.md](matrix.md) — quando trabalho fica no principal vs. vai pra subagent. 9 heurísticas + tabela domínio×ação + 14 exemplos canônicos.
- [incident-response.md](incident-response.md) — estrutura mãe pra responder a alerta. Linka pros runbooks operacionais em [`../runbooks/`](../runbooks/README.md).
- [release-protocol.md](release-protocol.md) — versionamento, pre-flight, changelog, comunicação, janelas. Entry point: `/deploy-check`.
- [eval-comparative-strategy.md](eval-comparative-strategy.md) — DoD A/B com IC 95% pra iteração de prompt/modelo. Quando usar comparativo vs absoluto vs invariante binária.
- [conversation-change-doctrine.md](conversation-change-doctrine.md) — regra do general para mudanças conversacionais: quando adicionar regra, substituir regra ou redesenhar camada antes de poluir prompt/router.

## Quando consultar qual

| Situação | Doc |
|---|---|
| "Devo delegar isso pra subagent ou faço eu?" | matrix.md |
| "Alerta no Telegram — como respondo?" | incident-response.md (depois linka pro runbook específico) |
| "Vou publicar mudança em prod" | release-protocol.md |
| "Mudei o prompt do bot — como saber se melhorou ou é ruído?" | eval-comparative-strategy.md |
| "Estou adicionando mais regra no bot — isso é saudável ou virou ruído?" | conversation-change-doctrine.md |
