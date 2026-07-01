/**
 * Bootstrap de la base de datos (correr UNA vez):
 *
 *   npm run bootstrap
 *
 * Crea y puebla la hoja `Config` (categorías/subcategorías/descripciones +
 * medio de pago `mp`) y crea la hoja `Cuotas` vacía con sus encabezados.
 *
 * Lee las credenciales de `.dev.vars` (mismo formato que .env). Es idempotente:
 * si una hoja ya existe, no la toca.
 */

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { SheetsClient } from "../src/sheets/client";
import { fetchAccessToken } from "../src/google/auth";
import { CATEGORIAS_SEED, MEDIOS_PAGO_SEED } from "../src/config";
import { CONFIG_SHEET, CUOTAS_SHEET } from "../src/sheets/config-sheet";
import { CUOTAS_HEADERS } from "../src/sheets/cuotas";

// Carga .dev.vars además de .env, sin pisar variables ya presentes.
loadEnv({ path: ".dev.vars" });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable ${name} (definila en .dev.vars).`);
  return v;
}

async function main() {
  const spreadsheetId = requireEnv("SHEET_ID");
  const serviceAccountEmail = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKeyPem = requireEnv("GOOGLE_PRIVATE_KEY");

  const client = new SheetsClient(spreadsheetId, () =>
    fetchAccessToken({ serviceAccountEmail, privateKeyPem }),
  );

  const existing = new Set((await client.getSheets()).map((s) => s.title));

  // --- Hoja Config ---
  if (existing.has(CONFIG_SHEET)) {
    console.log(`• "${CONFIG_SHEET}" ya existe — no la toco.`);
  } else {
    console.log(`• Creando "${CONFIG_SHEET}"…`);
    await client.batchUpdate([{ addSheet: { properties: { title: CONFIG_SHEET } } }]);

    // Bloque de categorías en A:C.
    const catValues: unknown[][] = [
      ["categoria", "subcategoria", "descripcion"],
      ...CATEGORIAS_SEED.map((c) => [c.categoria, c.subcategoria, c.descripcion]),
    ];
    await client.updateValues(`${CONFIG_SHEET}!A1`, catValues);

    // Bloque de medios de pago en E (columna separada, se localiza por header).
    const medioValues: unknown[][] = [["medio_pago"], ...MEDIOS_PAGO_SEED.map((m) => [m])];
    await client.updateValues(`${CONFIG_SHEET}!E1`, medioValues);

    console.log(`  ${CATEGORIAS_SEED.length} subcategorías y ${MEDIOS_PAGO_SEED.length} medio(s) cargados.`);
  }

  // --- Hoja Cuotas ---
  if (existing.has(CUOTAS_SHEET)) {
    console.log(`• "${CUOTAS_SHEET}" ya existe — no la toco.`);
  } else {
    console.log(`• Creando "${CUOTAS_SHEET}"…`);
    await client.batchUpdate([{ addSheet: { properties: { title: CUOTAS_SHEET } } }]);
    await client.updateValues(`${CUOTAS_SHEET}!A1`, [CUOTAS_HEADERS]);
  }

  console.log("✅ Bootstrap completo.");
}

main().catch((err) => {
  console.error("❌ Bootstrap falló:", err instanceof Error ? err.message : err);
  process.exit(1);
});
