// Clasifica los issues de Linear en los tres grupos del popup.
// Las etiquetas se reconocen por NOMBRE, no por ID: así la misma extensión sirve en
// cualquier workspace. Si no existen, Ajustes → "Preparar mi Linear" las crea.

export const LABEL = {
  triage: '🔍 necesita-triage',
  humano: '👤 listo-para-humano',
  agente: '🤖 listo-para-agente',
  info: '❓ necesita-info',
  brief: '📦 brief-incluido',
};

// Semáforo de riesgo: etiquetas dentro del grupo `riesgo`.
export const RIESGO = {
  verde: 'verde',
  amarillo: 'amarillo',
  rojo: 'rojo',
};

// Tallas de Linear (estimación tShirt): 1 XS, 2 S, 3 M, 5 L, 8 XL…
const TALLAS = { 1: 'XS', 2: 'S', 3: 'M', 5: 'L', 8: 'XL', 13: 'XXL', 21: 'XXXL' };

/** Tallas que se eligen en la tarjeta: [estimate, nombre]. */
export const OPCIONES_TALLA = [[1, 'XS'], [2, 'S'], [3, 'M'], [5, 'L'], [8, 'XL']];

/** Talla del issue ("M") o null si no tiene estimación. */
export function talla(issue) {
  const e = issue.estimate;
  if (e == null) return null;
  return TALLAS[e] || String(e);
}

export const LABELS_DE_ESTADO = [LABEL.triage, LABEL.humano, LABEL.agente, LABEL.info];

const DIA = 24 * 60 * 60 * 1000;

const norma = (n) => (n || '').trim().toLowerCase();

/** ¿El issue trae la etiqueta con ese nombre? (sin importar mayúsculas) */
export function tiene(issue, nombre) {
  return (issue.labels?.nodes || []).some((l) => norma(l.name) === norma(nombre));
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

const COLOR = /^(verde|amarillo|rojo)$/i;

/**
 * Color del semáforo de riesgo (2026-11-02), o null si el issue no lo trae.
 * En Linear son los labels `verde` / `amarillo` / `rojo` dentro del grupo `riesgo`.
 * Antes se buscaba "riesgo" en el nombre del label y no salía en ningún issue
 * (0 de 592 el 2026-11-05): "Mover a agente" siempre decía que faltaba el riesgo.
 * El formato "riesgo: verde" se sigue aceptando.
 */
export function riesgo(issue) {
  for (const l of issue.labels?.nodes || []) {
    const nombre = (l.name || '').trim();
    if (COLOR.test(nombre) || /riesgo/i.test(l.parent?.name || '')) {
      const m = nombre.toLowerCase().match(/verde|amarillo|rojo/);
      if (m) return m[0];
    }
    if (/riesgo/i.test(nombre)) {
      const m = nombre.toLowerCase().match(/verde|amarillo|rojo/);
      if (m) return m[0];
    }
  }
  return null;
}

/**
 * Cambio de labels al moverlo a agente: quita el label de estado anterior y pone 🤖.
 * `color` (verde/amarillo/rojo) se agrega si el issue aún no tiene riesgo.
 * Se manda como agregar/quitar y no como el set completo: el caché puede tener minutos
 * y un label que alguien puso en Linear mientras tanto se borraría.
 * Antes además exigía 📦 brief-incluido y ninguno de los 21 issues de Ahora lo tenía
 * (2026-11-05): el botón nunca movía nada. Ahora solo el riesgo es obligatorio y se pide ahí.
 */
export function labelsParaAgente(issue, color = null, idDe = {}) {
  const quitar = (issue.labels?.nodes || [])
    .filter((l) => LABELS_DE_ESTADO.some((n) => norma(n) === norma(l.name)) && norma(l.name) !== norma(LABEL.agente))
    .map((l) => l.id);
  const agregar = tiene(issue, LABEL.agente) ? [] : [LABEL.agente];
  if (!riesgo(issue)) {
    if (!RIESGO[color]) throw new Error('Elige el riesgo antes de soltarlo a un agente.');
    agregar.push(RIESGO[color]);
  }
  // Los nombres se vuelven IDs con el mapa del workspace (idsDeLabels en lib/linear.js).
  const sinId = agregar.filter((n) => !idDe[n]);
  if (sinId.length) throw new Error(`Falta en tu Linear: ${sinId.join(', ')}. Créalas en Ajustes → Preparar mi Linear.`);
  return { addedLabelIds: agregar.map((n) => idDe[n]), removedLabelIds: quitar };
}

const ESPERA = /review|block/i;

// Vive aquí y no en consultas.js para no hacer un import circular.
export const SIN_PROYECTO = '__sin__';

function enProyecto(issue, proyecto) {
  if (!proyecto) return true;
  if (proyecto === SIN_PROYECTO) return !issue.project;
  return issue.project?.id === proyecto;
}

/** Proyectos presentes en la lista, con cuántos issues trae cada uno. Más issues primero. */
export function proyectosDe(issues) {
  const m = new Map();
  let sinProyecto = 0;
  for (const i of issues) {
    if (!i.project) { sinProyecto++; continue; }
    const p = m.get(i.project.id) || { id: i.project.id, name: i.project.name, n: 0 };
    p.n++;
    m.set(p.id, p);
  }
  const lista = [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'es'));
  return { lista, sinProyecto };
}

/**
 * Grupos del popup. Solo "ahora" es trabajo tuyo de hoy; lo demás se cuenta, no se lista entero.
 * - ahora:      In Progress + 👤 listo-para-humano en Todo/Triage
 * - agente:     🤖 listo-para-agente que nadie ha empezado, o delegado a un agente
 * - info:       ❓ necesita-info (atorado esperando una respuesta)
 * - esperando:  Review o Block: ya lo soltaste, espera a otro
 * - despues:    👤 en Backlog
 * - sinTriage:  sin label de estado o 🔍 (se cuenta: se resuelve con /triage-dia)
 * `proyecto`: '' = todos, SIN_PROYECTO = los que no tienen, o el id del proyecto.
 */
export function clasificar(issues, { equipos = [], proyecto = '', ahora = Date.now() } = {}) {
  const filtro = equipos.map((e) => e.trim().toUpperCase()).filter(Boolean);
  const g = { ahora: [], agente: [], info: [], esperando: [], despues: [], sinTriage: [] };

  for (const issue of issues) {
    if (filtro.length && !filtro.includes(issue.team?.key)) continue;
    if (!enProyecto(issue, proyecto)) continue;
    const tipo = issue.state?.type;
    if (['completed', 'canceled', 'duplicate'].includes(tipo)) continue;
    const dias = issue.updatedAt ? Math.floor((ahora - Date.parse(issue.updatedAt)) / DIA) : null;
    const conDias = { ...issue, dias };

    if (tipo === 'started' && ESPERA.test(issue.state?.name || '')) g.esperando.push(conDias);
    // Delegado a un agente: es suyo aunque lo pase a In Progress; no regresa a "Ahora".
    else if (issue.delegate) g.agente.push(issue);
    else if (tipo === 'started') g.ahora.push(issue);
    else if (tiene(issue, LABEL.humano)) (tipo === 'backlog' ? g.despues : g.ahora).push(issue);
    else if (tiene(issue, LABEL.agente)) g.agente.push(issue);
    else if (tiene(issue, LABEL.info)) g.info.push(conDias);
    else g.sinTriage.push(issue);
  }

  // En curso primero: lo que ya empezaste se termina antes de abrir otra cosa.
  g.ahora.sort((a, b) => {
    const ea = a.state?.type === 'started' ? 0 : 1;
    const eb = b.state?.type === 'started' ? 0 : 1;
    return ea - eb || ordenar(a, b);
  });
  g.agente.sort(ordenar);
  g.despues.sort(ordenar);
  g.info.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));
  g.esperando.sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0));

  return { siguiente: g.ahora[0] || null, ...g };
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
  // En inglés también: "Done when".
  const i = lineas.findIndex((l) => /listo cuando|done when/i.test(l));
  if (i >= 0) {
    usadas.add(i);
    const resto = lineas[i].replace(/.*(listo cuando|done when)\s*:?\s*/i, '').trim();
    if (resto) listoCuando = resto;
    else if (lineas[i + 1]) {
      listoCuando = lineas[i + 1];
      usadas.add(i + 1);
    }
  }
  const cuerpo = lineas.filter((_, j) => !usadas.has(j));
  return { texto: cuerpo.slice(0, 2).join(' ').slice(0, 220), listoCuando };
}

/** Issues que no estaban en la revisión anterior. La primera revisión (sin anteriores) no avisa nada. */
export function nuevos(idsAnteriores, issues) {
  if (!Array.isArray(idsAnteriores)) return [];
  const antes = new Set(idsAnteriores);
  return issues.filter((i) => !antes.has(i.id));
}
