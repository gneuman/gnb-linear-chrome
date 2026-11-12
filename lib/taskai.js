// TaskAI: la tarea de Claude que hace un issue y deja el PR a revisión (INT-2019).
// Aquí vive la regla de "listo para mandarlo" y el disparo. Sin dependencias de Chrome.
import { LABEL, riesgo } from './estado.js';
import { repoDe } from './consultas.js';

/** Tarea por omisión: "TaskAI" en claude.ai/code/routines. Se cambia en Ajustes. */
export const RUTINA = 'trig_01Ex4CeLCbW8p7K5dNVnSh4G';

const BASE = 'https://api.anthropic.com/v1/claude_code/routines';
// "Listo cuando" como título o inicio de línea (## Listo cuando, **Listo cuando:**), no a media frase.
const LISTO_CUANDO = /^[\s#>*_-]*listo cuando\b/im;
const REPO_EN_TEXTO = /\bgneuman\/([\w.-]*[\w-])/gi;

/**
 * Repo del issue para TaskAI: lo que Linear tiene ligado (repoDe) o, si no,
 * el único `gneuman/<repo>` escrito en la descripción. Dos repos distintos en
 * el texto = `varios`: un issue, un repo (decisiones.md, INT-1939).
 */
export function repoParaClaude(issue) {
  const ligado = repoDe(issue);
  if (ligado) return { repo: ligado, varios: false };
  // Las ramas de Linear se ven igual (gneuman/int-2019-slug): esas no son repo.
  const rama = (issue.branchName || '').toLowerCase();
  const enTexto = new Set([...(issue.description || '').matchAll(REPO_EN_TEXTO)]
    .map((m) => `gneuman/${m[1].replace(/\.git$/i, '')}`.toLowerCase())
    .filter((r) => r !== rama && !/^gneuman\/[a-z]+-\d+(-|$)/.test(r)));
  if (enTexto.size === 1) return { repo: [...enTexto][0], varios: false };
  return { repo: null, varios: enTexto.size > 1 };
}

/**
 * ¿Se puede mandar a TaskAI? Las mismas cuatro condiciones que revisa la tarea,
 * para que el botón no dispare algo que la tarea va a regresar.
 * Rojo nunca: solo Gabriel lo fusiona y la tarea no lo toma.
 */
export function listoParaClaude(issue) {
  const falta = [];
  const labels = (issue.labels?.nodes || []).map((l) => l.id);
  if (!labels.includes(LABEL.agente)) falta.push('🤖 listo-para-agente');
  const color = riesgo(issue);
  if (!color) falta.push('riesgo');
  else if (color === 'rojo') falta.push('riesgo verde o amarillo (es rojo)');
  const { repo, varios } = repoParaClaude(issue);
  if (!repo) falta.push(varios ? 'un solo repo (trae varios)' : 'repo');
  if (!LISTO_CUANDO.test(issue.description || '')) falta.push('"Listo cuando"');
  return { listo: falta.length === 0, falta, repo };
}

/**
 * Dispara TaskAI con el ID del issue. Regresa `{ status, url }`; si falla, lanza
 * un error con el código y el cuerpo, nunca con el token.
 * `pedir` es `fetch` (se inyecta en las pruebas).
 */
// La primera TaskAI se creó dentro de un proyecto de Claude y la API la rechaza
// ("this project is paused"); quien la tenga guardada pasa sola a la nueva.
const RUTINA_VIEJA = 'trig_01SWHeRdh6jxZ4MdUMJuk1Bq';

export async function dispararTaskAI({ token, rutina = RUTINA, issueId, pedir = fetch }) {
  if (!rutina || rutina === RUTINA_VIEJA) rutina = RUTINA;
  if (!token) throw new Error('Falta el token de TaskAI (Ajustes).');
  if (!/^trig_[\w]+$/.test(rutina || '')) throw new Error('El ID de la tarea en Ajustes no se ve bien (empieza con trig_).');
  const res = await pedir(`${BASE}/${rutina}/fire`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'anthropic-version': '2023-06-01',
      // La petición sale del navegador: sin esto la API la rechaza por CORS.
      'anthropic-dangerous-direct-browser-access': 'true',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: `issue: ${issueId}` }),
  });
  const cuerpo = await res.text();
  if (!res.ok) throw new Error(`TaskAI respondió ${res.status}: ${limpiar(cuerpo, token).slice(0, 300)}`);
  let json = {};
  try { json = JSON.parse(cuerpo); } catch { /* sin JSON: va sin liga */ }
  // La liga se pinta en el popup: solo se acepta si es de claude.ai.
  const url = typeof json.claude_code_session_url === 'string' && json.claude_code_session_url.startsWith('https://claude.ai/') ? json.claude_code_session_url : null;
  return { status: res.status, url };
}

/** Quita el token si la respuesta lo repite. */
function limpiar(texto, token) {
  return token ? texto.split(token).join('[token]') : texto;
}

/** Ventana en la que un issue ya mandado no se vuelve a mandar sin preguntar. */
export const ESPERA_REENVIO = 30 * 60 * 1000;

/** ¿Se mandó hace poco? `enviados` = { [identifier]: timestamp }. */
export function mandadoHacePoco(enviados, issueId, ahora = Date.now()) {
  const t = enviados?.[issueId];
  return typeof t === 'number' && ahora - t < ESPERA_REENVIO;
}

/**
 * Lee el comentario de cierre de TaskAI. El formato nuevo son tres líneas:
 *   TaskAI · ✅ PR listo
 *   👉 Te toca: Revisa y fusiona el PR …
 *   🔗 https://github.com/…
 * El formato viejo ("TaskAI: …" o "Claudita: …") se lee como resultado sin "te toca".
 * Regresa null si el comentario no es de TaskAI.
 */
export function leerResultado(body = '') {
  const lineas = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const primera = lineas[0] || '';
  const m = /^\**(TaskAI|Claudita)\**\s*[·:]\s*(.*)$/i.exec(primera);
  if (!m) return null;
  const linea = (re) => lineas.find((l) => re.test(l))?.replace(re, '').trim() || null;
  const resultado = m[2].trim();
  const emoji = ['✅', '⏭', '⛔', '❌'].find((e) => resultado.startsWith(e)) || '💬';
  const teToca = linea(/^👉\s*Te toca:\s*/i);
  const ligaLinea = linea(/^🔗\s*/);
  const liga = (ligaLinea?.match(/https?:\/\/\S+/) || body.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/) || [null])[0];
  return { emoji, resultado: resultado.replace(/^(✅|⏭|⛔|❌)\s*/, ''), teToca, liga };
}

/**
 * Cómo va cada issue mandado a TaskAI: el último comentario de TaskAI que sea
 * posterior al envío. Sin comentario todavía = "trabajando" (o "sin respuesta"
 * si ya pasaron más de 2 horas: probablemente falló sin avisar).
 */
export function seguimiento(issue, enviadoAt = null, ahora = Date.now()) {
  const desde = enviadoAt ? enviadoAt - 60_000 : 0;
  const comentarios = (issue.comments?.nodes || [])
    .filter((c) => Date.parse(c.createdAt) >= desde)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const c of comentarios) {
    const r = leerResultado(c.body);
    if (r) return { ...r, cuando: c.createdAt };
  }
  const tarde = enviadoAt && ahora - enviadoAt > 2 * 60 * 60 * 1000;
  return { emoji: tarde ? '⚠️' : '⏳', resultado: tarde ? 'Sin respuesta de TaskAI en más de 2 horas' : 'TaskAI está trabajando', teToca: tarde ? 'Revisa la sesión en claude.ai/code' : null, liga: null, cuando: null };
}

const PR = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/i;
const ESTADOS_PR = { merged: 'fusionado', open: 'abierto', closed: 'cerrado', draft: 'borrador' };

/**
 * PRs de GitHub ligados al issue en Linear, con su estado si Linear lo trae
 * (metadata.status de la integración de GitHub). Sin estado = null, no se adivina.
 */
export function prsDe(issue) {
  return (issue.attachments?.nodes || []).flatMap((a) => {
    const m = PR.exec(a.url || '');
    if (!m) return [];
    const st = String(a.metadata?.status || (a.metadata?.merged ? 'merged' : '') || '').toLowerCase();
    return [{ repo: m[1], numero: Number(m[2]), url: m[0], titulo: a.title || '', estado: ESTADOS_PR[st] || null }];
  });
}
