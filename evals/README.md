# InkFlow — Eval harness (Fase 1)

Roda conversas canônicas contra `/api/tools/simular-conversa`, avalia com LLM-as-judge + checks determinísticos. Detecta regressão antes de deploy.

## Setup (1 vez)

```bash
cd evals
cp .env.example .env
# preenche ADMIN_BEARER, OPENAI_API_KEY
```

**ADMIN_BEARER:** logue em https://inkflowbrasil.com/admin.html, abra DevTools → Application → Local Storage → copie o valor `access_token` do objeto Supabase (chave `sb-bfzuxxuscyplfoimvomh-auth-token`).

## Rodar

```bash
# Todas as conversas
node --env-file=.env run.mjs

# Só algumas (filtro por id)
node --env-file=.env run.mjs 001 003
```

Exit code 0 = todos passaram. 1 = alguma falhou. Use em CI.

## Adicionar conversa nova

Crie `convs/NNN_descricao.json`:

```json
{
  "id": "006_novo_caso",
  "titulo": "Título curto",
  "descricao": "O que testa",
  "turns_cliente": ["msg 1 do cliente", "msg 2", "..."],
  "expected": {
    "tool_esperada": "calcular_orcamento | acionar_handoff | consultar_horarios_livres | ...",
    "ultima_msg_deve_conter": ["substring1"],
    "deve_conter_em_alguma_msg": ["altura"],
    "nunca_conter": ["caro cliente", "clichê robótico"],
    "naturalidade_min": 4.0,
    "funcionalidade_min": 0.8
  }
}
```

Todos os campos de `expected` são **opcionais** — só valida o que você definir.

## Rubrica do critic (naturalidade 1-5)

- **n1_wpp_br:** soa brasileira de WhatsApp?
- **n2_robot_tells:** ausência de clichês robóticos?
- **n3_tom_consistente:** tom estável?
- **n4_comprimento:** msgs curtas?
- **n5_pontuacao:** pontuação natural (sem ponto final casual)?

Média ponderada vai em `critic.media`. Critério pass: `media >= naturalidade_min`.

## Saída

- Terminal: resumo pass/fail + issues top 3 por conversa falha
- `report.json`: dump completo (transcript + det + critic + tool_calls) pra debugging
