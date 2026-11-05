// La consulta exacta de Linear detrás de cada grupo del popup.
// Es la misma regla de `clasificar` (lib/estado.js) escrita como IssueFilter de GraphQL,
// para que Claude o curl vean exactamente lo que ve el popup.
// Si cambias una, cambia la otra: test/consultas.test.js lo revisa.
import { LABEL, SIN_PROYECTO, talla, riesgo } from './estado.js';

export { SIN_PROYECTO };

export const GRUPOS = {
  ahora: 'Ahora',
  agente: 'Para agente',
  info: 'Esperan info',
  esperando: 'Esperando a otros',
  despues: 'Después',
  sinTriage: 'Sin triage',
};

export const ENDPOINT = 'https://api.linear.app/graphql';

const iniciado = { state: { type: { eq: 'started' } } };
const noIniciado = { state: { type: { neq: 'started' } } };
const enEspera = {
  or: [{ state: { name: { containsIgnoreCase: 'review' } } }, { state: { name: { containsIgnoreCase: 'block' } } }],
};
const sinEspera = [{ state: { name: { notContainsIgnoreCase: 'review' } } }, { state: { name: { notContainsIgnoreCase: 'block' } } }];
const con = (id) => ({ labels: { some: { id: { eq: id } } } });
// Linear no tiene `none` en labels; `every` con `neq` incluye a los issues sin labels.
const sin = (id) => ({ labels: { every: { id: { neq: id } } } });

const delegado = { delegate: { null: false } };
const sinDelegar = { delegate: { null: true } };

// Mismo orden de precedencia que clasificar: en espera → delegado → iniciado → 👤 → 🤖 → ❓ → resto.
const PARTES = {
  esperando: [iniciado, enEspera],
  ahora: [sinDelegar, { or: [{ and: [iniciado, ...sinEspera] }, { and: [noIniciado, con(LABEL.humano), { state: { type: { neq: 'backlog' } } }] }] }],
  despues: [sinDelegar, noIniciado, con(LABEL.humano), { state: { type: { eq: 'backlog' } } }],
  agente: [{ or: [
    { and: [delegado, { or: [noIniciado, { and: sinEspera }] }] },
    { and: [sinDelegar, noIniciado, sin(LABEL.humano), con(LABEL.agente)] },
  ] }],
  info: [sinDelegar, noIniciado, sin(LABEL.humano), sin(LABEL.agente), con(LABEL.info)],
  sinTriage: [sinDelegar, noIniciado, sin(LABEL.humano), sin(LABEL.agente), sin(LABEL.info)],
};

/** IssueFilter de un grupo para una persona, con los mismos filtros de equipo y proyecto del popup. */
export function filtroDeGrupo(grupo, { personaId, equipos = [], proyecto = '' }) {
  if (!PARTES[grupo]) throw new Error(`Grupo desconocido: ${grupo}`);
  const y = [
    { assignee: { id: { eq: personaId } } },
    { state: { type: { nin: ['completed', 'canceled', 'duplicate'] } } },
  ];
  const claves = equipos.map((e) => e.trim().toUpperCase()).filter(Boolean);
  if (claves.length) y.push({ team: { key: { in: claves } } });
  if (proyecto === SIN_PROYECTO) y.push({ project: { null: true } });
  else if (proyecto) y.push({ project: { id: { eq: proyecto } } });
  return { and: [...y, ...PARTES[grupo]] };
}

export const QUERY = `query($filtro: IssueFilter, $despues: String) {
  issues(first: 100, after: $despues, filter: $filtro) {
    nodes { identifier title url priority estimate dueDate state { name } project { name } labels { nodes { name } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const PRIORIDAD = ['', 'urgente', 'alta', 'media', 'baja'];

/**
 * Texto para pegar en Claude: qué es, el endpoint exacto (curl) y la lista de issues.
 * `issues` ya viene filtrado y ordenado por el popup; `extra(issue)` agrega notas por issue.
 */
export function textoParaClaude({ grupo, persona, proyectoNombre, equipos = [], issues, filtro, extra = () => '' }) {
  // Comando de bash: la comilla simple se escapa para que ningún valor rompa el -d '…'.
  const cuerpo = JSON.stringify({ query: QUERY.replace(/\s+/g, ' '), variables: { filtro } }).replace(/'/g, "'\\''");
  const alcance = [
    `persona: ${persona.name} (${persona.email})`,
    `proyecto: ${proyectoNombre || 'todos'}`,
    equipos.length ? `equipos: ${equipos.join(', ')}` : null,
  ].filter(Boolean).join(' · ');
  const lista = issues.length
    ? issues.map((i) => {
        const partes = [i.identifier, i.title, i.state?.name, PRIORIDAD[i.priority], talla(i) && `talla ${talla(i)}`, i.dueDate && `vence ${i.dueDate}`, extra(i)];
        return `- ${partes.filter(Boolean).join(' · ')}\n  ${i.url}`;
      }).join('\n')
    : '- (vacío)';
  return [
    `# ¿Qué sigue? · ${GRUPOS[grupo]} (${issues.length})`,
    alcance,
    '',
    '## Endpoint exacto',
    'La misma búsqueda que el popup (bash). Pagina con `variables.despues` = `pageInfo.endCursor` mientras `hasNextPage` sea true.',
    '',
    '```bash',
    `curl -s ${ENDPOINT} \\`,
    '  -H "Content-Type: application/json" \\',
    '  -H "Authorization: $LINEAR_API_KEY" \\',
    `  -d '${cuerpo}'`,
    '```',
    '',
    '## Issues',
    lista,
  ].join('\n');
}

/** Slug de worktree a partir del ID: INT-1476 → wt-int-1476. */
const carpeta = (id) => `wt-${String(id).toLowerCase()}`;

/**
 * Un solo issue listo para pegar en una sesión de Claude y ponerse a trabajar:
 * qué es, la rama exacta de Linear, la descripción completa y cómo arrancar.
 */
export function textoDeIssue(issue) {
  // Sin branchName (p. ej. caché de una versión vieja) no se inventa: la convención pide el slug de Linear.
  const rama = issue.branchName || '<rama de Linear: "Copy git branch name">';
  const wt = `/c/tmp/${carpeta(issue.identifier)}`;
  const datos = [
    issue.state?.name,
    PRIORIDAD[issue.priority] && `prioridad ${PRIORIDAD[issue.priority]}`,
    talla(issue) && `talla ${talla(issue)}`,
    riesgo(issue) ? `riesgo ${riesgo(issue)}` : 'sin riesgo',
    issue.dueDate && `vence ${issue.dueDate}`,
  ].filter(Boolean).join(' · ');
  return [
    `# Trabajemos ${issue.identifier}: ${issue.title}`,
    '',
    `- Linear: ${issue.url}`,
    issue.branchName ? `- Rama: \`${rama}\`` : '- Rama: cópiala de Linear con "Copy git branch name"',
    `- ${datos}`,
    issue.project?.name ? `- Proyecto: ${issue.project.name}` : null,
    '',
    '## Descripción',
    (issue.description || '').trim() || '(sin descripción)',
    '',
    '## Para arrancar',
    `1. Lee el issue y sus comentarios en Linear (${issue.identifier}).`,
    '2. Revisa que nadie más lo esté trabajando y crea el worktree (`git fetch origin` primero):',
    `   - Si la rama ya existe: \`git worktree add ${wt} ${rama}\``,
    `   - Si no: \`git worktree add -b ${rama} ${wt} origin/main\``,
    '3. Trabaja hasta cumplir el "Listo cuando" y deja la prueba en el PR.',
  ].filter((l) => l !== null).join('\n');
}
