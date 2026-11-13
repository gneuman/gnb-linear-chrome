// Junta todas las llaves de traducción del código y del HTML. La usa test/i18n.test.js
// para que ningún texto quede sin inglés. Uso suelto: node scripts/llaves-i18n.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { llaveHtml } from '../lib/i18n.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (f) => readFileSync(join(raiz, f), 'utf8');
const JS = ['popup.js', 'options.js', 'background.js', 'lib/linear.js', 'lib/taskai.js'];

// Textos que llegan a t() desde una variable: aquí se nombran a mano.
export const DINAMICAS = [
  'verde', 'amarillo', 'rojo',
  'fusionado', 'abierto', 'cerrado', 'borrador',
  'el agente fusiona', 'segundo agente + tu "va"', 'solo tú fusionas', 'sin riesgo: ponlo antes de soltarlo',
  'riesgo', 'riesgo verde o amarillo (es rojo)', 'repo', 'un solo repo (trae varios)', '"Listo cuando"',
  'La etiqueta {label}', 'El color de riesgo: verde o amarillo', 'Es rojo: ese no lo hace un agente, lo haces tú',
  'El repo: lígalo al issue o al proyecto en Linear, o escribe dueño/repo en la descripción (el dueño de GitHub va en Ajustes)',
  'Un solo repo: la descripción menciona varios; parte el issue',
  'Una sección "Listo cuando" con lo que se tiene que comprobar',
  'Ahora', 'Para agente', 'Esperan info', 'Esperando a otros', 'Después', 'Sin triage',
  'Urgente', 'Alta', 'Media', 'Baja', 'Sin prioridad',
  'Sin respuesta de TaskAI en más de 2 horas', 'TaskAI está trabajando', 'Revisa la sesión en claude.ai/code',
];

export function llaves() {
  const set = new Set(DINAMICAS);
  for (const f of JS) {
    for (const m of leer(f).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) set.add(m[1].replace(/\\'/g, "'"));
  }
  for (const f of ['popup.html', 'options.html']) {
    const html = leer(f);
    for (const m of html.matchAll(/<(\w+)[^>]*\bdata-i18n\b[^>]*>([\s\S]*?)<\/\1>/g)) set.add(llaveHtml(m[2]));
    for (const m of html.matchAll(/\b(?:placeholder|title)="([^"]*)"/g)) set.add(m[1].replace(/&amp;/g, '&'));
  }
  return [...set];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(llaves(), null, 1));
