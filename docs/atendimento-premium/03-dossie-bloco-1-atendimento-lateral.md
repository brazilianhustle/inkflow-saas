# Dossiê Bloco 1 - Atendimento Lateral

Este dossiê detalha a primeira frente recomendada. São intents de alto impacto na experiência e risco operacional relativamente controlado.

## Fichas Operacionais

As fichas detalhadas ficam em:

- [pergunta_imagem](./intents/bloco-1/pergunta_imagem.md)
- [preco_generico](./intents/bloco-1/preco_generico.md)
- [tempo_sessao](./intents/bloco-1/tempo_sessao.md)
- [processo_tatuagem](./intents/bloco-1/processo_tatuagem.md)
- [portfolio](./intents/bloco-1/portfolio.md)
- [historia_vida](./intents/bloco-1/historia_vida.md)

## Objetivo Do Bloco 1

Permitir que o bot responda dúvidas humanas comuns no meio da coleta sem perder o fluxo.

Critério geral:

```text
responder a intenção lateral -> não mudar estado crítico -> retomar com a próxima pergunta útil
```

## 1. `pergunta_imagem`

### Família

Lateral atendível.

### Exemplos

- "o que você viu na imagem?"
- "dá pra entender essa foto?"
- "essa imagem serve?"
- "você consegue ver a tattoo?"
- "o que aparece aí?"

### O Que O Bot Deve Entender

O cliente não está respondendo um campo. Ele está testando/checando a leitura visual.

### Resposta Premium

Responder concretamente o que foi percebido na imagem e retomar a classificação útil.

Exemplo:

```text
Vi uma referência com traços finos e composição delicada.

Essa imagem é a referência do desenho ou é a foto do local onde tu quer tatuar?
```

### Dados Extraíveis

- descrição visual;
- possível `descricao_curta`, se for referência clara;
- possível `foto_local`, se for corpo/local claro;
- `tipo_foto` pendente se ambígua.

### Estado

Não deve avançar estado sozinho. Pode persistir metadado visual se a classificação estiver clara.

### Ação Operacional

Nenhuma ferramenta externa obrigatória. Pode usar análise visual já disponível no turno.

### Riscos

- inventar detalhe da imagem;
- assumir referência como local;
- assumir local como referência;
- ignorar a pergunta e continuar formulário.

### Teste Prático

Entrada: imagem + "o que você viu na imagem?"

Esperado:

- resposta menciona conteúdo visual;
- não pergunta direto um campo desconectado;
- estado continua seguro;
- retoma perguntando referência/local ou próximo dado útil.

## 2. `preco_generico`

### Família

Lateral atendível com risco financeiro.

### Exemplos

- "quanto fica?"
- "qual valor?"
- "me passa preço"
- "fica caro?"
- "quanto custa uma dessa?"

### O Que O Bot Deve Entender

O cliente quer preço antes da avaliação. O bot não pode inventar valor, mas também não deve soar evasivo.

### Resposta Premium

```text
O valor depende do tamanho, detalhe e local do corpo. O tatuador confirma certinho depois de avaliar tua ideia.

Pra eu te direcionar melhor, tu pensa em fazer em qual parte?
```

### Dados Extraíveis

Se a mensagem também contém dados, pode extrair:

- descrição;
- local;
- estilo;
- altura;
- referência.

### Estado

Não muda por si só. Retoma coleta.

### Ação Operacional

Nenhuma.

### Riscos

- inventar preço;
- prometer faixa;
- parecer que está escondendo valor;
- perder dados junto da pergunta.

### Teste Prático

Entrada: "quanto fica uma rosa no braço?"

Esperado:

- não fala valor;
- persiste/usa "rosa" e "braço" se a camada operacional permitir;
- retoma com próximo dado faltante.

## 3. `tempo_sessao`

### Família

Lateral atendível.

### Exemplos

- "quanto tempo demora?"
- "faz em uma sessão?"
- "demora muito?"
- "quanto tempo eu fico aí?"
- "dá pra fazer no mesmo dia?"

### O Que O Bot Deve Entender

Cliente quer previsibilidade. O bot pode explicar fatores, mas não prometer duração.

### Resposta Premium

```text
Depende do tamanho, detalhe e local do corpo. O tatuador confirma melhor quando avaliar tua ideia.

Tu imagina fazer em qual parte?
```

### Dados Extraíveis

Normalmente nenhum, exceto quando a mensagem inclui detalhes da tattoo.

### Estado

Não muda.

### Ação Operacional

Nenhuma.

### Riscos

- prometer duração exata;
- prometer uma sessão;
- desqualificar o trabalho como "rápido";
- gerar expectativa operacional errada.

### Teste Prático

Entrada: "essa tattoo demora quantas horas?"

Esperado:

- resposta fala que depende de fatores;
- não inventa horas;
- retoma a coleta.

## 4. `processo_tatuagem`

### Família

Lateral atendível.

### Exemplos

- "como funciona?"
- "qual o processo?"
- "primeiro eu mando a ideia?"
- "preciso pagar antes?"
- "como marca?"

### O Que O Bot Deve Entender

Cliente precisa entender o caminho. Resposta deve ser curta e conduzir.

### Resposta Premium

```text
Funciona assim: eu entendo tua ideia, junto as infos principais e o tatuador avalia pra passar valor e horário.

Me conta o que tu pensa em tatuar?
```

### Dados Extraíveis

Se o cliente incluir ideia/local na pergunta, extrair.

### Estado

Não muda.

### Ação Operacional

Nenhuma.

### Riscos

- virar textão;
- prometer aprovação imediata;
- confundir com pagamento/agendamento;
- mencionar ferramentas internas.

### Teste Prático

Entrada: "como funciona pra fazer uma tattoo?"

Esperado:

- explica 2-3 etapas;
- retoma com primeira pergunta útil;
- não gera orçamento/agendamento.

## 5. `portfolio`

### Família

Lateral atendível.

### Exemplos

- "tem fotos dos trabalhos?"
- "manda portfolio"
- "tem instagram?"
- "quero ver umas tattoos"
- "tem exemplos de fineline?"

### O Que O Bot Deve Entender

Cliente quer confiança visual. Se portfolio existe, enviar. Se não existe, explicar e seguir.

### Resposta Premium

Com portfolio:

```text
Claro, te mando algumas referências.
```

Sem portfolio:

```text
Ainda estamos montando o portfolio aqui no chat, mas consigo seguir com teu orçamento por aqui.

Tu pensa em qual estilo?
```

### Dados Extraíveis

- estilo pedido;
- possível preferência estética.

### Estado

Não muda.

### Ação Operacional

Pode acionar ferramenta de portfolio se disponível.

### Riscos

- prometer portfolio sem URLs;
- enviar estilo errado;
- travar a coleta após enviar fotos.

### Teste Prático

Entrada: "tem exemplos de realismo?"

Esperado:

- se disponível, envia portfolio filtrado por realismo;
- se não disponível, explica;
- retoma fluxo.

## 6. `historia_vida`

### Família

Consultivo.

### Exemplos

- "quero fazer uma homenagem pro meu pai que faleceu..."
- "passei por uma fase difícil e queria marcar isso..."
- "minha mãe sempre gostou de borboletas..."
- "tenho medo porque é minha primeira tattoo..."

### O Que O Bot Deve Entender

O cliente trouxe contexto emocional e talvez dados úteis. O bot deve acolher sem exagerar, extrair o que importa e fazer uma pergunta por vez.

### Resposta Premium

```text
Entendi. Dá pra pensar em algo simbólico e delicado com essa ideia.

Tu imagina fazer em qual parte do corpo?
```

### Dados Extraíveis

- tema/descrição;
- estilo sugerido pelo cliente;
- local, se mencionado;
- sinal de indecisão;
- primeira tattoo/medo, se relevante para tom.

### Estado

Pode persistir dados claros. Não deve mudar estado por emoção isolada.

### Ação Operacional

Nenhuma.

### Riscos

- ignorar o contexto humano;
- responder com frieza;
- virar terapeuta;
- fazer 3 perguntas de uma vez;
- inventar design.

### Teste Prático

Entrada: história longa com tema e emoção.

Esperado:

- acolhe em uma frase;
- extrai tema se claro;
- faz uma pergunta útil;
- não dá conselho emocional profundo.

## Critério De Pronto Do Bloco 1

Bloco 1 está pronto quando:

- cada intent tem teste unitário de classificação;
- cada intent tem teste de integração no pipeline ou route;
- smoke real com WhatsApp valida pelo menos um caso por intent;
- estado não avança indevidamente em dúvidas laterais;
- resposta sempre retoma o fluxo;
- casos com dados mistos não perdem informação útil.
