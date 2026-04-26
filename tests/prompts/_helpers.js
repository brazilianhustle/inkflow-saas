// Helpers compartilhados entre os testes de prompts.
// Mantém a heurística de match de tokens banidos num único lugar.

// Retorna true se `token` aparece em `prompt` com a semântica correta:
// - Tokens alfanuméricos (ex: TODO, FIXME) exigem word boundary pra evitar
//   falso-positivo em palavras pt-br como "TODOS".
// - Delimitadores (ex: {{, }}) usam match de substring direto.
export function containsBannedToken(prompt, token) {
  const isWord = /^\w+$/.test(token);
  if (isWord) {
    return new RegExp(`\\b${token}\\b`).test(prompt);
  }
  return prompt.includes(token);
}
