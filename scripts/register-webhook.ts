/**
 * Registra el webhook de Telegram (con secret token) y el menú de comandos.
 *
 *   npm run register-webhook -- https://finahue-bot.<tu-subdominio>.workers.dev
 *
 * o definí WEBHOOK_URL en .dev.vars. Lee TELEGRAM_BOT_TOKEN y
 * TELEGRAM_WEBHOOK_SECRET de .dev.vars.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { TelegramApi } from "../src/telegram/api";
import { BOT_COMMANDS } from "../src/handlers/commands";

loadEnv({ path: ".dev.vars" });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable ${name} (definila en .dev.vars).`);
  return v;
}

async function main() {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const secret = requireEnv("TELEGRAM_WEBHOOK_SECRET");
  const url = process.argv[2] ?? process.env.WEBHOOK_URL;
  if (!url) {
    throw new Error(
      "Falta la URL del webhook. Pasala como argumento:\n" +
        "  npm run register-webhook -- https://finahue-bot.<subdominio>.workers.dev",
    );
  }

  const api = new TelegramApi(token);

  console.log(`• Registrando webhook en ${url} …`);
  await api.setWebhook(url, secret);

  console.log("• Configurando menú de comandos…");
  await api.setMyCommands(BOT_COMMANDS);

  console.log("✅ Webhook y comandos registrados.");
}

main().catch((err) => {
  console.error("❌ Falló:", err instanceof Error ? err.message : err);
  process.exit(1);
});
