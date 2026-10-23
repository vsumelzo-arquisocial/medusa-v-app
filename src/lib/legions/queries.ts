import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ListFormation } from "@/types/legions";
import { detachmentById, detachments, formationById, formations, slotById } from "./data";
import type { Db } from "./engine";
import type { ListMode } from "./collection";

export const db: Db = { formations, detachments, formationById, slotById, detachmentById };

/** Drop Pod unit ids (Deathstorm, Drop Pod, Palisade, Dreadnought). */
export const POD_UNIT_IDS = [20, 23, 24, 25];

export const collectionQuery = queryOptions({
  queryKey: ["collection"],
  queryFn: async () => {
    const [{ data, error }, bay] = await Promise.all([
      supabase.from("collection_items").select("unit_id, quantity"),
      supabase.from("pod_bay").select("unit_id, quantity"),
    ]);
    if (error) throw error;
    // Drop pods only count once loaded in the ship's Bahía de cápsulas.
    const m = new Map((data ?? []).filter((r) => !POD_UNIT_IDS.includes(r.unit_id)).map((r) => [r.unit_id, r.quantity]));
    for (const r of bay.data ?? []) if (r.quantity > 0) m.set(r.unit_id, r.quantity);
    return m;
  },
});

export interface SavedList {
  id: string; name: string; points: number; mode: ListMode; gamemode: "standard" | "titandeath";
  formations: ListFormation[]; updated_at: string;
  game_system?: string; list_format?: string; army_faction?: string | null; roster?: unknown;
}

export const listsQuery = queryOptions({
  queryKey: ["lists"],
  queryFn: async () => {
    const { data, error } = await supabase.from("army_lists").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as SavedList[];
  },
});

export const listQuery = (id: string) =>
  queryOptions({
    queryKey: ["lists", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("army_lists").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as unknown as SavedList | null;
    },
  });
