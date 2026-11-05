# Ficha de la Chrome Web Store: textos para copiar

Cada bloque va en el campo del mismo nombre del panel de la tienda.

## Pestaña "Ficha de Play Store" (Store listing)

**Idioma:** Español (Latinoamérica).

**Nombre** (sale del `manifest.json`): `GNB · ¿Qué sigue?`

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

Recordatorios escritos como hablas: "10am revisar propuesta", "a las 16:30 llamar", "en 30 min mandar correo". Una vez, diario o de lunes a viernes, con Posponer 10 min.

Te avisa cuando te asignan un issue nuevo y te manda un resumen a la hora que elijas.

Cómo se conecta: pegas tu API key personal de Linear en Ajustes. Se guarda solo en tu Chrome y la extensión habla directo con Linear. No hay servidor intermedio ni se guarda nada fuera de tu computadora.

Hecha para equipos que ordenan Linear con los labels 👤 listo-para-humano, 🤖 listo-para-agente y ❓ necesita-info. Sin esos labels, igual ves tus issues en curso y tus recordatorios.
```

**Categoría:** Productividad → Flujo de trabajo y planificación (Workflow & Planning).

**Ícono de la tienda:** `icons/icon128.png`.

**Capturas** (salen de `npm run capturas`, en `dist/tienda/`):
- `captura-1-que-sigue.png` (1280×800)
- `captura-2-recordatorios.png` (1280×800)

**Mosaico promocional pequeño:** `dist/tienda/mosaico-440x280.png`.

**Sitio web / asistencia:** déjalo vacío, o pon el correo de soporte.

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
| Acceso a `https://api.linear.app/*` | Es la API de Linear: de ahí lee los issues de la persona, y ahí escribe cuando ella pulsa "Empezar" o "Mover a agente". No se conecta a ningún otro sitio. |

**¿Usa código remoto?** No. Todo el código va dentro del paquete.

**Uso de datos.** Marca solo estas dos:
- **Información de identificación personal:** el correo de la persona, para buscarla en Linear.
- **Información de autenticación:** la API key de Linear, guardada solo en ese Chrome.

Marca las tres certificaciones: no se venden datos a terceros, no se usan para nada fuera del propósito único y no se usan para dar crédito ni préstamos.

**URL de la política de privacidad:** la página pública donde quede `tienda/privacidad.html` (ver el paso 3 de [README.md](README.md)).

## Pestaña "Distribución" (Distribution)

- **Pagos:** Gratis.
- **Visibilidad:** **Oculto (Unlisted).** No sale en búsquedas; la instala quien tenga la liga.
- **Regiones:** Todas.
