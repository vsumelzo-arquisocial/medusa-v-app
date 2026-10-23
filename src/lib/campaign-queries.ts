import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const campaignQuery = queryOptions({
  queryKey: ["campaign"],
  queryFn: async () => {
    await supabase.rpc("campaign_tick");
    const [c, r, a, p, s, b, sys] = await Promise.all([
      supabase.from("campaign").select("*").eq("id", 1).maybeSingle(),
      supabase.from("regions").select("*").order("id"),
      supabase.from("region_attacks").select("*").order("created_at", { ascending: false }).limit(60),
      supabase.rpc("campaign_players_40k"),
      supabase.from("ships").select("user_id,name"),
      supabase.from("celestial_bodies").select("*").order("sort"),
      supabase.rpc("system_ships"),
    ]);
    if (r.error) throw r.error;
    if (p.error) throw p.error;
    return {
      campaign: c.data, regions: r.data ?? [], attacks: a.data ?? [], players: p.data ?? [], ships: s.data ?? [],
      bodies: b.data ?? [], fleet: sys.data ?? [],
    };
  },
  refetchInterval: 5000,
});
