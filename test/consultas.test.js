import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { clasificar, proyectosDe, LABEL, SIN_PROYECTO } from '../lib/estado.js';
import { filtroDeGrupo, textoParaClaude, textoDeIssue, repoDe, GRUPOS } from '../lib/consultas.js';

// Evalúa en memoria el subconjunto de IssueFilter que usa consultas.js, con la semántica de Linear.
// Sirve para probar que la consulta y `clasificar` dicen lo mismo sin llamar a la API.
function cumple(filtro, issue) {
  return Object.entries(filtro).every(([campo, cond]) => {
    if (campo === 'and') return cond.every((f) => cumple(f, issue));
    if (campo === 'or') return cond.some((f) => cumple(f, issue));
    if (campo === 'assignee') return comparar(cond.id, issue.assignee?.id);
    if (campo === 'team') return comparar(cond.key, issue.team?.key);
    if (campo === 'project') return cond.null ? !issue.project : comparar(cond.id, issue.project?.id);
    if (campo === 'delegate') return cond.null ? !issue.delegate : !!issue.delegate;
    if (campo === 'state') return Object.entries(cond).every(([k, c]) => comparar(c, issue.state?.[k]));
    if (campo === 'labels') {
      const nombres = (issue.labels?.nodes || []).map((l) => l.name);
      if (cond.some) return nombres.some((n) => comparar(cond.some.name, n));
      if (cond.every) return nombres.every((n) => comparar(cond.every.name, n));
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
      case 'eqIgnoreCase': return s === x.toLowerCase();
      case 'neqIgnoreCase': return s !== x.toLowerCase();
      case 'containsIgnoreCase': return s.includes(x.toLowerCase());
      case 'notContainsIgnoreCase': return !s.includes(x.toLowerCase());
      default: throw new Error(`Operador sin evaluar en la prueba: ${op}`);
    }
  });
}

const P = 'persona-1';
const lab = (name) => ({ id: `id-${name}`, name });
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
const DELEGADOS = [null, { id: 'ag', name: 'Linear' }];
for (const state of ESTADOS) for (const l of LABELS) for (const project of PROYECTOS) for (const key of EQUIPOS) for (const delegate of DELEGADOS) {
  todos.push(issue({ state, project, delegate, team: { key }, labels: { nodes: l.map(lab) } }));
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

test('textoDeIssue: un issue listo para pegar en Claude, con la rama exacta de Linear', () => {
  const texto = textoDeIssue({
    identifier: 'INT-1476', title: 'Separar el contenido por tenant', url: 'https://linear.app/gnb-labs/issue/INT-1476',
    branchName: 'gneuman/int-1476-separar-el-contenido', priority: 1, estimate: 3, dueDate: '2026-10-16',
    state: { name: 'In Progress' }, project: { name: 'Coach G' },
    labels: { nodes: [{ id: 'v', name: 'verde', parent: { name: 'riesgo' } }] },
    description: 'TL;DR separar.\n\nListo cuando: las consultas filtran por tenantId',
  });
  assert.match(texto, /^# Trabajemos INT-1476: Separar el contenido por tenant/);
  assert.match(texto, /- Linear: https:\/\/linear\.app\/gnb-labs\/issue\/INT-1476/);
  assert.match(texto, /- Rama: `gneuman\/int-1476-separar-el-contenido`/);
  assert.match(texto, /In Progress · prioridad urgente · talla M · riesgo verde · vence 2026-10-16/);
  assert.match(texto, /- Proyecto: Coach G/);
  assert.match(texto, /Listo cuando: las consultas filtran por tenantId/, 'la descripción va completa');
  assert.match(texto, /git worktree add -b gneuman\/int-1476-separar-el-contenido \/c\/tmp\/wt-int-1476 origin\/main/, 'rama nueva');
  assert.match(texto, /git worktree add \/c\/tmp\/wt-int-1476 gneuman\/int-1476-separar-el-contenido`/, 'rama que ya existe');
});

test('textoDeIssue sin rama, sin descripción ni riesgo no truena', () => {
  const texto = textoDeIssue({ identifier: 'OP-9', title: 't', url: 'u', priority: 0, state: { name: 'Todo' }, labels: { nodes: [] }, description: '   ' });
  assert.match(texto, /- Rama: cópiala de Linear/, 'sin branchName no inventa una rama');
  assert.doesNotMatch(texto, /gneuman\/op-9/);
  assert.match(texto, /sin riesgo/);
  assert.match(texto, /\(sin descripción\)/);
  assert.doesNotMatch(texto, /Proyecto:/);
});

test('repoDe: primero lo ligado al issue, luego el link del proyecto, nunca inventado', () => {
  const proyecto = { name: 'PostLeads', externalLinks: { nodes: [{ url: 'https://publicaciones.gnb.mx' }, { url: 'https://github.com/gneuman/postleads' }] } };
  assert.equal(repoDe({ project: proyecto }), 'gneuman/postleads', 'del proyecto');
  assert.equal(repoDe({ attachments: { nodes: [{ url: 'https://github.com/gneuman/gnb-crm/pull/613' }] }, project: proyecto }), 'gneuman/gnb-crm', 'el del issue gana');
  assert.equal(repoDe({ attachments: { nodes: [{ url: 'https://github.com/gneuman/x.git' }] } }), 'gneuman/x');
  assert.equal(repoDe({ attachments: { nodes: [{ url: 'https://figma.com/a' }] }, project: { externalLinks: { nodes: [] } } }), null);
  assert.equal(repoDe({}), null);
  const raros = ['https://github.com/orgs/gneuman/projects/3', 'https://github.com/settings/tokens', 'https://gist.github.com/gneuman/abc', 'https://api.github.com/repos/o/r'];
  assert.equal(repoDe({ attachments: { nodes: raros.map((url) => ({ url })) }, project: proyecto }), 'gneuman/postleads', 'lo que no es repo no tapa al del proyecto');
  assert.equal(repoDe({ attachments: { nodes: [{ url: 'https://GitHub.com/gneuman/X/tree/main?a=1#b' }] } }), 'gneuman/X');
});

test('textoDeIssue dice el repo, o que falta en Linear', () => {
  const base = { identifier: 'INT-1', title: 't', url: 'u', priority: 0, state: { name: 'Todo' }, labels: { nodes: [] } };
  assert.match(textoDeIssue({ ...base, attachments: { nodes: [{ url: 'https://github.com/gneuman/postleads/pull/9' }] } }), /- Repo: gneuman\/postleads \(https:\/\/github\.com\/gneuman\/postleads\)/);
  assert.match(textoDeIssue(base), /- Repo: no está en Linear/);
});
