// Cliente mínimo de la API GraphQL de Linear con API key personal.
// La llave vive en chrome.storage.local; nunca en el código.

import { t } from './i18n.js';
import { GRUPO_FUERA, cambioFuera, delegadoFuera } from './estado.js';

const URL = 'https://api.linear.app/graphql';

export async function gql(llave, query, variables = {}) {
  if (!llave) throw new Error(t('Falta la API key de Linear (Ajustes).'));
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: llave },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) {
    const msg = json.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`Linear: ${msg}`);
  }
  return json.data;
}

const CAMPOS = `
  id identifier title url branchName priority estimate dueDate updatedAt description
  state { id name type }
  team { id key name }
  project { id name status { name type } externalLinks(first: 10) { nodes { url } } }
  attachments(first: 10) { nodes { url title metadata } }
  labels { nodes { id name parent { name } } }
  delegate { id name }
  assignee { id name }
`;

/**
 * Quién es la persona. Orden: correo de Ajustes → correo del perfil de Chrome → dueño de la API key.
 * Si un correo no existe en Linear (p. ej. Chrome con un Gmail personal), pasa al siguiente.
 */
export async function resolverPersona(llave, correos) {
  for (const { correo, fuente } of correos) {
    if (!correo) continue;
    const data = await gql(
      llave,
      `query($correo: String!) { users(filter: { email: { eqIgnoreCase: $correo } }) { nodes { id name email } } }`,
      { correo }
    );
    const u = data.users.nodes[0];
    if (u) return { ...u, fuente };
  }
  const { viewer } = await gql(llave, 'query { viewer { id name email } }');
  return { ...viewer, fuente: 'llave' };
}

// Con tope de 500 se perdían issues en silencio: el 2026-11-05 Gabriel tenía ~590 abiertos
// y "Para agente" enseñaba 14 de 24. Si se llega al tope, el popup lo dice.
export const TOPE = 2000;
const POR_PAGINA = 250;

/** Issues abiertos asignados a esa persona, paginando de 250 en 250 hasta TOPE. */
export async function issuesDe(llave, personaId) {
  const todos = [];
  let despues = null;
  for (let i = 0; i < TOPE / POR_PAGINA; i++) {
    const data = await gql(
      llave,
      `query($despues: String, $persona: ID) {
        issues(first: ${POR_PAGINA}, after: $despues, filter: {
          assignee: { id: { eq: $persona } },
          state: { type: { nin: ["completed", "canceled"] } }
        }) {
          nodes { ${CAMPOS} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { despues, persona: personaId }
    );
    todos.push(...data.issues.nodes);
    if (!data.issues.pageInfo.hasNextPage) break;
    despues = data.issues.pageInfo.endCursor;
  }
  return todos;
}

/** Estado del team del issue con ese tipo, prefiriendo el que se llame como `nombre`. */
async function estadoDelTeam(llave, issue, tipo, nombre) {
  const data = await gql(
    llave,
    `query($id: String!) { team(id: $id) { states { nodes { id name type position } } } }`,
    { id: issue.team.id }
  );
  const candidatos = data.team.states.nodes.filter((s) => s.type === tipo).sort((a, b) => a.position - b.position);
  const destino = candidatos.find((s) => nombre.test(s.name)) || candidatos[0];
  if (!destino) throw new Error(t('El team {team} no tiene estado "{tipo}".', { team: issue.team.key, tipo }));
  return destino;
}

/** Pasa el issue al estado "In Progress" de su team (o el primer estado de tipo started). */
export async function empezar(llave, issue) {
  const destino = await estadoDelTeam(llave, issue, 'started', /in progress/i);
  await actualizar(llave, issue.id, { stateId: destino.id });
  return destino.name;
}

/**
 * Lo que se puede elegir en la tarjeta para un issue de ese team: sus estados
 * (en el orden de Linear) y sus miembros activos.
 */
export async function opcionesDelTeam(llave, teamId) {
  const data = await gql(
    llave,
    `query($id: String!) { team(id: $id) {
      states { nodes { id name type position } }
      members(first: 100) { nodes { id name active } }
    } }`,
    { id: teamId }
  );
  const orden = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'];
  const estados = data.team.states.nodes
    .filter((s) => s.type !== 'duplicate')
    .sort((a, b) => orden.indexOf(a.type) - orden.indexOf(b.type) || a.position - b.position);
  const personas = data.team.members.nodes.filter((m) => m.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return { estados, personas };
}

/** Agentes instalados en el workspace (Linear, Cursor…): a quién se le puede delegar. */
export async function agentes(llave) {
  const data = await gql(llave, 'query { users(first: 50, filter: { app: { eq: true }, active: { eq: true } }) { nodes { id name } } }');
  return data.users.nodes;
}

/**
 * Suelta el issue a un agente en un solo cambio: labels (`cambio` = addedLabelIds/removedLabelIds),
 * de regreso a Todo si estaba en curso, y delegado al agente si se da `agenteNombre`.
 * Si ese agente ya no existe, igual lo mueve y regresa `sinAgente` para avisarlo.
 */
export async function moverAAgente(llave, issue, { cambio, agenteNombre = '' }) {
  const input = { ...cambio };
  if (issue.state?.type === 'started') input.stateId = (await estadoDelTeam(llave, issue, 'unstarted', /^todo$/i)).id;
  let agente = null;
  if (agenteNombre) {
    agente = (await agentes(llave)).find((a) => a.name.toLowerCase() === agenteNombre.toLowerCase()) || null;
    if (agente) input.delegateId = agente.id;
  }
  await actualizar(llave, issue.id, input);
  return { agente: agente?.name || null, sinAgente: agenteNombre && !agente ? agenteNombre : null };
}

export async function actualizar(llave, id, input) {
  const data = await gql(
    llave,
    `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
    { id, input }
  );
  if (!data.issueUpdate.success) throw new Error(t('Linear no aceptó el cambio.'));
}

/**
 * Issues que pasaron por TaskAI: los que mandaste (ids guardados) más los que
 * tienen un comentario de TaskAI en los últimos `dias`. Con sus últimos comentarios,
 * para leer qué dijo TaskAI y qué te toca.
 */
export async function issuesTaskAI(llave, mandados = [], dias = 14) {
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const data = await gql(
    llave,
    `query($desde: DateTimeOrDuration!) { comments(first: 50, filter: { body: { startsWith: "TaskAI" }, createdAt: { gt: $desde } }) { nodes { issue { identifier } } } }`,
    { desde }
  );
  const ids = [...new Set([...mandados, ...data.comments.nodes.map((c) => c.issue?.identifier).filter(Boolean)])].slice(0, 40);
  if (!ids.length) return [];
  // Un alias por issue: una sola llamada aunque sean varios.
  const partes = ids.map((id, i) => `i${i}: issue(id: ${JSON.stringify(id)}) { id identifier title url team { id key } state { name type }
    comments(last: 15) { nodes { body createdAt } } }`);
  const r = await gql(llave, `query { ${partes.join('\n')} }`).catch(async (e) => {
    // Un ID borrado tumba toda la consulta: se piden de uno en uno.
    const sueltos = await Promise.all(partes.map((p) => gql(llave, `query { ${p} }`).catch(() => ({}))));
    if (sueltos.every((s) => !Object.keys(s).length)) throw e;
    return Object.assign({}, ...sueltos);
  });
  return Object.values(r).filter(Boolean);
}

/** Pasa el issue al estado Done de su team. */
export async function terminar(llave, issue) {
  const destino = await estadoDelTeam(llave, issue, 'completed', /^done$/i);
  await actualizar(llave, issue.id, { stateId: destino.id });
  return destino.name;
}

/** Deja un comentario en el issue. Vacío no se manda. */
export async function comentar(llave, issueId, texto) {
  const body = (texto || '').trim();
  if (!body) throw new Error(t('El comentario está vacío.'));
  const data = await gql(
    llave,
    `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
    { input: { issueId, body } }
  );
  if (!data.commentCreate.success) throw new Error(t('Linear no aceptó el comentario.'));
}

/**
 * Nombre → ID de las etiquetas de la extensión en el workspace. Prefiere la de
 * workspace (sin team) si hay una con el mismo nombre en varios teams.
 */
export async function idsDeLabels(llave, nombres) {
  const data = await gql(
    llave,
    `query($nombres: [String!]) { issueLabels(first: 250, filter: { name: { in: $nombres } }) { nodes { id name team { id } parent { name } } } }`,
    { nombres }
  );
  const mapa = {};
  for (const l of data.issueLabels.nodes.sort((a, b) => (a.team ? 1 : 0) - (b.team ? 1 : 0))) {
    if (!mapa[l.name]) mapa[l.name] = l.id;
  }
  return mapa;
}

// Lo que la extensión necesita en Linear, con colores y para qué sirve cada una.
export const ETIQUETAS = [
  { name: '🔍 necesita-triage', color: '#EF4444', description: 'Recién creado: alguien tiene que decidir qué sigue.' },
  { name: '👤 listo-para-humano', color: '#8B5CF6', description: 'Listo para hacerse, pero pide juicio de una persona.' },
  { name: '🤖 listo-para-agente', color: '#10B981', description: 'Spec completo: un agente lo puede hacer solo.' },
  { name: '❓ necesita-info', color: '#FBBF24', description: 'Esperando una respuesta antes de seguir.' },
];
export const SEMAFORO = [
  { name: 'verde', color: '#4CB782', description: 'Docs, notas, typos. El agente fusiona con pruebas en verde.' },
  { name: 'amarillo', color: '#F2C94C', description: 'Código sin dinero ni clientes. Otro agente revisa y una persona dice "va".' },
  { name: 'rojo', color: '#EB5757', description: 'Pagos, clientes, credenciales, borrar datos. Solo una persona fusiona.' },
];

/**
 * Crea en el workspace las etiquetas que falten (las de estado y el grupo `riesgo`
 * con verde/amarillo/rojo). Las que ya existen no se tocan. Regresa los nombres creados.
 */
export async function prepararLinear(llave) {
  const todas = [...ETIQUETAS.map((e) => e.name), 'riesgo', ...SEMAFORO.map((e) => e.name)];
  const hay = await idsDeLabels(llave, todas);
  const crear = async (input) => {
    const d = await gql(llave, `mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success issueLabel { id } } }`, { input });
    if (!d.issueLabelCreate.success) throw new Error(t('Linear no creó "{nombre}".', { nombre: input.name }));
    return d.issueLabelCreate.issueLabel.id;
  };
  const creadas = [];
  for (const e of ETIQUETAS) if (!hay[e.name]) { await crear(e); creadas.push(e.name); }
  let grupo = hay.riesgo;
  if (!grupo) { grupo = await crear({ name: 'riesgo', color: '#4EA7FC', isGroup: true, description: 'Semáforo: el color decide quién fusiona el PR.' }); creadas.push('riesgo'); }
  for (const e of SEMAFORO) if (!hay[e.name]) { await crear({ ...e, parentId: grupo }); creadas.push(e.name); }
  return creadas;
}

/**
 * El ID de un issue a partir de lo que se pegue: "CID-683", "cid-683" o la liga
 * de Linear (…/issue/CID-683/slug). Null si no se ve un ID.
 */
export function idDeIssue(texto = '') {
  const t = String(texto).trim();
  const m = /\/issue\/([a-z][a-z0-9]*-\d+)/i.exec(t) || /^([a-z][a-z0-9]*-\d+)$/i.exec(t);
  return m ? m[1].toUpperCase() : null;
}

/** Trae un issue cualquiera (no tiene que ser tuyo) con los mismos campos de las tarjetas. */
export async function traerIssue(llave, identificador) {
  const noExiste = new Error(t('No existe {id} en tu Linear. Revisa el número o pega la liga.', { id: identificador }));
  const data = await gql(llave, `query($id: String!) { issue(id: $id) { ${CAMPOS} } }`, { id: identificador })
    .catch((e) => { throw /entity not found/i.test(e.message) ? noExiste : e; });
  if (!data.issue) throw noExiste;
  return data.issue;
}

/** Arma título y descripción de un issue a partir de lo seleccionado en una página. Sin Chrome: se prueba. */
export function issueDeSeleccion({ texto = '', tituloPagina = '', url = '' }) {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  const base = limpio || tituloPagina.trim() || url;
  const title = base.length > 80 ? base.slice(0, 79).trimEnd() + '…' : base;
  const partes = [];
  if (limpio) partes.push(texto.trim().split('\n').map((l) => `> ${l}`).join('\n'));
  if (url) partes.push(`${t('Desde')}: [${tituloPagina.trim() || url}](${url})`);
  return { title, description: partes.join('\n\n') };
}

/** Crea un issue asignado a la persona, en el primer equipo de Ajustes (o su primer equipo). */
export async function crearIssue(llave, { personaId, equipoKey = '', title, description }) {
  const { teams } = await gql(llave, 'query { teams(first: 100) { nodes { id key } } }');
  const team = teams.nodes.find((x) => x.key.toLowerCase() === equipoKey.toLowerCase()) || teams.nodes[0];
  if (!team) throw new Error(t('No encontré un equipo en Linear.'));
  const d = await gql(
    llave,
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url } } }`,
    { input: { teamId: team.id, title, description, ...(personaId ? { assigneeId: personaId } : {}) } }
  );
  return d.issueCreate.issue;
}

// ---------- Delegar a alguien que no está en Linear ----------
// Igual que radar.gnb.mx: grupo de etiquetas «Delegado a» con una por persona. El issue
// sigue a tu nombre, pero sale de «Ahora» y queda en «Esperando a otros».

/** Las personas fuera de Linear: las etiquetas del grupo «Delegado a», por nombre. */
export async function personasFuera(llave) {
  const data = await gql(
    llave,
    `query($g: String!) { issueLabels(first: 100, filter: { parent: { name: { eqIgnoreCase: $g } } }) { nodes { id name } } }`,
    { g: GRUPO_FUERA }
  );
  return data.issueLabels.nodes.map((l) => ({ id: l.id, nombre: l.name.trim() })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** La etiqueta de esa persona dentro del grupo; si no existe se crea (y el grupo, si falta). */
async function etiquetaFuera(llave, nombre) {
  const ya = (await personasFuera(llave)).find((p) => p.nombre.toLowerCase() === nombre.toLowerCase());
  if (ya) return ya;
  const g = await gql(
    llave,
    `query($g: String!) { issueLabels(first: 1, filter: { name: { eqIgnoreCase: $g }, isGroup: { eq: true } }) { nodes { id } } }`,
    { g: GRUPO_FUERA }
  );
  let grupo = g.issueLabels.nodes[0]?.id;
  const crear = `mutation($i: IssueLabelCreateInput!) { issueLabelCreate(input: $i) { success issueLabel { id name } } }`;
  if (!grupo) {
    const c = await gql(llave, crear, { i: { name: GRUPO_FUERA, isGroup: true, color: '#0EA5E9' } });
    if (!c.issueLabelCreate.success) throw new Error(t('Linear no creó la etiqueta.'));
    grupo = c.issueLabelCreate.issueLabel.id;
  }
  const c = await gql(llave, crear, { i: { name: nombre, parentId: grupo, color: '#0EA5E9' } });
  if (!c.issueLabelCreate.success) throw new Error(t('Linear no creó la etiqueta.'));
  return { id: c.issueLabelCreate.issueLabel.id, nombre: c.issueLabelCreate.issueLabel.name };
}

/**
 * Le pone al issue la etiqueta «Delegado a › nombre» (nombre vacío = regresártelo),
 * comprueba que Linear la dejó y comenta. Regresa quién lo tiene ahora (o null).
 */
export async function delegarFuera(llave, issue, nombre) {
  const antes = delegadoFuera(issue);
  if ((antes || '').toLowerCase() === nombre.toLowerCase()) return antes || null;
  const nueva = nombre ? await etiquetaFuera(llave, nombre) : null;
  const data = await gql(
    llave,
    `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { labels { nodes { id name parent { name } } } } } }`,
    { id: issue.id, input: cambioFuera(issue, nueva?.id || '') }
  );
  if (!data.issueUpdate.success) throw new Error(t('Linear no aceptó el cambio.'));
  const ahora = delegadoFuera(data.issueUpdate.issue);
  if ((ahora || '').toLowerCase() !== nombre.toLowerCase()) throw new Error(t('Linear no dejó la etiqueta en {id}.', { id: issue.identifier }));
  await comentar(llave, issue.id, ahora
    ? `Delegado a ${ahora} (no está en Linear)${antes ? `; antes lo tenía ${antes}` : ''}. — ¿Qué sigue?`
    : `Regresado a quien lo tiene${antes ? `; lo tenía ${antes}` : ''}. — ¿Qué sigue?`);
  return ahora;
}
