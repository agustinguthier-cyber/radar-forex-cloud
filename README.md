# Radar Forex — Escáner en la nube

Este mini-proyecto revisa EUR/USD, GBP/USD, USD/JPY, USD/CHF, USD/CAD, AUD/USD
(lunes a viernes) más BTC/USD, ETH/USD y XRP/USD (los 7 días, incluido el fin
de semana, ya que el mercado cripto nunca cierra) cada 15 minutos, y te manda
las señales directo a Telegram, corriendo en los servidores gratuitos de
GitHub. **No depende de tu PC ni de tu luz**: mientras tengas datos en tu
teléfono, te siguen llegando las alertas.

⚠️ **Antes de usar dinero real con BTC/USD, ETH/USD o XRP/USD**, abre MT5,
haz clic derecho sobre cada símbolo → **Especificación**, y anota el
**"Contract size"** exacto. Edita esos valores en `config.json` →
`criptoContratos`. Los que trae el archivo son valores de ejemplo — si están
mal, la herramienta ahora detecta el error y no te envía la señal (en vez de
mandarte un stop loss sin sentido), pero igual es mejor tenerlos correctos
desde el principio.

No necesitas saber programar. Sigue estos pasos con mucha calma, uno por uno,
sin saltarte ninguno.

---

## Paso 1 — Crea una cuenta gratis en GitHub

1. Abre [github.com](https://github.com) en tu navegador.
2. Clic en **"Sign up"** (arriba a la derecha).
3. Pon tu correo, crea una contraseña, y un nombre de usuario (el que quieras).
4. Sigue las instrucciones en pantalla (te pedirá verificar el correo). Si ya tienes cuenta, sáltate este paso e inicia sesión.

## Paso 2 — Crea un repositorio nuevo

Un "repositorio" es simplemente una carpeta de proyecto dentro de GitHub.

1. Ya con tu sesión iniciada, busca arriba a la derecha un ícono **+** y haz clic.
2. En el menú que aparece, clic en **"New repository"**.
3. En el campo **"Repository name"** escribe: `radar-forex-cloud`
4. Más abajo verás dos opciones: **Public** y **Private**. Deja marcado **Public** (no hay ningún dato sensible en el código; tus claves van en un lugar aparte y cifrado, eso lo hacemos en el Paso 4).
5. No marques ninguna otra casilla (ni "Add a README file", ni ".gitignore", ni licencia).
6. Baja y haz clic en el botón verde **"Create repository"**.

Ahora estás en la página vacía de tu nuevo repositorio.

## Paso 3 — Sube los archivos del proyecto

1. En esa misma página, busca un texto azul que dice **"uploading an existing file"** y haz clic ahí (o ve al botón **"Add file"** arriba a la derecha → **"Upload files"**).
2. Se abre una zona para arrastrar archivos. Abre en tu computadora la carpeta donde descomprimiste el ZIP (`radar-forex-cloud`).
3. Selecciona **todos** los archivos que ves ahí (`scanner.js`, `config.json`, `state.json`, `package.json`, `README.md`) y arrástralos a la zona de GitHub. Súbelos primero, sin la carpeta `.github` — la agregamos aparte en el siguiente paso porque los navegadores a veces no dejan arrastrar carpetas completas.
4. Baja hasta abajo de la página y haz clic en el botón verde **"Commit changes"**.
5. Ahora vas a crear el archivo que falta, dentro de una carpeta especial. Clic en **"Add file" → "Create new file"**.
6. En el campo del nombre del archivo, escribe exactamente esta ruta completa (con las barras incluidas):
   ```
   .github/workflows/scan.yml
   ```
   Al escribir las barras `/`, GitHub va creando las carpetas solo. No necesitas crear las carpetas por separado.
7. Abre en tu computadora el archivo `scan.yml` (está dentro de `radar-forex-cloud/.github/workflows/`) con el Bloc de notas o cualquier editor de texto, copia **todo** su contenido, y pégalo en el cuadro grande de GitHub.
8. Baja y clic en **"Commit changes"** otra vez.

Al terminar, tu repositorio debe verse con estos archivos: `scanner.js`, `config.json`, `state.json`, `package.json`, `README.md`, y una carpeta `.github` que al abrirla tiene `workflows/scan.yml` adentro.

## Paso 4 — Agrega tus claves secretas (nunca van dentro del código)

1. En tu repositorio, busca la pestaña **"Settings"** (con un ícono de engranaje ⚙️, arriba en el menú del repositorio — no el de tu perfil, el del repositorio).
2. En el menú de la izquierda, busca **"Secrets and variables"** y haz clic para desplegarlo, luego clic en **"Actions"**.
3. Verás un botón verde **"New repository secret"**. Haz clic.
4. Se abren dos campos: **"Name"** y **"Secret"**. Agrega, uno por uno (repitiendo "New repository secret" para cada uno):

   | En "Name" escribe exactamente | En "Secret" pega |
   |---|---|
   | `TWELVE_DATA_API_KEY` | Tu clave de twelvedata.com |
   | `TELEGRAM_BOT_TOKEN` | El token que te dio BotFather |
   | `TELEGRAM_CHAT_ID` | El número que te dio @userinfobot |

5. Después de cada uno, clic en **"Add secret"**.

Al terminar debes ver 3 secrets listados (los valores nunca se muestran de nuevo, ni siquiera a ti — eso es normal y es justamente para tu seguridad).

## Paso 5 — Activa las Actions (el "motor" que corre el escaneo)

1. Ve a la pestaña **"Actions"** de tu repositorio (arriba, junto a "Settings").
2. Si GitHub te muestra un mensaje de advertencia, clic en el botón **"I understand my workflows, go ahead and enable them"**.
3. Deberías ver, en la lista de la izquierda, un workflow llamado **"Radar Forex Scanner"**.

## Paso 6 — Pruébalo ya mismo (sin esperar 15 minutos)

1. En la pestaña **Actions**, clic en **"Radar Forex Scanner"** (en la lista de la izquierda).
2. A la derecha aparece un botón **"Run workflow"** con una flechita ▾. Clic ahí, y en el cuadro que se despliega, clic de nuevo en el botón verde **"Run workflow"**.
3. Espera unos 20-30 segundos y actualiza la página (F5). Debería aparecer una fila nueva con un círculo amarillo (corriendo) que luego cambia a ✔ verde (funcionó) o ❌ rojo (algo falló).
4. Si sale ❌, haz clic sobre esa ejecución y luego sobre el paso "Ejecutar el escáner" para ver el mensaje de error exacto — la mayoría de las veces es un secret mal escrito o un espacio de más al pegarlo.
5. Si sale ✔ y había alguna señal disponible en ese momento, te debe llegar a Telegram. Si no llegó nada, es normal — puede que en ese instante no hubiera ninguna señal (clic en la ejecución para ver el detalle: debe mostrar una línea por cada par, del tipo "EUR/USD: sin señal").

A partir de aquí, corre solo cada 15 minutos, todos los días, sin que hagas nada. Los fines de semana vas a ver en el detalle que los 6 pares forex se saltan automáticamente y solo siguen activos BTC/USD, ETH/USD y XRP/USD.

---

## Cómo ajustar la configuración (sin tocar el código)

Edita el archivo `config.json` directamente en GitHub (clic en el archivo → ícono de lápiz ✏️ → cambia el valor → **Commit changes**):

- `riesgo`, `tp1`, `tp2`: tus montos en USD (por defecto 0.80 / 2.00 / 3.00).
- `lote`: tamaño de lote en XM.
- `sens`: `"conservador"`, `"balanceado"` o `"agresivo"`.
- `htf`: `true` para mantener el filtro de tendencia mayor activado, `false` para apagarlo.
- `fib`: `"info"` (solo informa), `"req"` (exige confluencia Fibonacci), `"off"` (lo apaga).
- `spreads`: actualiza estos números con los spreads reales que veas en tu MT5 (para los 6 pares forex).
- `criptoContratos` y `criptoSpreads`: igual, pero para BTC/USD, ETH/USD y XRP/USD. Verifica el "Contract size" real en MT5 (clic derecho sobre el símbolo → Especificación) antes de operar con dinero real — si lo dejas mal, la herramienta ahora detecta el cálculo imposible y no te manda la señal, pero es mejor tenerlo correcto desde el inicio.

## Cambiar la frecuencia de escaneo

Edita `.github/workflows/scan.yml` y cambia la línea del cron:

```yaml
- cron: '*/15 * * * *'   # cada 15 minutos
```

Por ejemplo `*/10 * * * *` para cada 10 minutos. **No bajes de 5 minutos** — GitHub no lo permite y además agotarías rápido los minutos gratis de tu cuenta.

## Cosas importantes que debes saber

- **GitHub a veces retrasa la ejecución programada unos minutos** en horas de mucho tráfico mundial (es gratis, no garantizan puntualidad exacta al segundo). Para scalping esto es un límite real a tener en cuenta.
- **No compartas tu repositorio con las claves visibles** — los Secrets no se ven, pero nunca pegues tokens directamente en `config.json` ni en ningún archivo subido.
- Esta versión en la nube **solo envía las alertas por Telegram**; no lleva el historial visual ni las estadísticas de aciertos que sí tiene tu página HTML. Puedes seguir usando la página en tu PC cuando esté prendida, para revisar y marcar resultados con calma, mientras la nube te sigue avisando aunque el PC esté apagado.
- Si en algún momento quieres detenerlo, ve a **Settings → Actions → General** y selecciona "Disable Actions".
