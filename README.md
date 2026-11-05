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
| **Mover a agente** | Pone `🤖 listo-para-agente`. Si falta `📦 brief-incluido` o `riesgo`, no lo mueve y te dice que corras `/triage-dia` |
| **Recordatorios** | Escribe arriba `10am revisar propuesta`, `a las 16:30 llamar`, `en 30 min mandar correo`. Una vez, diario o L a V. El ⏰ de cada issue lo prellena |
| **Cinco por grupo** | Cada grupo enseña 5 y el resto detrás de "Ver N más" |
| **Ícono** | Número = lo de **Ahora** + recordatorios que ya sonaron. Revisa Linear cada 15 min |
| **Resumen diario** | Notificación a la hora que elijas (9:00 por omisión) |

Los recordatorios suenan con notificación de Chrome con **Posponer 10 min** y
**Hecho**. Clic en la notificación abre el issue si viene de uno.

## Instalar (modo desarrollador)

1. Clona el repo.
2. Chrome → `chrome://extensions` → activa **Modo de desarrollador** →
   **Cargar descomprimida** → elige la carpeta del repo.
3. Ajustes de la extensión → pega tu **API key personal de Linear**
   (Linear → Settings → Security & access → Personal API keys) → Guardar.
   La prueba contra Linear antes de guardarla.

La llave se guarda solo en `chrome.storage.local` de ese Chrome. No va en el
código ni pasa por ningún servidor.

## Límites que conviene saber

- **Los recordatorios suenan solo con Chrome abierto.** Si estaba cerrado,
  suenan al abrirlo.
- Los recordatorios viven en ese Chrome, no en Linear: no se sincronizan entre
  computadoras.
- "Días sin moverse" usa la última actualización del issue, no la fecha en que
  le pusieron el label.

## Desarrollo

```bash
npm test
```

La lógica (clasificar issues, entender horas) está en `lib/` sin dependencias
de Chrome y tiene pruebas en `test/`. Sin build ni dependencias.

| Archivo | Qué hace |
|---|---|
| `background.js` | Alarmas: revisar Linear, resumen diario, recordatorios, número del ícono |
| `popup.*` | La ventana de la extensión |
| `options.*` | API key, hora del resumen, equipos |
| `lib/estado.js` | Grupos, orden, semáforo, IDs de labels |
| `lib/schedule.js` | Próxima hora y parser de "10am …" |
| `lib/linear.js` | GraphQL de Linear |
