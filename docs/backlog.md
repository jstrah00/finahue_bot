# Backlog

Mejoras propuestas, ordenadas por lo que conviene hacer primero. Nada de esto está
implementado todavía.

Escrito el **2026-08-11**, sobre el código en `31fbd47`. Las referencias son al archivo y
la función (no al número de línea) para que no se desactualicen.

**Arranque sugerido:** `A1`, `A2`, `A3` (los que más cambian el uso diario) y `B1` (el
único que hoy puede perder datos).

| ID | Mejora | Impacto | Esfuerzo |
|---|---|---|---|
| **A1** | Gastos fijos recurrentes, no sólo cuotas finitas | Alto | Chico |
| **A2** | Aviso de presupuesto al confirmar el gasto | Alto | Chico |
| **A3** | Deshacer el último gasto | Alto | Chico |
| **A4** | El gasto va a la hoja del mes de su fecha | Alto | Chico |
| **A5** | `/nuevomes` automático + presupuestos heredados | Medio-alto | Medio |
| **B1** | Aplicar cuotas debe ser reintentable | Alto | Medio |
| **B2** | Localizar filas de `Cuotas` por `id`, no por posición | Medio | Chico |
| **B3** | Sacar relecturas innecesarias del Sheet | Medio | Chico |
| **B4** | Detectar montos ambiguos (`5,000`) | Medio | Chico |
| **B5** | `/cancelar` y «← Atrás» en el formulario de cuota | Medio | Chico |
| **B6** | Tests de la lógica de cuotas | Medio | Medio |
| **B7** | Rangos `A1:Z5000` hardcodeados | Bajo | Chico |
| **C1** | Personas configurables (hoy `juli`/`mili` están en el código) | Alto para repartirlo | Medio |
| **C2** | Un solo secret de usuarios | Bajo | Chico |
| **C3** | Setup automatizado o Worker multi-tenant | Alto para repartirlo | Grande |
| **D1** | Cargar gastos desde la foto del ticket | Alto | Medio |
| **D2** | Lenguaje natural como fallback del parser | Medio | Medio |
| **D3** | Recordatorio diario con contexto | Medio | Chico |
| **D4** | Cierre de mes automático | Medio | Medio |
| **D5** | Quién puso qué (gastos compartidos) | Medio | Grande |
| **D6** | `/buscar <texto>` | Bajo | Chico |

---

## A. Lo primero

### A1 · Gastos fijos recurrentes, no sólo cuotas finitas

**Por qué.** La hoja `Cuotas` modela pagos con fin (`total_cuotas`), pero la mayoría de los
gastos fijos no tienen fin: alquiler, servicios, suscripciones, monotributo, obra social —
todos presentes en las categorías del seed. Hoy hay que cargarlos a mano todos los meses.
Es la carga manual repetitiva más grande que queda.

**Cómo.** `total_cuotas` vacío o `0` significa recurrente hasta que se cierre a mano.
- `insertable()` en `src/sheets/cuotas.ts` deja de exigir `cuotaActual <= totalCuotas` para esos casos.
- `insertActiveCuotasIntoMonth` los inserta sin avanzar contador (nunca se cierran solos).
- `cuotaToExpense` escribe `fijo` en `es_cuota` en lugar de `cuota 3 de 12`.
- `/cuota`: si en el paso 7 respondés `fijo` (o `0`), saltea el paso 8 y va derecho al 9.

**Listo cuando.** Se puede dar de alta un gasto fijo sin total, `/nuevomes` lo inserta todos
los meses, y sigue apareciendo hasta que se pone `estado = cerrada` en la planilla.

---

### A2 · Aviso de presupuesto al confirmar el gasto

**Por qué.** Al confirmar, el bot dice "Guardado" y repite lo que ya sabías. No dice lo único
que importa en ese momento: cómo quedó ese presupuesto. Es lo que convierte el registro en
algo que cambia decisiones.

**Cómo.** En `handleExpenseConfirmCallback` (`src/handlers/expense.ts`), después del
`appendExpense`, leer la fila del Resumen de esa categoría/subcategoría con `readResumen` y
agregar una línea al mensaje de confirmación:

```
✅ Guardado
📊 super: $246.000 / $300.000 · 82% ⚠️ quedan $54.000
```

Respeta la regla de que el bot no calcula: el `SUMIFS` ya recalculó cuando se escribió la
fila, así que sólo se lee la celda. Umbrales sugeridos: ⚠️ desde 80 %, 🔴 al pasarse.
Para `ahorros`, mostrar el acumulado (`esAhorro` ya distingue el caso).

**Listo cuando.** Todo gasto confirmado responde con el estado del presupuesto que afectó, y
las subcategorías sin presupuesto no muestran nada raro.

---

### A3 · Deshacer el último gasto

**Por qué.** No hay manera de corregir desde Telegram: cualquier error termina en "abrí la
planilla". Es el hueco de UX más visible del bot.

**Cómo.** Casi todo está hecho: `appendValues` devuelve `updatedRange` y `rowFromRange`
(`src/sheets/detalle.ts`) ya extrae el número de fila.
- Guardar `{mes, fila}` en KV por usuario al confirmar (`StateStore`, TTL de unas horas).
- Botón **↩️ Deshacer** en el mensaje de "Guardado", y además un comando `/deshacer`.
- Borrar con `deleteDimension` vía `batchUpdate`. Es seguro: los `SUMIFS` del Resumen usan
  columnas enteras (`$B:$B`), no rangos fijos, así que correr las filas no rompe nada.
- Un solo nivel de deshacer, y se consume al usarlo.

**Listo cuando.** Después de guardar, un toque borra la fila y el bot confirma cuál borró.

---

### A4 · El gasto va a la hoja del mes de su fecha

**Por qué.** Hoy `handleExpenseMessage` y `handleExpenseConfirmCallback` escriben siempre en
`currentMonthKey()`. Si el 2 de agosto cargás algo del 31 de julio con `31/07`, la fila queda
en la hoja de agosto con fecha de julio: rompe base caja en silencio y el resumen de julio
nunca lo ve. Pasa justo en los primeros días de cada mes, que es cuando más se cargan gastos
atrasados.

**Cómo.** Derivar la hoja destino de `expense.fecha.slice(0, 7)` en lugar del mes actual.
Validar contra `monthExists` con ese mes y, si no existe, decirlo con claridad
(«el gasto es de 2026-07 y esa hoja no existe»). El mismo criterio aplica en
`handleSubcatCallback`, que hoy también valida contra el mes actual.

**Listo cuando.** Un gasto con fecha de otro mes cae en la hoja de ese mes, o falla con un
mensaje que explica por qué.

---

### A5 · `/nuevomes` automático + presupuestos heredados

**Por qué.** Dos fricciones que se resuelven juntas: hay que acordarse de correr
`/nuevomes` (y hasta que alguien lo haga, ningún gasto se puede cargar), y hay que cargar
los presupuestos desde cero doce veces al año aunque cambien poco.

**Cómo.**
- El cron ya existe (`scheduled` en `src/index.ts`). El día 1 corre `handleNuevoMes` sola y
  manda al chat el mismo mensaje que hoy manda a mano, con las cuotas insertadas.
  `/nuevomes` sigue disponible, y como es idempotente no molesta que se corra dos veces.
- En `createMonth` (`src/sheets/month.ts`), precargar la columna `presupuesto` con los
  valores del mes anterior (`readResumen` del mes previo, match por categoría+subcategoría).
  Si no hay mes anterior, queda vacía como hoy.

**Listo cuando.** El día 1 el mes aparece creado y avisado, con los presupuestos del mes
pasado ya puestos para ajustar.

---

## B. Robustez

### B1 · Aplicar cuotas debe ser reintentable

**Por qué.** `insertActiveCuotasIntoMonth` (`src/sheets/cuotas.ts`) itera escribiendo el
gasto y avanzando el contador. Si falla en la tercera de cinco, el mes **ya está creado**, así
que el guard `monthExists` de `handleNuevoMes` impide reintentar: las cuotas restantes no
entran nunca y nadie se entera. La idempotencia actual depende de un efecto secundario (que
el mes se cree una sola vez), no de los datos.

**Cómo.** Columna nueva `ultimo_mes_aplicado` en la hoja `Cuotas`. Se inserta sólo si es
distinta del mes que se está aplicando, y se escribe junto con el avance del contador. Con
eso la operación se vuelve idempotente por `(cuota, mes)` y se puede reintentar sin
duplicar. Agregar un comando `/aplicarcuotas` que la corra sobre el mes actual, para
recuperarse de una falla parcial sin tocar la planilla.

**Listo cuando.** Correr la aplicación de cuotas dos veces sobre el mismo mes inserta cada
cuota exactamente una vez, y una falla a mitad de camino se arregla reintentando.

---

### B2 · Localizar filas de `Cuotas` por `id`, no por posición

**Por qué.** `advanceCuota` escribe en `cuota.rowNumber`, un número calculado en un read
anterior. Si entre el read y el write alguien ordena, inserta o borra filas en la planilla,
se escribe sobre la cuota equivocada. La hoja ya tiene una columna `id` que no se usa para
localizar nada.

**Cómo.** Buscar la fila por `id` inmediatamente antes de escribir, y si no aparece, fallar
con un error claro en vez de escribir a ciegas.

---

### B3 · Sacar relecturas innecesarias del Sheet

**Por qué.** Dos casos concretos:
- `advanceCuota` llama `loadCuotasSheet` (rango `A1:Z5000` completo) en cada iteración del
  loop: con 10 cuotas son ~20 lecturas de la hoja entera para insertar 10 filas.
- `readConfig` se lee en cada mensaje entrante que empieza con número, aunque la Config
  cambie una vez por mes.

**Cómo.** Pasar el `HeaderMap` ya cargado a `advanceCuota` en lugar de recargarlo. Cachear
`readConfig` en KV con TTL corto (5 min), igual que se hace con el token de Google en
`src/google/auth.ts`. Conviene además invalidarlo desde `/categorias` o con un
`/recargarconfig`, para no esperar el TTL después de editar la planilla.

---

### B4 · Detectar montos ambiguos (`5,000`)

**Por qué.** `parseArs("5,000")` devuelve `5`. Es correcto para formato es-AR (la coma es
decimal), pero quien escribe al estilo inglés carga cinco pesos en vez de cinco mil y no se
entera nunca más.

**Cómo.** En el resumen de confirmación, cuando el input tenía coma seguida de exactamente
tres dígitos y ningún punto, marcarlo: `💰 Monto: $5 — ¿seguro? escribiste "5,000"`. No
cambiar el parseo, sólo hacer visible el caso ambiguo.

---

### B5 · `/cancelar` y «← Atrás» en el formulario de cuota

**Por qué.** Mientras hay un formulario abierto, todo el texto de ese usuario va al
formulario (`dispatchMessage` en `src/index.ts`), así que un error en el paso 2 te deja 30
minutos sin poder cargar gastos, salvo que termines la cuota igual y la borres después.

**Cómo.** Comando `/cancelar` que haga `delCuotaForm`, y un botón **← Atrás** en cada paso
que retroceda un `step`. Mostrar en cada mensaje del formulario cómo salir.

---

### B6 · Tests de la lógica de cuotas

**Por qué.** Sólo el parser tiene cobertura, y la lógica con más reglas sutiles es la de
cuotas: las tres ramas del paso 9 en `finalizeCuota`, el avance del contador, el cierre en la
última cuota y (con `A1`) los recurrentes que no cierran.

**Cómo.** Un `SheetsClient` fake en memoria que registre las llamadas, y tests sobre
`finalizeCuota` e `insertActiveCuotasIntoMonth`. Cubrir en particular: `este mes` con hoja
existente, `este mes` sin hoja, `mes que viene`, y la última cuota.

---

### B7 · Rangos `A1:Z5000` hardcodeados

**Por qué.** `listGastos` y `loadCuotasSheet` leen hasta la fila 5000 y la columna Z. Si se
supera, se truncan en silencio, que es el peor modo de falla posible.

**Cómo.** Detectar cuando la respuesta llega al límite del rango y avisar, o pedir el rango
sin límite de fila (`A:Z`) y quedarse con el ancho real de los headers.

---

## C. Para poder repartirlo

Relacionado con el plan de dárselo a otras personas con su propia infraestructura.

### C1 · Personas configurables

**Por qué.** `juli` y `mili` están literales en el parser (`parseExpense` en
`src/parser/expense.ts`), en el teclado de `/cuota` y en el tipo `Quien`, que es una unión de
dos valores. Mientras siga así, cada instalación necesita tocar código, y no soporta tres
convivientes. Es el punto donde la guía de usuario promete más flexibilidad de la que hay:
dice que los nombres «se definen al instalar el bot», y hoy eso significa editar el código.

**Cómo.** Llevar las personas a la hoja `Config` como ya se hace con categorías y medios de
pago (una columna `persona`, o derivarlas de `USER_MAP`). `Quien` pasa a ser `string`
validado contra esa lista, y el teclado de `/cuota` se arma con ella.

---

### C2 · Un solo secret de usuarios

**Por qué.** `ALLOWED_USER_IDS` y `USER_MAP` guardan la misma información en dos lugares y
se pueden desincronizar: alguien queda autorizado sin nombre, o al revés.

**Cómo.** Dejar sólo `USER_MAP` y derivar la allowlist de sus claves en `parseAllowedUserIds`.

---

### C3 · Setup automatizado o Worker multi-tenant

**Por qué.** Hoy instalarlo son ocho secrets, un KV namespace, el bootstrap y el registro del
webhook a mano, más una Service Account de Google por persona. Es demasiado para regalarlo.

**Cómo.** Dos caminos, excluyentes:
- **`npm run setup` interactivo** que encadene todo lo del README y verifique cada paso. Cada
  persona sigue con su propia infraestructura y sus propias credenciales.
- **Worker multi-tenant**: un solo deploy, la config por `chat_id` en KV, y cada persona
  comparte su planilla con la misma Service Account. Saca Google Cloud del onboarding, a
  cambio de que esa cuenta tenga acceso a todas las planillas. Es una decisión de confianza,
  no técnica.

---

## D. Features más grandes

### D1 · Cargar gastos desde la foto del ticket

Hoy las fotos se descartan (`dispatchMessage` ignora los mensajes sin `text`). Mandar la
imagen a un modelo con visión para extraer monto y comercio, y usar el resultado para
pre-llenar la confirmación que ya existe. Es la mejora que más fricción saca, y el paso de
confirmar sigue siendo la red de seguridad ante un OCR equivocado.

### D2 · Lenguaje natural como fallback del parser

No para reemplazar el formato estricto, que es rapidísimo cuando ya lo tenés en los dedos,
sino para cuando el parser no reconoce la categoría: en vez de rechazar el mensaje,
interpretar «5 lucas en el súper con mp» y proponer el gasto para confirmar.

### D3 · Recordatorio diario con contexto

El de las 21:30 es un texto fijo, así que se vuelve ruido y se ignora. Si ya hay gastos
cargados hoy: «van $23.400 hoy, ¿falta algo?». Si no hay ninguno, el empujón de siempre.

### D4 · Cierre de mes automático

El último día del mes: total gastado, top 3 desvíos y comparación con el mes anterior. Es el
momento en que los datos sirven de verdad, y hoy no los mira nadie salvo que abra la planilla.

### D5 · Quién puso qué (gastos compartidos)

`quien` es una sola persona por gasto y no existe la noción de «lo puse yo pero va a la
común». Para una pareja, «quién puso más este mes» es una pregunta real que hoy el sistema no
responde. Implica columnas nuevas en el Detalle y una vista de saldos entre personas.

### D6 · `/buscar <texto>`

Buscar en el detalle y las notas de los últimos meses. Responde cosas del tipo «¿cuánto
pagamos el dentista la última vez?», que hoy requieren abrir la planilla y usar Ctrl+F hoja
por hoja.
