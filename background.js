// Service worker: revisa Linear cada 15 min, pone el número en el ícono,
// manda el resumen diario y dispara los recordatorios.
import { misIssues } from './lib/linear.js';
import { clasificar } from './lib/estado.js';
import { siguienteHora } from './lib/schedule.js';
import { config, recordatorios, guardarRecordatorios, equiposDe } from './lib/store.js';

const REVISAR = 'revisar';
const RESUMEN = 'resumen';
const REC = 'rec:';
const ICONO = 'icons/icon128.png';

chrome.runtime.onInstalled.addListener(programar);
chrome.runtime.onStartup.addListener(programar);

async function programar() {
  chrome.alarms.create(REVISAR, { periodInMinutes: 15, delayInMinutes: 0.1 });
  const c = await config();
  chrome.alarms.create(RESUMEN, { when: siguienteHora(c.horaResumen, 'diario') });
  await sincronizarRecordatorios();
}

/** Una alarma por recordatorio activo; borra las que sobran. Los vencidos con Chrome cerrado se disparan ya. */
async function sincronizarRecordatorios() {
  const lista = await recordatorios();
  const activos = new Set();
  for (const r of lista) {
    if (r.disparado) continue;
    activos.add(REC + r.id);
    chrome.alarms.create(REC + r.id, { when: Math.max(r.at, Date.now() + 1000) });
  }
  for (const a of await chrome.alarms.getAll()) {
    if (a.name.startsWith(REC) && !activos.has(a.name)) chrome.alarms.clear(a.name);
  }
  await pintarNumero();
}

async function refrescar() {
  const c = await config();
  if (!c.llave) {
    await chrome.storage.local.set({ cache: { error: 'Falta la API key de Linear. Ábrela en Ajustes.', at: Date.now() } });
    await pintarNumero();
    return null;
  }
  try {
    const issues = await misIssues(c.llave);
    await chrome.storage.local.set({ cache: { issues, at: Date.now() } });
  } catch (e) {
    const { cache = {} } = await chrome.storage.local.get('cache');
    await chrome.storage.local.set({ cache: { ...cache, error: e.message, at: Date.now() } });
  }
  await pintarNumero();
  return chrome.storage.local.get('cache').then((x) => x.cache);
}

async function pintarNumero() {
  const c = await config();
  const { cache } = await chrome.storage.local.get('cache');
  const vencidos = (await recordatorios()).filter((r) => r.disparado).length;
  if (!cache?.issues) {
    chrome.action.setBadgeText({ text: cache?.error ? '!' : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#c0392b' });
    return;
  }
  const { tuyos } = clasificar(cache.issues, { equipos: equiposDe(c) });
  const n = tuyos.length + vencidos;
  chrome.action.setBadgeText({ text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: vencidos ? '#c0392b' : '#5e6ad2' });
}

async function mandarResumen() {
  const cache = await refrescar();
  const c = await config();
  chrome.alarms.create(RESUMEN, { when: siguienteHora(c.horaResumen, 'diario') });
  if (!cache?.issues) return;
  const g = clasificar(cache.issues, { equipos: equiposDe(c) });
  const hoy = (await recordatorios()).filter((r) => !r.disparado && r.at < Date.now() + 18 * 3600 * 1000).length;
  chrome.notifications.create(RESUMEN, {
    type: 'basic',
    iconUrl: ICONO,
    title: 'Hoy',
    message:
      `${g.tuyos.length} tuyos, ${g.agente.length} para agente, ${g.atorados.length} atorados` +
      (hoy ? `, ${hoy} recordatorios` : '') +
      (g.siguiente ? `\nSigue: ${g.siguiente.identifier} ${g.siguiente.title}` : ''),
  });
}

async function dispararRecordatorio(id) {
  const lista = await recordatorios();
  const r = lista.find((x) => x.id === id);
  if (!r) return;
  chrome.notifications.create(REC + r.id, {
    type: 'basic',
    iconUrl: ICONO,
    title: r.issueId ? `Recordatorio · ${r.issueId}` : 'Recordatorio',
    message: r.texto,
    requireInteraction: true,
    buttons: [{ title: 'Posponer 10 min' }, { title: 'Hecho' }],
  });
  if (r.repetir && r.repetir !== 'no' && r.hhmm) {
    r.at = siguienteHora(r.hhmm, r.repetir);
  } else {
    r.disparado = true;
  }
  await guardarRecordatorios(lista);
  await sincronizarRecordatorios();
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === REVISAR) refrescar();
  else if (a.name === RESUMEN) mandarResumen();
  else if (a.name.startsWith(REC)) dispararRecordatorio(a.name.slice(REC.length));
});

chrome.notifications.onButtonClicked.addListener(async (notifId, boton) => {
  if (!notifId.startsWith(REC)) return;
  const id = notifId.slice(REC.length);
  let lista = await recordatorios();
  const r = lista.find((x) => x.id === id);
  if (r && boton === 0) {
    // Posponer: un recordatorio de una vez vuelve a quedar activo en 10 min.
    if (r.disparado) {
      r.disparado = false;
      r.at = Date.now() + 10 * 60 * 1000;
    } else {
      lista.push({ ...r, id: crypto.randomUUID(), repetir: 'no', hhmm: null, at: Date.now() + 10 * 60 * 1000 });
    }
  } else if (r && boton === 1 && r.disparado) {
    lista = lista.filter((x) => x.id !== id);
  }
  await guardarRecordatorios(lista);
  await sincronizarRecordatorios();
  chrome.notifications.clear(notifId);
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith(REC)) return;
  const r = (await recordatorios()).find((x) => x.id === notifId.slice(REC.length));
  if (r?.issueUrl) chrome.tabs.create({ url: r.issueUrl });
  chrome.notifications.clear(notifId);
});

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo === 'refrescar') refrescar().then(() => responder({ ok: true }));
  else if (msg?.tipo === 'programar') programar().then(() => responder({ ok: true }));
  else if (msg?.tipo === 'recordatorios') sincronizarRecordatorios().then(() => responder({ ok: true }));
  else return false;
  return true;
});
