/** Subconjunto de los tipos de la Bot API de Telegram que usamos. */

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/** Botón inline. */
export interface InlineButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineButton[][];
