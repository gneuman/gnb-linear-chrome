import { clasificar, resumen, riesgo, puedeIrAAgente, labelsParaAgente, proyectosDe, SIN_PROYECTO } from './lib/estado.js';
import { filtroDeGrupo, textoParaClaude, GRUPOS } from './lib/consultas.js';
import { parseRapido, siguienteHora } from './lib/schedule.js';
import { empezar, actualizar, vistaDeGrupo, TOPE } from './lib/linear.js';
import { config, guardarConfig, cache, recordatorios, guardarRecordatorios, equiposDe, vistas, guardarVista } from './lib/store.js';

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
  const partes = [issue.team?.key, issue.state?.name, PRIORIDAD[issue.priority]];
  if (issue.dueDate) partes.push(`vence ${issue.dueDate}`);
  return partes.filter(Boolean).join(' · ');
}

function cabecera(issue) {
  const color = riesgo(issue);
  return el('div', { class: 'fila' },
    el('span', { class: `punto ${color || ''}`, title: color ? `riesgo ${color}` : 'sin riesgo' }),
    el('span', { class: 'id' }, issue.identifier),
    el('span', { class: 'titulo' }, el('a', { href: issue.url, target: '_blank' }, issue.title)));
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

async function accion(fn, okTexto) {
  try {
    avisar('Guardando en Linear…', true);
    await fn();
    avisar(okTexto, true);
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
      botonAgente(issue),
      botonRecordar(issue)));
}

function botonAgente(issue) {
  return el('button', {
    title: 'Poner 🤖 listo-para-agente',
    onclick: async () => {
      const { ok, falta } = puedeIrAAgente(issue);
      if (!ok) {
        avisar(`Falta ${falta.join(' y ')}. Corre /triage-dia ${issue.identifier} antes de soltarlo.`);
        return;
      }
      const c = await config();
      await accion(() => actualizar(c.llave, issue.id, { labelIds: labelsParaAgente(issue) }), `${issue.identifier} → listo para agente`);
    },
  }, 'Mover a agente');
}

function tarjetaAgente(issue) {
  const color = riesgo(issue);
  const nota = { verde: 'el agente fusiona', amarillo: 'segundo agente + tu "va"', rojo: 'solo tú fusionas' }[color] || 'sin riesgo: ponlo antes de soltarlo';
  return el('div', { class: 'item' }, cabecera(issue), el('div', { class: 'meta' }, `${meta(issue)} · ${nota}`));
}

function tarjetaAtorada(issue) {
  const dias = issue.dias == null ? '' : ` · ${issue.dias} d sin moverse`;
  return el('div', { class: 'item' },
    cabecera(issue),
    el('div', { class: 'meta' }, `${meta(issue)}${dias}`),
    el('div', { class: 'acciones' }, botonRecordar(issue)));
}

/** Notas por issue que le sirven a Claude: riesgo, "Listo cuando" y días sin moverse. */
function notasParaClaude(issue) {
  const color = riesgo(issue);
  const { listoCuando } = resumen(issue.description);
  return [color && `riesgo ${color}`, listoCuando && `Listo cuando: ${listoCuando}`, issue.dias != null && `${issue.dias} d sin moverse`]
    .filter(Boolean).join(' · ');
}

/**
 * Los dos botones de la consulta de un grupo. `ctx` = persona, equipos y proyecto del popup.
 * Copiar: endpoint exacto + lista, para pegar en Claude. Linear: abre la misma búsqueda como vista personal.
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
    }, 'Copiar para Claude'),
    el('button', {
      title: 'Abrir esta misma búsqueda en Linear (vista personal)',
      onclick: async (e) => {
        parar(e);
        // Un doble clic en el primer uso crearía dos vistas.
        const boton = e.currentTarget;
        if (boton.disabled) return;
        boton.disabled = true;
        try {
          avisar('Armando la vista en Linear…', true);
          const c = await config();
          const vista = await vistaDeGrupo(c.llave, { nombre: `¿Qué sigue? · ${GRUPOS[grupo]}`, filtro: filtro(), vista: (await vistas())[grupo] });
          await guardarVista(grupo, vista);
          avisar('');
          chrome.tabs.create({ url: vista.url });
        } catch (err) {
          avisar(err.message);
        } finally {
          boton.disabled = false;
        }
      },
    }, 'Linear ↗'));
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
