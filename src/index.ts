/**
 * Entrypoint del Worker: webhook de Telegram.
 *
 * Seguridad (antes de procesar nada):
 *   1. Header X-Telegram-Bot-Api-Secret-Token == TELEGRAM_WEBHOOK_SECRET → si no, 401.
 *   2. from.id ∈ ALLOWED_USER_IDS → si no, se ignora en silencio.
 *   3. Nunca se loguean secrets.
 */

import type { Env } from "./env";
import { parseAllowedUserIds } from "./env";
import type { TelegramUpdate, TelegramMessage, TelegramCallbackQuery } from "./telegram/types";
import { createCtx, type Ctx } from "./ctx";
import { handleCommand } from "./handlers/commands";
import {
  handleExpenseMessage,
  handleExpenseConfirmCallback,
  handleSubcatCallback,
  PREFIX_CONFIRM,
  PREFIX_SUBCAT,
} from "./handlers/expense";
import { handleCuotaText, handleCuotaCallback, PREFIX_CUOTA_FORM } from "./handlers/cuota";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response("ok");

    // 1. Validar el secret token del webhook.
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      return new Response("bad request", { status: 400 });
    }

    // 2. Validar el usuario.
    const fromId = update.message?.from?.id ?? update.callback_query?.from.id;
    const allowed = parseAllowedUserIds(env);
    if (fromId === undefined || !allowed.has(fromId)) {
      // Ignorar en silencio: 200 sin acción.
      return new Response("ok");
    }

    const ctx = createCtx(env);
    try {
      await dispatch(ctx, update);
    } catch (err) {
      // Backstop: nunca dejamos que Telegram reintente en loop por un throw.
      console.error("Unhandled error:", err instanceof Error ? err.message : String(err));
    }
    return new Response("ok");
  },

  /**
   * Cron trigger (ver wrangler.toml): recordatorio diario a las 21:30 ART.
   * Se manda al chat configurado en REMINDER_CHAT_ID (el id del grupo).
   */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendDailyReminder(env));
  },
};

const DAILY_REMINDER_TEXT = "Recordá agregar los gastos que hiciste hoy!";

async function sendDailyReminder(env: Env): Promise<void> {
  const chatId = Number(env.REMINDER_CHAT_ID);
  if (!Number.isFinite(chatId) || chatId === 0) {
    console.error("REMINDER_CHAT_ID no configurado o inválido:", env.REMINDER_CHAT_ID);
    return;
  }
  const ctx = createCtx(env);
  try {
    await ctx.api.sendMessage(chatId, DAILY_REMINDER_TEXT);
  } catch (err) {
    console.error(
      `Fallo al mandar recordatorio a ${chatId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function dispatch(ctx: Ctx, update: TelegramUpdate): Promise<void> {
  if (update.callback_query) return dispatchCallback(ctx, update.callback_query);
  if (update.message) return dispatchMessage(ctx, update.message);
}

async function dispatchMessage(ctx: Ctx, msg: TelegramMessage): Promise<void> {
  const text = msg.text;
  if (!text) return; // ignoramos fotos/stickers/etc.

  // Comando: empieza con "/".
  if (text.startsWith("/")) {
    const tokens = text.trim().split(/\s+/);
    // "/categoria@FinahueBot" -> "categoria"
    const command = tokens[0]!.slice(1).split("@")[0]!.toLowerCase();
    const args = tokens.slice(1);
    return handleCommand(ctx, msg, command, args);
  }

  // ¿Hay un formulario de /cuota activo para este usuario?
  const form = await ctx.state.getCuotaForm(msg.from!.id);
  if (form) return handleCuotaText(ctx, msg, form);

  // Si no, es un intento de registrar un gasto.
  return handleExpenseMessage(ctx, msg);
}

async function dispatchCallback(ctx: Ctx, cq: TelegramCallbackQuery): Promise<void> {
  const parts = (cq.data ?? "").split(":");
  const prefix = parts[0];
  switch (prefix) {
    case PREFIX_CONFIRM:
      return handleExpenseConfirmCallback(ctx, cq, parts);
    case PREFIX_SUBCAT:
      return handleSubcatCallback(ctx, cq, parts);
    case PREFIX_CUOTA_FORM:
      return handleCuotaCallback(ctx, cq, parts);
    default:
      await ctx.api.answerCallbackQuery(cq.id);
  }
}
