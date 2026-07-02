/**
 * /nuevomes — crea las hojas del mes actual (Detalle + Resumen) con headers,
 * fórmulas SUMIFS y las filas de Config precargadas (presupuesto en blanco), y
 * luego inserta automáticamente las cuotas activas del mes.
 *
 * La inserción es idempotente por diseño: como el mes se crea una sola vez
 * (guard `monthExists`), las cuotas nunca se duplican.
 */

import type { Ctx } from "../ctx";
import { readConfig } from "../sheets/config-sheet";
import { monthExists, createMonth } from "../sheets/month";
import { insertActiveCuotasIntoMonth } from "../sheets/cuotas";
import { currentMonthKey, todayIso } from "../util/date";
import { formatArs } from "../format/money";
import { escapeMd } from "../format/md";
import { reportError } from "./errors";

export async function handleNuevoMes(ctx: Ctx, chatId: number): Promise<void> {
  try {
    const mes = currentMonthKey();

    if (await monthExists(ctx.sheets, mes)) {
      await ctx.api.sendMessage(
        chatId,
        `📅 El mes *${mes}* ya existe. No lo sobrescribo (las cuotas ya se cargaron al crearlo).`,
        { parseMode: "Markdown" },
      );
      return;
    }

    const config = await readConfig(ctx.sheets);
    await createMonth(ctx.sheets, mes, config);

    const { inserted, closed } = await insertActiveCuotasIntoMonth(ctx.sheets, mes, todayIso());

    const lines = [
      `✅ Creé las hojas del mes *${mes}*:`,
      `• \`${mes} Detalle\``,
      `• \`${mes} Resumen\` (con fórmulas listas)`,
      "",
    ];

    if (inserted.length === 0) {
      lines.push("No había cuotas activas para insertar este mes. 🎉");
    } else {
      lines.push(`🧾 *Cuotas insertadas* (${inserted.length}):`);
      for (const c of inserted) {
        lines.push(
          `• ${escapeMd(c.descripcion)} — *${formatArs(c.montoCuota)}* · cuota ${c.cuotaActual}/${c.totalCuotas}`,
        );
      }
      if (closed.length) {
        lines.push("", "🏁 *Cerradas* (última cuota):", ...closed.map((c) => `• ${escapeMd(c.descripcion)}`));
      }
    }

    lines.push("", "Ahora cargá los *presupuestos* en el Resumen.");

    await ctx.api.sendMessage(chatId, lines.join("\n"), { parseMode: "Markdown" });
  } catch (err) {
    await reportError(ctx, chatId, err);
  }
}
