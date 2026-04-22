// ── Helpers de agenda — calcula slots livres baseado em horario_funcionamento
// do tenant + agendamentos existentes (tentative/confirmed). Source of truth:
// tabela `agendamentos` no Supabase.

// Dias da semana padrao ISO (seg=1 ... dom=0 em JS)
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

// Parse "HH:MM-HH:MM" ou "HHhMM-HHhMM" ou "closed" → { start, end } em minutos
function parseHorario(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim().toLowerCase();
  if (s === 'closed' || s === 'fechado' || s === '-') return null;
  const normalized = s.replace(/h(\d)/g, ':$1').replace(/h$/g, ':00');
  const parts = normalized.split(/[-–]/).map(x => x.trim());
  if (parts.length !== 2) return null;
  const toMin = (hm) => {
    const m = hm.match(/^(\d{1,2})(?::(\d{2}))?/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return h * 60 + mm;
  };
  const start = toMin(parts[0]);
  const end = toMin(parts[1]);
  if (start == null || end == null || end <= start) return null;
  return { start, end };
}

// Obtem horario de funcionamento do dia considerando chaves como "seg-sex"
export function horarioDoDia(horarioFuncionamento, diaSemana) {
  if (!horarioFuncionamento || typeof horarioFuncionamento !== 'object') return null;
  const dia = DIAS[diaSemana];
  if (horarioFuncionamento[dia]) return parseHorario(horarioFuncionamento[dia]);
  // Chaves compostas tipo "seg-sex"
  for (const k of Object.keys(horarioFuncionamento)) {
    const parts = k.toLowerCase().split(/[-–_]/);
    if (parts.length === 2 && DIAS.includes(parts[0]) && DIAS.includes(parts[1])) {
      const i0 = DIAS.indexOf(parts[0]);
      const i1 = DIAS.indexOf(parts[1]);
      const inRange = i0 <= i1 ? (diaSemana >= i0 && diaSemana <= i1) : (diaSemana >= i0 || diaSemana <= i1);
      if (inRange) return parseHorario(horarioFuncionamento[k]);
    }
  }
  return null;
}

// Constante: offset fixo de America/Sao_Paulo (UTC-3). Brasil nao tem DST desde 2019.
const SP_OFFSET_HOURS = 3;

// Extrai componentes Y/M/D + weekday em timezone SP (independente do runtime)
function spDateParts(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const y = parseInt(parts.find(p => p.type === 'year').value, 10);
  const m = parseInt(parts.find(p => p.type === 'month').value, 10) - 1;
  const d = parseInt(parts.find(p => p.type === 'day').value, 10);
  const wdStr = parts.find(p => p.type === 'weekday').value.toLowerCase();
  const wmap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return { y, m, d, wd: wmap[wdStr] };
}

// Gera slots candidatos em um dia baseado em horario_funcionamento + duracao.
// Trabalha em timezone SP explicito (UTC-3), retorna Dates em UTC.
export function slotsDoDia(data, horarioFuncionamento, duracaoH) {
  const { y, m, d, wd } = spDateParts(data);
  const horario = horarioDoDia(horarioFuncionamento, wd);
  if (!horario) return [];
  const duracaoMin = Math.max(30, Math.round(duracaoH * 60));
  const slots = [];
  for (let t = horario.start; t + duracaoMin <= horario.end; t += duracaoMin) {
    // hora local SP → UTC: soma offset
    const inicio = new Date(Date.UTC(y, m, d, Math.floor(t / 60) + SP_OFFSET_HOURS, t % 60, 0));
    const fim = new Date(inicio.getTime() + duracaoMin * 60000);
    slots.push({ inicio, fim });
  }
  return slots;
}

// Remove slots que conflitam com agendamentos existentes.
// agendamentos: [{ inicio: ISOString, fim: ISOString, status }]
export function filtrarConflitos(slots, agendamentos) {
  const ocupados = (agendamentos || [])
    .filter(a => ['tentative', 'confirmed'].includes(a.status))
    .map(a => ({ inicio: new Date(a.inicio).getTime(), fim: new Date(a.fim).getTime() }));
  return slots.filter(s => {
    const si = s.inicio.getTime(), sf = s.fim.getTime();
    return !ocupados.some(o => si < o.fim && sf > o.inicio);
  });
}

// Horario de funcionamento default quando tenant nao configurou
export const HORARIO_DEFAULT = {
  'seg-sex': '10:00-19:00',
  'sab': '10:00-15:00',
  'dom': 'closed',
};
