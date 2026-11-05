import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasificar, puedeIrAAgente, labelsParaAgente, riesgo, resumen, LABEL } from '../lib/estado.js';

const lab = (id, name = id) => ({ id, name });
const issue = (id, extra = {}) => ({
  id, identifier: id, title: id, priority: 0, team: { key: 'OP' },
  state: { type: 'unstarted', name: 'Todo' }, labels: { nodes: [] }, ...extra,
});

test('agrupa en tuyos, agente y atorados', () => {
  const issues = [
    issue('OP-1', { labels: { nodes: [lab(LABEL.humano)] }, priority: 3 }),
    issue('OP-2', { state: { type: 'started', name: 'In Progress' }, priority: 4 }),
    issue('OP-3', { labels: { nodes: [lab(LABEL.agente)] } }),
    issue('OP-4', { labels: { nodes: [lab(LABEL.info)] }, updatedAt: '2026-11-01T00:00:00Z' }),
    issue('OP-5'),
  ];
  const g = clasificar(issues, { ahora: Date.parse('2026-11-05T00:00:00Z') });
  assert.deepEqual(g.tuyos.map((i) => i.id), ['OP-2', 'OP-1']);
  assert.equal(g.siguiente.id, 'OP-2', 'lo que ya empezaste va primero');
  assert.deepEqual(g.agente.map((i) => i.id), ['OP-3']);
  assert.deepEqual(g.atorados.map((i) => [i.id, i.motivo]), [['OP-4', 'necesita info'], ['OP-5', 'necesita triage']]);
  assert.equal(g.atorados[0].dias, 4);
});

test('ordena por prioridad, sin prioridad al final, luego fecha', () => {
  const h = [lab(LABEL.humano)];
  const g = clasificar([
    issue('A', { labels: { nodes: h }, priority: 0 }),
    issue('B', { labels: { nodes: h }, priority: 2, dueDate: '2026-11-20' }),
    issue('C', { labels: { nodes: h }, priority: 2, dueDate: '2026-11-10' }),
    issue('D', { labels: { nodes: h }, priority: 1 }),
  ]);
  assert.deepEqual(g.tuyos.map((i) => i.id), ['D', 'C', 'B', 'A']);
});

test('filtra por equipo', () => {
  const g = clasificar([issue('OP-1', { labels: { nodes: [lab(LABEL.humano)] } }), issue('INT-1', { team: { key: 'INT' }, labels: { nodes: [lab(LABEL.humano)] } })], { equipos: ['int'] });
  assert.deepEqual(g.tuyos.map((i) => i.id), ['INT-1']);
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
