// Corre la consulta de cada grupo contra Linear y la compara con lo que arma el popup.
// Uso: LINEAR_API_KEY=... node scripts/verificar-consultas.mjs [--correo x@y.com] [--proyecto <id|__sin__>] [--equipos INT,OP]
// Solo lee: no crea ni cambia nada en Linear.
import { gql, resolverPersona, issuesDe } from '../lib/linear.js';
import { clasificar } from '../lib/estado.js';
import { filtroDeGrupo, GRUPOS } from '../lib/consultas.js';

const llave = process.env.LINEAR_API_KEY;
if (!llave) {
  console.error('Falta LINEAR_API_KEY en el entorno.');
  process.exit(2);
}
const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : '';
};
const proyecto = arg('proyecto');
const equipos = arg('equipos').split(',').filter(Boolean);

const persona = await resolverPersona(llave, [{ correo: arg('correo'), fuente: 'argumento' }]);
const issues = await issuesDe(llave, persona.id);
const g = clasificar(issues, { equipos, proyecto });

async function porConsulta(filtro) {
  const ids = [];
  let despues = null;
  for (let i = 0; i < 5; i++) {
    const data = await gql(
      llave,
      `query($filtro: IssueFilter, $despues: String) { issues(first: 100, after: $despues, filter: $filtro) { nodes { identifier } pageInfo { hasNextPage endCursor } } }`,
      { filtro, despues }
    );
    ids.push(...data.issues.nodes.map((n) => n.identifier));
    if (!data.issues.pageInfo.hasNextPage) break;
    despues = data.issues.pageInfo.endCursor;
  }
  return ids;
}

console.log(`${persona.name} · ${issues.length} abiertos · proyecto: ${proyecto || 'todos'} · equipos: ${equipos.join(',') || 'todos'}`);
let fallas = 0;
for (const grupo of Object.keys(GRUPOS)) {
  const popup = new Set(g[grupo].map((i) => i.identifier));
  const linear = new Set(await porConsulta(filtroDeGrupo(grupo, { personaId: persona.id, equipos, proyecto })));
  const soloPopup = [...popup].filter((x) => !linear.has(x));
  const soloLinear = [...linear].filter((x) => !popup.has(x));
  const ok = !soloPopup.length && !soloLinear.length;
  if (!ok) fallas++;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${GRUPOS[grupo].padEnd(18)} popup ${String(popup.size).padStart(3)} · consulta ${String(linear.size).padStart(3)}`
    + (ok ? '' : ` · solo popup: ${soloPopup.join(' ') || '-'} · solo consulta: ${soloLinear.join(' ') || '-'}`));
}
process.exit(fallas ? 1 : 0);
