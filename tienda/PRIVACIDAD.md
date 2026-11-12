# Política de privacidad de la extensión «¿Qué sigue?»

*Última actualización: 12 de noviembre de 2026.*

«¿Qué sigue?» es una extensión de Chrome que muestra tus issues de Linear y te recuerda tareas.
Funciona entera en tu computadora: no tiene servidor propio.

## Qué datos usa

- **Tu API key personal de Linear.** La pegas tú en Ajustes. Sirve para leer tus issues y para cambiarlos cuando tú lo pides: empezar, editar, comentar, delegar o pasar a Done.
- **Tu correo.** El que escribes en Ajustes o, si lo dejas vacío, el del perfil de Chrome. Sirve para encontrarte en Linear y mostrar solo los issues asignados a ti.
- **Tus issues de Linear y tus recordatorios.** Se guarda una copia para abrir la ventana al instante y para avisarte de lo nuevo.
- **Opcional: el token de tu tarea de Claude.** Solo si usas «Mandar a Claude». Lo generas tú en claude.ai y lo pegas en Ajustes. Sirve para pedirle a tu propia tarea que trabaje un issue: se manda solo el ID del issue (por ejemplo ENG-123).

## Dónde se guardan

Solo en el almacenamiento local de la extensión, en tu Chrome. No se sincronizan con otras computadoras.

## Con quién se comparten

Con Linear (`api.linear.app`), con tu API key, para leer y cambiar tus issues. Y, solo si pusiste el token de tu tarea de Claude, con Anthropic (`api.anthropic.com`), cuando pulsas «Mandar a Claude».
No se venden datos, no hay analítica ni publicidad, y no se mandan a ningún otro servidor, ni al del autor.

## Cómo borrarlos

Al quitar la extensión de Chrome se borra todo lo que guardaba. Para cortar el acceso a Linear, revoca la llave en Linear → Settings → Security & access → Personal API keys. Para cortar el de Claude, borra el token de tu tarea en claude.ai/code/routines.

## Contacto

Gabriel Neuman · [gabrielneuman.com](https://gabrielneuman.com) · Código abierto: [github.com/gneuman/gnb-linear-chrome](https://github.com/gneuman/gnb-linear-chrome)
