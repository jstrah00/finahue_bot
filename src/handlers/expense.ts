/**
 * Registro de gastos: mensaje sin "/" → parse → confirmación ✅/❌ → escritura.
 */

import type { Ctx } from "../ctx";
import { resolveQuien } from "../ctx";
import type { TelegramMessage, TelegramCallbackQuery } from "../telegram/types";
import type { Expense } from "../domain";
import { parseExpense } from "../parser/expense";
import { readConfig } from "../sheets/config-sheet";
import { monthExists } from "../sheets/month";
import { appendExpense } from "../sheets/detalle";
import { currentMonthKey } from "../util/date";
import { formatArs } from "../format/money";
import { escapeMd } from "../format/md";
import { confirmCancelKeyboard, optionsKeyboard } from "../telegram/keyboards";
import { newToken, type PendingExpense } from "../state/kv";
import { reportError } from "./errors";

const PREFIX_CONFIRM = "exp";
const PREFIX_SUBCAT = "sub";

/** Arma el texto de resumen del gasto interpretado. */
export function expenseSummary(e: Expense): string {
  const lines = [
    "🧾 *Confirmá el gasto:*",
    "",
    `💰 Monto: *${formatArs(e.monto)}*`,
    `📝 Detalle: ${escapeMd(e.detalle)}`,
    `📂 Categoría: ${escapeMd(e.categoria)} › ${escapeMd(e.subcategoria)}`,
  ];
  if (e.medioPago) lines.push(`💳 Medio: ${escapeMd(e.medioPago)}`);
  lines.push(`👤 Quién: ${escapeMd(e.quien)}`);
  lines.push(`📅 Fecha: ${escapeMd(e.fecha)}`);
  if (e.notas) lines.push(`🗒️ Notas: ${escapeMd(e.notas)}`);
  if (e.revisar) lines.push("⚠️ Marcado para *revisar*");
  return lines.join("\n");
}

/** Maneja un mensaje de texto que no es comando: intento de registrar gasto. */
export async function handleExpenseMessage(ctx: Ctx, msg: TelegramMessage): Promise<void> {
  const chatId = msg.chat.id;
  const text = msg.text ?? "";
  const defaultQuien = resolveQuien(ctx, msg.from!.id);

  // En un grupo el bot recibe TODOS los mensajes (privacy mode off). Un gasto
  // siempre empieza con el monto (un número) en la primera línea. Si la primera
  // línea no arranca con un dígito, es charla normal → lo ignoramos en silencio
  // para no spamear errores en cada mensaje.
  const firstLine = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  if (!/^\$?\d/.test(firstLine)) return;

  try {
    const config = await readConfig(ctx.sheets);
    const result = parseExpense(text, { config, defaultQuien });

    if (result.status === "error") {
      await ctx.api.sendMessage(chatId, result.message, { parseMode: "Markdown" });
      return;
    }

    if (result.status === "need_subcategoria") {
      const token = newToken();
      const pending: PendingExpense = { kind: "expense", expense: result.draft, chatId };
      await ctx.state.putPending(token, pending);
      await ctx.api.sendMessage(
        chatId,
        `📂 ¿Qué subcategoría de *${escapeMd(result.categoria)}*? Elegí una:`,
        {
          parseMode: "Markdown",
          keyboard: optionsKeyboard(PREFIX_SUBCAT, token, result.subcategorias, 3),
        },
      );
      return;
    }

    // status === "ok": validar que exista el mes antes de ofrecer confirmar.
    const mes = currentMonthKey();
    if (!(await monthExists(ctx.sheets, mes))) {
      await ctx.api.sendMessage(
        chatId,
        `📅 Todavía no existe la hoja del mes *${mes}*. Corré /nuevomes primero.`,
        { parseMode: "Markdown" },
      );
      return;
    }

    const token = newToken();
    const pending: PendingExpense = { kind: "expense", expense: result.expense, chatId };
    await ctx.state.putPending(token, pending);
    await ctx.api.sendMessage(chatId, expenseSummary(result.expense), {
      parseMode: "Markdown",
      keyboard: confirmCancelKeyboard(PREFIX_CONFIRM, token),
    });
  } catch (err) {
    await reportError(ctx, chatId, err);
  }
}

/** Callback de selección de subcategoría: "sub:<token>:<subcat>". */
export async function handleSubcatCallback(ctx: Ctx, cq: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const [, token, subcat] = parts;
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  if (!token || !subcat || chatId === undefined || messageId === undefined) {
    await ctx.api.answerCallbackQuery(cq.id, "Datos inválidos.");
    return;
  }

  const pending = await ctx.state.getPending(token);
  if (!pending || pending.kind !== "expense") {
    await ctx.api.answerCallbackQuery(cq.id, "Se venció, cargá el gasto de nuevo.");
    await ctx.api.editMessageText(chatId, messageId, "⏱️ Expiró. Cargá el gasto de nuevo.");
    return;
  }

  await ctx.api.answerCallbackQuery(cq.id);
  const expense: Expense = { ...pending.expense, subcategoria: subcat };

  if (!expense.detalle) {
    await ctx.state.delPending(token);
    await ctx.api.editMessageText(chatId, messageId, "❌ Falta el *detalle* del gasto. Cargalo de nuevo.", {
      parseMode: "Markdown",
    });
    return;
  }

  const mes = currentMonthKey();
  if (!(await monthExists(ctx.sheets, mes))) {
    await ctx.state.delPending(token);
    await ctx.api.editMessageText(chatId, messageId, `📅 No existe la hoja de *${mes}*. Corré /nuevomes.`, {
      parseMode: "Markdown",
    });
    return;
  }

  await ctx.state.putPending(token, { kind: "expense", expense, chatId });
  await ctx.api.editMessageText(chatId, messageId, expenseSummary(expense), {
    parseMode: "Markdown",
    keyboard: confirmCancelKeyboard(PREFIX_CONFIRM, token),
  });
}

/** Callback de confirmación: "exp:ok:<token>" o "exp:no:<token>". */
export async function handleExpenseConfirmCallback(
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
  if (!pending || pending.kind !== "expense") {
    await ctx.api.answerCallbackQuery(cq.id, "Se venció.");
    await ctx.api.editMessageText(chatId, messageId, "⏱️ Expiró. Cargá el gasto de nuevo.");
    return;
  }

  // Consumimos el estado siempre (evita doble escritura por doble tap).
  await ctx.state.delPending(token);

  if (action === "no") {
    await ctx.api.answerCallbackQuery(cq.id, "Cancelado");
    await ctx.api.editMessageText(chatId, messageId, "❌ Gasto cancelado.");
    return;
  }

  try {
    const mes = currentMonthKey();
    await appendExpense(ctx.sheets, mes, pending.expense);
    await ctx.api.answerCallbackQuery(cq.id, "Guardado ✅");
    await ctx.api.editMessageText(
      chatId,
      messageId,
      `✅ *Guardado*\n\n${expenseSummary(pending.expense)}`,
      { parseMode: "Markdown" },
    );
  } catch (err) {
    await ctx.api.answerCallbackQuery(cq.id, "Error al guardar");
    await reportError(ctx, chatId, err);
  }
}

export { PREFIX_CONFIRM, PREFIX_SUBCAT };
