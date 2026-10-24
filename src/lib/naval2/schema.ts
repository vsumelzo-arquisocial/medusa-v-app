import { z } from "zod";
import { ROUNDS_PER_BLOCK } from "./factions";

export const roundPlanSchema = z.object({
  maneuver: z.enum(["acercarse", "mantener", "flanquear", "romper"]),
  order: z
    .enum([
      "fijar_blanco",
      "avante_toda",
      "nuevo_rumbo",
      "recargar",
      "prepararse",
      "control_danos",
      "faccion",
    ])
    .nullable(),
  target: z.enum(["capital", "escoltas"]),
  preferredRange: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

export const blockPlanSchema = z.object({
  rounds: z.array(roundPlanSchema).length(ROUNDS_PER_BLOCK),
  doctrine: z.enum(["pantalla", "ataque", "flanqueo"]),
});
