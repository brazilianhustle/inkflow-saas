# Intent: `portfolio`

## Status

`aprovado_para_planejamento`

## Família

`lateral_atendivel`

## Risco

`baixo`

## Exemplos

- "tem fotos dos trabalhos?"
- "manda portfolio"
- "tem instagram?"
- "quero ver umas tattoos"
- "tem exemplos de fineline?"
- "manda trabalhos de realismo"
- "posso ver referências?"

## O Que O Bot Deve Entender

O cliente quer confiança visual antes de seguir. Se houver portfolio cadastrado, o sistema deve enviar. Se não houver, explicar sem travar a conversa.

## Resposta Premium

Com portfolio:

```text
Claro, te mando algumas referências.
```

Sem portfolio:

```text
Ainda estamos montando o portfolio aqui no chat, mas consigo seguir com teu orçamento por aqui.

Tu pensa em qual estilo?
```

## O Que Nunca Fazer

- Prometer envio se não há portfolio.
- Escrever URL manualmente quando o sistema envia mídia/URLs.
- Mandar estilo errado quando o cliente pediu estilo específico.
- Parar o fluxo depois de enviar portfolio.
- Trocar portfolio por orçamento.

## Dados Extraíveis

- `estilo`, se o cliente pedir estilo específico;
- preferência estética;
- possível `descricao_curta`, se o pedido vier com ideia.

## Estados Onde Pode Acontecer

- `coletando_tattoo`
- `coletando_cadastro`
- `propondo_valor`
- `escolhendo_horario`
- `aguardando_sinal`
- `aguardando_tatuador`

## Pode Mudar Estado?

`nao`

## Pode Persistir Dados?

`depende`

Pode persistir estilo se o cliente deixou claro que é preferência para a própria tattoo, não só filtro de portfolio.

## Ação Operacional

- enviar portfolio quando disponível;
- sem portfolio, responder e retomar.

## Retomada Do Fluxo

Depois de enviar ou explicar:

- se falta ideia: pedir ideia;
- se falta estilo e o portfolio não definiu preferência: perguntar estilo;
- se já havia etapa em andamento, retomar essa etapa.

## Fallback

Se a ferramenta de portfolio falhar:

```text
Tive um problema pra te mandar as referências agora, mas consigo seguir com teu orçamento por aqui.

Qual ideia tu pensa em tatuar?
```

## Testes Automatizados

- Classifica pedido de portfolio.
- Quando `portfolio_disponivel=true`, emite ação/ferramenta de portfolio.
- Quando `portfolio_disponivel=false`, não emite ação de portfolio.
- Não muda estado.
- Retoma fluxo.
- Preserva estilo pedido como filtro.

## Smoke Real

- mensagem: "tem exemplos de realismo?"
- estado inicial: `coletando_tattoo`
- resposta esperada: envia portfolio de realismo ou explica ausência e retoma.
- estado esperado: `coletando_tattoo`
- side effects proibidos: handoff, orçamento, cobrança.

## Observações

Portfolio já existe como ação transversal nos prompts/agents atuais. O objetivo aqui é garantir que o pedido seja reconhecido antes de parecer formulário.

