/** Barra de progreso con caracteres de bloque (ej. "████░░░░ 52%"). */

const WIDTH = 8;

/**
 * Renderiza una barra de progreso a partir de un ratio (0..1+).
 * Si el ratio es null/inválido (ej. presupuesto vacío), devuelve "—".
 */
export function progressBar(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * WIDTH);
  const pct = Math.round(ratio * 100);
  return `${"█".repeat(filled)}${"░".repeat(WIDTH - filled)} ${pct}%`;
}
