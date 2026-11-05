// Clasifica los issues de Linear en los tres grupos del popup.
// Los IDs de label vienen de gnb-meta/operacion/areas/skills/compartidas/triage-dia/references/linear-ids.md
// (labels de workspace: sirven en todos los teams).

export const LABEL = {
  triage: 'e35c191e-5c61-4fbf-a868-13200a2ca605',
  humano: '0a6fcfa4-df6a-4cd4-9417-bd1e8b84c7d7',
  agente: 'b5565186-c19c-4577-bded-163b86494dac',
  info: '2ed1cb66-314b-479e-9355-bfe9c37a67c8',
  brief: '3ba72dd9-908a-4652-a38d-1df5e6afadd8',
};

export const LABELS_DE_ESTADO = [LABEL.triage, LABEL.humano, LABEL.agente, LABEL.info];

const DIA = 24 * 60 * 60 * 1000;

function labelIds(issue) {
  return (issue.labels?.nodes || []).map((l) => l.id);
}

function tiene(issue, id) {
  return labelIds(issue).includes(id);
}

// Linear: 0 sin prioridad, 1 urgente, 2 alta, 3 media, 4 baja. Sin prioridad va al final.
function rangoPrioridad(p) {
  return p ? p : 5;
}

function ordenar(a, b) {
  const p = rangoPrioridad(a.priority) - rangoPrioridad(b.priority);
  if (p) return p;
  const da = a.dueDate || '9999-12-31';
  const db = b.dueDate || '9999-12-31';
  return da < db ? -1 : da > db ? 1 : 0;
}

/** Color del semáforo de riesgo (2026-11-02), o null si el issue no lo trae. */
export function riesgo(issue) {
  const l = (issue.labels?.nodes || []).find((x) => /riesgo/i.test(x.name));
  if (!l) return null;
  const m = l.name.toLowerCase().match(/verde|amarillo|rojo/);
  return m ? m[0] : null;
}

/** ¿Se puede soltar a un agente? Necesita brief y semáforo. */
export function puedeIrAAgente(issue) {
  const falta = [];
  if (!tiene(issue, LABEL.brief)) falta.push('brief');
  if (!riesgo(issue)) falta.push('riesgo');
  return { ok: falta.length === 0, falta };
}

/** Labels que debe quedar con el issue al moverlo a agente: quita el estado anterior, pone 🤖. */
export function labelsParaAgente(issue) {
  return labelIds(issue).filter((id) => !LABELS_DE_ESTADO.includes(id)).concat(LABEL.agente);
}

export function clasificar(issues, { equipos = [], ahora = Date.now() } = {}) {
  const filtro = equipos.map((e) => e.trim().toUpperCase()).filter(Boolean);
  const tuyos = [];
  const agente = [];
  const atorados = [];

  for (const issue of issues) {
    if (filtro.length && !filtro.includes(issue.team?.key)) continue;
    const enCurso = issue.state?.type === 'started';
    if (enCurso || tiene(issue, LABEL.humano)) {
      tuyos.push(issue);
    } else if (tiene(issue, LABEL.agente)) {
      agente.push(issue);
    } else if (tiene(issue, LABEL.info) || tiene(issue, LABEL.triage) || !labelIds(issue).some((id) => LABELS_DE_ESTADO.includes(id))) {
      // Sin label de estado = necesita triage (máquina de estados de triage-dia).
      const motivo = tiene(issue, LABEL.info) ? 'necesita info' : 'necesita triage';
      const dias = issue.updatedAt ? Math.floor((ahora - Date.parse(issue.updatedAt)) / DIA) : null;
      atorados.push({ ...issue, motivo, dias });
    }
  }

  // En curso primero: lo que ya empezaste se termina antes de abrir otra cosa.
  tuyos.sort((a, b) => {
    const ea = a.state?.type === 'started' ? 0 : 1;
    const eb = b.state?.type === 'started' ? 0 : 1;
    return ea - eb || ordenar(a, b);
  });
  agente.sort(ordenar);
  atorados.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));

  return { siguiente: tuyos[0] || null, tuyos, agente, atorados };
}

/** Dos líneas de qué hay que hacer, más el "Listo cuando" si existe. */
export function resumen(descripcion = '') {
  const limpio = (s) =>
    s
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#*_`>]/g, '')
      .replace(/^\s*[-+]\s+/, '')
      .trim();

  const lineas = (descripcion || '').split('\n').map(limpio).filter(Boolean);
  let listoCuando = null;
  const usadas = new Set();
  const i = lineas.findIndex((l) => /listo cuando/i.test(l));
  if (i >= 0) {
    usadas.add(i);
    const resto = lineas[i].replace(/.*listo cuando\s*:?\s*/i, '').trim();
    if (resto) listoCuando = resto;
    else if (lineas[i + 1]) {
      listoCuando = lineas[i + 1];
      usadas.add(i + 1);
    }
  }
  const cuerpo = lineas.filter((_, j) => !usadas.has(j));
  return { texto: cuerpo.slice(0, 2).join(' ').slice(0, 220), listoCuando };
}
