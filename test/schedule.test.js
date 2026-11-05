import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siguienteHora, parseRapido } from '../lib/schedule.js';

// Jueves 5 nov 2026, 8:00 hora local.
const jueves8 = new Date(2026, 10, 5, 8, 0, 0);

test('10:00 a las 8am cae hoy', () => {
  const d = new Date(siguienteHora('10:00', 'no', jueves8));
  assert.equal(d.getDate(), 5);
  assert.equal(d.getHours(), 10);
});

test('una hora que ya pasó cae mañana', () => {
  const d = new Date(siguienteHora('07:30', 'no', jueves8));
  assert.equal(d.getDate(), 6);
});

test('laborables salta el fin de semana', () => {
  const viernesTarde = new Date(2026, 10, 6, 18, 0, 0);
  const d = new Date(siguienteHora('09:00', 'laborables', viernesTarde));
  assert.equal(d.getDay(), 1);
  assert.equal(d.getDate(), 9);
});

test('parse: 10am, 4:30pm, a las 9, recuérdame', () => {
  assert.deepEqual(parseRapido('10am revisar propuesta'), { texto: 'revisar propuesta', hhmm: '10:00' });
  assert.deepEqual(parseRapido('4:30 pm llamar a David'), { texto: 'llamar a David', hhmm: '16:30' });
  assert.deepEqual(parseRapido('recuérdame a las 9 pagar'), { texto: 'pagar', hhmm: '09:00' });
  assert.deepEqual(parseRapido('12am backup'), { texto: 'backup', hhmm: '00:00' });
  assert.deepEqual(parseRapido('16:45 cerrar sesión'), { texto: 'cerrar sesión', hhmm: '16:45' });
});

test('parse: relativo en minutos y horas', () => {
  assert.equal(parseRapido('en 30 min mandar correo', jueves8).at, jueves8.getTime() + 30 * 60000);
  assert.equal(parseRapido('en 2 h revisar PR', jueves8).at, jueves8.getTime() + 120 * 60000);
});

test('parse: sin hora devuelve null', () => {
  assert.equal(parseRapido('revisar propuesta'), null);
  assert.equal(parseRapido('10 cosas que hacer'), null);
  assert.equal(parseRapido('25:00 algo'), null);
});
