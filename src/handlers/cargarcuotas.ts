/**
 * /cargarcuotas — inserta las cuotas activas en el Detalle del mes actual.
 *
 * Lee las cuotas `activa`, las muestra y pide confirmación ✅/❌. Al confirmar,
 * inserta cada una como gasto (nota "cuota X de Y"), avanza `cuota_actual` y
 * cierra la cuota cuando supera `total_cuotas`.
 */

import type { Ctx } from "../ctx";
import type { TelegramCallbackQuery } from "../telegram/types";
import type { Cuota, Expense } from "../domain";
import { monthExists } from "../sheets/month";
import { readActiveCuotas, advanceCuota } from "../sheets/cuotas";
import { appendExpense } from "../sheets/detalle";
import { currentMonthKey, todayIso } from "../util/date";
import { formatArs } from "../format/money";
import { escapeMd } from "../format/md";
import { confirmCancelKeyboard } from "../telegram/keyboards";
import { newToken, type PendingCuotas } from "../state/kv";
import { reportError } from "./errors";

export const PREFIX_CARGAR_CUOTAS = "cc";

/** Filtra cuotas que ya se pasaron de total (defensivo). */
function insertable(c: Cuota): boolean {
  return c.cuotaActual >= 1 && c.cuotaActual <= c.totalCuotas;
}

export async function handleCargarCuotas(ctx: Ctx, chatId: number): Promise<void> {
  try {
    const mes = currentMonthKey();
    if (!(await monthExists(ctx.sheets, mes))) {
      await ctx.api.sendMessage(chatId, `📅 No existe la hoja de *${mes}*. Corré /nuevomes primero.`, {
        parseMode: "Markdown",
      });
      return;
    }

    const cuotas = (await readActiveCuotas(ctx.sheets)).filter(insertable);
    if (cuotas.length === 0) {
      await ctx.api.sendMessage(chatId, "No hay cuotas activas para insertar este mes. 🎉");
      return;
    }

    const token = newToken();
    const pending: PendingCuotas = { kind: "cuotas", mes, cuotas, chatId };
    await ctx.state.putPending(token, pending);

    const lines = [
      `🧾 *Cuotas a insertar en ${mes}* (${cuotas.length}):`,
      "",
      ...cuotas.map(
        (c) =>
          `• ${escapeMd(c.descripcion)} — *${formatArs(c.montoCuota)}* · ${escapeMd(c.categoria)}›${escapeMd(
            c.subcategoria,
          )} · cuota ${c.cuotaActual}/${c.totalCuotas} · ${escapeMd(c.quien)}`,
      ),
      "",
      "⚠️ Confirmar inserta los gastos y *avanza los contadores*. No lo corras dos veces el mismo mes.",
    ];

    await ctx.api.sendMessage(chatId, lines.join("\n"), {
      parseMode: "Markdown",
      keyboard: confirmCancelKeyboard(PREFIX_CARGAR_CUOTAS, token),
    });
  } catch (err) {
    await reportError(ctx, chatId, err);
  }
}

/** Callback "cc:ok:<token>" / "cc:no:<token>". */
export async function handleCargarCuotasCallback(
  ctx: Ctx,
  cq: TelegramCallbackQuery,
  parts: string[],
): Promise<void> {
  const [, action, token] = parts;
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  if (!action || !token || chatId === undefined || messageId === undefined) {
    await ctx.api.answerCallbackQuery(cq.id, "Datos inválidos.");
    return;
  }

  const pending = await ctx.state.getPending(token);
  if (!pending || pending.kind !== "cuotas") {
    await ctx.api.answerCallbackQuery(cq.id, "Se venció.");
    await ctx.api.editMessageText(chatId, messageId, "⏱️ Expiró. Corré /cargarcuotas de nuevo.");
    return;
  }

  await ctx.state.delPending(token); // consumir siempre (evita doble inserción)

  if (action === "no") {
    await ctx.api.answerCallbackQuery(cq.id, "Cancelado");
    await ctx.api.editMessageText(chatId, messageId, "❌ No inserté ninguna cuota.");
    return;
  }

  await ctx.api.answerCallbackQuery(cq.id, "Insertando…");
  const fecha = todayIso();
  const inserted: string[] = [];
  const closed: string[] = [];

  try {
    for (const c of pending.cuotas) {
      const expense: Expense = {
        monto: c.montoCuota,
        detalle: c.descripcion,
        categoria: c.categoria,
        subcategoria: c.subcategoria,
        medioPago: c.medioPago,
        quien: c.quien,
        fecha,
        notas: "",
        revisar: false,
        esCuota: `cuota ${c.cuotaActual} de ${c.totalCuotas}`,
      };
      await appendExpense(ctx.sheets, pending.mes, expense);
      const { cerrada } = await advanceCuota(ctx.sheets, c);
      inserted.push(`• ${c.descripcion} — ${formatArs(c.montoCuota)} (cuota ${c.cuotaActual}/${c.totalCuotas})`);
      if (cerrada) closed.push(`• ${c.descripcion}`);
    }

    const lines = [`✅ Inserté ${inserted.length} cuota(s) en *${pending.mes}*:`, "", ...inserted];
    if (closed.length) lines.push("", "🏁 *Cerradas* (última cuota):", ...closed);
    await ctx.api.editMessageText(chatId, messageId, lines.join("\n"), { parseMode: "Markdown" });
  } catch (err) {
    await reportError(ctx, chatId, err);
  }
}
