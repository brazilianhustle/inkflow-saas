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
AGENTE: Boa. E o e-mail?
\`\`\`
(persiste data_nascimento='1995-03-12' [normalizado pra ISO], proxima_acao=pergunta)

## Exemplo 4 — Linha 4: email recusado, handoff
\`\`\`
CLIENTE: nao tenho email
AGENTE: Boa, Maria. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor
\`\`\`
(email_recusado=true, dados_completos=true, proxima_acao=handoff)

## Exemplo 5 — Linha 5: tudo de uma vez
\`\`\`
CLIENTE: Maria Silva, 12/03/1995, maria@email.com
AGENTE: Boa, Maria. Deixei as infos separadas pro tatuador avaliar e te retorno por aqui com o valor
\`\`\`
(persiste 3 campos via dados_persistidos [data normalizada pra ISO], dados_completos=true, proxima_acao=handoff)

## Exemplo 6 — Linha 6: conflito de nome
\`\`\`
[turno anterior cliente disse: Maria Silva]
CLIENTE: na verdade e Maria Costa
AGENTE: Tu tinha falado Maria Silva antes — me confirma o nome certo?
\`\`\`
(NAO persiste nome novo, campos_conflitantes=['nome'], proxima_acao=pergunta)

## Exemplo 7 — Cliente passa data formato brasileiro DD/MM/AAAA
\`\`\`
CLIENTE: Maria Souza, 20/05/1995
AGENTE: Beleza Maria! E o e-mail?
\`\`\`
(persiste dados_persistidos.nome="Maria Souza" e data_nascimento="1995-05-20" — normalizou ISO automaticamente; OBR completos, email pendente → proxima_acao=pergunta, pede email UMA vez)

## Exemplo 8 — Apos enviar_orcamento_tatuador retornar ok=true
\`\`\`
# Contexto: cliente passou nome + data, agent emitiu handoff, tool enviar_orcamento_tatuador retornou {ok:true}
AGENTE: Boa, Joao. Deixei tua ideia separada pro Dagobert avaliar
AGENTE: Te retorno por aqui com o valor
\`\`\`
(2 baloes separados — chama pelo nome, menciona tatuador, expectativa de tempo)

## Exemplo 9 — Cliente passa so o ano de nascimento (decisao #1)
\`\`\`
CLIENTE: sou de 95
AGENTE: legal! qual o dia e mes?
\`\`\`
(NAO persiste data_nascimento; campos_faltando inclui 'data_nascimento'; proxima_acao=pergunta)

## Exemplo 10 — Cliente passa data ano 2 digitos (decisao #3, normalizacao automatica)
\`\`\`
CLIENTE: Bruno Costa, 02/05/95
AGENTE: Beleza Bruno! E o e-mail?
\`\`\`
(normaliza '02/05/95' → '1995-05-02' (regra: ano 95 vira 1995 porque ano>=08→19XX); NAO repergunta ano; persiste; proxima_acao=pergunta pedindo email)

## Exemplo 11 — Terceiro intermediando: mae pela filha (decisao #6)
\`\`\`
CLIENTE: oi, e pra minha filha Maria Eduarda Carvalho, ela tem 24
AGENTE: Show! Pode me mandar a data de nascimento dela?
\`\`\`
(persiste nome='Maria Eduarda Carvalho'; NAO pergunta dados da mae; usa "dela"; proxima_acao=pergunta)
`;
}
