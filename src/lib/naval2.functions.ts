import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { blockPlanSchema } from "@/lib/naval2/schema";
import type { BlockPlan } from "@/lib/naval2/types";

/** Procesa los duelos navales v2 pendientes (se llama al consultar el mando naval). */
export const duelTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { processDueDuels } = await import("@/lib/naval2/server");
    await processDueDuels();
    return { ok: true };
  });

/** Fija las órdenes de un bloque del duelo v2. */
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
    const { submitPlan } = await import("@/lib/naval2/server");
    await submitPlan(context.userId, data.raidId, data.block, data.plan as BlockPlan);
    return { ok: true };
  });
