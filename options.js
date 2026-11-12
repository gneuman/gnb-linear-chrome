import { config, guardarConfig } from './lib/store.js';
import { gql, agentes } from './lib/linear.js';
import { RUTINA } from './lib/taskai.js';

const $ = (s) => document.querySelector(s);

config().then(async (c) => {
  $('#llave').value = c.llave;
  $('#hora').value = c.horaResumen;
  $('#equipos').value = c.equipos;
  $('#correo').value = c.correo;
  $('#avisar').checked = c.avisarNuevos;
  $('#rutina-taskai').value = c.rutinaTaskAI;
  // El token no se vuelve a pintar: solo se dice si hay uno.
  $('#token-taskai').placeholder = c.tokenTaskAI ? 'Guardado · escribe uno nuevo para cambiarlo' : 'sk-ant-…';
  // El guardado se pone antes de ir a Linear: si se guarda antes de que responda, no se pierde.
  const sel = $('#agente');
  const opcion = (nombre, texto = nombre) => {
    if (![...sel.options].some((o) => o.value === nombre)) sel.append(new Option(texto, nombre));
  };
  if (c.agente) opcion(c.agente);
  sel.value = c.agente;
  // Los agentes salen de Linear; sin llave o sin red queda la lista base.
  if (!c.llave) return;
  try {
    const lista = await agentes(c.llave);
    for (const a of lista) opcion(a.name);
    if (c.agente && !lista.some((a) => a.name === c.agente)) {
      [...sel.options].find((o) => o.value === c.agente).text = `${c.agente} (no está en Linear)`;
    }
  } catch { /* sin red: se queda la lista base */ }
});

chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }).then((info) => {
  if (info?.email) $('#correo').placeholder = `${info.email} (perfil de Chrome)`;
}).catch(() => {});

$('#f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const estado = $('#estado');
  const llave = $('#llave').value.trim();
  estado.className = 'aviso ok';
  estado.textContent = 'Probando la llave…';
  try {
    const d = await gql(llave, 'query { viewer { name } }');
    const correo = $('#correo').value.trim();
    if (correo) {
      const u = await gql(llave, 'query($c: String!) { users(filter: { email: { eqIgnoreCase: $c } }) { nodes { name } } }', { c: correo });
      if (!u.users.nodes.length) throw new Error(`${correo} no es usuario de este Linear.`);
    }
    const rutinaTaskAI = $('#rutina-taskai').value.trim() || RUTINA;
    if (!/^trig_\w+$/.test(rutinaTaskAI)) throw new Error('El ID de la tarea empieza con trig_.');
    const token = $('#token-taskai').value.trim();
    const taskai = { rutinaTaskAI };
    if ($('#borrar-token').checked) taskai.tokenTaskAI = '';
    else if (token) taskai.tokenTaskAI = token;
    await guardarConfig({ llave, correo, avisarNuevos: $('#avisar').checked, horaResumen: $('#hora').value || '09:00', equipos: $('#equipos').value.trim(), agente: $('#agente').value, ...taskai });
    $('#token-taskai').value = '';
    $('#borrar-token').checked = false;
    $('#token-taskai').placeholder = (await config()).tokenTaskAI ? 'Guardado · escribe uno nuevo para cambiarlo' : 'sk-ant-…';
    await chrome.runtime.sendMessage({ tipo: 'programar' });
    await chrome.runtime.sendMessage({ tipo: 'refrescar' });
    estado.textContent = `Listo, ${d.viewer.name}.`;
  } catch (err) {
    estado.className = 'aviso';
    estado.textContent = err.message;
  }
});
