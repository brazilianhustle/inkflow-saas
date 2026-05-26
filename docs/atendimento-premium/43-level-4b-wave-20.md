# Level 4B - Wave 20 - Cadastro Lateral Recovery

## Objetivo

Validar que duvidas laterais durante cadastro pendente sao respondidas sem perder a pergunta operacional pendente e sem promover handoff antes da hora.

## Hipotese

O cliente real no WhatsApp frequentemente interrompe o cadastro com duvidas simples, como tempo de sessao. O bot premium precisa responder a duvida, preservar o estado `coletando_cadastro` e retomar exatamente o dado que faltava. Depois, quando o cliente responde esse dado, o fluxo deve continuar sem repetir pergunta ja resolvida e sem criar orcamento prematuro.

## Escopo Inicial

```text
wave_id: level4b-wave-20-cadastro-lateral-recovery
autonomy_level: 4B
tipo: funcional leve
primeiro_cenario_http: cadastro-lateral-data-recovery
primeiro_cenario_whatsapp_real: whatsapp-real-cadastro-lateral-data-recovery
risco: amarelo baixo
```

## Gates Obrigatorios

- `wave-health` PASS antes de tocar codigo;
- se houver mudanca funcional, testes focados e CI/deploy PASS antes de smoke de producao;
- HTTP radar antes de WhatsApp real;
- WhatsApp real definitivo pela instancia `central`;
- estado final permanece `coletando_cadastro`;
- `orcid=null`;
- nome existente preservado;
- data de nascimento persistida apenas no turno da data;
- resposta lateral nao pede e-mail antes da data;
- resposta apos data pede e-mail sem repetir data;
- Workflow Manager registra preservacao por policy em pergunta lateral;
- ConversationRouter registra resposta de data pendente;
- registrar `Provas Conclusivas Reais` no fechamento.

## Stop Conditions

- WhatsApp real FAIL;
- estado sair indevidamente de `coletando_cadastro`;
- criacao de `orcid` antes de cadastro completo;
- e-mail ser pedido antes da data;
- data nao persistir apos resposta `12/03/1995`;
- repeticao da pergunta de data depois que a data ja foi persistida;
- resposta com preco, agenda, pagamento ou sinal;
- falha Supabase preflight;
- CI/deploy FAIL quando houver codigo.

## Primeiro Ataque

Executar `cadastro-lateral-data-recovery` e `whatsapp-real-cadastro-lateral-data-recovery` sem alterar codigo.

Se PASS:

```text
decisao: fechar micro-slice como revalidacao funcional e escolher proxima variacao pequena da mesma familia
```

Se FAIL:

```text
decisao: travar execucao, gerar triage/plan-review e corrigir o ponto minimo antes de qualquer novo slice
```
