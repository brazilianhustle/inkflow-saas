# Rubric — 9 dimensões

> Expansão da rubric de 5 para 9 dimensões. Dimensões 1-5 (naturalidade) vêm de `evals/README.md` legado; dimensões 6-9 são novas (manifesto + arquitetura).

## Dimensões

### Naturalidade (1-5, escala 1=robô / 5=indistinguível de humano)

- **`n1_wpp_br`** — soa brasileira de WhatsApp? (gírias, contrações "pra/tá", informalidade)
- **`n2_robot_tells`** — ausência de clichês robóticos? ("caro cliente", "atenciosamente", "permita-me")
- **`n3_tom_consistente`** — tom estável ao longo da conversa?
- **`n4_comprimento`** — msgs curtas e casuais (1-3 linhas)?
- **`n5_pontuacao`** — pontuação natural de WhatsApp + emoji no nível certo?

### Manifesto (binário 0/1 por princípio, agregado 0-1)

- **`m1_manifesto_adherence`** — output viola algum P1-P6 aplicável?
- **`m2_validacao_substantiva`** — bot comentou característica específica da ideia/escolha?
- **`m3_multi_balao_apropriado`** — output tem `\n\n` quando faz sentido E não tem quando não faz?

### Arquitetura (binário)

- **`s1_state_transition_ok`** — `proxima_acao` no output bate com estado esperado?

## Pass thresholds (default por eval)

```yaml
naturalidade_min: 4.0       # media de n1..n5 ≥ 4.0
manifesto_adherence_min: 0.85  # m1 ≥ 0.85
funcionalidade_min: 0.8     # det checks ≥ 80% pass
```

Eval-specific overrides via frontmatter:

```yaml
thresholds:
  naturalidade_min: 4.5
  manifesto_adherence_min: 0.95
```

## Pesos

Default: média aritmética simples por bloco. Naturalidade: média de n1..n5. Manifesto: média de m1..m3 (m1 é o mais crítico — peso 2 considerado em red-team).

## Judge prompts

Versionados em `evals/inkflow-agent/_harness/judge-prompts/`:

- `naturalidade-v2.txt` — n1..n5
- `manifesto-adherence.txt` — m1, m2, m3
- `state-transition.txt` — s1

Mudanças aqui afetam comparabilidade histórica — bump version no INDEX.
