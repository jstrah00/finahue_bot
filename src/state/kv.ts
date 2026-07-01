/**
 * Estado transitorio en Workers KV con TTL.
 *
 * Se usa para:
 *   - Gastos pendientes de confirmación (✅/❌).
 *   - Estado del formulario multi-paso de /cuota.
 *   - Cuotas pendientes de confirmación en /cargarcuotas.
 *
 * NO es una base de datos: es estado efímero de conversación. Toda la
 * persistencia real vive en el Sheet.
 */

import type { Expense, Cuota, Quien } from "../domain";

/** TTL por defecto para estado de conversación (10 min). */
const DEFAULT_TTL_SECONDS = 10 * 60;

/** Gasto pendiente de confirmación. */
export interface PendingExpense {
  kind: "expense";
  expense: Expense;
  chatId: number;
}

/** Cuotas pendientes de insertar (comando /cargarcuotas). */
export interface PendingCuotas {
  kind: "cuotas";
  mes: string; // "YYYY-MM"
  cuotas: Cuota[];
  chatId: number;
}

/** Estado del formulario de alta de cuota (/cuota). */
export interface CuotaForm {
  kind: "cuotaForm";
  chatId: number;
  userId: number;
  step: CuotaStep;
  descripcion?: string;
  montoCuota?: number;
  categoria?: string;
  subcategoria?: string;
  medioPago?: string;
  quien?: Quien;
  totalCuotas?: number;
  cuotaActual?: number;
}

export type CuotaStep =
  | "descripcion"
  | "montoCuota"
  | "categoria"
  | "subcategoria"
  | "medioPago"
  | "quien"
  | "totalCuotas"
  | "cuotaActual";

export type PendingState = PendingExpense | PendingCuotas;

export class StateStore {
  constructor(private readonly kv: KVNamespace) {}

  private async put(key: string, value: unknown, ttl = DEFAULT_TTL_SECONDS): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), { expirationTtl: ttl });
  }

  private async get<T>(key: string): Promise<T | null> {
    const raw = await this.kv.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  // --- Estado pendiente asociado a un token (callback ✅/❌) ---
  putPending(token: string, state: PendingState): Promise<void> {
    return this.put(`pending:${token}`, state);
  }
  getPending(token: string): Promise<PendingState | null> {
    return this.get<PendingState>(`pending:${token}`);
  }
  delPending(token: string): Promise<void> {
    return this.kv.delete(`pending:${token}`);
  }

  // --- Formulario de /cuota, por usuario ---
  putCuotaForm(userId: number, form: CuotaForm): Promise<void> {
    return this.put(`cuotaform:${userId}`, form, 30 * 60); // 30 min: el form es más largo
  }
  getCuotaForm(userId: number): Promise<CuotaForm | null> {
    return this.get<CuotaForm>(`cuotaform:${userId}`);
  }
  delCuotaForm(userId: number): Promise<void> {
    return this.kv.delete(`cuotaform:${userId}`);
  }
}

/**
 * Genera un token corto y único para asociar estado a callbacks.
 * Basado en crypto.randomUUID (disponible en Workers y Node moderno).
 */
export function newToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
