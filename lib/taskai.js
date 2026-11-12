// TaskAI: la rutina de Claude que hace un issue y deja el PR a revisión (INT-2019).
// Aquí vive la regla de "listo para mandarlo" y el disparo. Sin dependencias de Chrome.
import { LABEL, riesgo, tiene } from './estado.js';
import { repoDe } from './consultas.js';

// La rutina (claude.ai/code/routines) y su token se ponen en Ajustes: cada quien usa la suya.

const BASE = 'https://api.anthropic.com/v1/claude_code/routines';
// "Listo cuando" como título o inicio de línea (## Listo cuando, **Listo cuando:**), no a media frase.
const LISTO_CUANDO = /^[\s#>*_-]*(listo cuando|done when|acceptance criteria)\b/im;
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `dueño/repo` escrito en el texto, o una liga de github.com/dueño/repo.
const repoEnTexto = (dueno) => new RegExp(`(?:github\\.com\\/|\\b)(${escapar(dueno)})\\/([\\w.-]*[\\w-])`, 'gi');

/**
 * Repo del issue para TaskAI: lo que Linear tiene ligado (repoDe) o, si no,
 * el único `<dueño>/<repo>` escrito en la descripción. `dueno` es el usuario u
 * organización de GitHub de Ajustes; sin él solo cuenta lo ligado en Linear.
 * Dos repos distintos en el texto = `varios`: un issue, un repo.
 */
export function repoParaClaude(issue, dueno = '') {
  const ligado = repoDe(issue);
  if (ligado) return { repo: ligado, varios: false };
  dueno = (dueno || '').trim().replace(/^@/, '');
  if (!/^[\w.-]+$/.test(dueno)) return { repo: null, varios: false };
  // Las ramas de Linear se ven igual (dueño/int-2019-slug): esas no son repo.
  const rama = (issue.branchName || '').toLowerCase();
  const enTexto = new Set([...(issue.description || '').matchAll(repoEnTexto(dueno))]
    .map((m) => `${m[1]}/${m[2].replace(/\.git$/i, '')}`.toLowerCase())
    .filter((r) => r !== rama && !/^[\w.-]+\/[a-z]+-\d+(-|$)/.test(r)));
  if (enTexto.size === 1) return { repo: [...enTexto][0], varios: false };
  return { repo: null, varios: enTexto.size > 1 };
}

/**
 * ¿Se puede mandar a TaskAI? Las mismas cuatro condiciones que revisa la tarea,
 * para que el botón no dispare algo que la tarea va a regresar.
 * Rojo nunca: solo una persona lo fusiona y la tarea no lo toma.
 */
export function listoParaClaude(issue, dueno = '') {
  const falta = [];
  if (!tiene(issue, LABEL.agente)) falta.push(LABEL.agente);
  const color = riesgo(issue);
  if (!color) falta.push('riesgo');
  else if (color === 'rojo') falta.push('riesgo verde o amarillo (es rojo)');
  const { repo, varios } = repoParaClaude(issue, dueno);
  if (!repo) falta.push(varios ? 'un solo repo (trae varios)' : 'repo');
  if (!LISTO_CUANDO.test(issue.description || '')) falta.push('"Listo cuando"');
  return { listo: falta.length === 0, falta, repo };
}

/**
 * Dispara TaskAI con el ID del issue. Regresa `{ status, url }`; si falla, lanza
 * un error con el código y el cuerpo, nunca con el token.
 * `pedir` es `fetch` (se inyecta en las pruebas).
 */
export async function dispararTaskAI({ token, rutina, issueId, pedir = fetch }) {
  if (!token) throw new Error('Falta el token de TaskAI (Ajustes).');
  if (!/^trig_[\w]+$/.test(rutina || '')) throw new Error('Falta el ID de la rutina en Ajustes, o no se ve bien (empieza con trig_).');
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

/**
 * ¿Ya está hecho por sus PR? Solo si alguno se fusionó y ninguno sigue abierto:
 * con un PR abierto todavía falta trabajo, aunque otro ya haya entrado.
 */
export function hechoPorPRs(prs) {
  return prs.some((p) => p.estado === 'fusionado') && !prs.some((p) => p.estado === 'abierto' || p.estado === 'borrador');
}
