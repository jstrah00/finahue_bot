/** Cliente mínimo de la Bot API de Telegram. */

import type { InlineKeyboard } from "./types";

export class TelegramApi {
  constructor(private readonly token: string) {}

  private async call(method: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
    if (!data.ok) {
      throw new Error(`Telegram ${method} error: ${data.description ?? "desconocido"}`);
    }
    return data.result;
  }

  async sendMessage(
    chatId: number,
    text: string,
    opts: { keyboard?: InlineKeyboard; parseMode?: "Markdown" | "MarkdownV2" | "HTML" } = {},
  ): Promise<{ message_id: number }> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (opts.parseMode) body.parse_mode = opts.parseMode;
    if (opts.keyboard) body.reply_markup = { inline_keyboard: opts.keyboard };
    return (await this.call("sendMessage", body)) as { message_id: number };
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    opts: { keyboard?: InlineKeyboard; parseMode?: "Markdown" | "MarkdownV2" | "HTML" } = {},
  ): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, message_id: messageId, text };
    if (opts.parseMode) body.parse_mode = opts.parseMode;
    // reply_markup vacío quita los botones.
    body.reply_markup = opts.keyboard ? { inline_keyboard: opts.keyboard } : { inline_keyboard: [] };
    await this.call("editMessageText", body);
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  async setMyCommands(commands: { command: string; description: string }[]): Promise<void> {
    await this.call("setMyCommands", { commands });
  }

  async setWebhook(url: string, secretToken: string): Promise<void> {
    await this.call("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"],
    });
  }
}
