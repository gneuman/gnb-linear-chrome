import { clasificar, resumen, riesgo, talla, labelsParaAgente, proyectosDe, estadisticas, SIN_PROYECTO, OPCIONES_TALLA, LABEL, RIESGO } from './lib/estado.js';
import { filtroDeGrupo, textoParaClaude, textoDeIssue, GRUPOS } from './lib/consultas.js';
import { parseRapido, siguienteHora } from './lib/schedule.js';
import { empezar, moverAAgente, actualizar, opcionesDelTeam, issuesTaskAI, terminar, comentar, idsDeLabels, idDeIssue, traerIssue, TOPE } from './lib/linear.js';
import { listoParaClaude, repoParaClaude, dispararTaskAI, mandadoHacePoco, seguimiento, prsDe, hechoPorPRs } from './lib/taskai.js';
import { config, guardarConfig, cache, recordatorios, guardarRecordatorios, equiposDe } from './lib/store.js';
import { t, locale, usarIdioma, traducirDom } from './lib/i18n.js';

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

const PRIORIDAD = () => ['', t('Urgente'), t('Alta'), t('Media'), t('Baja')];

function meta(issue) {
  const partes = [issue.team?.key, issue.state?.name];
  if (issue.dueDate) partes.push(t('vence {fecha}', { fecha: issue.dueDate }));
  if (issue.delegate) partes.push(t('🤖 {nombre} lo trabaja', { nombre: issue.delegate.name }));
  // El repo que TaskAI tiene que tener conectado para hacer el issue.
  const { repo, varios } = repoParaClaude(issue, ajustes.duenoRepos);
  partes.push(repo ? `📦 ${repo}` : varios ? t('📦 varios repos') : t('📦 sin repo'));
  return partes.filter(Boolean).join(' · ');
}

/** Importancia y tamaño de un vistazo: prioridad con color y talla (XS–XL). */
function chips(issue) {
  const tt = talla(issue);
  return [
    issue.priority ? el('span', { class: `chip p${issue.priority}`, title: t('Prioridad {p}', { p: PRIORIDAD()[issue.priority].toLowerCase() }) }, PRIORIDAD()[issue.priority]) : null,
    tt ? el('span', { class: 'chip talla', title: t('Tamaño (estimación)') }, tt) : null,
  ];
}

function cabecera(issue) {
  const color = riesgo(issue);
  return el('div', { class: 'fila' },
    el('span', { class: `punto ${color || ''}`, title: color ? t('riesgo {color}', { color: t(color) }) : t('sin riesgo') }),
    el('span', { class: 'id' }, issue.identifier),
    el('span', { class: 'titulo' }, el('a', { href: issue.url, target: '_blank' }, issue.title)),
    ...chips(issue));
}

function botonRecordar(issue) {
  return el('button', {
    title: t('Crear un recordatorio de este issue'),
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
    title: t('Copiar este issue para pegarlo en una sesión de Claude'),
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(textoDeIssue(issue));
        avisar(t('{id} copiado. Pégalo en Claude.', { id: issue.identifier }), true);
      } catch (err) {
        avisar(t('No pude copiar: {error}', { error: err.message }));
      }
    },
  }, t('Copiar issue'));
}

async function accion(fn, okTexto) {
  try {
    avisar(t('Guardando en Linear…'), true);
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
    listoCuando ? el('div', { class: 'listo' }, el('b', {}, t('Listo cuando: ')), listoCuando) : null,
    lineaPRs(issue),
    el('div', { class: 'acciones' },
      enCurso
        ? el('button', { onclick: () => chrome.tabs.create({ url: issue.url }) }, t('Abrir'))
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
          }, t('Empezar')),
      botonCopiar(issue),
      botonAgente(issue),
      // En tus tarjetas solo sale si ya está listo; en "Para agente" sale siempre y dice qué falta.
      botonTaskAI(issue),
      botonComentar(issue),
      botonDelegar(issue),
      botonEditar(issue),
      botonRecordar(issue)));
}

// Ajustes vigentes del último pintado: las tarjetas los leen sin volver a storage.
let ajustes = {};

// Nombre → ID de las etiquetas en este workspace: se pide una vez por popup abierto.
let etiquetas = null;
function idsEtiquetas(llave) {
  etiquetas ||= idsDeLabels(llave, [...Object.values(LABEL), ...Object.values(RIESGO)]).catch((e) => { etiquetas = null; throw e; });
  return etiquetas;
}

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
    r = await moverAAgente(c.llave, issue, { cambio: labelsParaAgente(issue, color, await idsEtiquetas(c.llave)), agenteNombre: c.agente });
  }, () => {
    if (r.sinAgente) return t('{id} → Para agente, sin delegar: no encontré al agente "{agente}". Revísalo en Ajustes.', { id: issue.identifier, agente: r.sinAgente });
    return `${issue.identifier} → ${t('Para agente')}${r.agente ? t(' · {agente} ya lo está trabajando', { agente: r.agente }) : ''}`;
  });
  botones.forEach((b) => { b.disabled = false; });
}

/** Si no tiene riesgo, lo pide ahí mismo con tres botones; si ya lo tiene, lo suelta directo. */
function botonAgente(issue, texto = t('Mover a agente')) {
  return el('button', {
    title: ajustes.agente ? t('Soltarlo a un agente (🤖) y delegarlo a {agente}', { agente: ajustes.agente }) : t('Soltarlo a un agente (🤖)'),
    onclick: (e) => {
      const boton = e.currentTarget;
      if (riesgo(issue)) return soltar(issue, null, boton);
      const fila = boton.closest('.acciones');
      if (fila.nextElementSibling?.classList.contains('elegir-riesgo')) return;
      fila.after(el('div', { class: 'acciones elegir-riesgo' },
        el('span', { class: 'meta' }, t('Riesgo:')),
        ...['verde', 'amarillo', 'rojo'].map((color) =>
          el('button', { class: `riesgo ${color}`, onclick: (ev) => soltar(issue, color, ev.currentTarget) }, t(color)))));
    },
  }, texto);
}

function tarjetaAgente(issue) {
  const color = riesgo(issue);
  const nota = t({ verde: 'el agente fusiona', amarillo: 'segundo agente + tu "va"', rojo: 'solo tú fusionas' }[color] || 'sin riesgo: ponlo antes de soltarlo');
  return el('div', { class: 'item' },
    cabecera(issue),
    el('div', { class: 'meta' }, `${meta(issue)} · ${nota}`),
    lineaPRs(issue),
    // Los que ya tienen 🤖 pero nadie los trabaja: un clic para que el agente los tome.
    el('div', { class: 'acciones' },
      botonTaskAI(issue),
      botonCopiar(issue),
      issue.delegate || !ajustes.agente ? null : botonAgente(issue, t('Delegar a {agente}', { agente: ajustes.agente })),
      botonComentar(issue),
      botonDelegar(issue),
      botonEditar(issue)));
}

/**
 * Ventanita encima del popup: título, texto y botones. Regresa `{ cambiar, cerrar }`
 * para reusarla de "¿Lo mando?" a "Lanzando…" a "✅ Lanzado". Clic fuera la cierra.
 */
function modal({ titulo, texto = '', cuerpo = null, botones = [], tono = '' }) {
  document.querySelector('.modal-fondo')?.remove();
  const caja = el('div', { class: `modal ${tono}`, role: 'dialog', 'aria-modal': 'true' });
  const fondo = el('div', { class: 'modal-fondo', onclick: (e) => { if (e.target === fondo) cerrar(); } }, caja);
  const cerrar = () => fondo.remove();
  const cambiar = (o) => {
    caja.className = `modal ${o.tono || ''}`;
    // replaceChildren pinta `null` como texto: lo vacío se quita.
    caja.replaceChildren(...[
      el('h3', {}, o.titulo),
      o.texto ? el('p', {}, o.texto) : null,
      o.cuerpo,
      el('div', { class: 'acciones' }, ...(o.botones || []).map((b) =>
        b.href
          ? el('a', { class: `boton ${b.primario ? 'primario' : ''}`, href: b.href, target: '_blank' }, b.texto)
          : el('button', { class: b.primario ? 'primario' : '', onclick: () => (b.onclick ? b.onclick() : cerrar()) }, b.texto))),
    ].filter(Boolean));
  };
  cambiar({ titulo, texto, cuerpo, botones, tono });
  document.body.append(fondo);
  return { cambiar, cerrar };
}

/**
 * Manda el issue a TaskAI (la rutina de Claude que hace el issue y deja el PR a revisión).
 * Sale en todas las tarjetas. Todo pasa en un modal: si al issue le falta algo, lo dice
 * y deja arreglar ahí mismo lo que se puede (🤖 y color); si está listo, pregunta,
 * enseña "Lanzando…" y deja el resultado: ✅ Lanzado o ❌ No se lanzó.
 */
function botonTaskAI(issue) {
  // Sin token no hay a quién mandarlo: el botón ni sale (se configura en Ajustes).
  if (!ajustes.tokenTaskAI) return null;
  const { listo, falta } = listoParaClaude(issue, ajustes.duenoRepos);
  return el('button', {
    class: listo ? 'primario' : '',
    title: listo ? t('Claude lo hace y te deja el PR a revisión, sin fusionar') : t('Antes falta: {lista}', { lista: falta.map((f) => t(f)).join(', ') }),
    onclick: () => abrirTaskAI(issue),
  }, listo ? t('🤖 Mandar a Claude') : t('🤖 Mandar a Claude · falta {n}', { n: falta.length }));
}

async function abrirTaskAI(issue, m = null) {
  const c = await config();
  const mostrar = (o) => (m ? m.cambiar(o) : (m = modal(o)));
  const { listo, falta, repo } = listoParaClaude(issue, c.duenoRepos);

  if (!listo) {
    const color = riesgo(issue);
    const arreglable = falta.every((f) => f === LABEL.agente || f === 'riesgo');
    const poner = (nuevo) => async () => {
      mostrar({ titulo: t('Preparando {id}…', { id: issue.identifier }) });
      try {
        await actualizar(c.llave, issue.id, labelsParaAgente(issue, nuevo, await idsEtiquetas(c.llave)));
        const extra = [{ name: LABEL.agente }];
        if (nuevo && !color) extra.push({ name: RIESGO[nuevo], parent: { name: 'riesgo' } });
        await abrirTaskAI({ ...issue, labels: { nodes: [...(issue.labels?.nodes || []), ...extra] } }, m);
        chrome.runtime.sendMessage({ tipo: 'refrescar' }).then(pintar);
      } catch (err) {
        mostrar({ tono: 'mal', titulo: t('❌ No pude prepararlo'), texto: err.message, botones: [{ texto: t('Cerrar') }] });
      }
    };
    const lista = el('ul', { class: 'falta' }, ...falta.map((f) => el('li', {}, AYUDA[f] ? t(AYUDA[f], { label: LABEL.agente }) : f)));
    const botones = color === 'rojo'
      ? [{ texto: t('Abrir en Linear'), href: issue.url, primario: true }, { texto: t('Cerrar') }]
      : arreglable
        ? (color
          ? [{ texto: t('Ponerle 🤖 y mandarlo'), primario: true, onclick: poner(null) }]
          : [{ texto: `🤖 ${t('verde')}`, primario: true, onclick: poner('verde') }, { texto: `🤖 ${t('amarillo')}`, onclick: poner('amarillo') }])
          .concat([{ texto: t('Cancelar') }])
        : [{ texto: t('Abrir en Linear'), href: issue.url, primario: true }, { texto: t('Cerrar') }];
    return mostrar({ tono: 'ojo', titulo: t('{id} todavía no está listo para Claude', { id: issue.identifier }),
      texto: arreglable && color !== 'rojo' ? t('Lo arreglas desde aquí:') : t('Esto se arregla en el issue, en Linear:'), cuerpo: lista, botones });
  }

  if (!c.tokenTaskAI) {
    return mostrar({ tono: 'mal', titulo: t('❌ No se lanzó'), texto: t('Falta el token de tu rutina. Genéralo en claude.ai/code/routines → tu rutina → disparo por API, y pégalo en Ajustes.'),
      botones: [{ texto: t('Abrir Ajustes'), primario: true, onclick: () => chrome.runtime.openOptionsPage() }, { texto: t('Cerrar') }] });
  }
  // Cada disparo abre una sesión nueva de Claude: dos clics = dos PRs.
  const { enviadosTaskAI = {} } = await chrome.storage.local.get('enviadosTaskAI');
  const repetido = mandadoHacePoco(enviadosTaskAI, issue.identifier);
  const lanzar = async () => {
    mostrar({ titulo: t('Lanzando {id}…', { id: issue.identifier }), texto: t('Hablando con TaskAI.') });
    try {
      const r = await dispararTaskAI({ token: c.tokenTaskAI, rutina: c.rutinaTaskAI, issueId: issue.identifier });
      await chrome.storage.local.set({ enviadosTaskAI: { ...enviadosTaskAI, [issue.identifier]: Date.now() } });
      mostrar({ tono: 'bien', titulo: t('✅ Lanzado: {id}', { id: issue.identifier }),
        texto: t('TaskAI lo recibió ({status}). Claude ya está trabajando; el PR llega a Internal Review y te comenta en el issue.', { status: r.status }),
        botones: [r.url ? { texto: t('Ver la sesión'), href: r.url, primario: true } : null, { texto: t('Listo') }].filter(Boolean) });
    } catch (err) {
      mostrar({ tono: 'mal', titulo: t('❌ No se lanzó'), texto: err.message,
        botones: [{ texto: t('Reintentar'), primario: true, onclick: lanzar }, { texto: t('Cerrar') }] });
    }
  };
  mostrar({
    tono: repetido ? 'ojo' : '',
    titulo: repetido ? t('{id} ya se mandó hace poco', { id: issue.identifier }) : t('¿Mandar {id} a Claude?', { id: issue.identifier }),
    texto: repetido ? t('Se mandó hace menos de 30 min. Si lo mandas otra vez se abre otra sesión y saldría otro PR.') : `${issue.title}. ${t('Claude lo hace y te deja el PR a revisión, sin fusionar.')}`,
    // La extensión no ve el entorno de la rutina: no sabe si el repo está conectado, solo lo avisa.
    cuerpo: el('p', { class: 'repo' }, '📦 Repo: ', el('b', {}, repo), el('br'), t('Revisa que tu rutina lo tenga conectado (la extensión no lo puede ver). Si no, Claude comenta "falta agregar" en el issue y no lo hace.')),
    botones: [{ texto: repetido ? t('Mandar otra vez') : t('Mandar'), primario: true, onclick: lanzar }, { texto: t('Abrir mi rutina'), href: urlRutina(c.rutinaTaskAI) }, { texto: t('Cancelar') }],
  });
}

/** La página de la rutina en claude.ai, para revisar o agregarle repos. */
const urlRutina = (id) => `https://claude.ai/code/routines/${id || ''}`;

const AYUDA = {
  [LABEL.agente]: 'La etiqueta {label}',
  riesgo: 'El color de riesgo: verde o amarillo',
  'riesgo verde o amarillo (es rojo)': 'Es rojo: ese no lo hace un agente, lo haces tú',
  repo: 'El repo: lígalo al issue o al proyecto en Linear, o escribe dueño/repo en la descripción (el dueño de GitHub va en Ajustes)',
  'un solo repo (trae varios)': 'Un solo repo: la descripción menciona varios; parte el issue',
  '"Listo cuando"': 'Una sección "Listo cuando" con lo que se tiene que comprobar',
};

/** Asignar el issue a otra persona del team, en un modal. */
function botonDelegar(issue) {
  return el('button', {
    title: t('Asignárselo a otra persona del equipo'),
    onclick: async () => {
      const m = modal({ titulo: t('Delegar {id}', { id: issue.identifier }), texto: t('Cargando al equipo…') });
      try {
        const c = await config();
        const { personas } = await opcionesDe(c.llave, issue.team.id);
        const sel = el('select', { class: 'modal-select' },
          ...personas.map((p) => el('option', { value: p.id, selected: p.id === issue.assignee?.id ? 'selected' : false }, p.name)));
        m.cambiar({ titulo: t('Delegar {id}', { id: issue.identifier }), texto: issue.title, cuerpo: sel,
          botones: [{ texto: t('Asignar'), primario: true, onclick: async () => {
            const nombre = sel.selectedOptions[0].text;
            m.cambiar({ titulo: t('Asignando a {nombre}…', { nombre }) });
            try {
              await actualizar(c.llave, issue.id, { assigneeId: sel.value });
              m.cambiar({ tono: 'bien', titulo: t('✅ {id} ahora es de {nombre}', { id: issue.identifier, nombre }), texto: t('Ya está en Linear. Le llega la notificación.'), botones: [{ texto: t('Listo') }] });
              await chrome.runtime.sendMessage({ tipo: 'refrescar' });
              await pintar();
            } catch (err) {
              m.cambiar({ tono: 'mal', titulo: t('❌ No se asignó'), texto: err.message, botones: [{ texto: t('Cerrar') }] });
            }
          } }, { texto: t('Cancelar') }] });
      } catch (err) {
        m.cambiar({ tono: 'mal', titulo: t('❌ No pude cargar al equipo'), texto: err.message, botones: [{ texto: t('Cerrar') }] });
      }
    },
  }, t('Delegar a…'));
}

/** Dejar un comentario en Linear sin abrir el issue. Ctrl+Enter lo manda. */
function botonComentar(issue) {
  return el('button', {
    title: t('Dejar un comentario en Linear'),
    onclick: () => {
      const caja = el('textarea', { class: 'modal-texto', rows: '4', placeholder: t('Tu comentario…') });
      let m;
      const mandar = async () => {
        const texto = caja.value;
        if (!texto.trim()) { caja.focus(); return; }
        m.cambiar({ titulo: t('Comentando…') });
        try {
          const c = await config();
          await comentar(c.llave, issue.id, texto);
          m.cambiar({ tono: 'bien', titulo: t('✅ Comentario en {id}', { id: issue.identifier }), texto: t('Ya está en Linear.'), botones: [{ texto: t('Listo') }] });
        } catch (err) {
          // El texto no se pierde: vuelve a la caja para reintentar.
          m.cambiar({ tono: 'mal', titulo: t('❌ No se comentó'), texto: err.message, cuerpo: caja, botones: [{ texto: t('Reintentar'), primario: true, onclick: mandar }, { texto: t('Cerrar') }] });
        }
      };
      caja.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) mandar(); });
      m = modal({ titulo: t('Comentar en {id}', { id: issue.identifier }), texto: issue.title, cuerpo: caja,
        botones: [{ texto: t('Comentar'), primario: true, onclick: mandar }, { texto: t('Cancelar') }] });
      caja.focus();
    },
  }, t('💬 Comentar'));
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
    title: t('Cambiar estado, prioridad, talla o persona en Linear'),
    onclick: async (e) => {
      const fila = e.currentTarget.closest('.acciones');
      const abierta = fila.nextElementSibling;
      if (abierta?.classList.contains('editar')) return abierta.remove();
      const caja = el('div', { class: 'acciones editar' }, el('span', { class: 'meta' }, t('Cargando…')));
      fila.after(caja);
      try {
        const c = await config();
        const { estados, personas } = await opcionesDe(c.llave, issue.team.id);
        const cambiar = (input, texto) => accion(() => actualizar(c.llave, issue.id, input), `${issue.identifier} → ${texto}`);
        const opcion = (value, texto, actual) => el('option', { value, selected: actual ? 'selected' : false }, texto);
        caja.replaceChildren(
          el('select', { title: t('Estado'), onchange: (ev) => cambiar({ stateId: ev.target.value }, ev.target.selectedOptions[0].text) },
            ...estados.map((s) => opcion(s.id, s.name, s.id === issue.state?.id))),
          el('select', { title: t('Prioridad'), onchange: (ev) => cambiar({ priority: Number(ev.target.value) }, t('prioridad {p}', { p: ev.target.selectedOptions[0].text })) },
            ...[[1, 'Urgente'], [2, 'Alta'], [3, 'Media'], [4, 'Baja'], [0, 'Sin prioridad']].map(([v, txt]) => opcion(String(v), t(txt), (issue.priority ?? 0) === v))),
          el('select', { title: t('Talla'), onchange: (ev) => cambiar({ estimate: ev.target.value ? Number(ev.target.value) : null }, t('talla {t}', { t: ev.target.selectedOptions[0].text })) },
            opcion('', t('Sin talla'), issue.estimate == null),
            // Una talla fuera de la lista (13, 21) se enseña tal cual, no como "Sin talla".
            issue.estimate != null && !OPCIONES_TALLA.some(([v]) => v === issue.estimate) ? opcion(String(issue.estimate), talla(issue), true) : null,
            ...OPCIONES_TALLA.map(([v, txt]) => opcion(String(v), txt, issue.estimate === v))),
          el('select', { title: t('Persona'), onchange: (ev) => cambiar({ assigneeId: ev.target.value || null }, ev.target.selectedOptions[0].text) },
            opcion('', t('Sin asignar'), !issue.assignee),
            ...personas.map((p) => opcion(p.id, p.name, p.id === issue.assignee?.id))));
      } catch (err) {
        caja.replaceChildren(el('span', { class: 'aviso' }, err.message));
      }
    },
  }, t('Editar'));
}

/**
 * Los PR que Linear ya tiene ligados al issue, con liga directa. Si alguno ya se
 * fusionó y el issue sigue abierto, lo dice y ofrece pasarlo a Done: no hace
 * falta mandarlo a Claude para descubrir que ya está hecho.
 */
function lineaPRs(issue) {
  const prs = prsDe(issue);
  if (!prs.length) return null;
  const hecho = hechoPorPRs(prs);
  const pendientes = prs.filter((p) => p.estado === 'abierto' || p.estado === 'borrador');
  const algunoFusionado = prs.some((p) => p.estado === 'fusionado');
  return el('div', { class: `prs ${hecho ? 'fusionado' : ''}` },
    '🔀 ',
    ...prs.flatMap((p, i) => [i ? ' · ' : '', el('a', { href: p.url, target: '_blank', title: p.titulo }, `PR #${p.numero}`), p.estado ? ` ${t(p.estado)}` : '']),
    hecho
      ? el('span', {}, t(' · ya está hecho. '), el('button', { onclick: () => confirmarDone(issue) }, t('Pasar a Done')))
      : algunoFusionado && pendientes.length
        ? el('span', {}, t(' · falta {lista}: revísalo o ciérralo antes de pasar a Done.', { lista: pendientes.map((p) => `#${p.numero}`).join(', ') }))
        : null);
}

function confirmarDone(issue, despues = pintar) {
  const m = modal({ titulo: t('¿Pasar {id} a Done?', { id: issue.identifier }), texto: issue.title, botones: [{ texto: t('Pasar a Done'), primario: true, onclick: async () => {
    m.cambiar({ titulo: t('Cerrando {id}…', { id: issue.identifier }) });
    try {
      const c = await config();
      await terminar(c.llave, issue);
      m.cambiar({ tono: 'bien', titulo: t('✅ {id} en Done', { id: issue.identifier }), botones: [{ texto: t('Listo') }] });
      await chrome.runtime.sendMessage({ tipo: 'refrescar' });
      await despues();
    } catch (err) {
      m.cambiar({ tono: 'mal', titulo: t('❌ No se cerró'), texto: err.message, botones: [{ texto: t('Cerrar') }] });
    }
  } }, { texto: t('Cancelar') }] });
}

function tarjetaAtorada(issue) {
  const dias = issue.dias == null ? '' : ` · ${t('{n} d sin moverse', { n: issue.dias })}`;
  return el('div', { class: 'item' },
    cabecera(issue),
    el('div', { class: 'meta' }, `${meta(issue)}${dias}`),
    lineaPRs(issue),
    el('div', { class: 'acciones' }, botonTaskAI(issue), botonCopiar(issue), botonComentar(issue), botonDelegar(issue), botonEditar(issue), botonRecordar(issue)));
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
      title: t('Copiar el endpoint exacto y la lista para pegar en Claude'),
      onclick: async (e) => {
        parar(e);
        const texto = textoParaClaude({
          grupo, persona: ctx.persona, proyectoNombre: ctx.proyectoNombre, equipos: ctx.equipos,
          issues: lista, filtro: filtro(), extra: notasParaClaude,
        });
        try {
          await navigator.clipboard.writeText(texto);
          avisar(t('{grupo}: consulta y {n} issues copiados. Pégalos en Claude.', { grupo: t(GRUPOS[grupo]), n: lista.length }), true);
        } catch (err) {
          avisar(t('No pude copiar: {error}', { error: err.message }));
        }
      },
    }, t('Copiar para Claude')));
}

const VISIBLES = 5;

/** Título + las primeras 5 tarjetas; el resto detrás de "ver N más". `consulta` = botones del grupo. */
function seccion(titulo, lista, tarjeta, vacio, consulta = null) {
  const caja = el('div');
  const pintarCaja = (todas) => {
    const mostrar = todas ? lista : lista.slice(0, VISIBLES);
    caja.replaceChildren(...mostrar.map(tarjeta));
    if (lista.length > VISIBLES) {
      caja.append(el('button', { class: 'mas', onclick: () => pintarCaja(!todas) }, todas ? t('Ver menos') : t('Ver {n} más', { n: lista.length - VISIBLES })));
    }
  };
  if (lista.length) pintarCaja(false);
  else caja.append(el('p', { class: 'vacio' }, vacio));
  return [el('h2', { class: 'con-consulta' }, el('span', {}, `${titulo} (${lista.length})`), consulta), caja];
}

/**
 * Tira de números arriba, como el Radar de la mañana: de un vistazo cuánto hay,
 * cuánto está en curso y qué se está quemando. Urgentes y vencidos salen en rojo si hay.
 */
function numeros(n) {
  const caja = (valor, texto, alerta = false) =>
    el('div', { class: `numero ${alerta && valor ? 'alerta' : ''}` }, el('b', {}, String(valor)), el('span', {}, texto));
  return el('div', { class: 'numeros', title: t('Tus issues abiertos con el filtro de arriba') },
    caja(n.abiertos, t('abiertos')),
    caja(n.enCurso, t('en curso')),
    caja(n.urgentes, t('urgentes'), true),
    caja(n.vencidos, t('vencidos'), true),
    caja(n.quietos, t('+3 d quietos'), true),
    caja(n.agente, t('para agente')));
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
    main.append(el('p', {}, t('Conecta Linear: '), el('a', { href: '#', onclick: () => chrome.runtime.openOptionsPage() }, t('pon tu API key en Ajustes')), '.'));
    return;
  }
  if (datos?.error) main.append(el('p', { class: 'aviso' }, datos.error));
  if (!datos?.issues) {
    main.append(el('p', { class: 'vacio' }, t('Cargando…')));
    return;
  }
  ajustes = c;
  $('[data-tab="taskai"]').hidden = !c.tokenTaskAI;
  const equipos = equiposDe(c);
  const { lista: proyectos, sinProyecto } = proyectosDe(contados(datos.issues, equipos));
  // Si el proyecto guardado ya no trae issues tuyos, se vuelve a "Todos".
  const vigente = c.proyecto === SIN_PROYECTO ? sinProyecto > 0 : proyectos.some((p) => p.id === c.proyecto);
  const proyecto = vigente ? c.proyecto : '';
  const proyectoNombre = proyecto === SIN_PROYECTO ? t('sin proyecto') : proyectos.find((p) => p.id === proyecto)?.name || '';
  const ctx = { persona: datos.persona, equipos, proyecto, proyectoNombre };
  const g = clasificar(datos.issues, { equipos, proyecto });
  const consulta = (grupo) => botonesDeConsulta(grupo, g[grupo], ctx);
  // append() pinta `null` como texto: lo vacío se quita antes.
  main.append(...[
    await seccionTraidos(datos.persona),
    selectorDeProyecto(proyectos, sinProyecto, proyecto),
    numeros(estadisticas(datos.issues, { equipos, proyecto })),
    el('h2', {}, t('Lo siguiente')),
    g.siguiente ? tarjetaTuya(g.siguiente, true) : el('p', { class: 'vacio' }, proyecto ? t('Nada tuyo para hoy en este proyecto.') : t('Nada tuyo para hoy.')),
    // La consulta de "Ahora" trae también "Lo siguiente": es el mismo grupo.
    ...seccion(t('Ahora'), g.ahora.slice(1), (i) => tarjetaTuya(i), t('Nada más.'), consulta('ahora')),
    ...seccion(t('Para agente'), g.agente, tarjetaAgente, t('Nada listo para soltar.'), consulta('agente')),
    ...seccion(t('Esperan info'), g.info, tarjetaAtorada, t('Nada esperando respuesta.'), consulta('info')),
    el('h2', {}, t('No es para hoy')),
    plegado(t('Esperando a otros'), g.esperando, t('review o block, más viejo primero'), consulta('esperando')),
    plegado(t('Después'), g.despues, t('👤 en Backlog'), consulta('despues')),
    plegado(t('Sin triage'), g.sinTriage, t('corre /triage-dia'), consulta('sinTriage')),
    el('p', { class: 'meta' },
      datos.persona ? `${t('Tareas de {nombre}', { nombre: datos.persona.name })} (${datos.persona.email}) · ` : '',
      `${t('Revisado {hora}', { hora: new Date(datos.at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) })} · ${t('{n} abiertos', { n: datos.issues.length })} · `,
      el('a', { href: 'https://gabrielneuman.com', target: '_blank' }, 'gabrielneuman.com')),
    datos.issues.length >= TOPE
      ? el('p', { class: 'aviso' }, t('Llegaste al tope de {n} issues: puede faltar alguno. Cierra o cancela los viejos en Linear.', { n: TOPE }))
      : null,
  ].filter(Boolean));
}

// ---------- Traer un issue cualquiera ----------
// Pegas "CID-683" o su liga y queda fijo arriba con todos los botones (Mandar a
// Claude, Editar, Comentar…), aunque no sea tuyo. Se quedan hasta que les das ✕
// o hasta que pasan a Done o Canceled.

const cerrado = (i) => ['completed', 'canceled'].includes(i.state?.type);

const MAX_TRAIDOS = 5;

async function traidos() {
  const { traidos = [] } = await chrome.storage.local.get('traidos');
  return traidos;
}

async function guardarTraidos(lista) {
  await chrome.storage.local.set({ traidos: lista.slice(0, MAX_TRAIDOS) });
}

async function seccionTraidos(persona) {
  const campo = el('input', { type: 'text', placeholder: t('Pega un issue: CID-683 o su liga'), autocomplete: 'off' });
  const caja = el('div', { class: 'traidos' });
  const form = el('form', { class: 'traer', onsubmit: async (e) => {
    e.preventDefault();
    const id = idDeIssue(campo.value);
    if (!id) return avisar(t('Eso no parece un issue. Pega el ID (CID-683) o la liga de Linear.'));
    await guardarTraidos([id, ...(await traidos()).filter((t) => t !== id)]);
    campo.value = '';
    await pintarAhora();
  } }, campo, el('button', { type: 'submit' }, t('Traer')));

  const ids = await traidos();
  if (ids.length) {
    const c = await config();
    // Se piden en paralelo; uno que falle no tumba a los demás.
    const todos = await Promise.all(ids.map((id) => traerIssue(c.llave, id).catch((err) => ({ error: err.message, identifier: id }))));
    // Los que ya se cerraron (Done o Canceled) se quitan solos de la lista.
    const cerrados = todos.filter(cerrado).map((i) => i.identifier);
    if (cerrados.length) await guardarTraidos(ids.filter((id) => !cerrados.includes(id)));
    const issues = todos.filter((i) => !cerrado(i));
    if (issues.length) caja.append(el('h2', {}, t('📌 Traídos')));
    for (const i of issues) caja.append(tarjetaTraida(i, persona));
  }
  return el('div', {}, form, caja);
}

function tarjetaTraida(issue, persona) {
  const quitar = el('button', { class: 'quitar', title: t('Quitar de aquí (no cambia nada en Linear)'), onclick: async () => {
    await guardarTraidos((await traidos()).filter((t) => t !== issue.identifier));
    await pintarAhora();
  } }, '✕');
  if (issue.error) return el('div', { class: 'item' }, el('div', { class: 'meta' }, `${issue.identifier}: ${issue.error} `, quitar));
  const tarjeta = tarjetaTuya(issue);
  tarjeta.querySelector('.fila').append(quitar);
  if (persona?.id && issue.assignee?.id !== persona.id) {
    tarjeta.querySelector('.meta').append(` · ${t('de {nombre}', { nombre: issue.assignee?.name || t('nadie') })} · `,
      el('button', { onclick: async () => {
        const c = await config();
        await accion(() => actualizar(c.llave, issue.id, { assigneeId: persona.id }), `${issue.identifier} → ${t('ahora es tuyo')}`);
      } }, t('Asignármelo')));
  }
  return tarjeta;
}

/** Los issues que el popup cuenta con el filtro de equipos y sin el de proyecto: de ahí salen las opciones. */
function contados(issues, equipos) {
  const g = clasificar(issues, { equipos });
  return [...g.ahora, ...g.agente, ...g.info, ...g.esperando, ...g.despues, ...g.sinTriage];
}

function selectorDeProyecto(proyectos, sinProyecto, actual) {
  if (!proyectos.length && !sinProyecto) return null;
  const opcion = (value, texto) => el('option', { value, selected: value === actual ? 'selected' : false }, texto);
  return el('label', { class: 'proyecto' }, t('Proyecto'),
    el('select', {
      onchange: async (e) => {
        await guardarConfig({ proyecto: e.target.value });
        await pintarAhora();
      },
    },
    opcion('', t('Todos')),
    ...proyectos.map((p) => opcion(p.id, `${p.name} (${p.n})`)),
    sinProyecto ? opcion(SIN_PROYECTO, `${t('Sin proyecto')} (${sinProyecto})`) : null));
}

/**
 * Pestaña TaskAI: lo que mandaste a Claude y lo que TaskAI comentó, con qué te toca.
 * Arriba lo que espera algo de ti; luego lo que sigue trabajando. Lo cerrado no sale.
 */
async function pintarTaskAI() {
  const main = $('#taskai');
  const c = await config();
  if (!c.llave) return main.replaceChildren(el('p', { class: 'vacio' }, t('Conecta Linear en Ajustes.')));
  main.replaceChildren(el('p', { class: 'vacio' }, t('Revisando lo que hizo TaskAI…')));
  try {
    const { enviadosTaskAI = {} } = await chrome.storage.local.get('enviadosTaskAI');
    const issues = await issuesTaskAI(c.llave, Object.keys(enviadosTaskAI));
    const filas = issues
      .filter((i) => !['completed', 'canceled', 'duplicate'].includes(i.state?.type))
      .map((i) => ({ issue: i, s: seguimiento(i, enviadosTaskAI[i.identifier] || null) }));
    const tuyos = filas.filter((f) => f.s.teToca);
    const resto = filas.filter((f) => !f.s.teToca);
    $('#n-taskai').textContent = tuyos.length ? `(${tuyos.length}!)` : '';
    if (!filas.length) return main.replaceChildren(el('p', { class: 'vacio' }, t('Nada abierto de TaskAI. Lo que mandes con "Mandar a Claude" sale aquí.')));
    main.replaceChildren(...[
      el('h2', {}, `${t('Te toca')} (${tuyos.length})`),
      ...(tuyos.length ? tuyos.map(tarjetaTaskAI) : [el('p', { class: 'vacio' }, t('Nada esperándote.'))]),
      resto.length ? el('h2', {}, `${t('En curso o sin acción')} (${resto.length})`) : null,
      ...resto.map(tarjetaTaskAI),
    ].filter(Boolean));
  } catch (err) {
    main.replaceChildren(el('p', { class: 'aviso' }, err.message));
  }
}

function tarjetaTaskAI({ issue, s }) {
  const pr = s.liga && /github\.com\/.+\/pull\/\d+/.test(s.liga) ? s.liga : null;
  return el('div', { class: 'item' },
    el('div', { class: 'fila' },
      el('span', { class: 'id' }, issue.identifier),
      el('span', { class: 'titulo' }, el('a', { href: issue.url, target: '_blank' }, issue.title))),
    el('div', { class: 'meta' }, `${issue.state?.name || ''}${s.cuando ? ` · ${new Date(s.cuando).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' })}` : ''}`),
    el('div', { class: 'listo' }, `${s.emoji} ${t(s.resultado)}`),
    s.teToca ? el('div', { class: 'te-toca' }, '👉 ', el('b', {}, t('Te toca: ')), t(s.teToca)) : null,
    el('div', { class: 'acciones' },
      pr ? el('a', { class: 'boton primario', href: pr, target: '_blank' }, t('Ver PR')) : null,
      el('a', { class: 'boton', href: issue.url, target: '_blank' }, t('Abrir issue')),
      el('button', { onclick: () => confirmarDone(issue, pintarTaskAI) }, t('Pasar a Done'))));
}

const REPETIR = () => ({ no: '', diario: ` · ${t('diario')}`, laborables: ` · ${t('L a V')}` });

function cuando(at) {
  const d = new Date(at);
  const hoy = new Date();
  const manana = new Date(); manana.setDate(hoy.getDate() + 1);
  const hora = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoy.toDateString()) return t('Hoy {hora}', { hora });
  if (d.toDateString() === manana.toDateString()) return t('Mañana {hora}', { hora });
  return `${d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })} ${hora}`;
}

async function pintarRecordatorios() {
  const main = $('#recordatorios');
  const lista = (await recordatorios()).slice().sort((a, b) => Number(b.disparado) - Number(a.disparado) || a.at - b.at);
  const vencidos = lista.filter((r) => r.disparado).length;
  $('#n-rec').textContent = lista.length ? `(${vencidos ? vencidos + '!' : lista.length})` : '';
  main.replaceChildren();
  if (!lista.length) {
    main.append(el('p', { class: 'vacio' }, t('Sin recordatorios. Escribe arriba: "10am revisar propuesta".')));
    return;
  }
  for (const r of lista) {
    const repite = r.repetir && r.repetir !== 'no';
    main.append(el('div', { class: `item ${r.disparado ? 'vencido' : ''}` },
      el('div', { class: 'fila' },
        el('span', { class: 'id' }, r.disparado ? t('Ya sonó') : cuando(r.at) + (REPETIR()[r.repetir] || '')),
        el('span', { class: 'titulo' }, r.issueUrl ? el('a', { href: r.issueUrl, target: '_blank' }, r.texto) : r.texto)),
      el('div', { class: 'acciones' },
        el('button', { onclick: () => borrar(r.id) }, repite ? t('Borrar') : t('Hecho')),
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
    if (!p) return avisar(t('Pon una hora: "10am revisar propuesta", "a las 16:30 llamar" o "en 30 min …".'));
    texto = p.texto;
    hhmm = p.hhmm || null;
    at = p.at || null;
  }
  if (!texto) return avisar(t('¿Qué te recuerdo?'));
  if (hhmm) at = siguienteHora(hhmm, repetir);
  const lista = await recordatorios();
  lista.push({
    id: crypto.randomUUID(), texto, at, hhmm, repetir: hhmm ? repetir : 'no', disparado: false,
    issueId: campo.dataset.issueId || null, issueUrl: campo.dataset.issueUrl || null,
  });
  await guardarRecordatorios(lista);
  await chrome.runtime.sendMessage({ tipo: 'recordatorios' });
  campo.value = ''; $('#rapido-hora').value = ''; delete campo.dataset.issueId; delete campo.dataset.issueUrl;
  avisar(t('Te aviso {cuando}', { cuando: cuando(at).toLowerCase() }).replace(/\.?$/, '.'), true);
  await pintarRecordatorios();
});

for (const b of document.querySelectorAll('[data-tab]')) {
  b.addEventListener('click', () => {
    for (const x of document.querySelectorAll('[data-tab]')) x.classList.toggle('activa', x === b);
    $('#ahora').hidden = b.dataset.tab !== 'ahora';
    $('#recordatorios').hidden = b.dataset.tab !== 'recordatorios';
    $('#taskai').hidden = b.dataset.tab !== 'taskai';
    if (b.dataset.tab === 'taskai') pintarTaskAI();
  });
}
$('#ajustes').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('#refrescar').addEventListener('click', async () => {
  avisar(t('Revisando Linear…'), true);
  await chrome.runtime.sendMessage({ tipo: 'refrescar' });
  avisar('');
  await pintar();
});

async function pintar() {
  await Promise.all([pintarAhora(), pintarRecordatorios()]);
}

await usarIdioma();
traducirDom();
pintar();
// Si el caché tiene más de 2 min, pide uno nuevo y vuelve a pintar.
cache().then((d) => {
  if (!d || Date.now() - d.at > 2 * 60 * 1000) chrome.runtime.sendMessage({ tipo: 'refrescar' }).then(pintar);
});
