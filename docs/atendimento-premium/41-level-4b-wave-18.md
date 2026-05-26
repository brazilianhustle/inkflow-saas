# Level 4B - Wave 18 - Cadastro After Media Naturalness

## Objetivo

Abrir uma onda pequena depois do fechamento da Wave 17 para revalidar a naturalidade de fechamento de cadastro apos midia, sem mexer em menoridade legal, preco fechado, agenda, pagamento, secrets ou 4C.

## Hipotese

Evidencias historicas antigas ainda registram copy como `Fechado` e `valor certinho` em fluxos de cadastro completo. A Wave 17 provou que parte disso era historico e que a copy atual ja esta limpa para e-mail recusado. A proxima confirmacao mais util e o caminho de e-mail valido apos midia.

## Escopo Inicial

```text
wave_id: level4b-wave-18-cadastro-after-media-naturalness
autonomy_level: 4B
tipo: revalidacao primeiro, codigo apenas se necessario
primeiro_cenario_http: cadastro-after-media-email-valido-handoff
primeiro_cenario_whatsapp_real: whatsapp-real-cadastro-after-media-email-valido-handoff
mensagem_alvo: joao@example.com
risco: amarelo baixo
```

## Gates Obrigatorios

- `wave-health` PASS antes de tocar codigo;
- testes focados se houver mudanca de codigo;
- `npm test` se houver mudanca funcional;
- CI/deploy PASS antes de smoke de producao quando houver codigo;
- HTTP radar antes de WhatsApp real;
- WhatsApp real definitivo pela instancia `central`;
- registrar `Provas Conclusivas Reais` no fechamento.

## Stop Conditions

- WhatsApp real FAIL;
- HTTP radar mostrar copy rigida atual (`Fechado`, `valor certinho`, `avaliar com calma`);
- perda de `foto_local_msg_id` ou `refs_imagens_msg_ids`;
- falta de `orcid` no handoff valido;
- qualquer envio indevido de agenda, pagamento, sinal ou preco fechado;
- falha Supabase preflight;
- CI/deploy FAIL.

## Primeiro Ataque

Revalidar `cadastro-after-media-email-valido-handoff` sem alteracao de codigo.

Se PASS com copy atual baixa:

```text
decisao: fechar micro-slice como revalidacao sem codigo
```

Se FAIL por copy rigida:

```text
decisao: corrigir na familia central de voz/handoff, com teste local e ciclo completo
```
