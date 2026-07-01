/**
 * Datos iniciales de la hoja `Config`.
 *
 * OJO: esto es SOLO el seed que usa `npm run bootstrap` para poblar la hoja la
 * primera vez. En runtime el bot NUNCA usa estas constantes como fuente de
 * verdad: siempre lee la hoja `Config` real (que el usuario puede editar a
 * mano). Ver `src/sheets/config-sheet.ts`.
 */

export interface CategoriaSeed {
  categoria: string;
  subcategoria: string;
  descripcion: string;
}

/** Tabla inicial de categorías / subcategorías / descripciones. */
export const CATEGORIAS_SEED: CategoriaSeed[] = [
  { categoria: "casa", subcategoria: "super", descripcion: "Súper, verdulería, comida recurrente" },
  { categoria: "casa", subcategoria: "hogar", descripcion: "Equipamiento no recurrente, deco, Starlink en cuotas" },
  { categoria: "casa", subcategoria: "servicios", descripcion: "Luz, gas, agua, internet" },
  { categoria: "casa", subcategoria: "mantenimiento", descripcion: "Productos de limpieza, arreglos, service del hogar" },
  { categoria: "mascotas", subcategoria: "comida", descripcion: "Alimento de las mascotas" },
  { categoria: "mascotas", subcategoria: "insumos", descripcion: "Piedras sanitarias, juguetes, insumos mensuales" },
  { categoria: "mascotas", subcategoria: "salud", descripcion: "Veterinario, vacunas, imprevistos de salud" },
  { categoria: "transporte", subcategoria: "nafta", descripcion: "Nafta" },
  { categoria: "transporte", subcategoria: "seguro", descripcion: "Seguro del auto" },
  { categoria: "transporte", subcategoria: "auto", descripcion: "Service, gomería, VTV, patente, peajes" },
  { categoria: "salud", subcategoria: "psicojuli", descripcion: "Psicólogo de Juli" },
  { categoria: "salud", subcategoria: "psicomili", descripcion: "Psicóloga de Mili" },
  { categoria: "salud", subcategoria: "medicacion", descripcion: "Medicación de Mili" },
  { categoria: "salud", subcategoria: "obrasocial", descripcion: "Obra social / prepaga" },
  { categoria: "salud", subcategoria: "imprevistos", descripcion: "Dentista, estudios, consultas fuera de lo fijo" },
  { categoria: "suscripciones", subcategoria: "entretenimiento", descripcion: "Netflix, Paramount, Spotify" },
  { categoria: "suscripciones", subcategoria: "monotributo", descripcion: "Monotributo" },
  { categoria: "suscripciones", subcategoria: "actividades", descripcion: "Gimnasio y otras actividades" },
  { categoria: "suscripciones", subcategoria: "otras", descripcion: "Apps, software, otras suscripciones" },
  { categoria: "personal", subcategoria: "juli", descripcion: "Gasto personal libre de Juli (ej. zapatillas en cuotas)" },
  { categoria: "personal", subcategoria: "mili", descripcion: "Gasto personal libre de Mili" },
  { categoria: "salidas", subcategoria: "restaurantes", descripcion: "Restaurantes, bares" },
  { categoria: "salidas", subcategoria: "ocio", descripcion: "Cine, recitales, escapadas de un día" },
  { categoria: "snow", subcategoria: "pases", descripcion: "Cuotas del pase de temporada + días extra" },
  { categoria: "snow", subcategoria: "equipo", descripcion: "Tabla, botas, fijaciones, ropa técnica" },
  { categoria: "snow", subcategoria: "otros", descripcion: "Equipo o clases para familiares/amigos" },
  { categoria: "ahorros", subcategoria: "imprevistos", descripcion: "Fondo de imprevistos" },
  { categoria: "ahorros", subcategoria: "autonuevo", descripcion: "Ahorro para auto" },
  { categoria: "ahorros", subcategoria: "temposnow", descripcion: "Recarga del fondo de snowboard para la próxima temporada" },
  { categoria: "ahorros", subcategoria: "largoplazo", descripcion: "Ahorro de largo plazo (terreno)" },
];

/** Medios de pago iniciales. El usuario agrega el resto a mano en la hoja. */
export const MEDIOS_PAGO_SEED: string[] = ["mp"];

/**
 * Categoría especial que ACUMULA en vez de presupuestar.
 * Sus subcategorías van en el Resumen sin presupuesto / desvío / porcentaje.
 */
export const CATEGORIA_AHORROS = "ahorros";
