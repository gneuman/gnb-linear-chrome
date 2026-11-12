import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comentar } from '../lib/linear.js';

test('comentar: manda el comentario a Linear con la llave', async () => {
  let pedido;
  globalThis.fetch = async (url, opts) => {
    pedido = { url, opts };
    return { ok: true, status: 200, json: async () => ({ data: { commentCreate: { success: true } } }) };
  };
  await comentar('lin_llave', 'abc', '  Revisado, va  ');
  const { variables } = JSON.parse(pedido.opts.body);
  assert.equal(pedido.opts.headers.Authorization, 'lin_llave');
  assert.deepEqual(variables, { input: { issueId: 'abc', body: 'Revisado, va' } });
});

test('comentar: vacío no llama a Linear', async () => {
  globalThis.fetch = async () => { throw new Error('no debió llamar'); };
  await assert.rejects(comentar('k', 'abc', '   '), /vacío/);
});

import { prepararLinear } from '../lib/linear.js';

test('prepararLinear: crea solo lo que falta, y los colores dentro del grupo riesgo', async () => {
  const creadas = [];
  globalThis.fetch = async (url, opts) => {
    const { query, variables } = JSON.parse(opts.body);
    if (query.includes('issueLabels')) {
      return { ok: true, json: async () => ({ data: { issueLabels: { nodes: [{ id: 'a', name: '🤖 listo-para-agente', team: null }, { id: 'v', name: 'verde', team: null }] } } }) };
    }
    creadas.push(variables.input);
    return { ok: true, json: async () => ({ data: { issueLabelCreate: { success: true, issueLabel: { id: `id-${variables.input.name}` } } } }) };
  };
  const r = await prepararLinear('k');
  assert.deepEqual(r, ['🔍 necesita-triage', '👤 listo-para-humano', '❓ necesita-info', 'riesgo', 'amarillo', 'rojo']);
  assert.equal(creadas.find((c) => c.name === 'riesgo').isGroup, true);
  assert.equal(creadas.find((c) => c.name === 'rojo').parentId, 'id-riesgo');
});

import { idDeIssue } from '../lib/linear.js';

test('idDeIssue: lee el ID de la liga o del texto', () => {
  assert.equal(idDeIssue('https://linear.app/gnb-labs/issue/CID-683/crear-la-landing'), 'CID-683');
  assert.equal(idDeIssue(' cid-683 '), 'CID-683');
  assert.equal(idDeIssue('hola'), null);
  assert.equal(idDeIssue('ver CID-683 mañana'), null, 'texto suelto no: solo el ID o la liga');
});

import { traerIssue } from '../lib/linear.js';

test('traerIssue: un ID que no existe da un mensaje claro', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ errors: [{ message: 'Entity not found: Issue' }] }) });
  await assert.rejects(traerIssue('k', 'CID-863'), /No existe CID-863 en tu Linear/);
});
