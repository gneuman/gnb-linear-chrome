# Publicar en la Chrome Web Store

Va como **Oculta (Unlisted)**: no sale en búsquedas y la instala quien tenga la
liga. Es la opción sin Google Workspace (2026-11-05). Si un día hay Workspace,
se puede cambiar a **Privada** para que solo la vea el dominio.

Publicar lo hace Gabriel: la cuenta, el pago y el botón de enviar son suyos.

## 0. Antes de cada subida

```bash
npm run empaquetar
```

Corre las pruebas y arma `dist/gnb-que-sigue-<versión>.zip`. Si ya subiste esa
versión, primero sube `"version"` en `manifest.json` (0.2.0 → 0.2.1, por ejemplo).

```bash
npm run capturas
```

Deja en `dist/tienda/` las dos capturas de 1280×800 y el mosaico de 440×280,
con datos de ejemplo. Vuelve a correrlo si cambia cómo se ve el popup.

## 1. Cuenta de desarrollador (una sola vez)

1. Entra a <https://chrome.google.com/webstore/devconsole> con la cuenta de Google que será dueña.
2. Acepta el acuerdo y paga los **5 USD** (un solo pago).
3. En **Cuenta**, pon un correo de contacto y verifícalo.
4. Cuando pregunte si eres comerciante (trader), contesta **No**: la extensión es gratis y de uso interno.

## 2. Subir el paquete

1. **Nuevo elemento** → sube `dist/gnb-que-sigue-<versión>.zip`.
2. Llena las pestañas con lo que está en [ficha.md](ficha.md): ficha, prácticas de privacidad y distribución.

## 3. Política de privacidad

La tienda pide una **URL pública**, y este repo es privado. Hay que publicar
[privacidad.html](privacidad.html) en un lugar abierto, por ejemplo
`gabrielneuman.com/extension/privacidad/`, y antes cambiar `CORREO_DE_SOPORTE`
por el correo de contacto. Esa URL va en **Prácticas de privacidad**.

## 4. Enviar a revisión

**Enviar para revisión.** Google suele tardar de unos días a una semana. Si la
rechazan, el correo dice qué permiso o texto no le cuadró: casi siempre se
arregla en la justificación de [ficha.md](ficha.md).

Ya aprobada, en la ficha está la liga `https://chromewebstore.google.com/detail/…`.
Esa liga va en [INSTALAR.md](../INSTALAR.md) y se le manda al equipo.

## Actualizar

1. Sube `"version"` en `manifest.json`.
2. `npm run empaquetar`.
3. En la consola: el elemento → **Paquete** → **Subir nuevo paquete** → **Enviar para revisión**.

Chrome actualiza solo a quien ya la tiene instalada, en unas horas.
