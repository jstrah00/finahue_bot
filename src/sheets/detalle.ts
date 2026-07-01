/**
 * Escritura y lectura de la hoja `YYYY-MM Detalle`.
 *
 * - Localiza columnas por encabezado (robusto a ediciones manuales).
 * - Pinta la fila de amarillo si el gasto está marcado con `revisar`.
 */

import type { Expense } from "../domain";
import { SheetsClient } from "./client";
import { buildHeaderMap, requireCol, cell, SheetStructureError } from "./headers";
import { detalleSheet } from "./month";
import { parseArs } from "../format/money";

/** Un gasto leído del Detalle, para listados. */
export interface GastoRow {
  fecha: string;
  monto: number;
  detalle: string;
  categoria: string;
  subcategoria: string;
  medioPago: string;
  quien: string;
  notas: string;
  esCuota: string;
}

/** Amarillo suave para las filas marcadas con `revisar`. */
const YELLOW = { red: 1, green: 0.95, blue: 0.6 };

async function findSheetId(client: SheetsClient, title: string): Promise<number> {
  const sheets = await client.getSheets();
  const found = sheets.find((s) => s.title === title);
  if (!found) {
    throw new SheetStructureError(
      `No existe la hoja "${title}". Primero corré /nuevomes para crear el mes.`,
    );
  }
  return found.sheetId;
}

/** Parsea el número de fila inicial de un rango tipo "'Hoja'!A5:I5". */
function rowFromRange(range: string | undefined): number | null {
  if (!range) return null;
  const m = range.match(/![A-Z]+(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Escribe un gasto en el Detalle del mes. Si `revisar`, pinta la fila.
 * Asume que la hoja del mes existe (validar antes con monthExists).
 */
export async function appendExpense(client: SheetsClient, mes: string, expense: Expense): Promise<void> {
  const sheet = detalleSheet(mes);
  const headerRows = await client.getValues(`${sheet}!1:1`, "FORMATTED_VALUE");
  if (headerRows.length === 0) {
    throw new SheetStructureError(`La hoja "${sheet}" no tiene encabezados.`);
  }
  const headers = buildHeaderMap(headerRows[0]!);

  // Mapa campo -> columna (por header). Solo escribimos los que existan.
  const colMap: Record<string, number> = {
    fecha: requireCol(headers, "fecha", sheet),
    monto: requireCol(headers, "monto", sheet),
    detalle: requireCol(headers, "detalle", sheet),
    categoria: requireCol(headers, "categoria", sheet),
    subcategoria: requireCol(headers, "subcategoria", sheet),
    medio_pago: requireCol(headers, "medio_pago", sheet),
    quien: requireCol(headers, "quien", sheet),
    notas: requireCol(headers, "notas", sheet),
    es_cuota: requireCol(headers, "es_cuota", sheet),
  };

  const values: Record<string, unknown> = {
    fecha: expense.fecha,
    monto: expense.monto,
    detalle: expense.detalle,
    categoria: expense.categoria,
    subcategoria: expense.subcategoria,
    medio_pago: expense.medioPago,
    quien: expense.quien,
    notas: expense.notas,
    es_cuota: expense.esCuota,
  };

  const maxCol = Math.max(...Object.values(colMap));
  const row: unknown[] = new Array(maxCol + 1).fill("");
  for (const [field, col] of Object.entries(colMap)) row[col] = values[field];

  const { updatedRange } = await client.appendValues(`${sheet}!A1`, [row]);

  if (expense.revisar) {
    const rowNum = rowFromRange(updatedRange);
    if (rowNum) {
      const sheetId = await findSheetId(client, sheet);
      await client.batchUpdate([
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: rowNum - 1,
              endRowIndex: rowNum,
              startColumnIndex: 0,
              endColumnIndex: maxCol + 1,
            },
            cell: { userEnteredFormat: { backgroundColor: YELLOW } },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
      ]);
    }
  }
}

/** Lee todos los gastos del Detalle del mes. */
export async function listGastos(client: SheetsClient, mes: string): Promise<GastoRow[]> {
  const sheet = detalleSheet(mes);
  const rows = await client.getValues(`${sheet}!A1:Z5000`, "FORMATTED_VALUE");
  if (rows.length === 0) throw new SheetStructureError(`La hoja "${sheet}" no existe o está vacía.`);

  const headers = buildHeaderMap(rows[0]!);
  const iFecha = requireCol(headers, "fecha", sheet);
  const iMonto = requireCol(headers, "monto", sheet);
  const iDetalle = requireCol(headers, "detalle", sheet);
  const iCat = requireCol(headers, "categoria", sheet);
  const iSub = requireCol(headers, "subcategoria", sheet);
  const iMedio = requireCol(headers, "medio_pago", sheet);
  const iQuien = requireCol(headers, "quien", sheet);
  const iNotas = requireCol(headers, "notas", sheet);
  const iCuota = requireCol(headers, "es_cuota", sheet);

  const out: GastoRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const detalle = cell(row, iDetalle);
    const montoRaw = cell(row, iMonto);
    if (!detalle && !montoRaw) continue; // fila vacía
    out.push({
      fecha: cell(row, iFecha),
      monto: parseArs(montoRaw) ?? 0,
      detalle,
      categoria: cell(row, iCat),
      subcategoria: cell(row, iSub),
      medioPago: cell(row, iMedio),
      quien: cell(row, iQuien),
      notas: cell(row, iNotas),
      esCuota: cell(row, iCuota),
    });
  }
  return out;
}
