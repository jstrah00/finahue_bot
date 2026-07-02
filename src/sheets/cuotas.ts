/**
 * Manejo de la hoja `Cuotas` (gestionada por el bot).
 *
 * Columnas: id, descripcion, monto_cuota, categoria, subcategoria, medio_pago,
 * quien, cuota_actual, total_cuotas, estado, fecha_alta.
 */

import type { Cuota, Expense, Quien } from "../domain";
import { SheetsClient } from "./client";
import { buildHeaderMap, requireCol, cell, colToLetter, norm, SheetStructureError, type HeaderMap } from "./headers";
import { CUOTAS_SHEET } from "./config-sheet";
import { appendExpense } from "./detalle";
import { parseArs } from "../format/money";

export const CUOTAS_HEADERS = [
  "id",
  "descripcion",
  "monto_cuota",
  "categoria",
  "subcategoria",
  "medio_pago",
  "quien",
  "cuota_actual",
  "total_cuotas",
  "estado",
  "fecha_alta",
];

function asQuien(v: string): Quien {
  return norm(v) === "mili" ? "mili" : "juli";
}

interface CuotasSheet {
  headers: HeaderMap;
  rows: unknown[][];
}

async function loadCuotasSheet(client: SheetsClient): Promise<CuotasSheet> {
  const rows = await client.getValues(`${CUOTAS_SHEET}!A1:Z5000`, "FORMATTED_VALUE");
  if (rows.length === 0) {
    throw new SheetStructureError(`La hoja "${CUOTAS_SHEET}" no existe. Corré \`npm run bootstrap\`.`);
  }
  return { headers: buildHeaderMap(rows[0]!), rows };
}

/** Lee todas las cuotas con estado `activa`. */
export async function readActiveCuotas(client: SheetsClient): Promise<Cuota[]> {
  const { headers, rows } = await loadCuotasSheet(client);
  const iId = requireCol(headers, "id", CUOTAS_SHEET);
  const iDesc = requireCol(headers, "descripcion", CUOTAS_SHEET);
  const iMonto = requireCol(headers, "monto_cuota", CUOTAS_SHEET);
  const iCat = requireCol(headers, "categoria", CUOTAS_SHEET);
  const iSub = requireCol(headers, "subcategoria", CUOTAS_SHEET);
  const iMedio = requireCol(headers, "medio_pago", CUOTAS_SHEET);
  const iQuien = requireCol(headers, "quien", CUOTAS_SHEET);
  const iActual = requireCol(headers, "cuota_actual", CUOTAS_SHEET);
  const iTotal = requireCol(headers, "total_cuotas", CUOTAS_SHEET);
  const iEstado = requireCol(headers, "estado", CUOTAS_SHEET);
  const iAlta = requireCol(headers, "fecha_alta", CUOTAS_SHEET);

  const out: Cuota[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    if (norm(row[iEstado]) !== "activa") continue;
    out.push({
      id: cell(row, iId),
      descripcion: cell(row, iDesc),
      montoCuota: parseArs(cell(row, iMonto)) ?? 0,
      categoria: cell(row, iCat),
      subcategoria: cell(row, iSub),
      medioPago: cell(row, iMedio),
      quien: asQuien(cell(row, iQuien)),
      cuotaActual: Number(cell(row, iActual)) || 0,
      totalCuotas: Number(cell(row, iTotal)) || 0,
      estado: "activa",
      fechaAlta: cell(row, iAlta),
      rowNumber: i + 1, // 1-indexed en la hoja
    });
  }
  return out;
}

/** Da de alta una cuota nueva (estado activa). */
export async function appendCuota(client: SheetsClient, cuota: Omit<Cuota, "rowNumber">): Promise<void> {
  const { headers } = await loadCuotasSheet(client);
  const values: Record<string, unknown> = {
    id: cuota.id,
    descripcion: cuota.descripcion,
    monto_cuota: cuota.montoCuota,
    categoria: cuota.categoria,
    subcategoria: cuota.subcategoria,
    medio_pago: cuota.medioPago,
    quien: cuota.quien,
    cuota_actual: cuota.cuotaActual,
    total_cuotas: cuota.totalCuotas,
    estado: cuota.estado,
    fecha_alta: cuota.fechaAlta,
  };

  let maxCol = 0;
  const colOf: Record<string, number> = {};
  for (const name of CUOTAS_HEADERS) {
    const idx = requireCol(headers, name, CUOTAS_SHEET);
    colOf[name] = idx;
    if (idx > maxCol) maxCol = idx;
  }
  const row: unknown[] = new Array(maxCol + 1).fill("");
  for (const name of CUOTAS_HEADERS) row[colOf[name]!] = values[name];

  await client.appendValues(`${CUOTAS_SHEET}!A1`, [row]);
  await ensureFechaAltaDateFormat(client, headers);
}

/**
 * Aplica formato de fecha (yyyy-mm-dd) a toda la columna `fecha_alta` de la hoja
 * Cuotas. Necesario porque escribimos con `USER_ENTERED`: Sheets guarda las
 * fechas como número de serie y, sin formato de fecha, la celda muestra ese
 * número crudo. Es idempotente y también corrige filas ya escritas.
 */
async function ensureFechaAltaDateFormat(client: SheetsClient, headers: HeaderMap): Promise<void> {
  const iAlta = requireCol(headers, "fecha_alta", CUOTAS_SHEET);
  const meta = (await client.getSheets()).find((s) => s.title === CUOTAS_SHEET);
  if (!meta) return; // la hoja debería existir; si no, no hay nada que formatear
  await client.batchUpdate([
    {
      repeatCell: {
        range: {
          sheetId: meta.sheetId,
          startRowIndex: 1, // saltear el header
          startColumnIndex: iAlta,
          endColumnIndex: iAlta + 1,
        },
        cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
  ]);
}

/**
 * Avanza el contador de una cuota tras insertarla en un mes: incrementa
 * cuota_actual y, si supera total_cuotas, la marca como `cerrada`.
 * Devuelve el nuevo estado.
 */
export async function advanceCuota(
  client: SheetsClient,
  cuota: Cuota,
): Promise<{ nuevaActual: number; cerrada: boolean }> {
  const { headers } = await loadCuotasSheet(client);
  const nuevaActual = cuota.cuotaActual + 1;
  const cerrada = nuevaActual > cuota.totalCuotas;

  const colActual = colToLetter(requireCol(headers, "cuota_actual", CUOTAS_SHEET));
  const colEstado = colToLetter(requireCol(headers, "estado", CUOTAS_SHEET));

  await client.updateValues(`${CUOTAS_SHEET}!${colActual}${cuota.rowNumber}`, [[nuevaActual]]);
  if (cerrada) {
    await client.updateValues(`${CUOTAS_SHEET}!${colEstado}${cuota.rowNumber}`, [["cerrada"]]);
  }
  return { nuevaActual, cerrada };
}

/** ¿La cuota está en un rango insertable (defensivo ante datos raros)? */
export function insertable(c: Cuota): boolean {
  return c.cuotaActual >= 1 && c.cuotaActual <= c.totalCuotas;
}

/** Construye el `Expense` de una cuota para el Detalle del mes. */
export function cuotaToExpense(c: Omit<Cuota, "rowNumber">, fecha: string): Expense {
  return {
    monto: c.montoCuota,
    detalle: c.descripcion,
    categoria: c.categoria,
    subcategoria: c.subcategoria,
    medioPago: c.medioPago,
    quien: c.quien,
    fecha,
    notas: "",
    revisar: false,
    esCuota: `cuota ${c.cuotaActual} de ${c.totalCuotas}`,
  };
}

export interface InsertCuotasResult {
  /** Cuotas insertadas en el Detalle este mes (con su cuota_actual previo al avance). */
  inserted: Cuota[];
  /** Cuotas que quedaron `cerrada` tras avanzar (última cuota). */
  closed: Cuota[];
}

/**
 * Inserta todas las cuotas `activa` insertables en el Detalle del mes: por cada
 * una escribe el gasto (nota "cuota X de Y") y avanza su contador (cerrándola si
 * supera el total). Asume que la hoja Detalle del mes ya existe.
 */
export async function insertActiveCuotasIntoMonth(
  client: SheetsClient,
  mes: string,
  fecha: string,
): Promise<InsertCuotasResult> {
  const cuotas = (await readActiveCuotas(client)).filter(insertable);
  const inserted: Cuota[] = [];
  const closed: Cuota[] = [];
  for (const c of cuotas) {
    await appendExpense(client, mes, cuotaToExpense(c, fecha));
    const { cerrada } = await advanceCuota(client, c);
    inserted.push(c);
    if (cerrada) closed.push(c);
  }
  return { inserted, closed };
}
