# Publicar en la Chrome Web Store

Va **Pública** (2026-11-12): gratis, de código abierto y con liga a gabrielneuman.com.
Si quieres probarla antes con el equipo, súbela como **Oculta** y luego cámbiala
a Pública desde Distribución, sin volver a subir el paquete.

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
4. Cuando pregunte si eres comerciante (trader): si la extensión es gratis y la donación es voluntaria, normalmente es **No**. Si contestas **Sí**, Google enseña tu dirección y teléfono en la ficha. Decídelo tú. (2026-11-18: salió el celular de Gabriel en la ficha; se quita en la consola, Cuenta → estado de comerciante → No comerciante, o cambiando el teléfono de contacto.)

## 2. Subir el paquete

1. **Nuevo elemento** → sube `dist/gnb-que-sigue-<versión>.zip`.
2. Llena las pestañas con lo que está en [ficha.md](ficha.md): ficha, prácticas de privacidad y distribución.

## 3. Política de privacidad

La tienda pide una **URL pública** con la política. Ya existe en tu sitio:

`https://gabrielneuman.com/extension/privacidad/`

Su texto se actualizó con el token de Claude en el PR 215 de gnb-website. Si cambia lo que guarda la extensión, se cambian juntos esa página y [privacidad.html](privacidad.html).

Esa URL va en **Prácticas de privacidad**.

## 4. Enviar a revisión

**Enviar para revisión.** Google suele tardar de unos días a una semana. Si la
rechazan, el correo dice qué permiso o texto no le cuadró: casi siempre se
arregla en la justificación de [ficha.md](ficha.md).

Ya aprobada, en la ficha está la liga `https://chromewebstore.google.com/detail/…`.
Esa liga va en [INSTALAR.md](../INSTALAR.md) y se le manda al equipo.

## Actualizar rápido (recomendado)

Liga pública: <https://chromewebstore.google.com/detail/hanbkkcipbiedbiolomknpfalaibibmg>

Una vez configurado, cada actualización es:

```bash
npm run version
```

```bash
git commit -am "versión" && git tag v$(node -p "require('./manifest.json').version") && git push --follow-tags
```

La etiqueta dispara la Action **Publicar en la tienda**: corre las pruebas, arma el zip,
lo sube y lo manda a revisión. También se lanza a mano en GitHub → Actions → Run workflow,
o desde tu compu con `npm run publicar` (con las tres variables en el entorno).
`npm run version -- menor` sube 0.8 → 0.9; `npm run version -- 1.0.0` pone una exacta.

### Configurarlo (una sola vez, ~10 min)

1. <https://console.cloud.google.com> → proyecto nuevo → **APIs y servicios → Biblioteca** → habilita **Chrome Web Store API**.
2. **Pantalla de consentimiento OAuth**: tipo Externo, agrégate como usuario de prueba.
3. **Credenciales → Crear → ID de cliente OAuth → App de escritorio**. Copia el *client id* y el *client secret*.
4. Saca el refresh token: abre en el navegador (con tu client id)
   `https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&access_type=offline&prompt=consent&redirect_uri=http://localhost&client_id=TU_CLIENT_ID`
   acepta, y copia el `code=` de la URL a la que te manda (aunque la página no cargue). Luego:
   ```bash
   curl -s https://oauth2.googleapis.com/token -d client_id=TU_CLIENT_ID -d client_secret=TU_SECRET -d code=EL_CODE -d grant_type=authorization_code -d redirect_uri=http://localhost
   ```
   El `refresh_token` de la respuesta es el tercero.
5. En GitHub: repo → **Settings → Secrets and variables → Actions** → crea `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.

Si la consola pide justificar un permiso nuevo, esa parte sí es a mano.

## Actualizar a mano

1. Sube `"version"` en `manifest.json`.
2. `npm run empaquetar`.
3. En la consola: el elemento → **Paquete** → **Subir nuevo paquete** → **Enviar para revisión**.

Chrome actualiza solo a quien ya la tiene instalada, en unas horas.
