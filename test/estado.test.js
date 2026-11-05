import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevos, clasificar, puedeIrAAgente, labelsParaAgente, riesgo, resumen, LABEL } from '../lib/estado.js';

const lab = (id, name = id) => ({ id, name });
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

test('a agente solo con brief y riesgo', () => {
  assert.deepEqual(puedeIrAAgente(issue('X')).falta, ['brief', 'riesgo']);
  const listo = issue('Y', { labels: { nodes: [lab(LABEL.brief), lab('r', 'riesgo: verde'), lab(LABEL.humano)] } });
  assert.equal(puedeIrAAgente(listo).ok, true);
  assert.equal(riesgo(listo), 'verde');
  assert.deepEqual(labelsParaAgente(listo), [LABEL.brief, 'r', LABEL.agente], 'quita el estado viejo, conserva lo demás');
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
