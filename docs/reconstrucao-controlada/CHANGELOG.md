# Changelog - Reconstrucao Controlada

## 2026-05-27

### Adicionado

- Criada trilha `docs/reconstrucao-controlada/`.
- Registrado handoff oficial da frente.
- Criado mapa inicial de extracao do repo atual.
- Criada arquitetura total alvo da plataforma InkFlow.
- Criada governanca de versionamento e regra anti-poluicao.
- Criado plano de acao faseado da reconstrucao controlada.
- Criada matriz de extracao operacional por frente, com origem, decisao, destino, risco, teste, pronto e dependencias.
- Criados contratos base da plataforma: entidades canonicas, estados, relacoes entre modulos e validacoes obrigatorias.
- Criado Tenant Config Contract com blocos, defaults, snapshots, invariantes, fixtures e testes obrigatorios.

### Decisoes

- Repo atual continua como legado operacional, vault e fonte de extracao.
- Novo repo futuro sera a fonte da verdade da plataforma SaaS.
- Bot premium vira modulo/vault dentro da plataforma, nao repo inteiro.
- Durante fase de arquitetura, apenas docs da frente podem ser alterados.
- Nenhum deploy, secret, smoke real, migration ou codigo funcional sera alterado nesta frente sem plano aprovado.

### Proximo Passo

- Criar `08-data-governance-contract.md` para mapear dados, finalidade, retencao e direitos LGPD antes do repo novo.
