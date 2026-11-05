import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { clasificar, proyectosDe, LABEL, SIN_PROYECTO } from '../lib/estado.js';
import { filtroDeGrupo, textoParaClaude, GRUPOS } from '../lib/consultas.js';

// Evalúa en memoria el subconjunto de IssueFilter que usa consultas.js, con la semántica de Linear.
// Sirve para probar que la consulta y `clasificar` dicen lo mismo sin llamar a la API.
function cumple(filtro, issue) {
  return Object.entries(filtro).every(([campo, cond]) => {
    if (campo === 'and') return cond.every((f) => cumple(f, issue));
    if (campo === 'or') return cond.some((f) => cumple(f, issue));
    if (campo === 'assignee') return comparar(cond.id, issue.assignee?.id);
    if (campo === 'team') return comparar(cond.key, issue.team?.key);
    if (campo === 'project') return cond.null ? !issue.project : comparar(cond.id, issue.project?.id);
    if (campo === 'state') return Object.entries(cond).every(([k, c]) => comparar(c, issue.state?.[k]));
    if (campo === 'labels') {
      const ids = (issue.labels?.nodes || []).map((l) => l.id);
      if (cond.some) return ids.some((id) => comparar(cond.some.id, id));
      if (cond.every) return ids.every((id) => comparar(cond.every.id, id));
    }
    throw new Error(`Campo sin evaluar en la prueba: ${campo}`);
  });
}

function comparar(c, v) {
  return Object.entries(c).every(([op, x]) => {
    const s = String(v ?? '').toLowerCase();
    switch (op) {
      case 'eq': return v === x;
      case 'neq': return v !== x;
      case 'in': return x.includes(v);
      case 'nin': return !x.includes(v);
      case 'containsIgnoreCase': return s.includes(x.toLowerCase());
      case 'notContainsIgnoreCase': return !s.includes(x.toLowerCase());
      default: throw new Error(`Operador sin evaluar en la prueba: ${op}`);
    }
  });
}

const P = 'persona-1';
const lab = (id) => ({ id, name: id });
let n = 0;
const issue = (extra = {}) => ({
  id: `X-${++n}`, identifier: `X-${n}`, title: 't', priority: 0, assignee: { id: P },
  team: { key: 'OP' }, project: null, state: { type: 'unstarted', name: 'Todo' }, labels: { nodes: [] }, ...extra,
});

// Una combinación de cada cosa que mueve a un issue de grupo: estado, label de estado, equipo y proyecto.
const ESTADOS = [
  { type: 'triage', name: 'Triage' }, { type: 'backlog', name: 'Backlog' }, { type: 'unstarted', name: 'Todo' },
  { type: 'started', name: 'In Progress' }, { type: 'started', name: 'Internal Review' }, { type: 'started', name: 'External Block' },
  { type: 'completed', name: 'Done' }, { type: 'canceled', name: 'Canceled' },
];
const LABELS = [[], [LABEL.humano], [LABEL.agente], [LABEL.info], [LABEL.triage], [LABEL.humano, LABEL.agente], [LABEL.agente, LABEL.info], ['otro']];
const PROYECTOS = [null, { id: 'p1', name: 'Wialon' }, { id: 'p2', name: 'CRM' }];
const EQUIPOS = ['OP', 'INT'];
const todos = [];
for (const state of ESTADOS) for (const l of LABELS) for (const project of PROYECTOS) for (const key of EQUIPOS) {
  todos.push(issue({ state, project, team: { key }, labels: { nodes: l.map(lab) } }));
}
todos.push(issue({ assignee: { id: 'otra-persona' }, labels: { nodes: [lab(LABEL.humano)] } }));

const casos = [
  {},
  { proyecto: 'p1' },
  { proyecto: SIN_PROYECTO },
  { equipos: ['int'] },
  { equipos: ['OP', 'INT'], proyecto: 'p2' },
];

for (const caso of casos) {
  test(`la consulta de cada grupo regresa lo mismo que el popup · ${JSON.stringify(caso)}`, () => {
    const mios = todos.filter((i) => i.assignee.id === P);
    const g = clasificar(mios, caso);
    let total = 0;
    for (const grupo of Object.keys(GRUPOS)) {
      const filtro = filtroDeGrupo(grupo, { personaId: P, ...caso });
      const consulta = todos.filter((i) => cumple(filtro, i)).map((i) => i.id).sort();
      assert.deepEqual(consulta, g[grupo].map((i) => i.id).sort(), grupo);
      total += consulta.length;
    }
    assert.ok(total > 0, 'el caso trae issues');
  });
}

test('los grupos no se enciman: cada issue abierto cae en uno solo', () => {
  for (const i of todos.filter((x) => x.assignee.id === P && !['completed', 'canceled'].includes(x.state.type))) {
    const en = Object.keys(GRUPOS).filter((grupo) => cumple(filtroDeGrupo(grupo, { personaId: P }), i));
    assert.equal(en.length, 1, `${i.state.name} ${i.labels.nodes.map((l) => l.id)}: ${en}`);
  }
});

test('filtra por proyecto en el popup', () => {
  const h = { labels: { nodes: [lab(LABEL.humano)] } };
  const lista = [issue({ ...h, project: { id: 'p1', name: 'Wialon' } }), issue({ ...h, project: { id: 'p2', name: 'CRM' } }), issue(h)];
  assert.deepEqual(clasificar(lista, { proyecto: 'p1' }).ahora.map((i) => i.project?.id), ['p1']);
  assert.deepEqual(clasificar(lista, { proyecto: SIN_PROYECTO }).ahora.map((i) => i.project), [null]);
  assert.equal(clasificar(lista).ahora.length, 3, 'sin proyecto elegido van todos');
});

test('proyectosDe cuenta por proyecto, el más cargado primero', () => {
  const lista = [issue({ project: { id: 'a', name: 'Zeta' } }), issue({ project: { id: 'b', name: 'Beta' } }), issue({ project: { id: 'b', name: 'Beta' } }), issue()];
  const { lista: proyectos, sinProyecto } = proyectosDe(lista);
  assert.deepEqual(proyectos.map((p) => [p.name, p.n]), [['Beta', 2], ['Zeta', 1]]);
  assert.equal(sinProyecto, 1);
});

test('el texto para Claude trae el curl con el filtro exacto y la lista', () => {
  const filtro = filtroDeGrupo('agente', { personaId: P, proyecto: 'p1' });
  const texto = textoParaClaude({
    grupo: 'agente', persona: { name: 'Ana', email: 'ana@gnb.mx' }, proyectoNombre: 'Wialon', filtro,
    issues: [{ identifier: 'INT-1', title: 'Importar CSV', url: 'https://linear.app/x/INT-1', state: { name: 'Todo' }, priority: 2 }],
    extra: () => 'riesgo verde',
  });
  assert.match(texto, /# ¿Qué sigue\? · Para agente \(1\)/);
  assert.match(texto, /proyecto: Wialon/);
  assert.match(texto, /curl -s https:\/\/api\.linear\.app\/graphql/);
  assert.match(texto, /\$LINEAR_API_KEY/);
  assert.match(texto, /- INT-1 · Importar CSV · Todo · alta · riesgo verde/);
  const cuerpo = JSON.parse(texto.match(/-d '(.*)'/)[1]);
  assert.deepEqual(cuerpo.variables.filtro, filtro, 'el filtro del curl es el mismo del grupo');
  assert.doesNotMatch(texto, /lin_api_/, 'nunca la llave');
});

test('una comilla simple en un valor no rompe el curl', () => {
  const filtro = filtroDeGrupo('ahora', { personaId: P, equipos: ["O'P"] });
  const texto = textoParaClaude({ grupo: 'ahora', persona: { name: 'Ana', email: 'a@b.mx' }, filtro, issues: [] });
  // Lo que bash le pasa a curl después de quitar las comillas.
  const argumento = texto.match(/-d ('.*')$/m)[1];
  const cuerpo = execFileSync('bash', ['-c', `printf '%s' ${argumento}`]).toString();
  assert.deepEqual(JSON.parse(cuerpo).variables.filtro, filtro);
});
