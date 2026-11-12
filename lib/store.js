// Lectura y escritura en chrome.storage.local. Un solo lugar para las llaves.

export const DEFAULTS = { llave: '', horaResumen: '09:00', equipos: '', correo: '', avisarNuevos: true, proyecto: '', agente: 'Linear', tokenTaskAI: '', rutinaTaskAI: '', duenoRepos: '' };

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
