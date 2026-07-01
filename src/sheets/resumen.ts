/**
 * Lectura de la hoja `YYYY-MM Resumen`.
 *
 * El bot NO calcula: solo lee las celdas ya calculadas por las fórmulas del
 * Sheet. Maneja con gracia celdas vacías o con error (#DIV/0!, etc.).
 */

import { SheetsClient } from "./client";
import { buildHeaderMap, requireCol, cell, SheetStructureError } from "./headers";
import { resumenSheet } from "./month";

export interface ResumenRow {
  categoria: string;
  subcategoria: string;
  presupuesto: number | null;
  gastado: number;
  desvio: number | null;
  /** Ratio 0..1+ (gastado/presupuesto), o null si no aplica. */
  porcentaje: number | null;
}

/** Convierte una celda a número, o null si está vacía / es error / no numérica. */
function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "" || t.startsWith("#") || t === "-") return null;
    const n = Number(t.replace(/\./g, "").replace(/,/g, "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Lee todas las filas del Resumen del mes. */
export async function readResumen(client: SheetsClient, mes: string): Promise<ResumenRow[]> {
  const sheet = resumenSheet(mes);
  const rows = await client.getValues(`${sheet}!A1:F2000`, "UNFORMATTED_VALUE");
  if (rows.length === 0) {
    throw new SheetStructureError(`La hoja "${sheet}" no existe. Corré /nuevomes para el mes ${mes}.`);
  }

  const headers = buildHeaderMap(rows[0]!);
  const iCat = requireCol(headers, "categoria", sheet);
  const iSub = requireCol(headers, "subcategoria", sheet);
  const iPres = requireCol(headers, "presupuesto", sheet);
  const iGast = requireCol(headers, "gastado", sheet);
  const iDesv = requireCol(headers, "desvio", sheet);
  const iPct = requireCol(headers, "porcentaje", sheet);

  const out: ResumenRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const categoria = cell(row, iCat);
    const subcategoria = cell(row, iSub);
    if (!categoria && !subcategoria) continue;
    out.push({
      categoria,
      subcategoria,
      presupuesto: toNumberOrNull(row[iPres]),
      gastado: toNumberOrNull(row[iGast]) ?? 0,
      desvio: toNumberOrNull(row[iDesv]),
      porcentaje: toNumberOrNull(row[iPct]),
    });
  }
  return out;
}
