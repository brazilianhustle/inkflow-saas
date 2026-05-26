# Level 4B Wave 13 - Minor Age Explicit

## Objetivo

Validar que, em cadastro, uma idade explicitamente menor de 18 anos aciona humano sem inventar `data_nascimento`, sem criar `orcid` e sem seguir para orcamento.

## Escopo

- Mensagem: `tenho 16 anos`.
- Estado inicial: cadastro aguardando data.
- Saida esperada: `aguardando_tatuador`, `orcid=null`, `data_nascimento=null`.
- Observabilidade: `conversation_router` com `minor_age_explicit` e `escalation_manager` com `minor_age`.
- HTTP radar + WhatsApp real definitivo.

## Fora De Escopo

- linguagem premium ampla;
- responsavel legal como coleta estruturada;
- preco, sinal, pagamento, agenda ou proposta;
- promocao para 4C.

## Estado

Em implementacao.
