# TaskAI: tu propia tarea de Claude para "Mandar a Claude"

El botón **🤖 Mandar a Claude** de la extensión le pasa el ID del issue a una
tarea programada de Claude Code (una *routine*) que es tuya: corre con tu cuenta
de Claude, en tus repos. La extensión no tiene servidor propio ni ve tu código.

```
¿Qué sigue? ──POST /fire {"text":"issue: ENG-123"}──▶ tu tarea en claude.ai
                                                       │ lee el issue en Linear
                                                       │ hace el trabajo, abre el PR
                                                       └─▶ comenta "TaskAI · ✅ …" en el issue
```

La pestaña **TaskAI** del popup lee esos comentarios y te dice qué te toca.

## Armarla (10 minutos)

1. En [claude.ai/code/routines](https://claude.ai/code/routines), crea una tarea nueva **desde la web**
   (no desde una sesión de un proyecto: esas no aceptan disparos por API).
2. Conéctale el conector de **Linear** y los repos de GitHub en los que va a trabajar.
3. Pega como instrucciones el contenido de [prompt.md](prompt.md). Ajústalo a tu equipo si quieres.
4. Agrégale un disparador **por API** y genera su token.
5. En la extensión, **Ajustes → Mandar a Claude**: pega el token y el ID de la tarea (`trig_…`).
   El token se guarda solo en ese Chrome y no se vuelve a enseñar.

Listo: el botón aparece en las tarjetas. Si al issue le falta algo (🤖, color de
riesgo, repo o "Listo cuando"), el botón lo dice y deja arreglar ahí lo que se puede.

## ¿Y si quiero asignarle issues desde Linear?

Eso es un agente de Linear (le asignas o lo mencionas en el issue). Vive en
[claude-linear-agent](https://github.com/gneuman/claude-linear-agent): un Worker de
Cloudflare que recibe los avisos de Linear y dispara la misma clase de tarea. En
la extensión, **Ajustes → Agente que hace las tareas** lo elige para "Mover a agente".
