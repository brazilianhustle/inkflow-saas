# Ciclo De Implementação E Validação

Este processo evita transformar o atendimento premium em uma coleção de prompts soltos.

## Loop Oficial

```text
1. Observar turno humano real
2. Criar ou atualizar ficha de intent
3. Classificar risco e estados afetados
4. Desenhar contrato técnico
5. Implementar slice pequeno
6. Rodar testes automatizados
7. Rodar smoke HTTP de radar
8. Rodar smoke real no WhatsApp como validacao definitiva do micro-slice
9. Registrar achados e evidence
10. Rodar gate formal do slice
11. Ajustar ficha/plano
12. Repetir
```

## 1. Observar

Fonte válida:

- smoke real;
- conversa real de cliente;
- replay de mensagem;
- bug report;
- simulação deliberada.

Sempre registrar:

- mensagem do cliente;
- estado atual;
- resposta esperada;
- resposta real;
- risco;
- evidência.

## 2. Ficha De Intent

Toda intent deve ter:

- exemplos;
- família;
- comportamento esperado;
- dados extraíveis;
- estado;
- ações;
- riscos;
- testes.

Usar [templates/intent-card.md](./templates/intent-card.md).

## 3. Classificação De Risco

### Baixo

Não muda estado, não aciona ferramenta crítica, não toca dinheiro.

Exemplo:

- `tempo_sessao`
- `processo_tatuagem`

### Médio

Pode extrair dados ou influenciar condução.

Exemplo:

- `pergunta_imagem`
- `historia_vida`
- `portfolio`

### Alto

Pode afetar dinheiro, agenda, menoridade, cobertura, estado terminal, novo orçamento ou reputação.

Exemplo:

- `negociacao`
- `menor_idade`
- `cobertura`
- `novo_pedido`
- `cliente_irritado`

## 4. Contrato Técnico

Antes de codar, definir:

```text
input:
  estado_agente
  mensagem
  historico
  imagens
  conversa
  tenant

output:
  intent
  confidence
  response_strategy
  can_mutate_state
  extracted_data
  next_step
  handoff_required
```

Esse contrato pode mudar com implementação, mas precisa existir antes.

## 5. Implementação

Regra de ouro:

```text
implementar poucos intents por vez
```

Evitar:

- mudar todos os prompts juntos;
- misturar risco financeiro com naturalidade;
- criar ferramenta nova sem teste;
- alterar estado em intent lateral sem necessidade.

## 6. Testes Automatizados

Tipos mínimos:

1. Classificação de intent.
2. Resposta/retomada.
3. Estado não muda quando não deve.
4. Dados úteis não se perdem.
5. Fallback para agent atual quando confidence baixo.

## 7. Smoke Real

Cada intent implementada deve ter uma ficha de smoke.

Usar [templates/smoke-card.md](./templates/smoke-card.md).

Smoke deve validar:

- mensagem real via WhatsApp;
- resposta final no cliente;
- estado no Supabase;
- mensagens persistidas;
- ausência de side effect indevido;
- logs sem erro.

Para WhatsApp real, registrar tambem prova de mensagem. O run so vira validacao definitiva se houver:

- `evolution-send.json` comprovando envio pela instancia remetente real;
- `poll.json` comprovando mensagem humana exata recebida e resposta AI posterior;
- `transcript.md` com HUMANO e BOT;
- `judgment.md` com veredito tecnico e `copy_risk`;
- `agent-turn-logs.json` e `scenario-agent-log-jq.txt` quando o comportamento exige observabilidade decisoria.

Sem essas provas, o teste pode ser tratado como tentativa operacional, mas nao como PASS definitivo do micro-slice.

## 8. Registro

Depois do smoke:

- atualizar a ficha da intent;
- registrar frase real que funcionou/falhou;
- mover casos descobertos para backlog ou nova intent;
- ajustar prioridade da onda se necessário.

## 9. Gate Formal Do Slice

Todo slice que vira fundação para próximos passos precisa declarar seus cenários obrigatórios em:

```text
docs/atendimento-premium/slice-gates/<slice>.env
```

Antes de considerar o slice concluído:

```bash
bash scripts/smoke/check-slice-gate.sh <slice>
```

O gate precisa passar com:

- PASS recente registrado em `smoke-runs.md`;
- evidence dir local existente;
- `summary.md`, `poll.json`, `transcript.md` e `judgment.md`;
- pelo menos um smoke HTTP de radar para feedback rápido quando aplicável;
- smoke WhatsApp real para comportamento crítico, handoff, dinheiro, agenda, risco ou estado terminal.

Se o gate falhar, o slice continua aberto. Se falhar por `contract_*`, abrir `plan-review.md` antes de alterar plano ou código.

## Gates Para Avançar De Onda

Não avançar para Onda 2 se Onda 1 ainda:

- ignora pergunta lateral comum;
- muda estado indevidamente;
- perde dados mistos;
- não tem smoke;
- não tem fallback claro.

Não avançar para dinheiro/agenda sem:

- teste cobrindo valor persistido vs valor falado;
- smoke real;
- plano de rollback;
- logs suficientes.
