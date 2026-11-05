// Lectura y escritura en chrome.storage.local. Un solo lugar para las llaves.

export const DEFAULTS = { llave: '', horaResumen: '09:00', equipos: '', correo: '', avisarNuevos: true, proyecto: '' };

export async function config() {
  const { config = {} } = await chrome.storage.local.get('config');
  return { ...DEFAULTS, ...config };
}

export async function guardarConfig(c) {
  await chrome.storage.local.set({ config: { ...(await config()), ...c } });
}

export async function recordatorios() {
  const { recordatorios = [] } = await chrome.storage.local.get('recordatorios');
  return recordatorios;
}

export async function guardarRecordatorios(lista) {
  await chrome.storage.local.set({ recordatorios: lista });
}

export async function cache() {
  const { cache = null } = await chrome.storage.local.get('cache');
  return cache;
}

export function equiposDe(c) {
  return (c.equipos || '').split(',').map((e) => e.trim()).filter(Boolean);
}

/** Vistas personales de Linear ya creadas, una por grupo: { [grupo]: { id, slugId } }. */
export async function vistas() {
  const { vistas = {} } = await chrome.storage.local.get('vistas');
  return vistas;
}

export async function guardarVista(grupo, vista) {
  await chrome.storage.local.set({ vistas: { ...(await vistas()), [grupo]: { id: vista.id, slugId: vista.slugId } } });
}
