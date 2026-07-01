/** Tipos de dominio compartidos por todo el bot. */

/** Nombres cortos de los usuarios. */
export type Quien = "juli" | "mili";

/** Una fila de la tabla de categorías de la hoja `Config`. */
export interface CategoriaRow {
  categoria: string;
  subcategoria: string;
  descripcion: string;
}

/**
 * Base de conocimiento leída de la hoja `Config`: qué categorías,
 * subcategorías y medios de pago existen. Fuente de verdad en runtime.
 */
export interface ConfigData {
  /** Todas las filas categoría+subcategoría (con descripción). */
  categorias: CategoriaRow[];
  /** categoria (lowercase) -> set de subcategorías válidas (lowercase). */
  subcatsPorCategoria: Map<string, Set<string>>;
  /** Medios de pago válidos (lowercase). */
  mediosPago: Set<string>;
}

/** Un gasto ya parseado y listo para confirmar / escribir en el Detalle. */
export interface Expense {
  /** Monto en ARS (número, sin formateo). */
  monto: number;
  detalle: string;
  categoria: string;
  subcategoria: string;
  medioPago: string;
  quien: Quien;
  /** Fecha en formato ISO local `YYYY-MM-DD` (zona Argentina). */
  fecha: string;
  notas: string;
  /** Marca de revisión → pinta la fila de amarillo. */
  revisar: boolean;
  /** Texto para la columna `es_cuota` (ej. "cuota 3 de 12"), o vacío. */
  esCuota: string;
}

/** Una cuota activa registrada en la hoja `Cuotas`. */
export interface Cuota {
  id: string;
  descripcion: string;
  montoCuota: number;
  categoria: string;
  subcategoria: string;
  medioPago: string;
  quien: Quien;
  cuotaActual: number;
  totalCuotas: number;
  estado: "activa" | "cerrada";
  fechaAlta: string;
  /** Fila (1-indexed) en la hoja Cuotas, para poder actualizarla. */
  rowNumber: number;
}
