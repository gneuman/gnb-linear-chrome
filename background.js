// Service worker: revisa Linear cada 15 min, pone el número en el ícono,
// manda el resumen diario y dispara los recordatorios.
import { resolverPersona, issuesDe } from './lib/linear.js';
import { clasificar, nuevos } from './lib/estado.js';
import { siguienteHora } from './lib/schedule.js';
import { config, recordatorios, guardarRecordatorios, equiposDe } from './lib/store.js';
import { t, usarIdioma } from './lib/i18n.js';

const REVISAR = 'revisar';
const RESUMEN = 'resumen';
const REC = 'rec:';
const ICONO = 'icons/icon128.png';

chrome.runtime.onInstalled.addListener(() => {
  // La 0.3.0 guardaba vistas de Linear; se quitaron en la 0.4.0.
  chrome.storage.local.remove('vistas');
  programar();
});
chrome.runtime.onStartup.addListener(programar);

async function programar() {
  chrome.alarms.create(REVISAR, { periodInMinutes: 5, delayInMinutes: 0.1 });
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

/** Correo del perfil de Chrome (vacío si no hay sesión de Chrome o no hay permiso). */
async function correoDeChrome() {
  try {
    const info = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    return info?.email || '';
  } catch {
    return '';
  }
}

async function refrescar() {
  await usarIdioma();
  const c = await config();
  if (!c.llave) {
    await chrome.storage.local.set({ cache: { error: t('Falta la API key de Linear. Ábrela en Ajustes.'), at: Date.now() } });
    await pintarNumero();
    return null;
  }
  try {
    const { cache: previo = {} } = await chrome.storage.local.get('cache');
    const correos = [
      { correo: c.correo, fuente: 'ajustes' },
      { correo: await correoDeChrome(), fuente: 'chrome' },
    ];
    // La persona se resuelve una vez y se guarda; se vuelve a buscar si cambian los correos.
    const clave = correos.map((x) => x.correo).join('|');
    const persona = previo.persona && previo.claveCorreos === clave ? previo.persona : await resolverPersona(c.llave, correos);
    const issues = await issuesDe(c.llave, persona.id);

    const mismoDueno = previo.persona?.id === persona.id;
    if (c.avisarNuevos && mismoDueno) avisarNuevos(nuevos(previo.ids, issues));

    await chrome.storage.local.set({
      cache: { issues, ids: issues.map((i) => i.id), persona, claveCorreos: clave, at: Date.now() },
    });
  } catch (e) {
    const { cache = {} } = await chrome.storage.local.get('cache');
    await chrome.storage.local.set({ cache: { ...cache, error: e.message, at: Date.now() } });
  }
  await pintarNumero();
  return chrome.storage.local.get('cache').then((x) => x.cache);
}

const NUEVO = 'nuevo:';

function avisarNuevos(lista) {
  if (!lista.length) return;
  if (lista.length > 3) {
    chrome.notifications.create(NUEVO + 'varios', {
      type: 'basic', iconUrl: ICONO,
      title: t('{n} issues nuevos en Linear', { n: lista.length }),
      message: lista.slice(0, 3).map((i) => `${i.identifier} ${i.title}`).join('\n') + '\n…',
    });
    return;
  }
  for (const i of lista) {
    chrome.notifications.create(NUEVO + i.id, {
      type: 'basic', iconUrl: ICONO,
      title: t('Nuevo: {id}', { id: i.identifier }),
      message: `${i.title}${i.priority === 1 ? ` · ${t('Urgente')}` : ''}`,
      contextMessage: [i.team?.key, i.state?.name].filter(Boolean).join(' · '),
    });
  }
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
  // Solo cuenta lo de "Ahora": lo que esperas de otros o falta triar no es para hoy.
  const { ahora } = clasificar(cache.issues, { equipos: equiposDe(c) });
  const n = ahora.length + vencidos;
  chrome.action.setBadgeText({ text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: vencidos ? '#c0392b' : '#5e6ad2' });
}

async function mandarResumen() {
  const cache = await refrescar();
  const c = await config();
  chrome.alarms.create(RESUMEN, { when: siguienteHora(c.horaResumen, 'diario') });
  if (!cache?.issues) return;
  await usarIdioma();
  const g = clasificar(cache.issues, { equipos: equiposDe(c) });
  const hoy = (await recordatorios()).filter((r) => !r.disparado && r.at < Date.now() + 18 * 3600 * 1000).length;
  chrome.notifications.create(RESUMEN, {
    type: 'basic',
    iconUrl: ICONO,
    title: t('Hoy'),
    message:
      t('{ahora} para hoy, {agente} para agente, {info} esperando info', { ahora: g.ahora.length, agente: g.agente.length, info: g.info.length }) +
      (hoy ? t(', {n} recordatorios', { n: hoy }) : '') +
      (g.siguiente ? `\n${t('Sigue: {id} {titulo}', { id: g.siguiente.identifier, titulo: g.siguiente.title })}` : ''),
  });
}

async function dispararRecordatorio(id) {
  const lista = await recordatorios();
  const r = lista.find((x) => x.id === id);
  if (!r) return;
  await usarIdioma();
  chrome.notifications.create(REC + r.id, {
    type: 'basic',
    iconUrl: ICONO,
    title: r.issueId ? `${t('Recordatorio')} · ${r.issueId}` : t('Recordatorio'),
    message: r.texto,
    requireInteraction: true,
    buttons: [{ title: t('Posponer 10 min') }, { title: t('Hecho') }],
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
  if (notifId.startsWith(NUEVO)) {
    const { cache } = await chrome.storage.local.get('cache');
    const issue = cache?.issues?.find((i) => i.id === notifId.slice(NUEVO.length));
    if (issue) chrome.tabs.create({ url: issue.url });
    else chrome.action.openPopup?.().catch(() => {});
    chrome.notifications.clear(notifId);
    return;
  }
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
