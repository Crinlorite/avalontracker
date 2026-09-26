// Estándar actual del juego: portales de 7 (azul) o 20 (amarillo) cargas.
// 2 y 40 existen en filas antiguas y se muestran tal cual, pero no se
// aceptan al escribir (spec §6.2).
import { z } from "zod";
export const PORTAL_SIZES = [7, 20] as const;
export type PortalSize = (typeof PORTAL_SIZES)[number];
export const portalSizeSchema = z.union([z.literal(7), z.literal(20)]);
