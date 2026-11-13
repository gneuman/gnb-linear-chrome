import { config, guardarConfig } from './lib/store.js';
import { gql, agentes, prepararLinear } from './lib/linear.js';
import { t, usarIdioma, traducirDom } from './lib/i18n.js';

const $ = (s) => document.querySelector(s);

await usarIdioma();
traducirDom();

config().then(async (c) => {
  $('#idioma').value = c.idioma || '';
  $('#llave').value = c.llave;
  $('#hora').value = c.horaResumen;
  $('#equipos').value = c.equipos;
  $('#correo').value = c.correo;
  $('#avisar').checked = c.avisarNuevos;
  $('#rutina-taskai').value = c.rutinaTaskAI;
  $('#dueno').value = c.duenoRepos;
  // El token no se vuelve a pintar: solo se dice si hay uno.
  $('#token-taskai').placeholder = c.tokenTaskAI ? t('Guardado · escribe uno nuevo para cambiarlo') : 'sk-ant-…';
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
      [...sel.options].find((o) => o.value === c.agente).text = `${c.agente} ${t('(no está en Linear)')}`;
    }
  } catch { /* sin red: se queda la lista base */ }
});

chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }).then((info) => {
  if (info?.email) $('#correo').placeholder = `${info.email} ${t('(perfil de Chrome)')}`;
}).catch(() => {});

$('#f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const estado = $('#estado');
  const llave = $('#llave').value.trim();
  estado.className = 'aviso ok';
  estado.textContent = t('Probando la llave…');
  try {
    const d = await gql(llave, 'query { viewer { name } }');
    const correo = $('#correo').value.trim();
    if (correo) {
      const u = await gql(llave, 'query($c: String!) { users(filter: { email: { eqIgnoreCase: $c } }) { nodes { name } } }', { c: correo });
      if (!u.users.nodes.length) throw new Error(t('{correo} no es usuario de este Linear.', { correo }));
    }
    const rutinaTaskAI = $('#rutina-taskai').value.trim();
    if (rutinaTaskAI && !/^trig_\w+$/.test(rutinaTaskAI)) throw new Error(t('El ID de la rutina empieza con trig_.'));
    const token = $('#token-taskai').value.trim();
    const taskai = { rutinaTaskAI };
    if ($('#borrar-token').checked) taskai.tokenTaskAI = '';
    else if (token) taskai.tokenTaskAI = token;
    const conToken = taskai.tokenTaskAI ?? (await config()).tokenTaskAI;
    if (conToken && !rutinaTaskAI) throw new Error(t('Con token hace falta el ID de la rutina (trig_…).'));
    const duenoRepos = $('#dueno').value.trim().replace(/^@/, '');
    if (duenoRepos && !/^[\w.-]+$/.test(duenoRepos)) throw new Error(t('El dueño de GitHub es solo el usuario u organización, sin liga (por ejemplo: mi-empresa).'));
    const idioma = $('#idioma').value;
    await guardarConfig({ idioma, llave, correo, avisarNuevos: $('#avisar').checked, horaResumen: $('#hora').value || '09:00', equipos: $('#equipos').value.trim(), agente: $('#agente').value, duenoRepos, ...taskai });
    $('#token-taskai').value = '';
    $('#borrar-token').checked = false;
    $('#token-taskai').placeholder = (await config()).tokenTaskAI ? t('Guardado · escribe uno nuevo para cambiarlo') : 'sk-ant-…';
    await chrome.runtime.sendMessage({ tipo: 'programar' });
    await chrome.runtime.sendMessage({ tipo: 'refrescar' });
    // Si cambió el idioma, la página se vuelve a pintar en el nuevo.
    if ((await usarIdioma()) !== document.documentElement.lang) return location.reload();
    estado.textContent = t('Listo, {nombre}.', { nombre: d.viewer.name });
  } catch (err) {
    estado.className = 'aviso';
    estado.textContent = err.message;
  }
});

// Crea en Linear las etiquetas que la extensión usa. Las que ya existen no se tocan.
$('#preparar').addEventListener('click', async () => {
  const estado = $('#estado-preparar');
  estado.className = 'aviso ok';
  estado.textContent = t('Revisando tu Linear…');
  try {
    const { llave } = await config();
    if (!llave) throw new Error(t('Primero guarda tu API key.'));
    const creadas = await prepararLinear(llave);
    estado.textContent = creadas.length ? t('Listo: creé {lista}.', { lista: creadas.join(', ') }) : t('Ya tenías todas. No cambié nada.');
  } catch (err) {
    estado.className = 'aviso';
    estado.textContent = err.message;
  }
});
