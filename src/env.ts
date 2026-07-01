import type { Quien } from "./domain";

/** Bindings + secrets del Worker (ver wrangler.toml y .dev.vars.example). */
export interface Env {
  STATE: KVNamespace;

  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  SHEET_ID: string;
  ALLOWED_USER_IDS: string;
  USER_MAP: string;
  /** Chat destino del recordatorio diario (id del grupo, ej. "-1001234567890"). */
  REMINDER_CHAT_ID: string;
}

/** Parsea `ALLOWED_USER_IDS` ("123,456") a un set de números. */
export function parseAllowedUserIds(env: Env): Set<number> {
  const ids = new Set<number>();
  for (const part of env.ALLOWED_USER_IDS.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n !== 0) ids.add(n);
  }
  return ids;
}

/**
 * Parsea `USER_MAP` ("id1:juli,id2:mili") a un mapa user_id -> nombre.
 * Solo acepta los nombres válidos juli/mili; ignora entradas mal formadas.
 */
export function parseUserMap(env: Env): Map<number, Quien> {
  const map = new Map<number, Quien>();
  for (const part of env.USER_MAP.split(",")) {
    const [rawId, rawName] = part.split(":");
    if (!rawId || !rawName) continue;
    const id = Number(rawId.trim());
    const name = rawName.trim().toLowerCase();
    if (Number.isFinite(id) && (name === "juli" || name === "mili")) {
      map.set(id, name);
    }
  }
  return map;
}
