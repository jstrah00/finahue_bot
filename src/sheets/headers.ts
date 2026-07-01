/**
 * Mapeo de columnas por ENCABEZADO (nunca por índice fijo).
 *
 * Regla de robustez del proyecto: el usuario puede reordenar/insertar columnas
 * a mano. Siempre localizamos las columnas por el nombre de su header.
 */

/** Normaliza un valor de celda a string trim + lowercase para comparar. */
export function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Error usado cuando falta una hoja o un encabezado esperado. */
export class SheetStructureError extends Error {}

/** Mapa header (lowercase) -> índice de columna (0-based). */
export type HeaderMap = Map<string, number>;

/** Construye el HeaderMap a partir de la fila de encabezados. */
export function buildHeaderMap(headerRow: unknown[]): HeaderMap {
  const map: HeaderMap = new Map();
  headerRow.forEach((cell, idx) => {
    const key = norm(cell);
    if (key && !map.has(key)) map.set(key, idx);
  });
  return map;
}

/**
 * Devuelve el índice de una columna por su header, o lanza SheetStructureError
 * con un mensaje claro si falta.
 */
export function requireCol(headers: HeaderMap, name: string, sheetName: string): number {
  const idx = headers.get(name.toLowerCase());
  if (idx === undefined) {
    throw new SheetStructureError(
      `La hoja "${sheetName}" no tiene la columna "${name}". Revisá los encabezados.`,
    );
  }
  return idx;
}

/** Lee una celda de una fila por su índice, como string trim. */
export function cell(row: unknown[], idx: number): string {
  return String(row[idx] ?? "").trim();
}

/** Convierte un índice de columna 0-based a letra(s) A1 (0->A, 26->AA). */
export function colToLetter(index: number): string {
  let n = index + 1;
  let letter = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}
