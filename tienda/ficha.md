# Ficha de la Chrome Web Store: textos para copiar

Cada bloque va en el campo del mismo nombre del panel de la tienda.

## Pestaña "Ficha de Play Store" (Store listing)

**Idioma:** Español (Latinoamérica).

**Nombre** (sale del `manifest.json`): `¿Qué sigue?`

**Resumen** (también sale del manifest, máximo 132 caracteres):

> Tus issues de Linear y tus recordatorios: qué sigue, qué va a un agente y qué está atorado.

**Descripción:**

```
Tu día en Linear sin abrir Linear.

Con un clic ves:
• Lo siguiente: tu issue más urgente, con un resumen de dos líneas y su "Listo cuando".
• Ahora: lo que tienes en curso y lo que está listo para ti. "Empezar" lo pasa a In Progress y lo abre.
• Para agente: lo que ya se puede soltar a un agente, con su semáforo de riesgo y quién fusiona.
• Esperan info: lo atorado, con los días que lleva sin moverse.
• Lo que no es para hoy, plegado y contado.

Desde cada tarjeta, sin abrir Linear: cambias estado, prioridad, talla y persona, comentas, delegas a alguien del equipo y lo pasas a Done cuando su PR ya se fusionó. Pega cualquier issue (su ID o su liga) y lo traes arriba con todos los botones.

Mandar a Claude (opcional): con tu propia tarea de Claude Code, un clic le pasa el issue y Claude te deja el PR a revisión, sin fusionar. La pestaña TaskAI te dice qué te toca de lo que mandaste.

Recordatorios escritos como hablas: "10am revisar propuesta", "a las 16:30 llamar", "en 30 min mandar correo". Una vez, diario o de lunes a viernes, con Posponer 10 min.

Cómo se conecta: pegas tu API key personal de Linear en Ajustes. Se guarda solo en tu Chrome y la extensión habla directo con Linear. No hay servidor intermedio ni se guarda nada fuera de tu computadora. "Preparar mi Linear" crea las etiquetas que usa (👤 listo-para-humano, 🤖 listo-para-agente, ❓ necesita-info y el semáforo de riesgo).

Gratis y de código abierto (MIT): github.com/gneuman/gnb-linear-chrome
Hecha por Gabriel Neuman · gabrielneuman.com
```

**Categoría:** Productividad → Flujo de trabajo y planificación (Workflow & Planning).

**Ícono de la tienda:** `icons/icon128.png`.

**Capturas** (salen de `npm run capturas`, en `dist/tienda/`):
- `captura-1-que-sigue.png` (1280×800)
- `captura-2-recordatorios.png` (1280×800)

**Mosaico promocional pequeño:** `dist/tienda/mosaico-440x280.png`.

**Sitio web oficial (Official URL / Homepage):** `https://gabrielneuman.com`. Ya viene también en el `manifest.json` (`homepage_url`): Chrome la enseña en "Detalles" de la extensión. Cuando Marketing publique la landing (CID-683), cámbiala por la de la landing.

**URL de asistencia (Support URL):** `https://github.com/gneuman/gnb-linear-chrome/issues` (cuando el repo sea público) o `https://gabrielneuman.com`.

## Pestaña "Prácticas de privacidad" (Privacy practices)

**Propósito único** (Single purpose):

```
Mostrar los issues de Linear asignados a la persona, ordenados por lo que sigue, y recordarle tareas a la hora que pida.
```

**Justificación de cada permiso:**

| Permiso | Texto para pegar |
|---|---|
| `storage` | Guarda en el Chrome de la persona su API key de Linear, sus ajustes, sus recordatorios y la última lista de issues para abrir el popup al instante. |
| `alarms` | Revisa Linear cada 5 minutos, manda el resumen diario a la hora elegida y hace sonar cada recordatorio a su hora. |
| `notifications` | Avisa cuando suena un recordatorio, cuando le asignan un issue nuevo a la persona y con el resumen diario. |
| `identity` | Se necesita para leer el correo del perfil de Chrome (ver `identity.email`). No inicia sesión ni pide tokens de Google. |
| `identity.email` | Lee el correo del perfil de Chrome para mostrar solo los issues asignados a esa persona en Linear, si no escribió otro correo en Ajustes. El correo no sale de la computadora salvo en la consulta a Linear que busca a esa persona. |
| `unlimitedStorage` | Guarda la copia local de los issues de la persona (pueden ser cientos con su descripción) para abrir el popup al instante sin pedirlos otra vez a Linear. |
| Acceso a `https://api.linear.app/*` | Es la API de Linear: de ahí lee los issues de la persona, y ahí escribe solo cuando ella pulsa un botón (empezar, editar, comentar, delegar, pasar a Done). |
| Acceso a `https://api.anthropic.com/*` | Opcional. Solo si la persona pega en Ajustes el token de su propia tarea de Claude: al pulsar "Mandar a Claude" se le manda a esa tarea el ID del issue. Sin token no se hace ninguna llamada. |

**¿Usa código remoto?** No. Todo el código va dentro del paquete.

**Uso de datos.** Marca solo estas dos:
- **Información de identificación personal:** el correo de la persona, para buscarla en Linear.
- **Información de autenticación:** la API key de Linear y, si la persona lo pone, el token de su tarea de Claude. Los dos se guardan solo en ese Chrome.

Marca las tres certificaciones: no se venden datos a terceros, no se usan para nada fuera del propósito único y no se usan para dar crédito ni préstamos.

**URL de la política de privacidad:** la página pública donde quede `tienda/privacidad.html` (ver el paso 3 de [README.md](README.md)).

## Pestaña "Distribución" (Distribution)

- **Pagos:** Gratis.
- **Visibilidad:** **Pública.** Sale en búsquedas de la tienda. (Si quieres probarla antes con el equipo, sube primero como Oculta y luego la cambias a Pública sin volver a subir el paquete.)
- **Regiones:** Todas.
