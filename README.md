# Finahue 🤖💸

Bot de Telegram para el tracking de finanzas de una pareja (Juli y Mili), con
**Google Sheets como única base de datos**. Corre en **Cloudflare Workers**
(TypeScript, vía webhook) y habla con la **Google Sheets API** usando una
**Service Account** (JWT RS256 firmado con `SubtleCrypto`). Todo en free tier,
sin infraestructura propia.

## Filosofía contable

- **Categoría ≠ medio de pago.** La categoría responde _en qué_ gastás; el medio,
  _con qué_ pagás. Son columnas separadas. La tarjeta de crédito **no** es una
  categoría.
- **Base caja.** El gasto entra el mes en que se **paga** la plata, no el de la
  compra ni el del consumo.
- **Desvío por categoría.** El desvío (gastado − presupuesto) se registra en la
  categoría correspondiente.
- **Montos siempre en ARS.** El bot no maneja dólares ni tipo de cambio.
- **El bot nunca calcula totales.** Los cálculos los hacen fórmulas `SUMIFS` del
  Sheet; el bot solo lee celdas ya calculadas.
- **Ahorros acumulan, no presupuestan.** La categoría `ahorros` no tiene
  presupuesto: sus subcategorías solo acumulan aportes. Comprar con plata de los
  ahorros se registra en la **categoría real** del gasto (ej. `casa hogar`), no
  en `ahorros`.

## Cómo cargar un gasto

Mandá al grupo un mensaje (sin `/`) con **una línea por campo**. La **primera
línea es siempre el monto**; el resto se reconoce solo, en cualquier orden:

```
5.000
helado en la costanera
salidas ocio
mp
```

El bot muestra un resumen y pide confirmar ✅ / cancelar ❌. Campos:

| Campo | Cómo se reconoce | Default |
|---|---|---|
| **Monto** (obligatorio) | 1ª línea, empieza con número (`5000`, `5.000`, `5000,50`) | — |
| **Categoría + subcategoría** | una línea de 2 palabras: `categoria subcat` (ej. `salidas ocio`) | — (subcat obligatoria) |
| **Medio de pago** | 1 palabra que matchea la Config (ej. `mp`) | vacío |
| **Quién** | 1 palabra: `juli` o `mili` | quien mandó el mensaje |
| **Fecha** | `dd/mm`, `dd/mm/aaaa`, `dd-mm` | hoy (zona AR) |
| **`revisar`** | la palabra exacta `revisar` → pinta la fila de amarillo | — |
| **Detalle** (obligatorio) | 1ª línea de texto libre; la 2ª va a `notas` | — |

El match es por **línea completa exacta** (no "contiene"), así `salidas del finde`
como detalle no se confunde con la categoría `salidas`.

## Comandos

- `/nuevomes` — crea las hojas `YYYY-MM Detalle` y `YYYY-MM Resumen` del mes
  actual (con fórmulas y categorías precargadas). No inserta cuotas.
- `/cargarcuotas` — muestra las cuotas activas del mes, pide confirmación e
  inserta cada una en el Detalle, avanzando los contadores.
- `/cuota` — alta guiada (formulario) de una cuota nueva.
- `/resumen` — presupuesto vs gastado de todo el mes.
- `/categoria <nombre> [YYYY-MM]` — detalle de una categoría (mes actual o pasado).
- `/gastos` — todos los gastos del mes.
- `/categorias`, `/mediosdepago`, `/formato`, `/sheet`, `/help`.

---

# Setup

## 1. Crear el bot en BotFather

1. Hablá con [@BotFather](https://t.me/BotFather) → `/newbot` → seguí los pasos.
   Guardá el **token** (`TELEGRAM_BOT_TOKEN`).
2. **Desactivá el privacy mode** para que el bot lea todos los mensajes del grupo
   (los gastos se cargan sin comando):
   `/setprivacy` → elegí el bot → **Disable**.
3. Agregá el bot al **grupo** de Telegram con Juli y Mili.

## 2. Obtener los `user_id` de Juli y Mili

Hablá con [@userinfobot](https://t.me/userinfobot) (o reenviále un mensaje de cada
uno). Anotá los dos IDs numéricos → van en `ALLOWED_USER_IDS` y `USER_MAP`.

## 3. Service Account de Google + compartir el Sheet

1. En [Google Cloud Console](https://console.cloud.google.com/): creá (o elegí) un
   proyecto.
2. **Habilitá la Google Sheets API**: *APIs & Services → Library → Google Sheets
   API → Enable*.
3. Creá una **Service Account**: *IAM & Admin → Service Accounts → Create*.
4. En la SA → *Keys → Add Key → Create new key → JSON*. Descargá el JSON. De ahí
   salen:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY` (el string completo con `-----BEGIN...`).
5. Creá un Google Sheet nuevo y **compartilo con el `client_email`** de la SA con
   permiso de **Editor**. El ID del Sheet está en su URL
   (`.../spreadsheets/d/<SHEET_ID>/edit`) → `SHEET_ID`.

## 4. Configurar el proyecto localmente

```bash
npm install
cp .dev.vars.example .dev.vars   # completá los valores
```

En `.dev.vars`, para `GOOGLE_PRIVATE_KEY` podés dejar los saltos de línea como
`\n` literales (el código los normaliza).

## 5. Bootstrap del Sheet (una sola vez)

Crea y puebla la hoja `Config` (categorías/subcategorías + medio `mp`) y crea la
hoja `Cuotas` vacía:

```bash
npm run bootstrap
```

Es idempotente: si una hoja ya existe, no la toca. Después podés editar `Config` a
mano para agregar más medios de pago o categorías — el bot los reconoce sin
cambios de código.

## 6. Crear el KV namespace y cargar secrets

```bash
# KV para estado transitorio + cache del token de Google
wrangler kv namespace create STATE
wrangler kv namespace create STATE --preview
# Pegá los IDs devueltos en wrangler.toml (id y preview_id).
```

Cargá los secrets en producción:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
wrangler secret put GOOGLE_PRIVATE_KEY
wrangler secret put SHEET_ID
wrangler secret put ALLOWED_USER_IDS      # ej: 123456789,987654321
wrangler secret put USER_MAP              # ej: 123456789:juli,987654321:mili
wrangler secret put REMINDER_CHAT_ID      # id del grupo, ej: -5488004217
```

`USER_MAP` (mapeo `id:nombre`) y `REMINDER_CHAT_ID` (id del grupo) se cargan como
secrets para no versionar los IDs reales en el repo.

Para obtener el `REMINDER_CHAT_ID`: agregá el bot al grupo, escribí cualquier
mensaje ahí y mirá el `chat.id` en el update (negativo, ej. `-5488004217`).

> `TELEGRAM_WEBHOOK_SECRET` es un string largo y aleatorio que vos elegís; Telegram
> lo manda en el header `X-Telegram-Bot-Api-Secret-Token` y el bot lo valida en
> cada request (si no coincide → 401).

## 7. Deploy y registro del webhook

```bash
npm run deploy
# Anotá la URL: https://finahue-bot.<tu-subdominio>.workers.dev

npm run register-webhook -- https://finahue-bot.<tu-subdominio>.workers.dev
```

`register-webhook` registra el webhook con el secret token y configura el menú de
comandos (`setMyCommands`). Lee `TELEGRAM_BOT_TOKEN` y `TELEGRAM_WEBHOOK_SECRET` de
`.dev.vars`.

## 8. Usar

En el grupo: `/nuevomes` para crear el mes, cargá presupuestos en el Resumen a
mano, y empezá a mandar gastos. `/help` explica todo.

Todos los días a las **21:30 ART** el bot manda al grupo (`REMINDER_CHAT_ID`) un
recordatorio para cargar los gastos del día. El cron está en `wrangler.toml`
(`[triggers] crons = ["30 0 * * *"]`, o sea 00:30 UTC).

---

# Estructura del Sheet

El Sheet es la única fuente de verdad. El bot **localiza columnas por su
encabezado** (nunca por posición), así que podés reordenar columnas o agregar
filas a mano sin romper nada.

- **`Config`** (editable a mano) — categorías/subcategorías/descripciones
  (`categoria | subcategoria | descripcion`) y medios de pago (`medio_pago`).
- **`Cuotas`** (gestionada por el bot) — `id | descripcion | monto_cuota |
  categoria | subcategoria | medio_pago | quien | cuota_actual | total_cuotas |
  estado | fecha_alta`.
- **`YYYY-MM Detalle`** — un gasto por fila: `fecha | monto | detalle | categoria
  | subcategoria | medio_pago | quien | notas | es_cuota`.
- **`YYYY-MM Resumen`** — una fila por subcategoría: `categoria | subcategoria |
  presupuesto | gastado | desvio | porcentaje`. `presupuesto` lo cargás vos;
  `gastado` es un `SUMIFS` sobre el Detalle; `desvio` y `porcentaje` quedan en
  blanco si no hay presupuesto (caso ahorros o presupuesto sin cargar).

---

# Desarrollo

```bash
npm run dev         # wrangler dev (usa .dev.vars)
npm test            # tests del parser de gastos
npm run typecheck   # tsc --noEmit
```

## Arquitectura

- `src/index.ts` — webhook, seguridad (secret token + allowlist), routing y el
  cron `scheduled` (recordatorio diario 21:30 ART → `REMINDER_CHAT_ID`).
- `src/google/` — JWT RS256 (`SubtleCrypto`) + access token (cache en KV ~50 min).
- `src/sheets/` — cliente REST, mapeo de columnas por header, Config, meses,
  Detalle, Resumen, Cuotas.
- `src/parser/expense.ts` — parser de gastos (reconocimiento no posicional).
- `src/handlers/` — gastos, comandos, `/nuevomes`, `/cargarcuotas`, `/cuota`,
  consultas.
- `src/state/kv.ts` — estado transitorio en Workers KV con TTL (confirmaciones y
  formulario de cuotas). No es una base de datos: toda la persistencia vive en el
  Sheet.
- `src/format/` — formateo de pesos y barras de progreso.

## Seguridad

- Se valida el header `X-Telegram-Bot-Api-Secret-Token` en cada request (401 si no
  coincide).
- Se valida que `from.id` esté en `ALLOWED_USER_IDS`; si no, el mensaje se ignora
  en silencio.
- Nunca se loguean secrets ni la private key.
