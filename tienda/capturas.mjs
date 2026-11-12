// Capturas para la Chrome Web Store con datos de ejemplo (nada real de Linear).
// Uso: npm run capturas  →  dist/tienda/*.png
// Pinta el popup de verdad con un `chrome` falso, y lo monta en lienzos del tamaño que pide la tienda.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright puede estar instalado global (sin node_modules en el repo): require lo encuentra.
const { chromium } = createRequire(import.meta.url)('playwright');

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'dist', 'tienda');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const servidor = createServer(async (req, res) => {
  try {
    const ruta = join(raiz, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    res.writeHead(200, { 'content-type': TIPOS[extname(ruta)] || 'application/octet-stream' });
    res.end(await readFile(ruta));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${servidor.address().port}`;

const L = {
  humano: '👤 listo-para-humano', agente: '🤖 listo-para-agente',
  info: '❓ necesita-info', brief: '📦 brief-incluido',
};
const hace = (d) => new Date(Date.now() - d * 864e5).toISOString();
let n = 100;
const issue = (titulo, o = {}) => ({
  id: `demo-${n}`, identifier: `OP-${n++}`, title: titulo, url: 'https://linear.app/',
  team: { key: 'OP' }, priority: o.p ?? 3, dueDate: o.vence ?? null, updatedAt: hace(o.dias ?? 0),
  state: { name: o.estado ?? 'Todo', type: o.tipo ?? 'unstarted' }, description: o.desc ?? '',
  labels: { nodes: (o.labels ?? []).map((name) => ({ id: name, name })).concat(o.riesgo ? [{ id: 'r', name: o.riesgo, parent: { name: 'riesgo' } }] : []) },
});

const issues = [
  issue('Mandar la propuesta de renovación anual', { estado: 'In Progress', tipo: 'started', p: 2, vence: '2026-11-07',
    desc: 'Ajustar precios con el descuento acordado y mandar el PDF.\nListo cuando: el cliente tiene el PDF en su correo.' }),
  issue('Revisar la página de ventas del taller', { labels: [L.humano], p: 2 }),
  issue('Preparar la agenda de la llamada del jueves', { labels: [L.humano], p: 3, vence: '2026-11-06' }),
  issue('Corregir el enlace roto del newsletter', { labels: [L.agente, L.brief], riesgo: 'verde', p: 3 }),
  issue('Agregar paginación al tablero de leads', { labels: [L.agente, L.brief], riesgo: 'amarillo', p: 2 }),
  issue('Conectar el cobro recurrente', { labels: [L.agente, L.brief], riesgo: 'rojo', p: 1 }),
  issue('Confirmar el dominio de envío', { labels: [L.info], dias: 4 }),
  issue('Validar textos con el cliente', { estado: 'In Review', tipo: 'started', dias: 2 }),
  issue('Ideas para el siguiente episodio', { labels: [L.humano], tipo: 'backlog', estado: 'Backlog' }),
  issue('Revisar costos del proveedor'),
];

const datos = {
  config: { llave: 'demo', horaResumen: '09:00', equipos: '', correo: '', avisarNuevos: true },
  cache: { issues, ids: issues.map((i) => i.id), persona: { name: 'Ana López', email: 'ana@ejemplo.com' }, at: Date.now() },
  recordatorios: [
    { id: 'r1', texto: 'Llamar a contabilidad', at: Date.now() - 6e4, disparado: true, repetir: 'no' },
    { id: 'r2', texto: 'Revisar pendientes del día', at: Date.now() + 2 * 36e5, hhmm: '10:00', disparado: false, repetir: 'laborables' },
    { id: 'r3', texto: 'OP-101 Revisar la página de ventas del taller', at: Date.now() + 5 * 36e5, disparado: false, repetir: 'no', issueUrl: 'https://linear.app/' },
  ],
};

function chromeFalso(d) {
  window.chrome = {
    storage: { local: {
      get: async (k) => ({ [k]: d[k] }),
      set: async (o) => Object.assign(d, o),
    } },
    runtime: { sendMessage: async () => {}, openOptionsPage: () => {} },
    tabs: { create: () => {} },
    identity: { getProfileUserInfo: async () => ({ email: '' }) },
  };
}

const navegador = await chromium.launch();
async function capturaPopup(tab) {
  const p = await navegador.newPage({ viewport: { width: 400, height: 580 }, deviceScaleFactor: 2 });
  await p.addInitScript(chromeFalso, datos);
  await p.goto(`${base}/popup.html`);
  await p.waitForSelector('.siguiente');
  if (tab) await p.click(`[data-tab="${tab}"]`);
  const png = await p.screenshot({ fullPage: false });
  await p.close();
  return `data:image/png;base64,${png.toString('base64')}`;
}

const icono = `data:image/png;base64,${(await readFile(join(raiz, 'icons/icon128.png'))).toString('base64')}`;

function lienzo({ w, h, titulo, texto, img, escala = 1.18 }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box;
      font-family:system-ui,sans-serif;background:#f4f4f7;color:#1f2023}
    .txt{flex:1} h1{font-size:${img ? 44 : 30}px;line-height:1.15;margin:0 0 16px} p{font-size:${img ? 22 : 16}px;line-height:1.45;color:#55585f;margin:0}
    .marca{display:flex;align-items:center;gap:12px;font-weight:600;margin-bottom:28px;font-size:${img ? 18 : 15}px}
    .marca img{width:${img ? 40 : 48}px;height:${img ? 40 : 48}px}
    .pop{width:400px;height:580px;border-radius:12px;box-shadow:0 18px 48px rgba(20,20,40,.18);background:#fff;overflow:hidden;flex:none;transform:scale(${escala});transform-origin:center}
    .pop img{width:400px;height:580px;display:block}
  </style></head><body><div class="txt"><div class="marca"><img src="${icono}">¿Qué sigue?</div><h1>${titulo}</h1><p>${texto}</p></div>
  ${img ? `<div class="pop"><img src="${img}"></div>` : ''}</body></html>`;
}

async function guardar(nombre, opciones) {
  const p = await navegador.newPage({ viewport: { width: opciones.w, height: opciones.h }, deviceScaleFactor: 1 });
  await p.setContent(lienzo(opciones));
  await p.screenshot({ path: join(salida, nombre) });
  await p.close();
  console.log(`dist/tienda/${nombre}`);
}

await mkdir(salida, { recursive: true });
const ahora = await capturaPopup();
const rec = await capturaPopup('recordatorios');
await guardar('captura-1-que-sigue.png', { w: 1280, h: 800, img: ahora,
  titulo: 'Lo siguiente, sin abrir Linear', texto: 'Tu issue más urgente arriba, lo que va a un agente con su semáforo de riesgo y lo que está atorado.' });
await guardar('captura-2-recordatorios.png', { w: 1280, h: 800, img: rec,
  titulo: 'Recordatorios escritos como hablas', texto: '“10am revisar propuesta”, “en 30 min llamar”. Una vez, diario o de lunes a viernes.' });
await guardar('marquesina-1400x560.png', { w: 1400, h: 560, img: ahora, escala: 0.86,
  titulo: 'Tu día en Linear, en un clic', texto: 'Qué sigue, qué va a un agente con su semáforo de riesgo y qué está atorado. Gratis y de código abierto.' });
await guardar('mosaico-440x280.png', { w: 440, h: 280,
  titulo: 'Tu día en Linear, en un clic', texto: 'Qué sigue, qué va a un agente y qué está atorado.' });

await navegador.close();
servidor.close();
