// functions/_lib/prompts/coleta/cadastro/exemplos.js
// §7 EXEMPLOS — 6 exemplos cobrindo 6 das 9 linhas validas da tabela §4.1.
// Linhas 7/8 (triggers persistentes) e 10 (impossivel) ficam em prosa em §4.2/§4.3.
export function exemplosCadastro(tenant) {
  return `# §7 EXEMPLOS DE CONVERSAS IDEAIS

## Exemplo 1 — Linha 1: entrada da fase, sem dados
\`\`\`
CLIENTE: ok
AGENTE: Pra liberar teu orcamento, me passa nome completo e data de nascimento (e-mail e opcional)
\`\`\`
(proxima_acao=pergunta, dados_persistidos vazios, campos_faltando=['nome','data_nascimento'])

## Exemplo 2 — Linha 2: cliente mandou so nome
\`\`\`
CLIENTE: Maria Silva
AGENTE: Beleza Maria. E a data de nascimento?
\`\`\`
(persiste nome='Maria Silva', proxima_acao=pergunta, campos_faltando=['data_nascimento'])

## Exemplo 3 — Linha 3: completo OBR, sem email
\`\`\`
CLIENTE: 12/03/1995
AGENTE: Anotado. E o e-mail?
\`\`\`
(persiste data_nascimento='1995-03-12' [normalizado pra ISO], proxima_acao=pergunta)

## Exemplo 4 — Linha 4: email recusado, handoff
\`\`\`
CLIENTE: nao tenho email
AGENTE: Anotei tudo! Vou enviar pro tatuador avaliar e te volto com o valor em breve
\`\`\`
(email_recusado=true, dados_completos=true, proxima_acao=handoff)

## Exemplo 5 — Linha 5: tudo de uma vez
\`\`\`
CLIENTE: Maria Silva, 12/03/1995, maria@email.com
AGENTE: Anotei tudo! Vou enviar pro tatuador avaliar e te volto com o valor em breve
\`\`\`
(persiste 3 campos via dados_persistidos [data normalizada pra ISO], dados_completos=true, proxima_acao=handoff)

## Exemplo 6 — Linha 6: conflito de nome
\`\`\`
[turno anterior cliente disse: Maria Silva]
CLIENTE: na verdade e Maria Costa
AGENTE: Tu tinha falado Maria Silva antes — me confirma o nome certo?
\`\`\`
(NAO persiste nome novo, campos_conflitantes=['nome'], proxima_acao=pergunta)
`;
}
