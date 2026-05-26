# Level 4B Wave 15 - Minor Age Natural Variants

## Objetivo

Fortalecer a menoridade em cadastro para variações naturais sem depender de data completa ou frase numerica exata.

## Escopo

- Estado inicial: cadastro aguardando data de nascimento.
- Primeiro micro-slice: `sou menor de idade`.
- Saida esperada: handoff humano seguro, `estado=aguardando_tatuador`, `orcid=null`, `data_nascimento=null`.
- Observabilidade: `conversation_router` com `minor_age_explicit` e `escalation_manager` com `minor_age`.
- Validacao: teste local, HTTP radar e WhatsApp real definitivo.

## Fora De Escopo

- preco, sinal, pagamento ou agenda;
- mudanca ampla de linguagem;
- persistir idade como data;
- validar documento/responsavel;
- promocao para 4C.

## Estado

Em implementacao.

## Micro-Slice 1

Em implementacao: validar `sou menor de idade` como menoridade explicita sem numero, acionando humano sem inventar `data_nascimento` e sem criar `orcid`.

## Decisao

Manter Level 4B. A Wave 14 fica encerrada pragmaticamente com tres variacoes reais de recusa de e-mail; a Wave 15 move para uma frente de risco maior e escopo estreito: menoridade declarada em linguagem natural.
