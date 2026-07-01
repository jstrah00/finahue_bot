/** Utilidades de fecha con zona horaria Argentina (America/Argentina/Buenos_Aires). */

const TZ = "America/Argentina/Buenos_Aires";

interface Ymd {
  year: number;
  month: number; // 1-12
  day: number;
}

/** Fecha "de hoy" en Argentina, sin importar la TZ del runtime. */
export function nowInArgentina(now: Date = new Date()): Ymd {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Clave del mes actual, "YYYY-MM". */
export function currentMonthKey(now: Date = new Date()): string {
  const { year, month } = nowInArgentina(now);
  return `${year}-${pad2(month)}`;
}

/** Fecha de hoy en formato ISO "YYYY-MM-DD". */
export function todayIso(now: Date = new Date()): string {
  const { year, month, day } = nowInArgentina(now);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Valida que un string sea "YYYY-MM". */
export function isMonthKey(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}

/**
 * Parsea una entrada de fecha del usuario (dd/mm, dd/mm/yyyy, dd-mm, dd-mm-yyyy)
 * a "YYYY-MM-DD". Devuelve null si no matchea o la fecha es inválida.
 * Usa `refYear` (año actual en Argentina) cuando no se especifica el año.
 */
export function parseDateInput(text: string, refYear: number): string | null {
  const m = text.trim().match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : refYear;
  if (m[3] && m[3].length === 2) year += 2000;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Validación real de día del mes.
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;

  return `${year}-${pad2(month)}-${pad2(day)}`;
}
