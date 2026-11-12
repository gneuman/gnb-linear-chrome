// Cliente mínimo de la API GraphQL de Linear con API key personal.
// La llave vive en chrome.storage.local; nunca en el código.

const URL = 'https://api.linear.app/graphql';

export async function gql(llave, query, variables = {}) {
  if (!llave) throw new Error('Falta la API key de Linear (Ajustes).');
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
  project { id name externalLinks(first: 10) { nodes { url } } }
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
  if (!destino) throw new Error(`El team ${issue.team.key} no tiene estado "${tipo}".`);
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
  if (!data.issueUpdate.success) throw new Error('Linear no aceptó el cambio.');
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
  if (!body) throw new Error('El comentario está vacío.');
  const data = await gql(
    llave,
    `mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
    { input: { issueId, body } }
  );
  if (!data.commentCreate.success) throw new Error('Linear no aceptó el comentario.');
}
