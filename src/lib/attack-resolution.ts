import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AttackConsent {
  attacker_id: string;
  defender_id: string | null;
  kind: string;
  resolved_at: string | null;
  auto_attacker_confirmed: boolean;
  auto_defender_confirmed: boolean;
}

export function consentState(attack: AttackConsent, viewer: string, spaceport: boolean) {
  const participant = viewer === attack.attacker_id || viewer === attack.defender_id;
  const eligible = participant && attack.kind === "attack" && !!attack.defender_id && !attack.resolved_at && !spaceport;
  const mine = viewer === attack.attacker_id ? attack.auto_attacker_confirmed : attack.auto_defender_confirmed;
  const other = viewer === attack.attacker_id ? attack.auto_defender_confirmed : attack.auto_attacker_confirmed;
  return { eligible, mine, other, ready: eligible && mine && other };
}

export const attackResolutionQuery = (gameId: string) => queryOptions({
  queryKey: ["attack-resolution", gameId],
  queryFn: async () => {
    const { data: attack, error } = await supabase.from("region_attacks").select("*").eq("game_id", gameId).maybeSingle();
    if (error) throw error;
    if (!attack) return null;
    const { data: region, error: regionError } = await supabase.from("regions").select("name,is_spaceport").eq("id", attack.region_id).single();
    if (regionError) throw regionError;
    return { attack, region };
  },
  refetchInterval: 5000,
});