/**
 * Escape para el parse_mode "Markdown" (legacy) de Telegram.
 * Escapamos los caracteres que rompen el parseo en texto dinámico
 * (detalle, notas, nombres, etc.).
 */
export function escapeMd(text: string): string {
  return text.replace(/([_*`\[])/g, "\\$1");
}
