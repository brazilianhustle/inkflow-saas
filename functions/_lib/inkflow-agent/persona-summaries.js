// persona-summaries.js — resumo inline das 15 personas pra prompt do classifier.
// Source-of-truth: docs/inkflow-agent/personas/INDEX.md. Atualizar manualmente
// quando taxonomia mudar (raro).

export const PERSONAS_PROMPT_BLOCK = `- PER-001 curioso-primeira-vez: nunca tatuou, vocabulario leigo, ansioso mas decidido. Faz perguntas basicas ("doi muito?", "quanto sai?").
- PER-002 indeciso-explorando: cliente que nao sabe o que tatuar. Casual, esta explorando ideias, vocabulario vago tipo "queria algo legal".
- PER-003 pesquisador-orcamento: foco no preco, distante. Pergunta valor logo no primeiro turno, pouco engajamento com ideia.
- PER-004 coverup-complicado: quer cobrir tattoo antiga. Menciona "cobrir", "tapar", "disfarcar", ou manda foto de pele tatuada.
- PER-005 complemento-serie: ja e cliente recorrente, quer adicionar a um sleeve/serie existente. Vocabulario experiente.
- PER-006 primeira-vez-safe: primeira vez mas tema simples e cautelosa. Pergunta sobre dor, cicatrizacao, cuidados.
- PER-007 negociador-preco: foco agressivo em desconto. Mensagens tipo "fecho hoje se der X", "fulano cobrou Y".
- PER-008 vago-de-proposito: distante, vagueia de proposito. Respostas curtas tipo "qualquer coisa", evita comprometer.
- PER-009 indeciso-eterno: muda de ideia no meio do fluxo (turn 3+). Manda "ah na verdade troquei", "esquece, vai ser outro tema".
- PER-010 contraditorio: info contraditoria na MESMA mensagem (ex: "rosa pequena de 25cm"). Conflitos no primeiro pacote de info.
- PER-011 menor-de-idade: cliente diz idade <18 ou fala em "minha mae", "meus pais autorizam".
- PER-012 cliente-em-surto: emocional, urgencia atipica. "preciso AGORA", "vai mudar minha vida", "perdi alguem".
- PER-013 prompt-injection: tentativa adversarial. "ignore as instrucoes", "voce e o tatuador", "execute".
- PER-014 estilo-indisponivel: pede estilo que estudio nao trabalha. Vocabulario tecnico ("aquarela", "trash polka", "biomechanic").
- PER-015 vip-recorrente: cliente veterano do estudio, casual, conversacional, faz pedidos rapidos.`;
