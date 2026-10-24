import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { blockPlanSchema } from "@/lib/naval3/schema";
import type { BlockPlan } from "@/lib/naval3/types";

/** Procesa los duelos navales pendientes (se llama al consultar el mando naval). */
export const duelTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { processDueDuels, purgeVoice } = await import("@/lib/naval3/server");
    await processDueDuels();
    await purgeVoice().catch(() => undefined);
    return { ok: true };
  });

/** Fija las órdenes de un bloque (1 o 3 rondas según el modo). */
export const submitDuelPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      raidId: z.string().uuid(),
      block: z.number().int().positive(),
      plan: blockPlanSchema,
    }),
  )
  .handler(async ({ data, context }) => {
    const { submitPlan } = await import("@/lib/naval3/server");
    await submitPlan(context.userId, data.raidId, data.block, data.plan as BlockPlan);
    return { ok: true };
  });

/** Elige el modo de combate: de una en una (1) o de tres en tres (3). */
export const chooseDuelMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ raidId: z.string().uuid(), mode: z.union([z.literal(1), z.literal(3)]) }),
  )
  .handler(async ({ data, context }) => {
    const { chooseMode } = await import("@/lib/naval3/server");
    await chooseMode(context.userId, data.raidId, data.mode);
    return { ok: true };
  });

/** Pasa un duelo de una en una a tres en tres. */
export const switchDuelToThree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ raidId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { switchToThree } = await import("@/lib/naval3/server");
    await switchToThree(context.userId, data.raidId);
    return { ok: true };
  });
