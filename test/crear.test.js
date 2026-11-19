import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueDeSeleccion } from '../lib/linear.js';

test('issue desde selección: título corto, cita y liga', () => {
  const r = issueDeSeleccion({ texto: 'Arreglar  el\nbotón de pago', tituloPagina: 'Tienda', url: 'https://x.com' });
  assert.equal(r.title, 'Arreglar el botón de pago');
  assert.match(r.description, /^> Arreglar {2}el\n> botón de pago/);
  assert.match(r.description, /\[Tienda\]\(https:\/\/x\.com\)/);
});

test('sin selección usa el título de la página y corta a 80', () => {
  assert.equal(issueDeSeleccion({ tituloPagina: 'Hola', url: 'u' }).title, 'Hola');
  assert.equal(issueDeSeleccion({ texto: 'a'.repeat(200) }).title.length, 80);
});

test('palabrasDeBusqueda: sin signos ni repetidas, de 2+ letras, máximo 5', async () => {
  const { palabrasDeBusqueda } = await import('../lib/linear.js');
  assert.deepEqual(palabrasDeBusqueda('Cotizar  Loga, house!'), ['cotizar', 'loga', 'house']);
  assert.deepEqual(palabrasDeBusqueda('a b x'), []);
  assert.deepEqual(palabrasDeBusqueda('Página página de ventas'), ['página', 'de', 'ventas']);
  assert.equal(palabrasDeBusqueda('uno dos tres cuatro cinco seis').length, 5);
});
