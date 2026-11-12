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
