import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FactionPoints, ListMode, Roster } from "@/lib/wh40k-lists";

/** Official points (Munitorum Field Manual), loaded on demand because the file is large. */
export const pointsQuery = (faction: string) =>
  queryOptions({
    queryKey: ["wh40k-points", faction],
    staleTime: Infinity,
    queryFn: async () => {
      const mod = await import("@/data/warhammer40k/points.json");
      const all = (mod.default ?? mod) as unknown as { factions: Record<string, FactionPoints> };
      return all.factions[faction] ?? { version: null, units: [], detachments: [] };
    },
  });

export const recruitsQuery = queryOptions({
  queryKey: ["wh40k-recruits"],
  queryFn: async () => {
    const { data, error } = await supabase.from("wh40k_recruits").select("unit_name, models, quantity, faction");
    if (error) throw error;
    return data ?? [];
  },
});

export interface Saved40kList {
  id: string; name: string; points: number; mode: ListMode; list_format: string;
  army_faction: string | null; roster: Roster; updated_at: string; game_system: string;
}

export const patrolsQuery = queryOptions({
  queryKey: ["wh40k-patrols"], staleTime: Infinity,
  queryFn: async () => (await import("@/lib/wh40k-patrols")).loadPatrols(),
});
