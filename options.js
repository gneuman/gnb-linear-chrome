import { config, guardarConfig } from './lib/store.js';
import { gql, agentes } from './lib/linear.js';

const $ = (s) => document.querySelector(s);

config().then(async (c) => {
  $('#llave').value = c.llave;
  $('#hora').value = c.horaResumen;
  $('#equipos').value = c.equipos;
  $('#correo').value = c.correo;
  $('#avisar').checked = c.avisarNuevos;
  // Los agentes salen de Linear; sin llave queda la lista base (Ninguno / Linear).
  if (c.llave) {
    try {
      const sel = $('#agente');
      for (const a of await agentes(c.llave)) {
        if (![...sel.options].some((o) => o.value === a.name)) sel.append(new Option(a.name, a.name));
      }
    } catch { /* sin red: se queda la lista base */ }
  }
  $('#agente').value = c.agente;
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
    await guardarConfig({ llave, correo, avisarNuevos: $('#avisar').checked, horaResumen: $('#hora').value || '09:00', equipos: $('#equipos').value.trim(), agente: $('#agente').value });
    await chrome.runtime.sendMessage({ tipo: 'programar' });
    await chrome.runtime.sendMessage({ tipo: 'refrescar' });
    estado.textContent = `Listo, ${d.viewer.name}.`;
  } catch (err) {
    estado.className = 'aviso';
    estado.textContent = err.message;
  }
});
