/**
 * Comandos de consulta y ayuda.
 * Toda salida es texto formateado (Markdown de Telegram), compacto para celular.
 */

import type { Ctx } from "../ctx";
import { readConfig } from "../sheets/config-sheet";
import { readResumen, type ResumenRow } from "../sheets/resumen";
import { listGastos } from "../sheets/detalle";
import { esAhorro } from "../sheets/month";
import { currentMonthKey, isMonthKey } from "../util/date";
import { formatArs } from "../format/money";
import { progressBar } from "../format/progress";
import { escapeMd } from "../format/md";
import { reportError } from "./errors";

/** Envía texto largo partido en mensajes de <= ~4000 chars (por líneas). */
async function sendChunked(ctx: Ctx, chatId: number, lines: string[]): Promise<void> {
  const MAX = 3800;
  let buf = "";
  for (const line of lines) {
    if (buf.length + line.length + 1 > MAX) {
      await ctx.api.sendMessage(chatId, buf, { parseMode: "Markdown" });
      buf = "";
    }
    buf += (buf ? "\n" : "") + line;
  }
  if (buf) await ctx.api.sendMessage(chatId, buf, { parseMode: "Markdown" });
}

// --- /categorias ---
export async function handleCategorias(ctx: Ctx, chatId: number): Promise<void> {
  try {
    const config = await readConfig(ctx.sheets);
    const lines: string[] = ["📂 *Categorías*", ""];
    let currentCat = "";
    for (const c of config.categorias) {
      if (c.categoria !== currentCat) {
        currentCat = c.categoria;
        lines.push(`*${escapeMd(c.categoria)}*`);
      }
      lines.push(`  • \`${escapeMd(c.subcategoria)}\` — ${escapeMd(c.descripcion)}`);
    }
    await sendChunked(ctx, chatId, lines);
  } catch (err) {
    await reportError(ctx, chatId, err);
  }
}

// --- /mediosdepago ---
export async function handleMediosDePago(ctx: Ctx, chatId: number): Promise<void> {
  try {
    const config = await readConfig(ctx.sheets);
    const medios = [...config.mediosPago].sort();
    const lines = ["💳 *Medios de pago*", "", ...medios.map((m) => `• \`${escapeMd(m)}\``)];
    await ctx.api.sendMessage(chatId, lines.join("\n"), { parseMode: "Markdown" });
  } catch (err) {
    await reportError(ctx, chatId, err);
  }
}

// --- /formato ---
export async function handleFormato(ctx: Ctx, chatId: number): Promise<void> {
  const text = [
    "📝 *Cómo cargar un gasto*",
    "",
    "Mandá un mensaje (sin `/`) con una línea por campo. La *primera línea es siempre el monto*; el resto se reconoce solo, en cualquier orden:",
    "",
    "```",
    "5.000",
    "helado en la costanera",
    "salidas ocio",
    "mp",
    "```",
    "",
    "Campos que reconoce:",
    "• *Monto* (1ª línea, obligatorio): `5000`, `5.000`, `5000,50`.",
    "• *Categoría + subcategoría* (una línea, 2 palabras): `salidas ocio`.",
    "• *Medio de pago* (1 palabra): ej. `mp`.",
    "• *Quién* (`juli` o `mili`): por defecto, quien manda el mensaje.",
    "• *Fecha* (`dd/mm` o `dd/mm/aaaa`): por defecto, hoy.",
    "• *`revisar`*: marca la fila en amarillo para revisar después.",
    "• *Detalle* (obligatorio): la 1ª línea de texto libre. La 2ª va a notas.",
    "",
    "Después te muestro un resumen para *confirmar* ✅ o *cancelar* ❌.",
  ].join("\n");
  await ctx.api.sendMessage(chatId, text, { parseMode: "Markdown" });
}

/** Línea de resumen para una subcategoría. */
function resumenLine(r: ResumenRow): string {
  const gastado = formatArs(r.gastado);
  if (esAhorro(r.categoria)) {
    // Ahorros: acumula, no presupuesta.
    return `  • \`${escapeMd(r.subcategoria)}\` — acumulado: *${gastado}*`;
  }
  if (r.presupuesto === null) {
    return `  • \`${escapeMd(r.subcategoria)}\` — gastado ${gastado} (sin presupuesto)`;
  }
  const restante = r.presupuesto - r.gastado;
  const bar = progressBar(r.porcentaje);
  return (
    `  • \`${escapeMd(r.subcategoria)}\`\n` +
    `     ${bar}\n` +
    `     ${gastado} / ${formatArs(r.presupuesto)} · resta *${formatArs(restante)}*`
  );
}

// --- /resumen ---
export async function handleResumen(ctx: Ctx, chatId: number): Promise<void> {
  try {
    const mes = currentMonthKey();
    const rows = await readResumen(ctx.sheets, mes);
    const lines: string[] = [`📊 *Resumen ${mes}*`, ""];
    let currentCat = "";
    for (const r of rows) {
      if (r.categoria !== currentCat) {
        currentCat = r.categoria;
        lines.push(`*${escapeMd(r.categoria)}*`);
      }
      lines.push(resumenLine(r));
    }
    await sendChunked(ctx, chatId, lines);
  } catch (err) {
    await reportError(ctx, chatId, err);
  }
}

/** Bloque multilínea de una subcategoría para /categoria. */
function categoriaBlock(r: ResumenRow): string {
  const gastado = formatArs(r.gastado);
  const nombre = `*${escapeMd(r.subcategoria)}*`;
  if (esAhorro(r.categoria)) {
    return `${nombre}\nacumulado: *${gastado}*`;
  }
  if (r.presupuesto === null) {
    return `${nombre}\ngastado ${gastado} · _sin presupuesto_`;
  }
  const restante = r.presupuesto - r.gastado;
  return `${nombre}\n${progressBar(r.porcentaje)}\n${gastado} / ${formatArs(r.presupuesto)} · resta *${formatArs(
    restante,
  )}*`;
}

// --- /categoria <nombre> [YYYY-MM] ---
export async function handleCategoria(ctx: Ctx, chatId: number, args: string[]): Promise<void> {
  const nombre = (args[0] ?? "").toLowerCase();
  if (!nombre) {
    await ctx.api.sendMessage(chatId, "Usá: `/categoria <nombre> [YYYY-MM]`", { parseMode: "Markdown" });
    return;
  }
  const mes = args[1] && isMonthKey(args[1]) ? args[1] : currentMonthKey();

  try {
    const rows = (await readResumen(ctx.sheets, mes)).filter((r) => r.categoria.toLowerCase() === nombre);
    if (rows.length === 0) {
      await ctx.api.sendMessage(chatId, `No encontré la categoría *${escapeMd(nombre)}* en ${mes}.`, {
        parseMode: "Markdown",
      });
      return;
    }

    const lines: string[] = [`📂 *${escapeMd(nombre)}* — ${mes}`, ""];
    lines.push(rows.map(categoriaBlock).join("\n---\n"));

    // Lista de gastos de esa categoría.
    const gastos = (await listGastos(ctx.sheets, mes)).filter((g) => g.categoria.toLowerCase() === nombre);
    lines.push("", `🧾 *Gastos* (${gastos.length}):`);
    if (gastos.length === 0) {
      lines.push("  _sin gastos este mes_");
    } else {
      for (const g of gastos) {
        const flag = g.esCuota ? ` _(${escapeMd(g.esCuota)})_` : "";
        lines.push(
          `  • ${g.fecha} · *${formatArs(g.monto)}* · ${escapeMd(g.subcategoria)} · ${escapeMd(g.detalle)}${flag}`,
        );
      }
    }
    await sendChunked(ctx, chatId, lines);
  } catch (err) {
    await reportError(ctx, chatId, err);
  }
}

// --- /gastos ---
export async function handleGastos(ctx: Ctx, chatId: number): Promise<void> {
  try {
    const mes = currentMonthKey();
    const gastos = await listGastos(ctx.sheets, mes);
    const lines: string[] = [`🧾 *Gastos ${mes}* (${gastos.length})`, ""];
    if (gastos.length === 0) {
      lines.push("_Todavía no hay gastos cargados este mes._");
    } else {
      for (const g of gastos) {
        const flag = g.esCuota ? ` _(${escapeMd(g.esCuota)})_` : "";
        lines.push(
          `• ${g.fecha} · *${formatArs(g.monto)}* · ${escapeMd(g.categoria)}›${escapeMd(g.subcategoria)} · ${escapeMd(
            g.detalle,
          )} · ${escapeMd(g.quien)}${flag}`,
        );
      }
    }
    await sendChunked(ctx, chatId, lines);
  } catch (err) {
    await reportError(ctx, chatId, err);
  }
}

// --- /sheet ---
export async function handleSheet(ctx: Ctx, chatId: number): Promise<void> {
  const url = `https://docs.google.com/spreadsheets/d/${ctx.env.SHEET_ID}/edit`;
  await ctx.api.sendMessage(chatId, `📄 [Abrir el Google Sheet](${url})`, { parseMode: "Markdown" });
}

// --- /help ---
export async function handleHelp(ctx: Ctx, chatId: number): Promise<void> {
  const text = [
    "🤖 *Finahue* — finanzas de la pareja",
    "",
    "*Filosofía*",
    "• *Categoría ≠ medio de pago*: la categoría es _en qué_ gastás; el medio, _con qué_ pagás. La tarjeta no es categoría.",
    "• *Base caja*: el gasto entra el mes en que se paga la plata.",
    "• *Ahorros*: la categoría `ahorros` _acumula_, no presupuesta. Comprar con plata de ahorros se registra en la categoría real del gasto.",
    "• *revisar*: agregá la palabra `revisar` para pintar la fila y revisarla después.",
    "",
    "*Cargar un gasto*: mandá el monto en la 1ª línea + los demás campos (ver /formato).",
    "",
    "*Comandos*",
    "• /nuevomes — crea las hojas del mes actual.",
    "• /cargarcuotas — inserta las cuotas activas del mes.",
    "• /cuota — alta guiada de una cuota nueva.",
    "• /categorias — categorías y subcategorías.",
    "• /mediosdepago — medios de pago.",
    "• /formato — cómo cargar un gasto.",
    "• /categoria <nombre> [YYYY-MM] — detalle de una categoría.",
    "• /resumen — presupuesto vs gastado de todo el mes.",
    "• /gastos — todos los gastos del mes.",
    "• /sheet — link al Google Sheet.",
  ].join("\n");
  await ctx.api.sendMessage(chatId, text, { parseMode: "Markdown" });
}
