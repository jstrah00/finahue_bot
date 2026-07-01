/**
 * Wrapper mínimo sobre la Google Sheets REST API v4.
 *
 * Recibe una función `getToken()` para obtener el access token (así funciona
 * tanto en el Worker —con cache en KV— como en el script de bootstrap).
 */

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export type ValueRenderOption = "FORMATTED_VALUE" | "UNFORMATTED_VALUE" | "FORMULA";

/** Metadata de una hoja dentro del spreadsheet. */
export interface SheetMeta {
  sheetId: number;
  title: string;
}

export class SheetsClient {
  constructor(
    private readonly spreadsheetId: string,
    private readonly getToken: () => Promise<string>,
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit & { query?: Record<string, string> } = {},
  ): Promise<T> {
    const token = await this.getToken();
    const url = new URL(`${BASE}/${this.spreadsheetId}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sheets API ${res.status} en ${path}: ${body.slice(0, 400)}`);
    }
    return (await res.json()) as T;
  }

  /** Locale del spreadsheet (ej. "es_AR", "en_US"). Define el separador de fórmulas. */
  async getLocale(): Promise<string> {
    const data = await this.request<{ properties?: { locale?: string } }>("", {
      query: { fields: "properties.locale" },
    });
    return data.properties?.locale ?? "en_US";
  }

  /** Lista las hojas del spreadsheet (sheetId + título). */
  async getSheets(): Promise<SheetMeta[]> {
    const data = await this.request<{
      sheets?: { properties?: { sheetId?: number; title?: string } }[];
    }>("", { query: { fields: "sheets.properties(sheetId,title)" } });
    return (data.sheets ?? [])
      .map((s) => s.properties)
      .filter((p): p is { sheetId: number; title: string } => !!p && p.sheetId != null && !!p.title)
      .map((p) => ({ sheetId: p.sheetId, title: p.title }));
  }

  /** Lee un rango en formato A1. Devuelve la matriz de valores (o []). */
  async getValues(
    rangeA1: string,
    renderOption: ValueRenderOption = "FORMATTED_VALUE",
  ): Promise<unknown[][]> {
    const data = await this.request<{ values?: unknown[][] }>(
      `/values/${encodeURIComponent(rangeA1)}`,
      { query: { valueRenderOption: renderOption } },
    );
    return data.values ?? [];
  }

  /** Escribe (sobrescribe) valores en un rango. USER_ENTERED parsea fórmulas/fechas. */
  async updateValues(rangeA1: string, values: unknown[][]): Promise<void> {
    await this.request(`/values/${encodeURIComponent(rangeA1)}`, {
      method: "PUT",
      query: { valueInputOption: "USER_ENTERED" },
      body: JSON.stringify({ values }),
    });
  }

  /**
   * Agrega filas al final de la tabla que contiene el rango dado.
   * Devuelve el rango efectivamente actualizado (ej. "'Hoja'!A5:I5") para
   * poder ubicar la fila recién insertada.
   */
  async appendValues(rangeA1: string, values: unknown[][]): Promise<{ updatedRange?: string }> {
    const res = await this.request<{ updates?: { updatedRange?: string } }>(
      `/values/${encodeURIComponent(rangeA1)}:append`,
      {
        method: "POST",
        query: { valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS" },
        body: JSON.stringify({ values }),
      },
    );
    return { updatedRange: res.updates?.updatedRange };
  }

  /** Ejecuta un batchUpdate (crear hojas, formato de celdas, etc.). */
  async batchUpdate(requests: unknown[]): Promise<unknown> {
    return this.request(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }
}
