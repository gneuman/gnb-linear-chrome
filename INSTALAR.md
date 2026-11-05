# Instalar «¿Qué sigue?»

Te enseña tus tareas de Linear y te recuerda cosas desde Chrome. Toma 3 minutos.

## 1. Instálala

**Desde la Chrome Web Store** (cuando ya esté aprobada):

1. Abre esta liga en Chrome: `LIGA_DE_LA_TIENDA`
2. Pulsa **Añadir a Chrome** → **Añadir extensión**.
3. Fíjala: ícono de rompecabezas 🧩 arriba a la derecha → 📌 junto a «¿Qué sigue?».

**Mientras se aprueba** (te mandan un `.zip`):

1. Descomprime el `.zip` en una carpeta que no vayas a borrar, por ejemplo `Documentos/que-sigue`.
2. En Chrome abre `chrome://extensions`.
3. Activa **Modo de desarrollador** (arriba a la derecha).
4. **Cargar descomprimida** → elige esa carpeta.
5. Fíjala con el 🧩 → 📌.

Esta versión no se actualiza sola. Cuando salga la de la tienda, quita esta e instala aquella.

## 2. Conéctala a tu Linear

1. En Linear: tu foto → **Settings** → **Security & access** → **Personal API keys** → **New key**.
   Ponle de nombre «Chrome» y copia la llave (empieza con `lin_api_`).
2. Clic en el ícono de la extensión → ⚙ **Ajustes**.
3. Pega la llave y pulsa **Guardar**. Debe decir «Listo, \<tu nombre\>».

Usa **tu propia** llave, no la de alguien más. Si no, lo que muevas desde la
extensión queda a nombre de esa persona en Linear.

**Si tu Chrome está con un correo distinto al de Linear** (por ejemplo, tu Gmail
personal), escribe en Ajustes el correo con el que entras a Linear. Si no,
puede que no veas tus tareas.

## 3. Úsala

- **Ícono:** el número es lo que tienes para hoy más los recordatorios que ya sonaron.
- **Empezar:** pasa el issue a In Progress y lo abre.
- **Recordatorios:** escribe arriba `10am revisar propuesta` o `en 30 min llamar` y pulsa **Recordar**.
- Cada mañana, a las 9:00, te llega un resumen. La hora se cambia en Ajustes.

Los recordatorios suenan solo con Chrome abierto, y viven en esa computadora.

## ¿Algo no jala?

| Ves | Haz |
|---|---|
| «Falta la API key» | Pega tu llave en ⚙ Ajustes. |
| No salen tus tareas | Escribe en Ajustes el correo con el que entras a Linear. |
| Un `!` rojo en el ícono | La llave se venció o la revocaron: crea otra y pégala. |
| No suenan los avisos | Revisa que Chrome tenga permiso de notificaciones en tu sistema. |
