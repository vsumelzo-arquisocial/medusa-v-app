import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { blockPlanSchema } from "@/lib/naval3/schema";
import type { BlockPlan } from "@/lib/naval3/types";

/** Procesa los duelos navales pendientes (se llama al consultar el mando naval). */
export const duelTick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { processDueDuels } = await import("@/lib/naval3/server");
    await processDueDuels();
    return { ok: true };
  });

/** Fija las órdenes de un bloque de 5 fases. */
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
