/** Router de comandos (/comando args). */

import type { Ctx } from "../ctx";
import type { TelegramMessage } from "../telegram/types";
import { handleNuevoMes } from "./nuevomes";
import { handleCargarCuotas } from "./cargarcuotas";
import { startCuotaForm } from "./cuota";
import {
  handleCategorias,
  handleMediosDePago,
  handleFormato,
  handleCategoria,
  handleResumen,
  handleGastos,
  handleSheet,
  handleHelp,
} from "./queries";

/** Lista de comandos para setMyCommands (usado por register-webhook). */
export const BOT_COMMANDS = [
  { command: "nuevomes", description: "Crear las hojas del mes actual" },
  { command: "cargarcuotas", description: "Insertar las cuotas activas del mes" },
  { command: "cuota", description: "Alta guiada de una cuota nueva" },
  { command: "resumen", description: "Presupuesto vs gastado del mes" },
  { command: "categoria", description: "Detalle de una categoría (<nombre> [YYYY-MM])" },
  { command: "gastos", description: "Todos los gastos del mes" },
  { command: "categorias", description: "Categorías y subcategorías" },
  { command: "mediosdepago", description: "Medios de pago" },
  { command: "formato", description: "Cómo cargar un gasto" },
  { command: "sheet", description: "Link al Google Sheet" },
  { command: "help", description: "Ayuda y filosofía" },
];

export async function handleCommand(
  ctx: Ctx,
  msg: TelegramMessage,
  command: string,
  args: string[],
): Promise<void> {
  const chatId = msg.chat.id;

  switch (command) {
    case "start":
    case "help":
      return handleHelp(ctx, chatId);
    case "nuevomes":
      return handleNuevoMes(ctx, chatId);
    case "cargarcuotas":
      return handleCargarCuotas(ctx, chatId);
    case "cuota":
      return startCuotaForm(ctx, chatId, msg.from!.id);
    case "categorias":
      return handleCategorias(ctx, chatId);
    case "mediosdepago":
      return handleMediosDePago(ctx, chatId);
    case "formato":
      return handleFormato(ctx, chatId);
    case "categoria":
      return handleCategoria(ctx, chatId, args);
    case "resumen":
      return handleResumen(ctx, chatId);
    case "gastos":
      return handleGastos(ctx, chatId);
    case "sheet":
      return handleSheet(ctx, chatId);
    default:
      await ctx.api.sendMessage(chatId, "No conozco ese comando. Mirá /help.");
  }
}
