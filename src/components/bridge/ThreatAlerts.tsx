import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Swords, Rocket, Map } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { raidsQuery } from "@/components/ship/NavalCombat";

/** Incoming threats against the current player: region attacks and naval raids. */
export function useThreats(uid: string) {
  const { data: regionAttacks = [] } = useQuery({
    queryKey: ["incoming-attacks", uid],
    refetchInterval: 60000,
    queryFn: async () => {
      const { data } = await supabase.from("region_attacks").select("id, region_id, game_id, deadline, attacker_id").eq("defender_id", uid).is("resolved_at", null);
      if (!data?.length) return [];
      const [{ data: regs }, { data: players }] = await Promise.all([
        supabase.from("regions").select("id, name").in("id", data.map((a) => a.region_id)),
        supabase.rpc("campaign_players_40k"),
      ]);
      return data.map((a) => ({ ...a, region: regs?.find((r) => r.id === a.region_id)?.name ?? `Región ${a.region_id}`, attacker: players?.find((p) => p.id === a.attacker_id)?.leader_name ?? "Un enemigo" }));
    },
  });
  const { data: raids } = useQuery(raidsQuery);
  const naval = raids?.raids.filter((r) => (r.status === "pendiente" && r.defender_id === raids.uid) || (r.status === "enfrentado" && (r.defender_id === raids.uid || r.attacker_id === raids.uid))) ?? [];
  return { regionAttacks, naval, total: regionAttacks.length + naval.length };
}

const fmt = (d: string) => new Date(d).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function ThreatAlerts({ uid }: { uid: string }) {
  const { regionAttacks, naval } = useThreats(uid);
  if (!regionAttacks.length && !naval.length) return null;
  return (
    <div className="threat-panel mb-4 space-y-2 border border-destructive bg-destructive/10 p-3">
      <p className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-destructive"><Swords className="h-4 w-4 animate-pulse" /> Alerta · tu fuerza está siendo atacada</p>
      {regionAttacks.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border border-destructive/50 bg-background/70 p-2 text-xs">
          <span className="flex items-center gap-2"><Map className="h-4 w-4 text-destructive" /> <b className="text-destructive">{a.attacker}</b> ataca {a.region} · límite {fmt(a.deadline)}</span>
          {a.game_id
            ? <Link to="/partidas/$id" params={{ id: a.game_id }} className="border border-destructive px-2 py-1 uppercase text-destructive hover:bg-destructive/20">Elegir lista de defensa</Link>
            : <Link to="/sistema" className="border border-destructive px-2 py-1 uppercase text-destructive hover:bg-destructive/20">Ver en el sistema</Link>}
        </div>
      ))}
      {naval.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-destructive/50 bg-background/70 p-2 text-xs">
          <span className="flex items-center gap-2"><Rocket className="h-4 w-4 text-destructive" /> {r.status === "enfrentado" ? "Duelo naval en curso" : "Una nave enemiga se aproxima"} · límite {fmt(r.deadline)}</span>
          <Link to="/mando" className="border border-destructive px-2 py-1 uppercase text-destructive hover:bg-destructive/20">Decidir la defensa</Link>
        </div>
      ))}
    </div>
  );
}
