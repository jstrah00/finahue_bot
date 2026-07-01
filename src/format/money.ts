/** Formateo de montos en pesos argentinos (ej. 5000 -> "$5.000"). */

export function formatArs(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const hasCents = rounded % 1 !== 0;
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rounded);
  return `$${formatted}`;
}

/**
 * Parsea un monto en formato ARS a número.
 * Acepta: "5000", "5.000", "5000,50", "5.000,50", "$5.000".
 * Devuelve null si no es un número válido.
 *
 * Heurística de separadores (formato es-AR): el punto es separador de miles y
 * la coma es separador decimal.
 */
export function parseArs(input: string): number | null {
  let s = input.trim().replace(/^\$/, "").replace(/\s/g, "");
  if (s === "") return null;

  // Coma = decimal; punto = miles. Sacamos puntos, coma -> punto decimal.
  s = s.replace(/\./g, "").replace(/,/g, ".");

  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
