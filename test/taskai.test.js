import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listoParaClaude, repoParaClaude, dispararTaskAI, mandadoHacePoco, ESPERA_REENVIO } from '../lib/taskai.js';
import { LABEL, RIESGO } from '../lib/estado.js';

const RUTINA = 'trig_01Prueba';
const D = 'gneuman';

const listo = (extra = {}) => ({
  identifier: 'INT-1',
  labels: { nodes: [{ name: LABEL.agente }, { name: RIESGO.verde }] },
  description: 'Hacer X en gneuman/gnb-meta.\n\n## Listo cuando\n- [ ] pasa',
  ...extra,
});

test('listoParaClaude: el caso completo está listo', () => {
  const r = listoParaClaude(listo(), D);
  assert.deepEqual(r, { listo: true, falta: [], repo: 'gneuman/gnb-meta' });
});

test('listoParaClaude: amarillo también entra', () => {
  const r = listoParaClaude(listo({ labels: { nodes: [{ name: LABEL.agente }, { name: RIESGO.amarillo }] } }), D);
  assert.equal(r.listo, true);
});

test('listoParaClaude: dice qué falta en cada caso', () => {
  const sinAgente = listoParaClaude(listo({ labels: { nodes: [{ name: RIESGO.verde }] } }), D);
  assert.deepEqual(sinAgente.falta, [LABEL.agente]);

  const sinRiesgo = listoParaClaude(listo({ labels: { nodes: [{ name: LABEL.agente }] } }), D);
  assert.deepEqual(sinRiesgo.falta, ['riesgo']);

  const rojo = listoParaClaude(listo({ labels: { nodes: [{ name: LABEL.agente }, { name: RIESGO.rojo }] } }), D);
  assert.deepEqual(rojo.falta, ['riesgo verde o amarillo (es rojo)']);

  const sinRepo = listoParaClaude(listo({ description: 'Listo cuando: pasa' }), D);
  assert.deepEqual(sinRepo.falta, ['repo']);

  const dosRepos = listoParaClaude(listo({ description: 'gneuman/a y gneuman/b.\nListo cuando: pasa' }), D);
  assert.deepEqual(dosRepos.falta, ['un solo repo (trae varios)']);

  const sinListo = listoParaClaude(listo({ description: 'en gneuman/gnb-meta' }), D);
  assert.deepEqual(sinListo.falta, ['"Listo cuando"']);
});

test('repoParaClaude: lo ligado en Linear gana al texto', () => {
  const issue = { attachments: { nodes: [{ url: 'https://github.com/gneuman/postleads/pull/1' }] }, description: 'ver gneuman/otro' };
  assert.deepEqual(repoParaClaude(issue, D), { repo: 'gneuman/postleads', varios: false });
  assert.deepEqual(repoParaClaude({ description: '`gneuman/gnb-meta`, otra vez gneuman/gnb-meta.' }, D), { repo: 'gneuman/gnb-meta', varios: false });
});

test('dispararTaskAI: manda el issue a la tarea y regresa la liga de la sesión', async () => {
  let pedido;
  const pedir = async (url, opts) => {
    pedido = { url, opts };
    return { ok: true, status: 200, text: async () => JSON.stringify({ claude_code_session_url: 'https://claude.ai/code/x' }) };
  };
  const r = await dispararTaskAI({ token: 'sk-secreto', rutina: RUTINA, issueId: 'INT-7', pedir });
  assert.deepEqual(r, { status: 200, url: 'https://claude.ai/code/x' });
  assert.equal(pedido.url, `https://api.anthropic.com/v1/claude_code/routines/${RUTINA}/fire`);
  assert.equal(pedido.opts.headers.Authorization, 'Bearer sk-secreto');
  assert.equal(pedido.opts.headers['anthropic-beta'], 'experimental-cc-routine-2026-04-01');
  assert.deepEqual(JSON.parse(pedido.opts.body), { text: 'issue: INT-7' });
});

test('dispararTaskAI: si falla, enseña código y cuerpo sin el token', async () => {
  const pedir = async () => ({ ok: false, status: 401, text: async () => 'token sk-secreto inválido' });
  await assert.rejects(
    dispararTaskAI({ token: 'sk-secreto', rutina: RUTINA, issueId: 'INT-7', pedir }),
    (e) => e.message.includes('401') && e.message.includes('[token]') && !e.message.includes('sk-secreto'),
  );
});

test('dispararTaskAI: sin token o con ID raro no llama a nadie', async () => {
  const pedir = async () => { throw new Error('no debió llamar'); };
  await assert.rejects(dispararTaskAI({ token: '', issueId: 'INT-7', pedir }), /Falta el token/);
  await assert.rejects(dispararTaskAI({ token: 't', rutina: 'otra', issueId: 'INT-7', pedir }), /trig_/);
});

test('repoParaClaude: una rama de Linear no es repo', () => {
  assert.deepEqual(repoParaClaude({ description: 'Rama: gneuman/int-2019-agregar-botones' }, D), { repo: null, varios: false });
  assert.deepEqual(repoParaClaude({ description: 'Rama gneuman/int-2019-x en gneuman/gnb-meta' }, D), { repo: 'gneuman/gnb-meta', varios: false });
  assert.deepEqual(repoParaClaude({ branchName: 'gneuman/fix-algo', description: 'gneuman/fix-algo en gneuman/postleads' }, D), { repo: 'gneuman/postleads', varios: false });
});

test('listoParaClaude: "Listo cuando" a media frase no cuenta', () => {
  assert.deepEqual(listoParaClaude(listo({ description: 'gneuman/gnb-meta, todavía sin listo cuando' }), D).falta, ['"Listo cuando"']);
  assert.equal(listoParaClaude(listo({ description: 'gneuman/gnb-meta\n**Listo cuando:** pasa' }), D).listo, true);
});

test('dispararTaskAI: una liga que no es de claude.ai no se enseña', async () => {
  const pedir = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ claude_code_session_url: 'javascript:alert(1)' }) });
  assert.equal((await dispararTaskAI({ token: 't', rutina: RUTINA, issueId: 'INT-7', pedir })).url, null);
});

test('mandadoHacePoco: pregunta antes de mandar dos veces el mismo issue', () => {
  const ahora = 1_000_000_000;
  assert.equal(mandadoHacePoco({ 'INT-7': ahora - 60_000 }, 'INT-7', ahora), true);
  assert.equal(mandadoHacePoco({ 'INT-7': ahora - ESPERA_REENVIO - 1 }, 'INT-7', ahora), false);
  assert.equal(mandadoHacePoco({}, 'INT-7', ahora), false);
});

import { leerResultado, seguimiento } from '../lib/taskai.js';

test('leerResultado: formato de tres líneas', () => {
  const r = leerResultado('TaskAI · ⏭ Ya estaba hecho (PR #118)\n👉 Te toca: Pásalo a Done\n🔗 https://github.com/gneuman/gnb-meta/pull/118\n\nDetalle…');
  assert.deepEqual(r, { emoji: '⏭', resultado: 'Ya estaba hecho (PR #118)', teToca: 'Pásalo a Done', liga: 'https://github.com/gneuman/gnb-meta/pull/118' });
});

test('leerResultado: formato viejo y comentarios ajenos', () => {
  const r = leerResultado('TaskAI: PR listo https://github.com/gneuman/x/pull/3 pasa en todo');
  assert.equal(r.emoji, '💬');
  assert.equal(r.liga, 'https://github.com/gneuman/x/pull/3');
  assert.equal(leerResultado('Boti: lo reviso'), null);
});

test('seguimiento: trabajando, resultado o sin respuesta', () => {
  const enviado = Date.parse('2026-11-12T15:00:00Z');
  const sinNada = { comments: { nodes: [{ body: 'TaskAI · ✅ viejo', createdAt: '2026-11-10T00:00:00Z' }] } };
  assert.equal(seguimiento(sinNada, enviado, enviado + 60_000).emoji, '⏳', 'un comentario de antes del envío no cuenta');
  assert.equal(seguimiento(sinNada, enviado, enviado + 3 * 3600_000).emoji, '⚠️');
  const listo = { comments: { nodes: [{ body: 'TaskAI · ✅ PR listo\n👉 Te toca: Revisa y fusiona\n🔗 https://github.com/a/b/pull/1', createdAt: '2026-11-12T15:20:00Z' }] } };
  assert.equal(seguimiento(listo, enviado).teToca, 'Revisa y fusiona');
});

import { prsDe } from '../lib/taskai.js';

test('prsDe: los PR ligados en Linear, con estado si viene', () => {
  const issue = { attachments: { nodes: [
    { url: 'https://github.com/gneuman/gnb-meta/pull/118', title: 'actualizar: organigrama', metadata: { status: 'merged' } },
    { url: 'https://github.com/gneuman/x/pull/3' },
    { url: 'https://figma.com/a' },
  ] } };
  assert.deepEqual(prsDe(issue), [
    { repo: 'gneuman/gnb-meta', numero: 118, url: 'https://github.com/gneuman/gnb-meta/pull/118', titulo: 'actualizar: organigrama', estado: 'fusionado' },
    { repo: 'gneuman/x', numero: 3, url: 'https://github.com/gneuman/x/pull/3', titulo: '', estado: null },
  ]);
});

test('repoParaClaude: sin dueño en Ajustes solo cuenta lo ligado en Linear', () => {
  assert.deepEqual(repoParaClaude({ description: 'en gneuman/gnb-meta' }), { repo: null, varios: false });
  assert.deepEqual(repoParaClaude({ description: 'en otra-org/app y github.com/otra-org/app' }, 'otra-org'), { repo: 'otra-org/app', varios: false });
  assert.deepEqual(repoParaClaude({ description: 'en gneuman/gnb-meta' }, 'otra-org'), { repo: null, varios: false });
});

test('listoParaClaude: "Done when" también cuenta', () => {
  assert.equal(listoParaClaude(listo({ description: 'gneuman/gnb-meta\n## Done when\n- it passes' }), D).listo, true);
});

test('dispararTaskAI: sin ID de tarea no llama a nadie', async () => {
  const pedir = async () => { throw new Error('no debió llamar'); };
  await assert.rejects(dispararTaskAI({ token: 't', issueId: 'INT-7', pedir }), /ID de la rutina/);
});
