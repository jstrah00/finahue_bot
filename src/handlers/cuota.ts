/**
 * /cuota — alta guiada (formulario multi-paso) de una cuota nueva.
 * El estado del formulario vive en KV, por usuario.
 *
 * Pasos: descripción → monto/cuota → categoría → subcategoría → medio →
 * quién → total de cuotas → cuota actual. Al terminar, escribe la fila en
 * `Cuotas` con estado `activa`.
 */

import type { Ctx } from "../ctx";
import type { TelegramMessage, TelegramCallbackQuery } from "../telegram/types";
import type { ConfigData, Quien } from "../domain";
import { readConfig } from "../sheets/config-sheet";
import { appendCuota } from "../sheets/cuotas";
import { parseArs, formatArs } from "../format/money";
import { escapeMd } from "../format/md";
import { optionsKeyboard } from "../telegram/keyboards";
import { newToken, type CuotaForm } from "../state/kv";
import { todayIso } from "../util/date";
import { subcatsOf } from "../parser/expense";
import { reportError } from "./errors";

export const PREFIX_CUOTA_FORM = "cf";

/** Categorías únicas (en orden de Config). */
function categoriasUnicas(config: ConfigData): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of config.categorias) {
    if (!seen.has(c.categoria)) {
      seen.add(c.categoria);
      out.push(c.categoria);
    }
  }
  return out;
}

/** Inicia el formulario de /cuota. */
export async function startCuotaForm(ctx: Ctx, chatId: number, userId: number): Promise<void> {
  const form: CuotaForm = { kind: "cuotaForm", chatId, userId, step: "descripcion" };
  await ctx.state.putCuotaForm(userId, form);
  await ctx.api.sendMessage(
    chatId,
    "🧾 *Nueva cuota* (paso 1/8)\n\n¿Descripción? (ej. `Starlink`, `Zapatillas Juli`)",
    { parseMode: "Markdown" },
  );
}

/** Procesa un mensaje de texto cuando hay un formulario de cuota activo. */
export async function handleCuotaText(ctx: Ctx, msg: TelegramMessage, form: CuotaForm): Promise<void> {
  const chatId = msg.chat.id;
  const userId = msg.from!.id;
  const text = (msg.text ?? "").trim();

  try {
    switch (form.step) {
      case "descripcion": {
        if (!text) return void (await ctx.api.sendMessage(chatId, "Escribí una descripción."));
        form.descripcion = text;
        form.step = "montoCuota";
        await ctx.state.putCuotaForm(userId, form);
        await ctx.api.sendMessage(chatId, "💰 *Paso 2/8* — ¿Monto de cada cuota? (ej. `15.000`)", {
          parseMode: "Markdown",
        });
        return;
      }
      case "montoCuota": {
        const monto = parseArs(text);
        if (monto === null || monto <= 0) {
          await ctx.api.sendMessage(chatId, "Monto inválido. Poné un número, ej. `15.000`.", {
            parseMode: "Markdown",
          });
          return;
        }
        form.montoCuota = monto;
        form.step = "categoria";
        await ctx.state.putCuotaForm(userId, form);
        const config = await readConfig(ctx.sheets);
        await ctx.api.sendMessage(chatId, "📂 *Paso 3/8* — Elegí la categoría:", {
          parseMode: "Markdown",
          keyboard: optionsKeyboard(PREFIX_CUOTA_FORM, "cat", categoriasUnicas(config), 3),
        });
        return;
      }
      case "totalCuotas": {
        const n = Number.parseInt(text, 10);
        if (!Number.isInteger(n) || n <= 0) {
          await ctx.api.sendMessage(chatId, "Poné un número entero de cuotas, ej. `12`.", {
            parseMode: "Markdown",
          });
          return;
        }
        form.totalCuotas = n;
        form.step = "cuotaActual";
        await ctx.state.putCuotaForm(userId, form);
        await ctx.api.sendMessage(
          chatId,
          `🔢 *Paso 8/8* — ¿En qué cuota vas? (1 a ${n}). Si recién arranca, poné \`1\`.`,
          { parseMode: "Markdown" },
        );
        return;
      }
      case "cuotaActual": {
        const n = Number.parseInt(text, 10);
        if (!Number.isInteger(n) || n < 1 || n > (form.totalCuotas ?? 0)) {
          await ctx.api.sendMessage(chatId, `Poné un número entre 1 y ${form.totalCuotas}.`);
          return;
        }
        form.cuotaActual = n;
        await finalizeCuota(ctx, form);
        return;
      }
      default:
        // Pasos que se resuelven con botones.
        await ctx.api.sendMessage(chatId, "Usá los botones de arriba para elegir 👆");
        return;
    }
  } catch (err) {
    await ctx.state.delCuotaForm(userId);
    await reportError(ctx, chatId, err);
  }
}

/** Procesa un callback de botón del formulario de cuota. */
export async function handleCuotaCallback(ctx: Ctx, cq: TelegramCallbackQuery, parts: string[]): Promise<void> {
  const field = parts[1];
  const value = parts[2];
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  const userId = cq.from.id;
  if (!field || !value || chatId === undefined || messageId === undefined) {
    await ctx.api.answerCallbackQuery(cq.id, "Datos inválidos.");
    return;
  }

  const form = await ctx.state.getCuotaForm(userId);
  if (!form) {
    await ctx.api.answerCallbackQuery(cq.id, "El formulario expiró. Empezá con /cuota.");
    return;
  }

  try {
    await ctx.api.answerCallbackQuery(cq.id);
    const config = await readConfig(ctx.sheets);

    if (field === "cat") {
      form.categoria = value;
      form.step = "subcategoria";
      await ctx.state.putCuotaForm(userId, form);
      await ctx.api.editMessageText(chatId, messageId, `📂 Categoría: *${escapeMd(value)}*\n\nElegí la subcategoría:`, {
        parseMode: "Markdown",
        keyboard: optionsKeyboard(PREFIX_CUOTA_FORM, "sub", subcatsOf(config, value), 3),
      });
      return;
    }

    if (field === "sub") {
      form.subcategoria = value;
      form.step = "medioPago";
      await ctx.state.putCuotaForm(userId, form);
      await ctx.api.editMessageText(chatId, messageId, `📂 ${escapeMd(form.categoria!)} › *${escapeMd(value)}*\n\nElegí el medio de pago:`, {
        parseMode: "Markdown",
        keyboard: optionsKeyboard(PREFIX_CUOTA_FORM, "medio", [...config.mediosPago].sort(), 3),
      });
      return;
    }

    if (field === "medio") {
      form.medioPago = value;
      form.step = "quien";
      await ctx.state.putCuotaForm(userId, form);
      await ctx.api.editMessageText(chatId, messageId, `💳 Medio: *${escapeMd(value)}*\n\n¿De quién es la cuota?`, {
        parseMode: "Markdown",
        keyboard: optionsKeyboard(PREFIX_CUOTA_FORM, "quien", ["juli", "mili"], 2),
      });
      return;
    }

    if (field === "quien") {
      form.quien = (value === "mili" ? "mili" : "juli") as Quien;
      form.step = "totalCuotas";
      await ctx.state.putCuotaForm(userId, form);
      await ctx.api.editMessageText(
        chatId,
        messageId,
        `👤 Quién: *${escapeMd(value)}*\n\n🔢 *Paso 7/8* — ¿Total de cuotas? (ej. \`12\`)`,
        { parseMode: "Markdown" },
      );
      return;
    }
  } catch (err) {
    await ctx.state.delCuotaForm(userId);
    await reportError(ctx, chatId, err);
  }
}

/** Escribe la cuota en la hoja y cierra el formulario. */
async function finalizeCuota(ctx: Ctx, form: CuotaForm): Promise<void> {
  const chatId = form.chatId;
  await appendCuota(ctx.sheets, {
    id: newToken(),
    descripcion: form.descripcion!,
    montoCuota: form.montoCuota!,
    categoria: form.categoria!,
    subcategoria: form.subcategoria!,
    medioPago: form.medioPago!,
    quien: form.quien!,
    cuotaActual: form.cuotaActual!,
    totalCuotas: form.totalCuotas!,
    estado: "activa",
    fechaAlta: todayIso(),
  });
  await ctx.state.delCuotaForm(form.userId);

  const restantes = form.totalCuotas! - form.cuotaActual! + 1;
  await ctx.api.sendMessage(
    chatId,
    [
      "✅ *Cuota dada de alta*",
      "",
      `🧾 ${escapeMd(form.descripcion!)}`,
      `💰 ${formatArs(form.montoCuota!)} × cuota`,
      `📂 ${escapeMd(form.categoria!)} › ${escapeMd(form.subcategoria!)}`,
      `💳 ${escapeMd(form.medioPago!)} · 👤 ${escapeMd(form.quien!)}`,
      `🔢 Vas por la cuota ${form.cuotaActual}/${form.totalCuotas} (${restantes} restantes)`,
      "",
      "ℹ️ Se insertará en los *próximos* meses cuando corras /cargarcuotas. No se agrega retroactivamente a meses ya creados.",
    ].join("\n"),
    { parseMode: "Markdown" },
  );
}
