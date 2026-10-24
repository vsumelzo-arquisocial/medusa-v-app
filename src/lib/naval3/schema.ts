import { z } from "zod";
import { PHASES_PER_BLOCK } from "./factions";

export const phasePlanSchema = z.object({
  move: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  action: z.enum(["fuego", "torpedos", "recargar", "evasion", "embestir", "reparar", "saltar"]),
});

export const blockPlanSchema = z.object({
  phases: z.array(phasePlanSchema).length(PHASES_PER_BLOCK),
  emergencyJump: z.number().int().min(0).max(60),
});
