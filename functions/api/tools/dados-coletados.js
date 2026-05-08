// ── Tool — dados_coletados ─────────────────────────────────────────────────
// POST /api/tools/dados-coletados
// Headers: X-Inkflow-Tool-Secret
// Body: { tenant_id, telefone, campo, valor }
// Conversa garantida via UPSERT idempotente (cria na 1ª chamada).
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
//
// HOTFIX 2026-05-06: persistencia via RPC `merge_conversa_jsonb` ao inves de
// PATCH read-modify-write. RPC faz merge atomico via Postgres `||` operator
// dentro de UPDATE single-statement, eliminando race condition quando LLM
// dispara N chamadas paralelas no mesmo turn (ex: cliente manda
// "Maria Silva, 12/03/1995, email" tudo junto = 3 calls).
import { withTool, supaFetch } from './_tool-helpers.js';
import { ensureConversa } from '../../_lib/conversas-upsert.js';

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

// Merge atomico via RPC (Postgres `||` operator dentro de single-statement
// UPDATE — row lock implicita garante sequencializacao de N calls paralelas).
// Retorna { merged_field, new_estado } com o estado pos-merge.
async function mergeConversaJsonb(env, { conversa_id, field, patch, setEstado = null, autoTransitionToCadastro = false }) {
  const r = await supaFetch(env, '/rest/v1/rpc/merge_conversa_jsonb', {
    method: 'POST',
    body: JSON.stringify({
      p_conversa_id: conversa_id,
      p_field_name: field,
      p_patch: patch,
      p_set_estado_agente: setEstado,
      p_auto_transition_to_cadastro: autoTransitionToCadastro,
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`merge-rpc-${r.status}: ${text.slice(0, 200)}`);
  }
  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new Error('merge-rpc-empty-response');
  return { merged_field: row.merged_field, new_estado: row.new_estado };
}

async function handle({ env, input }) {
  const { tenant_id, telefone, campo, valor } = input || {};

  // 1. Validação de input ANTES de qualquer side-effect
  if (!tenant_id) return { status: 400, body: { ok: false, error: 'tenant_id obrigatorio' } };
  if (!telefone)  return { status: 400, body: { ok: false, error: 'telefone obrigatorio' } };
  if (!campo)     return { status: 400, body: { ok: false, error: 'campo obrigatorio' } };

  // 2. Validação de campo
  const isCadastro = CAMPOS_CADASTRO.includes(campo);
  const isTattoo   = CAMPOS_TATTOO.includes(campo);
  if (!isCadastro && !isTattoo) {
    return { status: 400, body: { ok: false, error: `campo invalido: ${campo}` } };
  }

  // 2b. Fail-fast pra string sentinels — mini ja foi visto em loop tentando
  // persistir "null"/"undefined" como valor (audit Sub-2 F1). Reject ANTES
  // de criar conversa via upsert. Cobre tipo string em todos os campos.
  if (typeof valor === 'string' && /^(null|undefined|none|n\/a|—|-)$/i.test(valor.trim())) {
    return { status: 400, body: { ok: false, error: `valor invalido (sentinel string): ${valor}` } };
  }

  // 2c. Fail-fast pra string vazia/whitespace — mini bypass do sentinel check
  // mandando "" pra local_corpo (TC-03 v2 smoke 2026-05-08, 22 tool calls loop).
  if (typeof valor === 'string' && valor.trim() === '') {
    return { status: 400, body: { ok: false, error: 'valor nao pode ser string vazia' } };
  }

  // 2d. Fail-fast pra tamanho_cm numerico invalido — mini bypass mandando 0
  // como "nao tenho valor" (TC-03 v2 smoke). tamanho_cm precisa ser > 0.
  if (campo === 'tamanho_cm' && typeof valor === 'number' && valor <= 0) {
    return { status: 400, body: { ok: false, error: `tamanho_cm precisa ser numero > 0, recebi: ${valor}` } };
  }

  // 3. Garantir conversa via upsert idempotente (defaults só em INSERT)
  const conv = await ensureConversa(env, {
    tenant_id,
    telefone,
    defaultsOnInsert: { estado_agente: 'coletando_tattoo' },
  });
  if (!conv.ok) {
    return {
      status: 500,
      body: { ok: false, error: 'upsert-falhou', detail: { reason: conv.reason, status: conv.status } },
    };
  }

  const conversa_id = conv.id;

  // 4. Validação especial pra data_nascimento
  if (campo === 'data_nascimento') {
    const iso = normalizarData(String(valor || ''));
    if (!iso) {
      return { status: 200, body: { ok: false, gatilho: 'data_invalida', dica: 'use formato dd/mm/aaaa' } };
    }
    const idade = calcularIdade(iso);
    if (idade !== null && idade < 18) {
      // Merge atomico + force estado 'aguardando_tatuador' (menor de idade = handoff).
      await mergeConversaJsonb(env, {
        conversa_id,
        field: 'dados_cadastro',
        patch: { data_nascimento: iso, idade_anos: idade },
        setEstado: 'aguardando_tatuador',
      });
      return {
        status: 200,
        body: {
          ok: true, campo: 'data_nascimento', valor: iso, conversa_id,
          gatilho: 'menor_idade', idade_anos: idade,
          estado_agente: 'aguardando_tatuador',
        },
      };
    }
    await mergeConversaJsonb(env, {
      conversa_id,
      field: 'dados_cadastro',
      patch: { data_nascimento: iso, idade_anos: idade },
    });
    return { status: 200, body: { ok: true, campo: 'data_nascimento', valor: iso, idade_anos: idade, conversa_id } };
  }

  // 5. Validação básica do nome
  if (campo === 'nome') {
    const v = String(valor || '').trim();
    if (v.length < 1) return { status: 400, body: { ok: false, error: 'nome vazio' } };
    await mergeConversaJsonb(env, {
      conversa_id,
      field: 'dados_cadastro',
      patch: { nome: v },
    });
    return { status: 200, body: { ok: true, campo: 'nome', valor: v, conversa_id } };
  }

  // 6. Email (validação branda)
  if (campo === 'email') {
    const v = String(valor || '').trim();
    await mergeConversaJsonb(env, {
      conversa_id,
      field: 'dados_cadastro',
      patch: { email: v },
    });
    return { status: 200, body: { ok: true, campo: 'email', valor: v, conversa_id } };
  }

  // 7. Campo de tattoo — monta patch parcial pro RPC fazer merge atomico
  let patch;
  if (campo === 'refs_imagens') {
    // refs_imagens e array — RPC faz `||` que CONCATENA arrays jsonb.
    // Postgres jsonb `||` em arrays = concat. Em objects = merge top-level.
    // Pra adicionar items, mandamos array com items novos; merge fica:
    //   {refs_imagens: [old]} || {refs_imagens: [new]} = {refs_imagens: [new]}
    // OPS: isso SOBRESCREVE o array (merge de objects).
    // Pra concat real, precisariamos jsonb_set + ||. Pra simplificar:
    // ler estado atual via mergeRPC com patch vazio? Overkill.
    // Solucao: append client-side fica race-prone. Por enquanto MANTEMOS
    // semantica de SUBSTITUIR (cliente manda lista completa toda vez).
    // TODO P2: criar RPC dedicada `append_refs_imagens` se virar dor.
    const lista = Array.isArray(valor) ? valor : [valor];
    patch = { refs_imagens: lista };
  } else if (campo === 'tamanho_cm') {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0 || n > 200) {
      return { status: 400, body: { ok: false, error: `tamanho_cm fora do range: ${valor}` } };
    }
    patch = { tamanho_cm: n };
  } else {
    patch = { [campo]: valor };
  }

  // 8. Merge atomico + auto-transicao se 3 OBR completos
  const { merged_field, new_estado } = await mergeConversaJsonb(env, {
    conversa_id,
    field: 'dados_coletados',
    patch,
    autoTransitionToCadastro: true,
  });

  // 9. Detecta se transicao aconteceu (estado mudou pra coletando_cadastro)
  const obrCompletos = OBR_TATTOO.every(k => {
    const v = merged_field?.[k];
    return v !== undefined && v !== null && v !== '';
  });
  const transicaoAconteceu = obrCompletos && new_estado === 'coletando_cadastro';

  const body = { ok: true, campo, valor: merged_field?.[campo], conversa_id };
  if (transicaoAconteceu) {
    body.proxima_fase = 'cadastro';
    body.estado_agente = 'coletando_cadastro';
  }

  return { status: 200, body };
}

export const onRequest = withTool('dados_coletados', handle);

// Exports pra teste
export { normalizarData, calcularIdade, CAMPOS_TATTOO, CAMPOS_CADASTRO, OBR_TATTOO };
