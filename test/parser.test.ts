import { describe, it, expect } from "vitest";
import { parseExpense, type ParseContext } from "../src/parser/expense";
import type { ConfigData, Quien } from "../src/domain";
import { CATEGORIAS_SEED, MEDIOS_PAGO_SEED } from "../src/config";

/** Construye un ConfigData a partir de los seeds, como haría readConfig. */
function buildConfig(): ConfigData {
  const subcatsPorCategoria = new Map<string, Set<string>>();
  for (const c of CATEGORIAS_SEED) {
    const k = c.categoria.toLowerCase();
    if (!subcatsPorCategoria.has(k)) subcatsPorCategoria.set(k, new Set());
    subcatsPorCategoria.get(k)!.add(c.subcategoria.toLowerCase());
  }
  return {
    categorias: CATEGORIAS_SEED,
    subcatsPorCategoria,
    mediosPago: new Set(MEDIOS_PAGO_SEED),
  };
}

const CONFIG = buildConfig();
// 2026-07-15 09:00 en Argentina (UTC-3).
const FIXED_NOW = new Date("2026-07-15T12:00:00Z");

function ctx(defaultQuien: Quien = "juli"): ParseContext {
  return { config: CONFIG, defaultQuien, now: FIXED_NOW };
}

describe("parseExpense", () => {
  it("parsea un gasto básico", () => {
    const r = parseExpense("5000\nhelado en la costanera\nsalidas ocio\nmp", ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.expense.monto).toBe(5000);
    expect(r.expense.detalle).toBe("helado en la costanera");
    expect(r.expense.categoria).toBe("salidas");
    expect(r.expense.subcategoria).toBe("ocio");
    expect(r.expense.medioPago).toBe("mp");
    expect(r.expense.quien).toBe("juli");
    expect(r.expense.fecha).toBe("2026-07-15");
  });

  it("acepta separadores ARS (miles con punto, decimales con coma)", () => {
    const r = parseExpense("5.000,50\ncompra\ncasa super", ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.expense.monto).toBe(5000.5);
  });

  it("no depende del orden de las líneas (salvo el monto)", () => {
    const r = parseExpense("1000\nmp\ncasa super\ncompra del mes", ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.expense.categoria).toBe("casa");
    expect(r.expense.subcategoria).toBe("super");
    expect(r.expense.medioPago).toBe("mp");
    expect(r.expense.detalle).toBe("compra del mes");
  });

  it("trata 'personal juli' como categoría+subcategoría, no como quién", () => {
    const r = parseExpense("1000\nzapatillas\npersonal juli", ctx("mili"));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.expense.categoria).toBe("personal");
    expect(r.expense.subcategoria).toBe("juli");
    // quién queda en el default (sender), no se ve afectado por 'personal juli'.
    expect(r.expense.quien).toBe("mili");
  });

  it("una sola palabra 'mili' es el quién (override del default)", () => {
    const r = parseExpense("1000\nregalo\ncasa hogar\nmili", ctx("juli"));
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.expense.quien).toBe("mili");
  });

  it("desambigua subcategorías repetidas por la categoría de la misma línea", () => {
    const a = parseExpense("1000\nservice\ntransporte auto", ctx());
    const b = parseExpense("1000\naporte\nahorros autonuevo", ctx());
    expect(a.status).toBe("ok");
    expect(b.status).toBe("ok");
    if (a.status === "ok") expect(a.expense.categoria).toBe("transporte");
    if (b.status === "ok") expect(b.expense.categoria).toBe("ahorros");
  });

  it("categoría sola (sin subcat) pide la subcategoría", () => {
    const r = parseExpense("1000\ncompra\ncasa", ctx());
    expect(r.status).toBe("need_subcategoria");
    if (r.status !== "need_subcategoria") return;
    expect(r.categoria).toBe("casa");
    expect(r.subcategorias).toContain("super");
    expect(r.draft.detalle).toBe("compra");
    expect(r.draft.subcategoria).toBe("");
  });

  it("marca revisar", () => {
    const r = parseExpense("1000\nalgo raro\ncasa super\nrevisar", ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.expense.revisar).toBe(true);
  });

  it("primera línea libre = detalle, resto = notas", () => {
    const r = parseExpense("1000\ncasa super\nprimera\nsegunda\ntercera", ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.expense.detalle).toBe("primera");
    expect(r.expense.notas).toBe("segunda — tercera");
  });

  it("no confunde texto libre multi-palabra con una categoría", () => {
    const r = parseExpense("1000\nsalidas del finde\nsalidas ocio", ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.expense.detalle).toBe("salidas del finde");
    expect(r.expense.categoria).toBe("salidas");
    expect(r.expense.subcategoria).toBe("ocio");
  });

  it("parsea fecha dd/mm con el año actual", () => {
    const r = parseExpense("1000\ncompra\ncasa super\n05/03", ctx());
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.expense.fecha).toBe("2026-03-05");
  });

  it("error si la primera línea no es un número", () => {
    const r = parseExpense("hola\ncasa super", ctx());
    expect(r.status).toBe("error");
  });

  it("error si falta la categoría", () => {
    const r = parseExpense("1000\nsolo un detalle libre", ctx());
    expect(r.status).toBe("error");
    if (r.status !== "error") return;
    expect(r.message.toLowerCase()).toContain("categor");
  });

  it("error si falta el detalle", () => {
    const r = parseExpense("1000\ncasa super\nmp", ctx());
    expect(r.status).toBe("error");
    if (r.status !== "error") return;
    expect(r.message.toLowerCase()).toContain("detalle");
  });
});
