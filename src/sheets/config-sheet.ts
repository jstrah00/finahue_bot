/**
 * Lectura de la hoja `Config` — la base de conocimiento (fuente de verdad en
 * runtime) de categorías, subcategorías y medios de pago.
 *
 * Layout esperado (localizado por header, no por posición):
 *   - Columnas `categoria | subcategoria | descripcion` (bloque de categorías).
 *   - Columna `medio_pago` (bloque de medios de pago), en otra columna.
 * Ambos bloques conviven en la misma hoja; cada uno se identifica por su header.
 */

import type { ConfigData, CategoriaRow } from "../domain";
import { SheetsClient } from "./client";
import { buildHeaderMap, requireCol, cell, norm, SheetStructureError } from "./headers";

export const CONFIG_SHEET = "Config";
export const CUOTAS_SHEET = "Cuotas";

export async function readConfig(client: SheetsClient): Promise<ConfigData> {
  const rows = await client.getValues(`${CONFIG_SHEET}!A1:Z2000`, "FORMATTED_VALUE");
  if (rows.length === 0) {
    throw new SheetStructureError(
      `La hoja "${CONFIG_SHEET}" está vacía o no existe. Corré \`npm run bootstrap\`.`,
    );
  }

  const headers = buildHeaderMap(rows[0]!);
  const catIdx = requireCol(headers, "categoria", CONFIG_SHEET);
  const subIdx = requireCol(headers, "subcategoria", CONFIG_SHEET);
  const descIdx = requireCol(headers, "descripcion", CONFIG_SHEET);
  const medioIdx = requireCol(headers, "medio_pago", CONFIG_SHEET);

  const categorias: CategoriaRow[] = [];
  const subcatsPorCategoria = new Map<string, Set<string>>();
  const mediosPago = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;

    const categoria = cell(row, catIdx);
    const subcategoria = cell(row, subIdx);
    if (categoria && subcategoria) {
      categorias.push({ categoria, subcategoria, descripcion: cell(row, descIdx) });
      const key = norm(categoria);
      if (!subcatsPorCategoria.has(key)) subcatsPorCategoria.set(key, new Set());
      subcatsPorCategoria.get(key)!.add(norm(subcategoria));
    }

    const medio = cell(row, medioIdx);
    if (medio) mediosPago.add(norm(medio));
  }

  if (categorias.length === 0) {
    throw new SheetStructureError(
      `La hoja "${CONFIG_SHEET}" no tiene categorías cargadas. Corré \`npm run bootstrap\`.`,
    );
  }

  return { categorias, subcatsPorCategoria, mediosPago };
}
