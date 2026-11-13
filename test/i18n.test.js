import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, fijarIdioma, elegirIdioma, locale } from '../lib/i18n.js';
import { EN } from '../lib/i18n-en.js';
import { llaves } from '../scripts/llaves-i18n.mjs';

test('todo texto de la extensión tiene su inglés', () => {
  const faltan = llaves().filter((k) => EN[k] == null);
  assert.deepEqual(faltan, []);
});

test('el inglés conserva las mismas variables que el español', () => {
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  const distintas = Object.entries(EN).filter(([es, en]) => vars(es) !== vars(en)).map(([es]) => es);
  assert.deepEqual(distintas, []);
});

test('el inglés no trae guiones largos', () => {
  assert.deepEqual(Object.values(EN).filter((v) => /[—–]/.test(v)), []);
});

test('elegirIdioma: Ajustes manda; vacío = Chrome; Chrome en otro idioma = inglés', () => {
  assert.equal(elegirIdioma('en', 'es-MX'), 'en');
  assert.equal(elegirIdioma('es', 'en-US'), 'es');
  assert.equal(elegirIdioma('', 'es-419'), 'es');
  assert.equal(elegirIdioma('', 'en-GB'), 'en');
  assert.equal(elegirIdioma('', 'pt-BR'), 'en');
  assert.equal(elegirIdioma('', ''), 'en');
});

test('t traduce, rellena variables y cae al español si falta', () => {
  fijarIdioma('en');
  assert.equal(t('¿Mandar {id} a Claude?', { id: 'OP-1' }), 'Send OP-1 to Claude?');
  assert.equal(t('texto sin traducir {x}', { x: 1 }), 'texto sin traducir 1');
  assert.equal(locale(), 'en-US');
  fijarIdioma('es');
  assert.equal(t('¿Mandar {id} a Claude?', { id: 'OP-1' }), '¿Mandar OP-1 a Claude?');
  assert.equal(locale(), 'es-MX');
});
