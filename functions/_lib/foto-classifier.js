// functions/_lib/foto-classifier.js
// Classificador heuristico L1+L2+L3 para fotos chegando do cliente.
// Pura, zero deps. Decide se a foto eh do LOCAL do corpo ou referencia visual.

export const KEYWORDS_LOCAL = /\b(aqui|nessa parte|nesse lugar|nesse local|essa parte|esse lugar|esse local|minha pele|meu corpo|braço|braco|antebraço|antebraco|perna|coxa|panturrilha|costas|peito|ombro|pulso|tornozelo|nuca|pescoço|pescoco|virilha|costela|bíceps|biceps|gluteo|glúteo|tô mostrando|to mostrando|no meu|na minha)\b/i;
export const KEYWORDS_LOCAL_DEITICO = /\b(nessa parte|nesse lugar|nesse local|essa parte|esse lugar|esse local|minha pele|meu corpo)\b/i;

export function isFotoLocalCaption(texto_turno) {
  return Boolean(texto_turno && KEYWORDS_LOCAL.test(texto_turno));
}

export function isFotoLocalDeiticaCaption(texto_turno) {
  return Boolean(texto_turno && KEYWORDS_LOCAL_DEITICO.test(texto_turno));
}

/**
 * @param {{tentativas_foto_local: number, foto_local_atual: string|null, texto_turno: string|null|undefined}} params
 * @returns {'local'|'ref'}
 */
export function classificarFoto({ tentativas_foto_local, foto_local_atual, texto_turno }) {
  // L1 forte: agent pediu foto E ainda nao tem
  if (tentativas_foto_local > 0 && !foto_local_atual) return 'local';
  // L2 medio: texto sugere local do corpo
  if (isFotoLocalCaption(texto_turno)) return 'local';
  // L3 default: assume referencia
  return 'ref';
}
