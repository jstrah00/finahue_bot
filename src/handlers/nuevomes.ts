/**
 * /nuevomes — crea las hojas del mes actual (Detalle + Resumen) con headers,
 * fórmulas SUMIFS y las filas de Config precargadas (presupuesto en blanco).
 *
 * NO inserta cuotas: eso lo hace el comando dedicado /cargarcuotas.
 */

import type { Ctx } from "../ctx";
import { readConfig } from "../sheets/config-sheet";
import { monthExists, createMonth } from "../sheets/month";
import { currentMonthKey } from "../util/date";
import { reportError } from "./errors";

export async function handleNuevoMes(ctx: Ctx, chatId: number): Promise<void> {
  try {
    const mes = currentMonthKey();

    if (await monthExists(ctx.sheets, mes)) {
      await ctx.api.sendMessage(
        chatId,
        `📅 El mes *${mes}* ya existe. No lo sobrescribo.\n\nSi querés cargar las cuotas del mes, usá /cargarcuotas.`,
        { parseMode: "Markdown" },
      );
      return;
    }

    const config = await readConfig(ctx.sheets);
    await createMonth(ctx.sheets, mes, config);

    await ctx.api.sendMessage(
      chatId,
      [
        `✅ Creé las hojas del mes *${mes}*:`,
        `• \`${mes} Detalle\``,
        `• \`${mes} Resumen\` (con fórmulas listas)`,
        "",
        "Ahora cargá los *presupuestos* en el Resumen y, si querés, corré /cargarcuotas para insertar las cuotas activas del mes.",
      ].join("\n"),
      { parseMode: "Markdown" },
    );
  } catch (err) {
    await reportError(ctx, chatId, err);
  }
}
