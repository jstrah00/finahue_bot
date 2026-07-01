/** Ensambla las dependencias compartidas por los handlers. */

import type { Env } from "./env";
import { parseUserMap } from "./env";
import type { Quien } from "./domain";
import { TelegramApi } from "./telegram/api";
import { SheetsClient } from "./sheets/client";
import { StateStore } from "./state/kv";
import { getAccessToken } from "./google/auth";

export interface Ctx {
  env: Env;
  api: TelegramApi;
  sheets: SheetsClient;
  state: StateStore;
  userMap: Map<number, Quien>;
}

export function createCtx(env: Env): Ctx {
  const api = new TelegramApi(env.TELEGRAM_BOT_TOKEN);
  const sheets = new SheetsClient(env.SHEET_ID, () =>
    getAccessToken(env.STATE, {
      serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKeyPem: env.GOOGLE_PRIVATE_KEY,
    }),
  );
  return {
    env,
    api,
    sheets,
    state: new StateStore(env.STATE),
    userMap: parseUserMap(env),
  };
}

/** Resuelve el nombre corto (juli/mili) del que mandó el mensaje. */
export function resolveQuien(ctx: Ctx, userId: number): Quien {
  return ctx.userMap.get(userId) ?? "juli";
}
