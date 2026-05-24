# Mapa V1 Dos Turnos Humanos

Este mapa lista os tipos de mensagem humana que o atendimento premium precisa reconhecer antes de decidir se deve chamar um agent operacional.

## Famílias

### Coleta

Mensagens que completam ou corrigem dados do fluxo atual.

### Lateral Atendível

Dúvidas ou pedidos que o bot pode responder sem mudar estado crítico.

### Consultivo

Mensagens em que o cliente ainda está formando a ideia ou traz contexto emocional/longo.

### Replanejamento

Mensagens que mudam sujeito, ideia, local, escopo ou orçamento.

### Risco

Mensagens que podem exigir política, handoff, pausa ou cuidado especial.

### Financeiro/Operacional

Mensagens que tocam dinheiro, sinal, agenda, desconto, pagamento ou remarcação.

## Mapa Geral

| Intent | Família | Exemplo | Resposta ideal | Nunca fazer | Estado muda? | Risco | Prioridade |
|---|---|---|---|---|---:|---:|---:|
| `resposta_campo` | Coleta | "antebraço" | Salvar dado e perguntar próximo faltante | Reperguntar o que já respondeu | Sim | Baixo | Alta |
| `multi_info` | Coleta | "rosa fineline no braço, tenho 1,70" | Extrair tudo e seguir só com o faltante | Responder campo por campo | Sim | Médio | Alta |
| `pergunta_imagem` | Lateral | "o que você viu na foto?" | Responder a visão e retomar | Ignorar e seguir formulário | Não | Médio | Alta |
| `foto_ambigua` | Replanejamento | foto de tattoo/local sem clareza | Perguntar se é referência ou local | Assumir errado | Talvez | Alto | Alta |
| `preco_generico` | Lateral | "quanto fica?" | Explicar que valor vem após avaliação | Inventar preço | Não | Alto | Alta |
| `tempo_sessao` | Lateral | "quanto tempo demora?" | Explicar que depende de tamanho/detalhe/local | Prometer duração exata | Não | Médio | Alta |
| `processo_tatuagem` | Lateral | "como funciona?" | Explicar etapas de forma curta e retomar | Virar textão | Não | Médio | Alta |
| `tatuagem_terceiro` | Replanejamento | "é pra minha filha" | Coletar dados da pessoa que vai tatuar | Coletar dados de quem está falando | Sim | Alto | Alta |
| `menor_idade` | Risco | "ela tem 16" | Aplicar política/handoff seguro | Seguir orçamento normal | Sim/handoff | Alto | Alta |
| `cobertura` | Risco | "quero cobrir essa tattoo" | Detectar cover-up e seguir política do estúdio | Tratar como tattoo comum | Sim/handoff | Alto | Alta |
| `portfolio` | Lateral | "tem fotos dos trabalhos?" | Enviar portfolio ou explicar ausência | Prometer envio sem ferramenta | Não | Baixo | Média |
| `indeciso_consultor` | Consultivo | "quero tatuar mas não sei o quê" | Guiar com local/estilo/referências | Forçar formulário completo | Talvez | Médio | Alta |
| `historia_vida` | Consultivo | mensagem longa emocional | Acolher, extrair dado útil, fazer 1 pergunta | Ignorar contexto humano | Talvez | Médio | Alta |
| `cliente_irritado` | Risco | "vocês demoram demais" | Desescalar e acionar humano se preciso | Bater de frente ou soar seco | Talvez/handoff | Alto | Alta |
| `mudanca_ideia` | Replanejamento | "troca pra perna" | Atualizar campo certo e confirmar | Misturar antigo com novo | Sim | Alto | Média |
| `novo_pedido` | Replanejamento | cliente antigo manda nova arte | Abrir novo orçamento | Grudar no orçamento antigo | Sim | Alto | Média |
| `negociacao` | Financeiro | "faz por 500?" | Encaminhar ao tatuador sem aceitar sozinho | Confirmar desconto indevido | Sim/handoff | Alto | Média |
| `pagamento_sinal` | Financeiro | "já paguei", "manda QR" | Consultar estado e responder ação correta | Gerar cobrança duplicada/confusa | Sim | Alto | Média |
| `remarcacao` | Operacional | "quero mudar horário" | Acionar fluxo/humano correto | Reagendar inventando slot | Sim/handoff | Alto | Média |
| `fora_escopo` | Risco | piercing, médico, insulto | Recusar/encaminhar com educação | Tentar responder tudo | Talvez | Médio | Baixa |

## Ondas De Implementação

### Onda 1 - Atendimento lateral

Foco: mudar a sensação do bot sem mexer pesado em dinheiro/agenda.

- `pergunta_imagem`
- `preco_generico`
- `tempo_sessao`
- `processo_tatuagem`
- `portfolio`
- `historia_vida`

### Onda 2 - Sujeito, contexto e risco

Foco: lidar com casos humanos que mudam o significado da coleta.

- `tatuagem_terceiro`
- `menor_idade`
- `indeciso_consultor`
- `cobertura`
- `foto_ambigua`
- `cliente_irritado`

### Onda 3 - Operação, dinheiro e recorrência

Foco: estado complexo, agenda e confiança financeira.

- `mudanca_ideia`
- `novo_pedido`
- `negociacao`
- `pagamento_sinal`
- `remarcacao`

## Critério Para Subir Uma Intent De Onda

Uma intent pode subir de prioridade se:

- apareceu em smoke real;
- bloqueia cliente piloto;
- causa valor/cobrança errada;
- cria estado inconsistente;
- prejudica muito a sensação de atendimento humano;
- tem implementação pequena e validação objetiva.
