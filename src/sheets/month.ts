/**
 * Manejo de las hojas mensuales `YYYY-MM Detalle` y `YYYY-MM Resumen`.
 *
 * Creación con encabezados y las fórmulas SUMIFS del Resumen. El bot NUNCA
 * calcula totales: las fórmulas del Sheet lo hacen y el bot solo lee.
 */

import type { ConfigData } from "../domain";
import { SheetsClient } from "./client";
import { CATEGORIA_AHORROS } from "../config";

/** Encabezados de la hoja Detalle, en orden fijo al crearla. */
export const DETALLE_HEADERS = [
  "fecha",
  "monto",
  "detalle",
  "categoria",
  "subcategoria",
  "medio_pago",
  "quien",
  "notas",
  "es_cuota",
];

/** Encabezados de la hoja Resumen. */
export const RESUMEN_HEADERS = ["categoria", "subcategoria", "presupuesto", "gastado", "desvio", "porcentaje"];

export function detalleSheet(mes: string): string {
  return `${mes} Detalle`;
}
export function resumenSheet(mes: string): string {
  return `${mes} Resumen`;
}

/**
 * Separador de argumentos de fórmulas según el locale del Sheet.
 * Google Sheets usa ";" cuando el separador decimal es "," (es_AR, es_ES, etc.)
 * y "," cuando el decimal es "." (en_US). Escribir con el separador equivocado
 * produce "Error de análisis de fórmula" (#ERROR!).
 */
export function argSeparatorForLocale(locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale.replace("_", "-")).formatToParts(1.1);
    const decimal = parts.find((p) => p.type === "decimal")?.value;
    return decimal === "," ? ";" : ",";
  } catch {
    return ",";
  }
}

/**
 * Fórmulas [gastado, desvio, porcentaje] para cada subcategoría de Config,
 * en el orden de `config.categorias`. Se separa del resto para poder
 * regenerar solo estas columnas sin pisar los presupuestos cargados a mano.
 */
export function resumenFormulaRows(mes: string, config: ConfigData, sep: string): unknown[][] {
  const detalleRef = `'${detalleSheet(mes)}'`;
  return config.categorias.map((_, i) => {
    const r = i + 2; // fila en la hoja (1-indexed, +1 por header)
    const gastado = `=SUMIFS(${detalleRef}!$B:$B${sep} ${detalleRef}!$D:$D${sep} $A${r}${sep} ${detalleRef}!$E:$E${sep} $B${r})`;
    // desvio / porcentaje quedan en blanco si no hay presupuesto (ahorros o sin cargar).
    const desvio = `=IF($C${r}=""${sep} ""${sep} $D${r}-$C${r})`;
    const porcentaje = `=IF(OR($C${r}=""${sep} $C${r}=0)${sep} ""${sep} $D${r}/$C${r})`;
    return [gastado, desvio, porcentaje];
  });
}

/** ¿Existe la hoja Detalle de ese mes? */
export async function monthExists(client: SheetsClient, mes: string): Promise<boolean> {
  const sheets = await client.getSheets();
  const target = detalleSheet(mes);
  return sheets.some((s) => s.title === target);
}

/**
 * Crea las hojas Detalle y Resumen del mes con headers, filas de Config
 * precargadas (presupuesto en blanco) y fórmulas SUMIFS.
 */
export async function createMonth(client: SheetsClient, mes: string, config: ConfigData): Promise<void> {
  const detalle = detalleSheet(mes);
  const resumen = resumenSheet(mes);

  // 1. Crear ambas hojas.
  await client.batchUpdate([
    { addSheet: { properties: { title: detalle } } },
    { addSheet: { properties: { title: resumen } } },
  ]);

  // 2. Headers del Detalle.
  await client.updateValues(`${detalle}!A1`, [DETALLE_HEADERS]);

  // 3. Resumen: header + una fila por subcategoría con fórmulas.
  // Columnas del Detalle (fijas al crear): B=monto, D=categoria, E=subcategoria.
  const sep = argSeparatorForLocale(await client.getLocale());
  const formulas = resumenFormulaRows(mes, config, sep);
  const rows: unknown[][] = [
    RESUMEN_HEADERS,
    ...config.categorias.map((c, i) => [c.categoria, c.subcategoria, "", ...formulas[i]!]),
  ];

  await client.updateValues(`${resumen}!A1`, rows);
}

/** ¿La categoría es la especial de ahorros (acumula, no presupuesta)? */
export function esAhorro(categoria: string): boolean {
  return categoria.toLowerCase() === CATEGORIA_AHORROS;
}
