/** Manejo centralizado de errores hacia el usuario (sin filtrar secrets). */

import type { Ctx } from "../ctx";
import { SheetStructureError } from "../sheets/headers";

export async function reportError(ctx: Ctx, chatId: number, err: unknown): Promise<void> {
  // Log sin secrets: solo el mensaje de error.
  const message = err instanceof Error ? err.message : String(err);
  console.error("Handler error:", message);

  if (err instanceof SheetStructureError) {
    // Errores de estructura del Sheet: el mensaje ya es claro y útil.
    await ctx.api.sendMessage(chatId, `⚠️ ${message}`);
    return;
  }

  await ctx.api.sendMessage(
    chatId,
    "⚠️ Ocurrió un error procesando la solicitud. Probá de nuevo en un momento.",
  );
}
