import { z } from "zod";
import { PHASES_PER_BLOCK } from "./factions";

export const phasePlanSchema = z.object({
  speed: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  turn: z.union([
    z.literal(-2),
    z.literal(-1),
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal("encarar"),
    z.literal("costado"),
    z.literal("huir"),
  ]),
  action: z.enum([
    "fuego",
    "torpedos",
    "recargar",
    "escudos",
    "evasion",
    "embestir",
    "reparar",
    "saltar",
    "abordar",
  ]),
});

export const blockPlanSchema = z.object({
  phases: z.array(phasePlanSchema).min(1).max(PHASES_PER_BLOCK),
  emergencyJump: z.number().int().min(0).max(60),
});
