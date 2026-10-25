// Ingresos y bonificaciones de región de todos los planetas conquistados, ponderados por distancia.
// Mirrors public.region_factor / region_rate / daily_income_amount / income_breakdown.
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RegionType } from "@/lib/planet";
import { bodyById } from "@/lib/system";

export const MINE_CREDITS = 40;
export const LOSS_PER_ORBIT = 0.15;
export const MAX_LOSS = 0.75;

/** Fracción que llega de una región en `regionBody` con la nave en `shipBody` y la antena a `antenna`. */
export function regionFactor(
  shipBody: string | null | undefined,
  regionBody: string,
  antenna: number,
) {
  const a = bodyById(shipBody),
    b = bodyById(regionBody);
  if (!a || !b) return 0.25;
  const loss = Math.min(MAX_LOSS, LOSS_PER_ORBIT * Math.abs(a.orbit - b.orbit));
  return 1 - loss * (1 - Math.min(3, Math.max(0, antenna)) / 3);
}

/** Bonificación por regiones equivalentes: 0,10 con 1, 0,15 con 2, 0,20 con 3+ (lineal entre medias). */
export function rateFromReach(w: number) {
  if (w <= 0) return 0;
  if (w < 1) return 0.1 * w;
  return Math.min(0.2, 0.05 + 0.05 * w);
}

export interface IncomeRegion {
  id: number;
  name: string;
  type: RegionType;
  body_id: string;
  factor: number;
}
export interface IncomeBreakdown {
  base: number;
  bridge: number;
  mine_credits: number;
  antenna: number;
  total: number;
  ship_body: string | null;
  regions: IncomeRegion[];
  rates: Partial<Record<RegionType, number>>;
}

export const incomeBreakdownQuery = queryOptions({
  queryKey: ["income-breakdown"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("income_breakdown");
    if (error) throw error;
    return (data ?? null) as unknown as IncomeBreakdown | null;
  },
});

/** Agrupa las regiones por planeta con lo que aporta cada uno. */
export function byBody(b: IncomeBreakdown) {
  const map = new Map<
    string,
    { body: string; factor: number; regions: IncomeRegion[]; credits: number }
  >();
  for (const r of b.regions) {
    const g = map.get(r.body_id) ?? { body: r.body_id, factor: r.factor, regions: [], credits: 0 };
    g.regions.push(r);
    if (r.type === "mina") g.credits += b.mine_credits * r.factor;
    map.set(r.body_id, g);
  }
  return [...map.values()].sort((x, y) => y.factor - x.factor);
}
