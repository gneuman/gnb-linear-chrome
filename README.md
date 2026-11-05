# gnb-linear-chrome · ¿Qué sigue?

Extensión de Chrome para operar el día desde Linear sin abrir Linear:
qué sigue, qué se suelta a un agente, qué está atorado y tus recordatorios.

Lee los labels que ya existen en el workspace (máquina de estados de
`triage-dia` y semáforo de riesgo del 2026-11-02, ambos en
[gnb-meta](https://github.com/gneuman/gnb-meta)). No crea un sistema nuevo.

## Qué hace

| Pieza | Qué ves |
|---|---|
| **Lo siguiente** | Tu issue más urgente: primero lo que ya está en curso, luego prioridad y fecha. Resumen de 2 líneas y el "Listo cuando" |
| **Ahora** | `In Progress` + `👤 listo-para-humano` en Todo/Triage. Botón **Empezar** (lo pasa a In Progress y lo abre) |
| **Para agente** | `🤖 listo-para-agente` sin empezar, con su color de riesgo y quién fusiona |
| **Esperan info** | `❓ necesita-info`, con días sin moverse |
| **No es para hoy** | Plegado, solo el número: *Esperando a otros* (Review o Block), *Después* (👤 en Backlog) y *Sin triage* (sin label o 🔍: se resuelve con `/triage-dia`) |
| **Mover a agente** | Pone `🤖 listo-para-agente`, quita el 👤, lo regresa a Todo si estaba en curso y **se lo delega al agente de Ajustes** (Linear por omisión) para que lo haga. Si no tiene riesgo, te pide el color ahí mismo |
| **Delegar al agente** | En *Para agente*, los que tienen 🤖 pero nadie trabaja. Un clic y el agente lo toma. Los delegados dicen "🤖 Linear lo trabaja" |
| **Copiar issue** | En cada tarjeta. Copia ese issue listo para pegar en una sesión de Claude: link, rama exacta de Linear, estado, prioridad, talla, riesgo, descripción completa y cómo arrancar (worktree) |
| **Tamaño y prioridad** | Cada issue enseña su prioridad (Urgente en rojo, Alta en naranja) y su talla (XS–XL) |
| **Recordatorios** | Escribe arriba `10am revisar propuesta`, `a las 16:30 llamar`, `en 30 min mandar correo`. Una vez, diario o L a V. El ⏰ de cada issue lo prellena |
| **Proyecto** | Selector arriba: Todos, un proyecto o *Sin proyecto*. Se recuerda al reabrir. El número del ícono sigue contando todos |
| **Copiar para Claude** | En cada grupo. Copia el endpoint exacto (curl a la API de Linear con el mismo filtro del grupo) y la lista con riesgo y "Listo cuando". Se pega en Claude para delegar el grupo |
| **Cinco por grupo** | Cada grupo enseña 5 y el resto detrás de "Ver N más" |
| **Solo tus tareas** | Identifica a la persona por correo: el de Ajustes, si no el del perfil de Chrome, si no el dueño de la API key. El pie del popup dice de quién son |
| **Issue nuevo** | Notificación de Chrome cuando te asignan uno (revisa cada 5 min). Clic lo abre. Más de 3 a la vez = una sola notificación |
| **Ícono** | Número = lo de **Ahora** + recordatorios que ya sonaron. Revisa Linear cada 5 min |
| **Resumen diario** | Notificación a la hora que elijas (9:00 por omisión) |

Los recordatorios suenan con notificación de Chrome con **Posponer 10 min** y
**Hecho**. Clic en la notificación abre el issue si viene de uno.

## Instalar

Para el equipo: [INSTALAR.md](INSTALAR.md). Para publicar en la Chrome Web Store: [tienda/README.md](tienda/README.md).

### Modo desarrollador

1. Clona el repo.
2. Chrome → `chrome://extensions` → activa **Modo de desarrollador** →
   **Cargar descomprimida** → elige la carpeta del repo.
3. Ajustes de la extensión → pega tu **API key personal de Linear**
   (Linear → Settings → Security & access → Personal API keys) → Guardar.
   La prueba contra Linear antes de guardarla.

La llave se guarda solo en `chrome.storage.local` de ese Chrome. No va en el
código ni pasa por ningún servidor.

## Límites que conviene saber

- **Para que el agente programe con Claude**, en Linear: Settings → AI & agents →
  Cloud coding agent → Enabled, y el modelo en Claude. Sin eso, delegar solo
  marca el issue. La extensión no crea nada más en Linear.

- **Cada persona usa su propia API key.** Con una llave compartida verías las
  tareas del correo correcto, pero "Empezar" y "Mover a agente" quedarían en
  Linear a nombre del dueño de la llave.
- Si tu Chrome está con un correo que no es el de Linear (p. ej. Gmail
  personal), pon el correo de Linear en Ajustes.

- **Los recordatorios suenan solo con Chrome abierto.** Si estaba cerrado,
  suenan al abrirlo.
- Los recordatorios viven en ese Chrome, no en Linear: no se sincronizan entre
  computadoras.
- Se traen hasta 2000 issues abiertos por persona. Si llegas al tope, el popup
  lo dice.
- "Días sin moverse" usa la última actualización del issue, no la fecha en que
  le pusieron el label.

## Desarrollo

```bash
npm test
```

```bash
npm run empaquetar
```

Arma el `.zip` para la tienda en `dist/`.

```bash
LINEAR_API_KEY=lin_api_… node scripts/verificar-consultas.mjs [--correo x@y.com] [--proyecto <id|__sin__>] [--equipos INT,OP]
```

Corre la consulta de cada grupo contra Linear y la compara con lo que arma el
popup. Solo lee. Si sale `FALLA`, `lib/consultas.js` y `clasificar` dejaron de
decir lo mismo. `npm run capturas` deja las capturas
de la ficha en `dist/tienda/`.

La lógica (clasificar issues, entender horas) está en `lib/` sin dependencias
de Chrome y tiene pruebas en `test/`. Sin build ni dependencias.

| Archivo | Qué hace |
|---|---|
| `background.js` | Alarmas: revisar Linear, resumen diario, recordatorios, número del ícono |
| `popup.*` | La ventana de la extensión |
| `options.*` | API key, hora del resumen, equipos, agente que hace las tareas |
| `lib/estado.js` | Grupos, orden, semáforo, IDs de labels, filtro por proyecto |
| `lib/consultas.js` | La regla de cada grupo como filtro de GraphQL (Copiar para Claude) |
| `lib/schedule.js` | Próxima hora y parser de "10am …" |
| `lib/linear.js` | GraphQL de Linear |
