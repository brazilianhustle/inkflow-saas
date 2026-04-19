# InkFlow — Eval harness

Testa o bot contra conversas canônicas + auto-geradas. LLM-as-judge + checks determinísticos. Detecta regressão antes de deploy.

## Setup (1 vez)

```bash
cd evals
cp .env.example .env
# preenche EVAL_SECRET (permanente, nao expira) e OPENAI_API_KEY
```

**EVAL_SECRET:** crie com `openssl rand -hex 32`, cadastre no Cloudflare com:
```bash
npx wrangler pages secret put EVAL_SECRET --project-name=inkflow-saas
```
e cole o MESMO valor no `.env` local.

## Fluxo diário — 2 comandos

```bash
# 1. Gera N cenários novos automaticamente (LLM-powered)
node --env-file=.env generate.mjs 5

# 2. Roda todos os cenários (manuais + auto-gerados)
node --env-file=.env run.mjs
```

Exit code 0 = tudo passou · 1 = alguma falhou. Use em CI.

## Como funciona o gerador

`generate.mjs` chama gpt-4o pedindo N cenários **novos** — passa os existentes como contexto pra não duplicar. LLM cria edge cases (cliente confuso, contraditório, menor de idade, gatilhos, etc) com `turns_cliente` e `expected` já montados.

Cada cenário gerado vira um arquivo `convs/auto_<timestamp>_<slug>.json`. Rodar de novo gera novos — você pode deletar os que não interessam ou manter os que acharam bug real.

## Filtrar ids específicos

```bash
# Só conversas cujo id contém "001" ou "auto_007"
node --env-file=.env run.mjs 001 auto_007
```

## Adicionar conversa manual (opcional)

Crie `convs/NNN_descricao.json`:

```json
{
  "id": "006_novo_caso",
  "titulo": "Título curto",
  "descricao": "O que testa",
  "turns_cliente": ["msg 1 do cliente", "msg 2", "..."],
  "expected": {
    "tool_esperada": "calcular_orcamento | acionar_handoff | ...",
    "ultima_msg_deve_conter": ["R$"],
    "deve_conter_em_alguma_msg": ["altura"],
    "nunca_conter": ["caro cliente"],
    "naturalidade_min": 4.0,
    "funcionalidade_min": 0.8
  }
}
```

Todos os campos de `expected` são opcionais — só valida o que você definir.

## Rubrica do critic (naturalidade 1-5)

- **n1_wpp_br:** soa brasileira de WhatsApp?
- **n2_robot_tells:** ausência de clichês robóticos?
- **n3_tom_consistente:** tom estável?
- **n4_comprimento:** msgs curtas?
- **n5_pontuacao:** pontuação natural?

Média ponderada vai em `critic.media`. Pass se `media >= naturalidade_min`.

## Saída

- Terminal: resumo pass/fail + issues top 3 por conversa falha
- `report.json`: dump completo (transcript + det + critic + tool_calls) pra debugging
