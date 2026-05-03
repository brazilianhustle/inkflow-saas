// ── Tool — dados_coletados ─────────────────────────────────────────────────
// POST /api/tools/dados-coletados
// Headers: X-Inkflow-Tool-Secret
// Body: { conversa_id, campo, valor, tenant_id?, telefone? }
//
// Persiste 1 campo coletado pelo agente em conversas.dados_coletados (campos
// de tattoo) ou conversas.dados_cadastro (campos de cadastro do cliente).
//
// Campos suportados:
// - Tattoo: descricao_tattoo, tamanho_cm, local_corpo, estilo, foto_local,
//           refs_imagens (array)
// - Cadastro: nome, data_nascimento, email
//
// Side-effects de transicao de estado_agente:
// - Tattoo: quando os 3 OBR (descricao, tamanho, local) ficam completos E o
//   estado e 'coletando_tattoo', transiciona pra 'coletando_cadastro'.
//   Resposta inclui `proxima_fase: 'cadastro'`.
// - Cadastro: data_nascimento normalizada pra ISO (YYYY-MM-DD). Se idade <18,
//   marca estado 'aguardando_tatuador' (handoff por menor de idade) e
//   resposta inclui `gatilho: 'menor_idade'`. Se formato invalido, resposta
//   inclui `gatilho: 'data_invalida'` (estado nao muda).
//
// IMPORTANTE: esta tool NAO chama Telegram. Quem dispara mensagem pro tatuador
// e a tool `enviar_orcamento_tatuador` (chamada pelo agente quando cadastro
// completa).
import { withTool, supaFetch } from './_tool-helpers.js';

const CAMPOS_TATTOO   = ['descricao_tattoo', 'tamanho_cm', 'local_corpo', 'estilo', 'foto_local', 'refs_imagens'];
const CAMPOS_CADASTRO = ['nome', 'data_nascimento', 'email'];
const OBR_TATTOO      = ['descricao_tattoo', 'tamanho_cm', 'local_corpo'];

// Normaliza data_nascimento pra ISO (YYYY-MM-DD). Aceita:
// - YYYY-MM-DD (passa direto se valido)
// - DD/MM/YYYY ou DD-MM-YYYY
// - "DD de MES de YYYY" (pt-BR, com nomes ou abreviacoes)
// Retorna null se nao conseguir parsear.
const MESES_PT = {
  janeiro: '01', jan: '01',
  fevereiro: '02', fev: '02',
  marco: '03', 'março': '03', mar: '03',
  abril: '04', abr: '04',
  maio: '05', mai: '05',
  junho: '06', jun: '06',
  julho: '07', jul: '07',
  agosto: '08', ago: '08',
  setembro: '09', set: '09',
  outubro: '10', out: '10',
  novembro: '11', nov: '11',
  dezembro: '12', dez: '12',
};

function normalizarData(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();

  // ISO direto
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return isoFromParts(isoMatch[1], isoMatch[2], isoMatch[3]);

  // DD/MM/YYYY ou DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) return isoFromParts(dmyMatch[3], dmyMatch[2], dmyMatch[1]);

  // "DD de MES de YYYY"
  const ptMatch = s.match(/^(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})$/i);
  if (ptMatch) {
    const mes = MESES_PT[ptMatch[2].toLowerCase()];
    if (mes) return isoFromParts(ptMatch[3], mes, ptMatch[1]);
  }

  return null;
}

function isoFromParts(yyyy, mm, dd) {
  const y = String(yyyy).padStart(4, '0');
  const m = String(mm).padStart(2, '0');
  const d = String(dd).padStart(2, '0');
  // Validacao basica: ano razoavel, mes 01-12, dia 01-31
  const yNum = Number(y), mNum = Number(m), dNum = Number(d);
  if (yNum < 1900 || yNum > 2100) return null;
  if (mNum < 1 || mNum > 12) return null;
  if (dNum < 1 || dNum > 31) return null;
  // Roundtrip via Date pra detectar dias invalidos (ex: 31/02)
  const dt = new Date(`${y}-${m}-${d}T12:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== yNum || (dt.getUTCMonth() + 1) !== mNum || dt.getUTCDate() !== dNum) return null;
  return `${y}-${m}-${d}`;
}

function calcularIdade(isoDate) {
  if (!isoDate) return null;
  const nasc = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(nasc.getTime())) return null;
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - nasc.getUTCFullYear();
  const m = hoje.getUTCMonth() - nasc.getUTCMonth();
  if (m < 0 || (m === 0 && hoje.getUTCDate() < nasc.getUTCDate())) idade--;
  return idade;
}

async function carregarConversa(env, conversa_id) {
  const r = await supaFetch(env,
    `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}&select=id,estado_agente,dados_coletados,dados_cadastro`
  );
  if (!r.ok) throw new Error(`conversa-fetch-${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function patchConversa(env, conversa_id, fields) {
  const r = await supaFetch(env, `/rest/v1/conversas?id=eq.${encodeURIComponent(conversa_id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(fields),
  });
  if (!r.ok) throw new Error(`patch-conversa-${r.status}`);
}

async function handle({ env, input }) {
  const { conversa_id, campo, valor } = input || {};
  if (!conversa_id) return { status: 400, body: { ok: false, error: 'conversa_id obrigatorio' } };
  if (!campo) return { status: 400, body: { ok: false, error: 'campo obrigatorio' } };

  const isCadastro = CAMPOS_CADASTRO.includes(campo);
  const isTattoo   = CAMPOS_TATTOO.includes(campo);
  if (!isCadastro && !isTattoo) {
    return { status: 400, body: { ok: false, error: `campo invalido: ${campo}` } };
  }

  const conv = await carregarConversa(env, conversa_id);
  if (!conv) return { status: 404, body: { ok: false, error: 'conversa-nao-encontrada' } };

  // Validacao especial pra data_nascimento
  if (campo === 'data_nascimento') {
    const iso = normalizarData(String(valor || ''));
    if (!iso) {
      return { status: 200, body: { ok: false, gatilho: 'data_invalida', dica: 'use formato dd/mm/aaaa' } };
    }
    const idade = calcularIdade(iso);
    if (idade !== null && idade < 18) {
      // Persiste mesmo assim (pra audit trail) + transiciona pra aguardando_tatuador
      const cadastro = { ...(conv.dados_cadastro || {}), data_nascimento: iso, idade_anos: idade };
      await patchConversa(env, conversa_id, {
        dados_cadastro: cadastro,
        estado_agente: 'aguardando_tatuador',
      });
      return {
        status: 200,
        body: {
          ok: true, campo: 'data_nascimento', valor: iso,
          gatilho: 'menor_idade', idade_anos: idade,
          estado_agente: 'aguardando_tatuador',
        },
      };
    }
    // Maior de idade — persiste e segue
    const cadastro = { ...(conv.dados_cadastro || {}), data_nascimento: iso, idade_anos: idade };
    await patchConversa(env, conversa_id, { dados_cadastro: cadastro });
    return { status: 200, body: { ok: true, campo: 'data_nascimento', valor: iso, idade_anos: idade } };
  }

  // Validacao basica do nome (pelo menos 1 char nao-vazio)
  if (campo === 'nome') {
    const v = String(valor || '').trim();
    if (v.length < 1) return { status: 400, body: { ok: false, error: 'nome vazio' } };
    const cadastro = { ...(conv.dados_cadastro || {}), nome: v };
    await patchConversa(env, conversa_id, { dados_cadastro: cadastro });
    return { status: 200, body: { ok: true, campo: 'nome', valor: v } };
  }

  // Email (validacao branda — aceita mesmo sem @ pra nao bloquear cliente
  // que nao quer dar email correto; tatuador ve no orcamento)
  if (campo === 'email') {
    const v = String(valor || '').trim();
    const cadastro = { ...(conv.dados_cadastro || {}), email: v };
    await patchConversa(env, conversa_id, { dados_cadastro: cadastro });
    return { status: 200, body: { ok: true, campo: 'email', valor: v } };
  }

  // Campo de tattoo (refs_imagens e array; demais sao escalares)
  const dadosColetados = { ...(conv.dados_coletados || {}) };
  if (campo === 'refs_imagens') {
    const lista = Array.isArray(valor) ? valor : [valor];
    dadosColetados.refs_imagens = [...(dadosColetados.refs_imagens || []), ...lista];
  } else if (campo === 'tamanho_cm') {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0 || n > 200) {
      return { status: 400, body: { ok: false, error: `tamanho_cm fora do range: ${valor}` } };
    }
    dadosColetados.tamanho_cm = n;
  } else {
    dadosColetados[campo] = valor;
  }

  // Detecta se completou os 3 OBR — transicao pra cadastro
  const obrCompletos = OBR_TATTOO.every(k => {
    const v = dadosColetados[k];
    return v !== undefined && v !== null && v !== '';
  });

  let proximaFase = null;
  let novoEstado = null;
  if (obrCompletos && conv.estado_agente === 'coletando_tattoo') {
    novoEstado = 'coletando_cadastro';
    proximaFase = 'cadastro';
  }

  const patch = { dados_coletados: dadosColetados };
  if (novoEstado) patch.estado_agente = novoEstado;
  await patchConversa(env, conversa_id, patch);

  const body = { ok: true, campo, valor: dadosColetados[campo] };
  if (proximaFase) body.proxima_fase = proximaFase;
  if (novoEstado) body.estado_agente = novoEstado;

  return { status: 200, body };
}

export const onRequest = withTool('dados_coletados', handle);

// Exports pra teste
export { normalizarData, calcularIdade, CAMPOS_TATTOO, CAMPOS_CADASTRO, OBR_TATTOO };
