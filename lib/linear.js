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
  id identifier title url priority dueDate updatedAt description
  state { id name type }
  team { id key name }
  labels { nodes { id name } }
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

/** Issues abiertos asignados a esa persona, paginando de 100 en 100 (tope 500 para no colgar el popup). */
export async function issuesDe(llave, personaId) {
  const todos = [];
  let despues = null;
  for (let i = 0; i < 5; i++) {
    const data = await gql(
      llave,
      `query($despues: String, $persona: ID) {
        issues(first: 100, after: $despues, filter: {
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

/** Pasa el issue al estado "In Progress" de su team (o el primer estado de tipo started). */
export async function empezar(llave, issue) {
  const data = await gql(
    llave,
    `query($id: String!) { team(id: $id) { states { nodes { id name type position } } } }`,
    { id: issue.team.id }
  );
  const iniciados = data.team.states.nodes.filter((s) => s.type === 'started').sort((a, b) => a.position - b.position);
  const destino = iniciados.find((s) => /in progress/i.test(s.name)) || iniciados[0];
  if (!destino) throw new Error(`El team ${issue.team.key} no tiene estado "started".`);
  await actualizar(llave, issue.id, { stateId: destino.id });
  return destino.name;
}

export async function actualizar(llave, id, input) {
  const data = await gql(
    llave,
    `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
    { id, input }
  );
  if (!data.issueUpdate.success) throw new Error('Linear no aceptó el cambio.');
}
