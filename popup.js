import { clasificar, resumen, riesgo, talla, labelsParaAgente, proyectosDe, SIN_PROYECTO, OPCIONES_TALLA } from './lib/estado.js';
import { filtroDeGrupo, textoParaClaude, textoDeIssue, GRUPOS } from './lib/consultas.js';
import { parseRapido, siguienteHora } from './lib/schedule.js';
import { empezar, moverAAgente, actualizar, opcionesDelTeam, TOPE } from './lib/linear.js';
import { listoParaClaude, dispararTaskAI, mandadoHacePoco } from './lib/taskai.js';
import { config, guardarConfig, cache, recordatorios, guardarRecordatorios, equiposDe } from './lib/store.js';

const $ = (s) => document.querySelector(s);

// Construye nodos sin innerHTML: los títulos de Linear son texto ajeno.
function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null && h !== false) n.append(h);
  return n;
}

function avisar(texto, ok = false) {
  const a = $('#aviso');
  a.textContent = texto;
  a.className = ok ? 'aviso ok' : 'aviso';
  a.hidden = !texto;
}

const PRIORIDAD = ['', 'Urgente', 'Alta', 'Media', 'Baja'];

function meta(issue) {
  const partes = [issue.team?.key, issue.state?.name];
  if (issue.dueDate) partes.push(`vence ${issue.dueDate}`);
  if (issue.delegate) partes.push(`🤖 ${issue.delegate.name} lo trabaja`);
  return partes.filter(Boolean).join(' · ');
}

/** Importancia y tamaño de un vistazo: prioridad con color y talla (XS–XL). */
function chips(issue) {
  const t = talla(issue);
  return [
    issue.priority ? el('span', { class: `chip p${issue.priority}`, title: `Prioridad ${PRIORIDAD[issue.priority].toLowerCase()}` }, PRIORIDAD[issue.priority]) : null,
    t ? el('span', { class: 'chip talla', title: 'Tamaño (estimación)' }, t) : null,
  ];
}

function cabecera(issue) {
  const color = riesgo(issue);
  return el('div', { class: 'fila' },
    el('span', { class: `punto ${color || ''}`, title: color ? `riesgo ${color}` : 'sin riesgo' }),
    el('span', { class: 'id' }, issue.identifier),
    el('span', { class: 'titulo' }, el('a', { href: issue.url, target: '_blank' }, issue.title)),
    ...chips(issue));
}

function botonRecordar(issue) {
  return el('button', {
    title: 'Crear un recordatorio de este issue',
    onclick: () => {
      $('#rapido-texto').value = `${issue.identifier} ${issue.title}`;
      $('#rapido-texto').dataset.issueId = issue.identifier;
      $('#rapido-texto').dataset.issueUrl = issue.url;
      $('#rapido-hora').focus();
    },
  }, '⏰');
}

/** Copia este issue listo para pegar en Claude y ponerse a trabajar: rama, descripción y cómo arrancar. */
function botonCopiar(issue) {
  return el('button', {
    title: 'Copiar este issue para pegarlo en una sesión de Claude',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(textoDeIssue(issue));
        avisar(`${issue.identifier} copiado. Pégalo en Claude.`, true);
      } catch (err) {
        avisar(`No pude copiar: ${err.message}`);
      }
    },
  }, 'Copiar issue');
}

async function accion(fn, okTexto) {
  try {
    avisar('Guardando en Linear…', true);
    await fn();
    avisar(typeof okTexto === 'function' ? okTexto() : okTexto, true);
    await chrome.runtime.sendMessage({ tipo: 'refrescar' });
    await pintar();
  } catch (e) {
    avisar(e.message);
  }
}

function tarjetaTuya(issue, grande = false) {
  const { texto, listoCuando } = resumen(issue.description);
  const enCurso = issue.state?.type === 'started';
  return el('div', { class: grande ? 'siguiente' : 'item' },
    cabecera(issue),
    el('div', { class: 'meta' }, meta(issue)),
    grande && texto ? el('div', { class: 'meta' }, texto) : null,
    listoCuando ? el('div', { class: 'listo' }, el('b', {}, 'Listo cuando: '), listoCuando) : null,
    el('div', { class: 'acciones' },
      enCurso
        ? el('button', { onclick: () => chrome.tabs.create({ url: issue.url }) }, 'Abrir')
        : el('button', {
            class: 'primario',
            onclick: async () => {
              const c = await config();
              await accion(async () => {
                const estado = await empezar(c.llave, issue);
                chrome.tabs.create({ url: issue.url });
                return estado;
              }, `${issue.identifier} → In Progress`);
            },
          }, 'Empezar'),
      botonCopiar(issue),
      botonAgente(issue),
      // En tus tarjetas solo sale si ya está listo; en "Para agente" sale siempre y dice qué falta.
      listoParaClaude(issue).listo ? botonTaskAI(issue) : null,
      botonEditar(issue),
      botonRecordar(issue)));
}

// Ajustes vigentes del último pintado: las tarjetas los leen sin volver a storage.
let ajustes = {};

/**
 * Pone 🤖, regresa a Todo si estaba en curso y lo delega al agente de Ajustes.
 * Desactiva los botones de la tarjeta mientras corre: un doble clic abriría dos sesiones del agente.
 */
async function soltar(issue, color, boton) {
  const tarjeta = boton.closest('.item, .siguiente');
  const botones = [...tarjeta.querySelectorAll('button')];
  if (botones.some((b) => b.disabled)) return;
  botones.forEach((b) => { b.disabled = true; });
  const c = await config();
  let r = {};
  await accion(async () => {
    r = await moverAAgente(c.llave, issue, { cambio: labelsParaAgente(issue, color), agenteNombre: c.agente });
  }, () => {
    if (r.sinAgente) return `${issue.identifier} → Para agente, sin delegar: no encontré al agente "${r.sinAgente}". Revísalo en Ajustes.`;
    return `${issue.identifier} → Para agente${r.agente ? ` · ${r.agente} ya lo está trabajando` : ''}`;
  });
  botones.forEach((b) => { b.disabled = false; });
}

/** Si no tiene riesgo, lo pide ahí mismo con tres botones; si ya lo tiene, lo suelta directo. */
function botonAgente(issue, texto = 'Mover a agente') {
  return el('button', {
    title: ajustes.agente ? `Soltarlo a un agente (🤖) y delegarlo a ${ajustes.agente}` : 'Soltarlo a un agente (🤖)',
    onclick: (e) => {
      const boton = e.currentTarget;
      if (riesgo(issue)) return soltar(issue, null, boton);
      const fila = boton.closest('.acciones');
      if (fila.nextElementSibling?.classList.contains('elegir-riesgo')) return;
      fila.after(el('div', { class: 'acciones elegir-riesgo' },
        el('span', { class: 'meta' }, 'Riesgo:'),
        ...['verde', 'amarillo', 'rojo'].map((color) =>
          el('button', { class: `riesgo ${color}`, onclick: (ev) => soltar(issue, color, ev.currentTarget) }, color))));
    },
  }, texto);
}

function tarjetaAgente(issue) {
  const color = riesgo(issue);
  const nota = { verde: 'el agente fusiona', amarillo: 'segundo agente + tu "va"', rojo: 'solo tú fusionas' }[color] || 'sin riesgo: ponlo antes de soltarlo';
  return el('div', { class: 'item' },
    cabecera(issue),
    el('div', { class: 'meta' }, `${meta(issue)} · ${nota}`),
    // Los que ya tienen 🤖 pero nadie los trabaja: un clic para que el agente los tome.
    el('div', { class: 'acciones' },
      botonTaskAI(issue),
      botonCopiar(issue),
      issue.delegate || !ajustes.agente ? null : botonAgente(issue, `Delegar a ${ajustes.agente}`),
      botonEditar(issue)));
}

/**
 * Manda el issue a TaskAI (la tarea de Claude que hace el issue y deja el PR a revisión).
 * Apagado si no cumple lo que la tarea pide: dice qué falta en vez de dispararla en balde.
 */
function botonTaskAI(issue) {
  const { listo, falta } = listoParaClaude(issue);
  return el('button', {
    class: listo ? 'primario' : '',
    disabled: listo ? false : 'disabled',
    title: listo ? 'Claude lo hace y te deja el PR a revisión, sin fusionar' : `Falta: ${falta.join(', ')}`,
    onclick: async (e) => {
      const boton = e.currentTarget;
      if (boton.disabled) return;
      // Cada disparo abre una sesión nueva de Claude: dos clics = dos PRs.
      const { enviadosTaskAI = {} } = await chrome.storage.local.get('enviadosTaskAI');
      const pregunta = mandadoHacePoco(enviadosTaskAI, issue.identifier)
        ? `${issue.identifier} ya se mandó a Claude hace menos de 30 min. ¿Mandarlo otra vez? Se abriría otra sesión.`
        : `¿Mandar ${issue.identifier} a Claude? Lo hace y te deja el PR a revisión.`;
      if (!confirm(pregunta)) return;
      boton.disabled = true;
      try {
        const c = await config();
        avisar(`Mandando ${issue.identifier} a TaskAI…`, true);
        const r = await dispararTaskAI({ token: c.tokenTaskAI, rutina: c.rutinaTaskAI, issueId: issue.identifier });
        await chrome.storage.local.set({ enviadosTaskAI: { ...enviadosTaskAI, [issue.identifier]: Date.now() } });
        avisar(`${issue.identifier} → TaskAI (${r.status}). Te deja el PR a revisión.`, true);
        if (r.url) $('#aviso').append(' ', el('a', { href: r.url, target: '_blank' }, 'Ver sesión'));
      } catch (err) {
        avisar(err.message);
        boton.disabled = false;
      }
    },
  }, listo ? 'Mandar a Claude' : `Claude: falta ${falta[0]}`);
}

// Estados y personas por team: se piden una vez por popup abierto.
const opciones = new Map();
function opcionesDe(llave, teamId) {
  if (!opciones.has(teamId)) opciones.set(teamId, opcionesDelTeam(llave, teamId).catch((e) => { opciones.delete(teamId); throw e; }));
  return opciones.get(teamId);
}

/** Abre debajo de la tarjeta los selectores de estado, talla y persona; cada cambio va directo a Linear. */
function botonEditar(issue) {
  return el('button', {
    title: 'Cambiar estado, talla o persona en Linear',
    onclick: async (e) => {
      const fila = e.currentTarget.closest('.acciones');
      const abierta = fila.nextElementSibling;
      if (abierta?.classList.contains('editar')) return abierta.remove();
      const caja = el('div', { class: 'acciones editar' }, el('span', { class: 'meta' }, 'Cargando…'));
      fila.after(caja);
      try {
        const c = await config();
        const { estados, personas } = await opcionesDe(c.llave, issue.team.id);
        const cambiar = (input, texto) => accion(() => actualizar(c.llave, issue.id, input), `${issue.identifier} → ${texto}`);
        const opcion = (value, texto, actual) => el('option', { value, selected: actual ? 'selected' : false }, texto);
        caja.replaceChildren(
          el('select', { title: 'Estado', onchange: (ev) => cambiar({ stateId: ev.target.value }, ev.target.selectedOptions[0].text) },
            ...estados.map((s) => opcion(s.id, s.name, s.id === issue.state?.id))),
          el('select', { title: 'Talla', onchange: (ev) => cambiar({ estimate: ev.target.value ? Number(ev.target.value) : null }, `talla ${ev.target.selectedOptions[0].text}`) },
            opcion('', 'Sin talla', issue.estimate == null),
            // Una talla fuera de la lista (13, 21) se enseña tal cual, no como "Sin talla".
            issue.estimate != null && !OPCIONES_TALLA.some(([v]) => v === issue.estimate) ? opcion(String(issue.estimate), talla(issue), true) : null,
            ...OPCIONES_TALLA.map(([v, t]) => opcion(String(v), t, issue.estimate === v))),
          el('select', { title: 'Persona', onchange: (ev) => cambiar({ assigneeId: ev.target.value || null }, ev.target.selectedOptions[0].text) },
            opcion('', 'Sin asignar', !issue.assignee),
            ...personas.map((p) => opcion(p.id, p.name, p.id === issue.assignee?.id))));
      } catch (err) {
        caja.replaceChildren(el('span', { class: 'aviso' }, err.message));
      }
    },
  }, 'Editar');
}

function tarjetaAtorada(issue) {
  const dias = issue.dias == null ? '' : ` · ${issue.dias} d sin moverse`;
  return el('div', { class: 'item' },
    cabecera(issue),
    el('div', { class: 'meta' }, `${meta(issue)}${dias}`),
    el('div', { class: 'acciones' }, botonCopiar(issue), botonEditar(issue), botonRecordar(issue)));
}

/** Notas por issue que le sirven a Claude: riesgo, "Listo cuando" y días sin moverse. */
function notasParaClaude(issue) {
  const color = riesgo(issue);
  const { listoCuando } = resumen(issue.description);
  return [color && `riesgo ${color}`, listoCuando && `Listo cuando: ${listoCuando}`, issue.dias != null && `${issue.dias} d sin moverse`]
    .filter(Boolean).join(' · ');
}

/**
 * Botón de la consulta de un grupo. `ctx` = persona, equipos y proyecto del popup.
 * Copia el endpoint exacto + la lista, para pegar en Claude. No crea nada en Linear.
 */
function botonesDeConsulta(grupo, lista, ctx) {
  if (!ctx.persona) return null;
  const filtro = () => filtroDeGrupo(grupo, { personaId: ctx.persona.id, equipos: ctx.equipos, proyecto: ctx.proyecto });
  // Dentro de <summary> un clic también abriría o cerraría el grupo.
  const parar = (e) => { e.preventDefault(); e.stopPropagation(); };
  return el('span', { class: 'consulta' },
    el('button', {
      title: 'Copiar el endpoint exacto y la lista para pegar en Claude',
      onclick: async (e) => {
        parar(e);
        const texto = textoParaClaude({
          grupo, persona: ctx.persona, proyectoNombre: ctx.proyectoNombre, equipos: ctx.equipos,
          issues: lista, filtro: filtro(), extra: notasParaClaude,
        });
        try {
          await navigator.clipboard.writeText(texto);
          avisar(`${GRUPOS[grupo]}: consulta y ${lista.length} issues copiados. Pégalos en Claude.`, true);
        } catch (err) {
          avisar(`No pude copiar: ${err.message}`);
        }
      },
    }, 'Copiar para Claude'));
}

const VISIBLES = 5;

/** Título + las primeras 5 tarjetas; el resto detrás de "ver N más". `consulta` = botones del grupo. */
function seccion(titulo, lista, tarjeta, vacio, consulta = null) {
  const caja = el('div');
  const pintarCaja = (todas) => {
    const mostrar = todas ? lista : lista.slice(0, VISIBLES);
    caja.replaceChildren(...mostrar.map(tarjeta));
    if (lista.length > VISIBLES) {
      caja.append(el('button', { class: 'mas', onclick: () => pintarCaja(!todas) }, todas ? 'Ver menos' : `Ver ${lista.length - VISIBLES} más`));
    }
  };
  if (lista.length) pintarCaja(false);
  else caja.append(el('p', { class: 'vacio' }, vacio));
  return [el('h2', { class: 'con-consulta' }, el('span', {}, `${titulo} (${lista.length})`), consulta), caja];
}

/** Grupo que no es para hoy: una línea plegada con lista compacta adentro. */
function plegado(titulo, lista, nota, consulta = null) {
  if (!lista.length) return null;
  return el('details', { class: 'plegado' },
    el('summary', {}, el('b', {}, `${titulo} (${lista.length})`), nota ? ` · ${nota}` : ''),
    consulta ? el('div', { class: 'consulta-plegado' }, consulta) : null,
    ...lista.map((i) => el('div', { class: 'compacto' },
      el('span', { class: 'id' }, i.identifier),
      el('a', { href: i.url, target: '_blank' }, i.title),
      ...chips(i),
      i.dias != null ? el('span', { class: 'id' }, `${i.dias} d`) : null)));
}

async function pintarAhora() {
  const main = $('#ahora');
  const c = await config();
  const datos = await cache();
  main.replaceChildren();
  if (!c.llave) {
    main.append(el('p', {}, 'Conecta Linear: ', el('a', { href: '#', onclick: () => chrome.runtime.openOptionsPage() }, 'pon tu API key en Ajustes'), '.'));
    return;
  }
  if (datos?.error) main.append(el('p', { class: 'aviso' }, datos.error));
  if (!datos?.issues) {
    main.append(el('p', { class: 'vacio' }, 'Cargando…'));
    return;
  }
  ajustes = c;
  const equipos = equiposDe(c);
  const { lista: proyectos, sinProyecto } = proyectosDe(contados(datos.issues, equipos));
  // Si el proyecto guardado ya no trae issues tuyos, se vuelve a "Todos".
  const vigente = c.proyecto === SIN_PROYECTO ? sinProyecto > 0 : proyectos.some((p) => p.id === c.proyecto);
  const proyecto = vigente ? c.proyecto : '';
  const proyectoNombre = proyecto === SIN_PROYECTO ? 'sin proyecto' : proyectos.find((p) => p.id === proyecto)?.name || '';
  const ctx = { persona: datos.persona, equipos, proyecto, proyectoNombre };
  const g = clasificar(datos.issues, { equipos, proyecto });
  const consulta = (grupo) => botonesDeConsulta(grupo, g[grupo], ctx);
  // append() pinta `null` como texto: lo vacío se quita antes.
  main.append(...[
    selectorDeProyecto(proyectos, sinProyecto, proyecto),
    el('h2', {}, 'Lo siguiente'),
    g.siguiente ? tarjetaTuya(g.siguiente, true) : el('p', { class: 'vacio' }, proyecto ? 'Nada tuyo para hoy en este proyecto.' : 'Nada tuyo para hoy.'),
    // La consulta de "Ahora" trae también "Lo siguiente": es el mismo grupo.
    ...seccion('Ahora', g.ahora.slice(1), (i) => tarjetaTuya(i), 'Nada más.', consulta('ahora')),
    ...seccion('Para agente', g.agente, tarjetaAgente, 'Nada listo para soltar.', consulta('agente')),
    ...seccion('Esperan info', g.info, tarjetaAtorada, 'Nada esperando respuesta.', consulta('info')),
    el('h2', {}, 'No es para hoy'),
    plegado('Esperando a otros', g.esperando, 'review o block, más viejo primero', consulta('esperando')),
    plegado('Después', g.despues, '👤 en Backlog', consulta('despues')),
    plegado('Sin triage', g.sinTriage, 'corre /triage-dia', consulta('sinTriage')),
    el('p', { class: 'meta' },
      datos.persona ? `Tareas de ${datos.persona.name} (${datos.persona.email}) · ` : '',
      `Revisado ${new Date(datos.at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · ${datos.issues.length} abiertos`),
    datos.issues.length >= TOPE
      ? el('p', { class: 'aviso' }, `Llegaste al tope de ${TOPE} issues: puede faltar alguno. Cierra o cancela los viejos en Linear.`)
      : null,
  ].filter(Boolean));
}

/** Los issues que el popup cuenta con el filtro de equipos y sin el de proyecto: de ahí salen las opciones. */
function contados(issues, equipos) {
  const g = clasificar(issues, { equipos });
  return [...g.ahora, ...g.agente, ...g.info, ...g.esperando, ...g.despues, ...g.sinTriage];
}

function selectorDeProyecto(proyectos, sinProyecto, actual) {
  if (!proyectos.length && !sinProyecto) return null;
  const opcion = (value, texto) => el('option', { value, selected: value === actual ? 'selected' : false }, texto);
  return el('label', { class: 'proyecto' }, 'Proyecto',
    el('select', {
      onchange: async (e) => {
        await guardarConfig({ proyecto: e.target.value });
        await pintarAhora();
      },
    },
    opcion('', 'Todos'),
    ...proyectos.map((p) => opcion(p.id, `${p.name} (${p.n})`)),
    sinProyecto ? opcion(SIN_PROYECTO, `Sin proyecto (${sinProyecto})`) : null));
}

const REPETIR = { no: '', diario: ' · diario', laborables: ' · L a V' };

function cuando(at) {
  const d = new Date(at);
  const hoy = new Date();
  const manana = new Date(); manana.setDate(hoy.getDate() + 1);
  const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return `Hoy ${hora}`;
  if (d.toDateString() === manana.toDateString()) return `Mañana ${hora}`;
  return `${d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} ${hora}`;
}

async function pintarRecordatorios() {
  const main = $('#recordatorios');
  const lista = (await recordatorios()).slice().sort((a, b) => Number(b.disparado) - Number(a.disparado) || a.at - b.at);
  const vencidos = lista.filter((r) => r.disparado).length;
  $('#n-rec').textContent = lista.length ? `(${vencidos ? vencidos + '!' : lista.length})` : '';
  main.replaceChildren();
  if (!lista.length) {
    main.append(el('p', { class: 'vacio' }, 'Sin recordatorios. Escribe arriba: "10am revisar propuesta".'));
    return;
  }
  for (const r of lista) {
    const repite = r.repetir && r.repetir !== 'no';
    main.append(el('div', { class: `item ${r.disparado ? 'vencido' : ''}` },
      el('div', { class: 'fila' },
        el('span', { class: 'id' }, r.disparado ? 'Ya sonó' : cuando(r.at) + (REPETIR[r.repetir] || '')),
        el('span', { class: 'titulo' }, r.issueUrl ? el('a', { href: r.issueUrl, target: '_blank' }, r.texto) : r.texto)),
      el('div', { class: 'acciones' },
        el('button', { onclick: () => borrar(r.id) }, repite ? 'Borrar' : 'Hecho'),
        r.disparado ? el('button', { onclick: () => posponer(r.id) }, '+10 min') : null)));
  }
}

async function borrar(id) {
  await guardarRecordatorios((await recordatorios()).filter((r) => r.id !== id));
  await chrome.runtime.sendMessage({ tipo: 'recordatorios' });
  await pintarRecordatorios();
}

async function posponer(id) {
  const lista = await recordatorios();
  const r = lista.find((x) => x.id === id);
  if (r) { r.disparado = false; r.at = Date.now() + 10 * 60 * 1000; }
  await guardarRecordatorios(lista);
  await chrome.runtime.sendMessage({ tipo: 'recordatorios' });
  await pintarRecordatorios();
}

$('#rapido').addEventListener('submit', async (e) => {
  e.preventDefault();
  const campo = $('#rapido-texto');
  const hora = $('#rapido-hora').value;
  const repetir = $('#rapido-repetir').value;
  let texto = campo.value.trim();
  let hhmm = hora || null;
  let at = null;
  if (!hhmm) {
    const p = parseRapido(texto);
    if (!p) return avisar('Pon una hora: "10am revisar propuesta", "a las 16:30 llamar" o "en 30 min …".');
    texto = p.texto;
    hhmm = p.hhmm || null;
    at = p.at || null;
  }
  if (!texto) return avisar('¿Qué te recuerdo?');
  if (hhmm) at = siguienteHora(hhmm, repetir);
  const lista = await recordatorios();
  lista.push({
    id: crypto.randomUUID(), texto, at, hhmm, repetir: hhmm ? repetir : 'no', disparado: false,
    issueId: campo.dataset.issueId || null, issueUrl: campo.dataset.issueUrl || null,
  });
  await guardarRecordatorios(lista);
  await chrome.runtime.sendMessage({ tipo: 'recordatorios' });
  campo.value = ''; $('#rapido-hora').value = ''; delete campo.dataset.issueId; delete campo.dataset.issueUrl;
  avisar(`Te aviso ${cuando(at).toLowerCase()}`.replace(/\.?$/, '.'), true);
  await pintarRecordatorios();
});

for (const b of document.querySelectorAll('[data-tab]')) {
  b.addEventListener('click', () => {
    for (const x of document.querySelectorAll('[data-tab]')) x.classList.toggle('activa', x === b);
    $('#ahora').hidden = b.dataset.tab !== 'ahora';
    $('#recordatorios').hidden = b.dataset.tab !== 'recordatorios';
  });
}
$('#ajustes').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#refrescar').addEventListener('click', async () => {
  avisar('Revisando Linear…', true);
  await chrome.runtime.sendMessage({ tipo: 'refrescar' });
  avisar('');
  await pintar();
});

async function pintar() {
  await Promise.all([pintarAhora(), pintarRecordatorios()]);
}

pintar();
// Si el caché tiene más de 2 min, pide uno nuevo y vuelve a pintar.
cache().then((d) => {
  if (!d || Date.now() - d.at > 2 * 60 * 1000) chrome.runtime.sendMessage({ tipo: 'refrescar' }).then(pintar);
});
