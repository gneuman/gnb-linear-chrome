import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listoParaClaude, repoParaClaude, dispararTaskAI, RUTINA } from '../lib/taskai.js';
import { LABEL, RIESGO } from '../lib/estado.js';

const listo = (extra = {}) => ({
  identifier: 'INT-1',
  labels: { nodes: [{ id: LABEL.agente, name: '🤖 listo-para-agente' }, { id: RIESGO.verde, name: 'verde' }] },
  description: 'Hacer X en gneuman/gnb-meta.\n\n## Listo cuando\n- [ ] pasa',
  ...extra,
});

test('listoParaClaude: el caso completo está listo', () => {
  const r = listoParaClaude(listo());
  assert.deepEqual(r, { listo: true, falta: [], repo: 'gneuman/gnb-meta' });
});

test('listoParaClaude: amarillo también entra', () => {
  const r = listoParaClaude(listo({ labels: { nodes: [{ id: LABEL.agente }, { id: RIESGO.amarillo, name: 'amarillo' }] } }));
  assert.equal(r.listo, true);
});

test('listoParaClaude: dice qué falta en cada caso', () => {
  const sinAgente = listoParaClaude(listo({ labels: { nodes: [{ id: RIESGO.verde, name: 'verde' }] } }));
  assert.deepEqual(sinAgente.falta, ['🤖 listo-para-agente']);

  const sinRiesgo = listoParaClaude(listo({ labels: { nodes: [{ id: LABEL.agente }] } }));
  assert.deepEqual(sinRiesgo.falta, ['riesgo']);

  const rojo = listoParaClaude(listo({ labels: { nodes: [{ id: LABEL.agente }, { id: RIESGO.rojo, name: 'rojo' }] } }));
  assert.deepEqual(rojo.falta, ['riesgo verde o amarillo (es rojo)']);

  const sinRepo = listoParaClaude(listo({ description: 'Listo cuando: pasa' }));
  assert.deepEqual(sinRepo.falta, ['repo']);

  const dosRepos = listoParaClaude(listo({ description: 'gneuman/a y gneuman/b. Listo cuando: pasa' }));
  assert.deepEqual(dosRepos.falta, ['un solo repo (trae varios)']);

  const sinListo = listoParaClaude(listo({ description: 'en gneuman/gnb-meta' }));
  assert.deepEqual(sinListo.falta, ['"Listo cuando"']);
});

test('repoParaClaude: lo ligado en Linear gana al texto', () => {
  const issue = { attachments: { nodes: [{ url: 'https://github.com/gneuman/postleads/pull/1' }] }, description: 'ver gneuman/otro' };
  assert.deepEqual(repoParaClaude(issue), { repo: 'gneuman/postleads', varios: false });
  assert.deepEqual(repoParaClaude({ description: '`gneuman/gnb-meta`, otra vez gneuman/gnb-meta.' }), { repo: 'gneuman/gnb-meta', varios: false });
});

test('dispararTaskAI: manda el issue a la tarea y regresa la liga de la sesión', async () => {
  let pedido;
  const pedir = async (url, opts) => {
    pedido = { url, opts };
    return { ok: true, status: 200, text: async () => JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/x' }) };
  };
  const r = await dispararTaskAI({ token: 'sk-secreto', issueId: 'INT-7', pedir });
  assert.deepEqual(r, { status: 200, url: 'https://claude.ai/code/x' });
  assert.equal(pedido.url, `https://api.anthropic.com/v1/claude_code/routines/${RUTINA}/fire`);
  assert.equal(pedido.opts.headers.Authorization, 'Bearer sk-secreto');
  assert.equal(pedido.opts.headers['anthropic-beta'], 'experimental-cc-routine-2026-04-01');
  assert.deepEqual(JSON.parse(pedido.opts.body), { text: 'issue: INT-7' });
});

test('dispararTaskAI: si falla, enseña código y cuerpo sin el token', async () => {
  const pedir = async () => ({ ok: false, status: 401, text: async () => 'token sk-secreto inválido' });
  await assert.rejects(
    dispararTaskAI({ token: 'sk-secreto', issueId: 'INT-7', pedir }),
    (e) => e.message.includes('401') && e.message.includes('[token]') && !e.message.includes('sk-secreto'),
  );
});

test('dispararTaskAI: sin token o con ID raro no llama a nadie', async () => {
  const pedir = async () => { throw new Error('no debió llamar'); };
  await assert.rejects(dispararTaskAI({ token: '', issueId: 'INT-7', pedir }), /Falta el token/);
  await assert.rejects(dispararTaskAI({ token: 't', rutina: 'otra', issueId: 'INT-7', pedir }), /trig_/);
});
