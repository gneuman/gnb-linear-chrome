import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevos, clasificar, labelsParaAgente, riesgo, resumen, talla, estadisticas, LABEL, RIESGO } from '../lib/estado.js';

const lab = (id, name = id) => ({ id, name });
const IDS = { [LABEL.agente]: 'id-agente', [RIESGO.verde]: 'id-verde', [RIESGO.amarillo]: 'id-amarillo', [RIESGO.rojo]: 'id-rojo' };
const issue = (id, extra = {}) => ({
  id, identifier: id, title: id, priority: 0, team: { key: 'OP' },
  state: { type: 'unstarted', name: 'Todo' }, labels: { nodes: [] }, ...extra,
});

test('agrupa: ahora, agente, info, esperando, después y sin triage', () => {
  const issues = [
    issue('OP-1', { labels: { nodes: [lab(LABEL.humano)] }, priority: 3 }),
    issue('OP-2', { state: { type: 'started', name: 'In Progress' }, priority: 4 }),
    issue('OP-3', { labels: { nodes: [lab(LABEL.agente)] } }),
    issue('OP-4', { labels: { nodes: [lab(LABEL.info)] }, updatedAt: '2026-11-01T00:00:00Z' }),
    issue('OP-5'),
    issue('OP-6', { state: { type: 'started', name: 'External Review' }, labels: { nodes: [lab(LABEL.agente)] } }),
    issue('OP-7', { state: { type: 'started', name: 'External Block' } }),
    issue('OP-8', { state: { type: 'backlog', name: 'Backlog' }, labels: { nodes: [lab(LABEL.humano)] } }),
    issue('OP-9', { state: { type: 'duplicate', name: 'Duplicate' } }),
  ];
  const g = clasificar(issues, { ahora: Date.parse('2026-11-05T00:00:00Z') });
  const ids = (l) => l.map((i) => i.id);
  assert.deepEqual(ids(g.ahora), ['OP-2', 'OP-1']);
  assert.equal(g.siguiente.id, 'OP-2', 'lo que ya empezaste va primero');
  assert.deepEqual(ids(g.agente), ['OP-3']);
  assert.deepEqual(ids(g.info), ['OP-4']);
  assert.equal(g.info[0].dias, 4);
  assert.deepEqual(ids(g.esperando).sort(), ['OP-6', 'OP-7'], 'review y block no son para hoy');
  assert.deepEqual(ids(g.despues), ['OP-8']);
  assert.deepEqual(ids(g.sinTriage), ['OP-5']);
});

test('ordena por prioridad, sin prioridad al final, luego fecha', () => {
  const h = [lab(LABEL.humano)];
  const g = clasificar([
    issue('A', { labels: { nodes: h }, priority: 0 }),
    issue('B', { labels: { nodes: h }, priority: 2, dueDate: '2026-11-20' }),
    issue('C', { labels: { nodes: h }, priority: 2, dueDate: '2026-11-10' }),
    issue('D', { labels: { nodes: h }, priority: 1 }),
  ]);
  assert.deepEqual(g.ahora.map((i) => i.id), ['D', 'C', 'B', 'A']);
});

test('filtra por equipo', () => {
  const g = clasificar([issue('OP-1', { labels: { nodes: [lab(LABEL.humano)] } }), issue('INT-1', { team: { key: 'INT' }, labels: { nodes: [lab(LABEL.humano)] } })], { equipos: ['int'] });
  assert.deepEqual(g.ahora.map((i) => i.id), ['INT-1']);
});

test('a agente: quita el label de estado, pone 🤖 y no toca lo demás', () => {
  const conRiesgo = issue('Y', { labels: { nodes: [lab('r', 'riesgo: verde'), lab(LABEL.humano), lab(LABEL.info), lab('otro')] } });
  assert.equal(riesgo(conRiesgo), 'verde');
  assert.deepEqual(labelsParaAgente(conRiesgo, null, IDS), { addedLabelIds: ['id-agente'], removedLabelIds: [LABEL.humano, LABEL.info] });
  const yaEnAgente = issue('Y2', { labels: { nodes: [lab('r', 'riesgo: verde'), lab(LABEL.agente)] } });
  assert.deepEqual(labelsParaAgente(yaEnAgente, null, IDS), { addedLabelIds: [], removedLabelIds: [] }, 'delegar uno que ya tiene 🤖 no cambia labels');
});

test('a agente sin brief: basta el riesgo, y si falta se agrega el color elegido', () => {
  const sinNada = issue('X', { labels: { nodes: [lab(LABEL.humano)] } });
  assert.throws(() => labelsParaAgente(sinNada, null, IDS), /riesgo/, 'sin riesgo ni color elegido no se mueve');
  assert.deepEqual(labelsParaAgente(sinNada, 'amarillo', IDS), { addedLabelIds: ['id-agente', 'id-amarillo'], removedLabelIds: [LABEL.humano] });
  const yaTiene = issue('W', { labels: { nodes: [{ id: 'v', name: 'verde', parent: { name: 'riesgo' } }] } });
  assert.deepEqual(labelsParaAgente(yaTiene, 'rojo', IDS).addedLabelIds, ['id-agente'], 'no le pone un segundo color');
});

test('las etiquetas se reconocen por nombre: sirve en cualquier workspace', () => {
  const g = clasificar([issue('Z', { labels: { nodes: [{ id: 'otro-id', name: '👤 LISTO-para-humano ' }] } })]);
  assert.equal(g.ahora.length, 1);
  const sinEtiqueta = issue('X', { labels: { nodes: [lab(LABEL.humano)] } });
  assert.throws(() => labelsParaAgente(sinEtiqueta, 'verde', {}), /Preparar mi Linear/, 'si el workspace no tiene la etiqueta, dice cómo crearla');
});

test('delegado a un agente va a Para agente aunque esté In Progress, salvo en review', () => {
  const ag = { id: 'ag', name: 'Linear' };
  const g = clasificar([
    issue('D1', { delegate: ag, state: { type: 'started', name: 'In Progress' } }),
    issue('D2', { delegate: ag, labels: { nodes: [lab(LABEL.humano)] } }),
    issue('D3', { delegate: ag, state: { type: 'started', name: 'In Review' } }),
  ]);
  assert.deepEqual(g.agente.map((i) => i.id), ['D1', 'D2']);
  assert.deepEqual(g.esperando.map((i) => i.id), ['D3']);
  assert.equal(g.siguiente, null, 'lo que trabaja el agente no sale como "Lo siguiente"');
});

test('talla: la estimación tShirt de Linear', () => {
  assert.deepEqual([1, 2, 3, 5, 8].map((estimate) => talla({ estimate })), ['XS', 'S', 'M', 'L', 'XL']);
  assert.equal(talla({ estimate: null }), null);
  assert.equal(talla({}), null);
  assert.equal(talla({ estimate: 4 }), '4', 'un valor fuera de la escala se ve tal cual');
});

test('resumen saca el Listo cuando', () => {
  const r = resumen('## Qué\nArreglar el **checkout** de [Stripe](http://x).\n\nListo cuando:\nel pago crea la fila en purchases');
  assert.equal(r.texto, 'Qué Arreglar el checkout de Stripe.');
  assert.equal(r.listoCuando, 'el pago crea la fila en purchases');
  assert.equal(resumen('Listo cuando: pasa el test').listoCuando, 'pasa el test');
});

test('nuevos: avisa solo lo que no estaba, nunca en la primera revisión', () => {
  const issues = [issue('OP-1'), issue('OP-2'), issue('OP-3')];
  assert.deepEqual(nuevos(undefined, issues), [], 'primera vez: no avisa 150 issues de golpe');
  assert.deepEqual(nuevos(['OP-1', 'OP-2'], issues).map((i) => i.id), ['OP-3']);
  assert.deepEqual(nuevos(['OP-1', 'OP-2', 'OP-3', 'OP-9'], issues), [], 'uno que se cerró no avisa');
});

test('riesgo: el label de color dentro del grupo riesgo, como está en Linear', () => {
  const conGrupo = issue('Z', { labels: { nodes: [{ id: 'v', name: 'verde', parent: { name: 'riesgo' } }] } });
  assert.equal(riesgo(conGrupo), 'verde');
  assert.equal(riesgo(issue('Z2', { labels: { nodes: [{ id: 'r', name: 'Rojo' }] } })), 'rojo', 'el color solo, sin grupo');
  assert.equal(riesgo(issue('Z3', { labels: { nodes: [{ id: 'x', name: 'verde-limón', parent: { name: 'marca' } }] } })), null);
});

test('resumen saca también el "Done when" en inglés', () => {
  const r = resumen('Fix the checkout.\nDone when: the payment creates the row');
  assert.equal(r.listoCuando, 'the payment creates the row');
  assert.equal(r.texto, 'Fix the checkout.');
});

test('estadisticas: abiertos, en curso, urgentes, vencidos, quietos y para agente', () => {
  const ahora = new Date(2026, 10, 13, 9, 0, 0).getTime();
  const hace = (d) => new Date(ahora - d * 864e5).toISOString();
  const i = (o) => ({ id: Math.random(), team: { key: 'OP' }, labels: { nodes: (o.labels || []).map((name) => ({ name })) }, updatedAt: hace(o.dias ?? 0), state: { type: o.tipo || 'unstarted', name: o.estado || 'Todo' }, priority: o.p ?? 3, dueDate: o.vence || null });
  const issues = [
    i({ tipo: 'started', estado: 'In Progress', p: 1, vence: '2026-11-12' }),
    i({ tipo: 'started', estado: 'In Review', dias: 5 }),
    i({ labels: [LABEL.agente] }),
    i({ labels: [LABEL.humano], vence: '2026-11-13' }),
    i({ tipo: 'completed', estado: 'Done', p: 1 }),
  ];
  assert.deepEqual(estadisticas(issues, { ahora }), { abiertos: 4, enCurso: 1, urgentes: 1, vencidos: 1, quietos: 1, agente: 1 });
});

import { enProyectoActivo } from '../lib/estado.js';
test('enProyectoActivo: solo proyectos In Progress; sin proyecto sí sale', () => {
  assert.equal(enProyectoActivo({ project: { status: { type: 'started' } } }), true);
  assert.equal(enProyectoActivo({ project: { status: { type: 'planned' } } }), false);
  assert.equal(enProyectoActivo({ project: { status: { type: 'paused' } } }), false);
  assert.equal(enProyectoActivo({ project: { status: { type: 'backlog' } } }), false);
  assert.equal(enProyectoActivo({ project: { status: { type: 'completed' } } }), false);
  assert.equal(enProyectoActivo({ project: null }), true);
  assert.equal(enProyectoActivo({ project: { id: 'x' } }), true);
});
