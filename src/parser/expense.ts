/**
 * Parser de gastos — la pieza más delicada del bot.
 *
 * Un gasto es un mensaje multilínea. La clasificación es POR RECONOCIMIENTO
 * (no posicional, salvo el monto que es siempre la primera línea) y por LÍNEA
 * COMPLETA EXACTA (case-insensitive): la línea entera es el token, no se busca
 * "contiene". Así "salidas del finde" (3 palabras) no se confunde con la
 * categoría "salidas".
 *
 * Campos reconocidos:
 *   1. Monto        — línea 1, empieza con número (ARS).
 *   2. Cat+subcat   — línea de 2 palabras: categoría conocida + subcat válida.
 *   3. Medio de pago— 1 palabra que matchea un medio de Config.
 *   4. Quién        — 1 palabra exactamente `juli` o `mili`.
 *   5. Fecha        — dd/mm, dd/mm/yyyy, dd-mm, etc.
 *   6. `revisar`    — palabra exacta.
 *   7. Texto libre  — lo demás: 1º = detalle (obligatorio), resto = notas.
 */

import type { ConfigData, Expense, Quien } from "../domain";
import { parseArs } from "../format/money";
import { parseDateInput, todayIso, nowInArgentina } from "../util/date";

export type ParseResult =
  | { status: "ok"; expense: Expense }
  | { status: "need_subcategoria"; categoria: string; subcategorias: string[]; draft: Expense }
  | { status: "error"; message: string };

export interface ParseContext {
  config: ConfigData;
  defaultQuien: Quien;
  /** Inyectable para tests; por defecto usa la fecha real. */
  now?: Date;
}

/** Devuelve las subcategorías válidas de una categoría, ordenadas. */
export function subcatsOf(config: ConfigData, categoria: string): string[] {
  const set = config.subcatsPorCategoria.get(categoria.toLowerCase());
  return set ? [...set].sort() : [];
}

export function parseExpense(text: string, ctx: ParseContext): ParseResult {
  const { config, defaultQuien } = ctx;
  const now = ctx.now ?? new Date();
  const { year: refYear } = nowInArgentina(now);

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { status: "error", message: "El mensaje está vacío." };
  }

  // 1. Monto: SIEMPRE la primera línea.
  const monto = parseArs(lines[0]!);
  if (monto === null || monto <= 0) {
    return {
      status: "error",
      message:
        "❌ La primera línea debe ser el *monto* (un número en pesos). Ej: `5.000`.\n\nUsá /formato para ver un ejemplo.",
    };
  }

  let categoria = "";
  let subcategoria = "";
  let medioPago = "";
  let quien: Quien | "" = "";
  let fecha = "";
  let revisar = false;
  let singleWordCategoria = ""; // categoría sola (sin subcat) → falta subcat
  const freeLines: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const lower = line.toLowerCase();
    const words = line.split(/\s+/);

    // revisar (palabra exacta)
    if (lower === "revisar") {
      revisar = true;
      continue;
    }

    // quién (1 palabra exactamente juli/mili)
    if (words.length === 1 && (lower === "juli" || lower === "mili")) {
      quien = lower as Quien;
      continue;
    }

    // fecha
    const parsedDate = parseDateInput(line, refYear);
    if (parsedDate) {
      fecha = parsedDate;
      continue;
    }

    // categoría + subcategoría (2 palabras: cat conocida + subcat válida)
    if (words.length === 2) {
      const cat = words[0]!.toLowerCase();
      const sub = words[1]!.toLowerCase();
      const subcats = config.subcatsPorCategoria.get(cat);
      if (subcats?.has(sub)) {
        categoria = cat;
        subcategoria = sub;
        continue;
      }
      // Si es categoría conocida pero subcat inválida, NO es cat+subcat:
      // cae a texto libre (definición estricta del spec).
    }

    // categoría sola (1 palabra) → falta subcategoría
    if (words.length === 1 && config.subcatsPorCategoria.has(lower)) {
      singleWordCategoria = lower;
      continue;
    }

    // medio de pago (1 palabra que matchea Config)
    if (words.length === 1 && config.mediosPago.has(lower)) {
      medioPago = lower;
      continue;
    }

    // texto libre
    freeLines.push(line);
  }

  const detalle = freeLines[0] ?? "";
  const notas = freeLines.slice(1).join(" — ");
  const resolvedQuien: Quien = quien || defaultQuien;
  const resolvedFecha = fecha || todayIso(now);

  const draft: Expense = {
    monto,
    detalle,
    categoria,
    subcategoria,
    medioPago,
    quien: resolvedQuien,
    fecha: resolvedFecha,
    notas,
    revisar,
    esCuota: "",
  };

  // Resolución de categoría.
  if (!categoria) {
    if (singleWordCategoria) {
      return {
        status: "need_subcategoria",
        categoria: singleWordCategoria,
        subcategorias: subcatsOf(config, singleWordCategoria),
        draft: { ...draft, categoria: singleWordCategoria, subcategoria: "" },
      };
    }
    return {
      status: "error",
      message:
        "❌ No reconocí la *categoría*. Poné una línea con `categoria subcategoria` (ej: `salidas restaurantes`).\n\nMirá /categorias o /formato.",
    };
  }

  if (!detalle) {
    return { status: "error", message: "❌ Falta el *detalle* del gasto (una línea de texto describiéndolo)." };
  }

  return { status: "ok", expense: draft };
}
