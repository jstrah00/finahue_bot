/** Helpers para construir teclados inline. */

import type { InlineKeyboard } from "./types";

/** Botones ✅ Confirmar / ❌ Cancelar. `token` identifica el estado pendiente. */
export function confirmCancelKeyboard(prefix: string, token: string): InlineKeyboard {
  return [
    [
      { text: "✅ Confirmar", callback_data: `${prefix}:ok:${token}` },
      { text: "❌ Cancelar", callback_data: `${prefix}:no:${token}` },
    ],
  ];
}

/**
 * Teclado con una lista de opciones, N por fila. Cada opción genera un
 * callback_data `${prefix}:${token}:${value}`.
 */
export function optionsKeyboard(
  prefix: string,
  token: string,
  options: string[],
  perRow = 3,
): InlineKeyboard {
  const rows: InlineKeyboard = [];
  for (let i = 0; i < options.length; i += perRow) {
    rows.push(
      options.slice(i, i + perRow).map((opt) => ({
        text: opt,
        callback_data: `${prefix}:${token}:${opt}`,
      })),
    );
  }
  return rows;
}
