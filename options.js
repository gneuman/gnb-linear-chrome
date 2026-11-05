import { config, guardarConfig } from './lib/store.js';
import { gql } from './lib/linear.js';

const $ = (s) => document.querySelector(s);

config().then((c) => {
  $('#llave').value = c.llave;
  $('#hora').value = c.horaResumen;
  $('#equipos').value = c.equipos;
});

$('#f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const estado = $('#estado');
  const llave = $('#llave').value.trim();
  estado.className = 'aviso ok';
  estado.textContent = 'Probando la llave…';
  try {
    const d = await gql(llave, 'query { viewer { name } }');
    await guardarConfig({ llave, horaResumen: $('#hora').value || '09:00', equipos: $('#equipos').value.trim() });
    await chrome.runtime.sendMessage({ tipo: 'programar' });
    await chrome.runtime.sendMessage({ tipo: 'refrescar' });
    estado.textContent = `Listo, ${d.viewer.name}.`;
  } catch (err) {
    estado.className = 'aviso';
    estado.textContent = err.message;
  }
});
