---
last_reviewed: 2026-04-25
owner: leandro
status: stable
related: [matrix.md, incident-response.md, release-protocol.md, ../index.md, ../runbooks/README.md]
---

# Methodology — Index

Doctrine de como agents+humano operam no InkFlow.

## Documentos

- [matrix.md](matrix.md) — quando trabalho fica no principal vs. vai pra subagent. 9 heurísticas + tabela domínio×ação + 14 exemplos canônicos.
- [incident-response.md](incident-response.md) — estrutura mãe pra responder a alerta. Linka pros runbooks operacionais em [`../runbooks/`](../runbooks/README.md).
- [release-protocol.md](release-protocol.md) — versionamento, pre-flight, changelog, comunicação, janelas. Entry point: `/deploy-check`.

## Quando consultar qual

| Situação | Doc |
|---|---|
| "Devo delegar isso pra subagent ou faço eu?" | matrix.md |
| "Alerta no Telegram — como respondo?" | incident-response.md (depois linka pro runbook específico) |
| "Vou publicar mudança em prod" | release-protocol.md |
