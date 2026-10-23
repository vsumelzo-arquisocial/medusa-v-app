import { useQuery } from "@tanstack/react-query";
import { Globe } from "@/components/planet/Globe";
import { campaignQuery } from "@/lib/campaign-queries";
import { bridgeImageFor } from "@/lib/bridges";
import { get40kFaction } from "@/lib/warhammer40k-factions";
import { useViewMode } from "@/hooks/use-view-mode";
import { campaignForce, campaignColor } from "@/lib/campaign-forces";
import { CampaignLegend } from "@/components/planet/CampaignLegend";
import { fleetFor } from '@/lib/ship-identity';
import { profileQuery } from "@/lib/profile";
import { BODY_MAPS } from "@/lib/planet";
import { BODY_TEXTURES } from "@/lib/system-art";
import { bodyName } from "@/lib/system";

/**
 * Bridge stage: the full command bridge with a holographic Medusa V
 * projected above the tactical table. The planet is a button (future: planet status).
 */


export function OrbitalView({ shipName, onPlanetClick, race, faction, threats }: { race: string | null; faction: string | null; shipName?: string | null; onPlanetClick?: (body: string) => void; threats?: { planet: number; naval: number } }) {
  const traitor = get40kFaction(faction ?? "")?.group === "chaos";
  const hit = !!threats && threats.planet + threats.naval > 0;
  const factionName = get40kFaction(faction ?? "")?.name ?? "la flota";
  const { data } = useQuery(campaignQuery);
  const { data: prof } = useQuery(profileQuery);
  const mine = data?.fleet.find((f) => f.user_id === prof?.user.id);
  const body = mine?.body_id ?? "medusa-5";
  const inWarp = !!mine?.arrives_at && new Date(mine.arrives_at).getTime() > Date.now();
  const bodyRegions = (data?.regions ?? []).filter((r) => r.body_id === body);
  const side = (uid: string | null) => campaignForce(data?.players.find((p) => p.id === uid)?.army_faction);
  const styleFor = (id: number) => {
    const r = data?.regions.find((x) => x.id === id);
    const a = side(r?.owner_id ?? null);
    const hot = data?.attacks.some((x) => !x.resolved_at && x.region_id === id);
    const owner = data?.players.find((p) => p.id === r?.owner_id);
    return { fill: r?.owner_id ? (owner?.map_color ?? campaignColor(a)) : "transparent", pulse: !!hot, label: r?.is_spaceport ? "✠" : undefined };
  };
  const attacks = (data?.attacks ?? []).filter((a) => !a.resolved_at && bodyRegions.some((r) => r.id === a.region_id)).map((a) => {
    const own = (data?.regions ?? []).filter((r) => r.owner_id === a.attacker_id);
    const from = own.find((r) => r.neighbors.includes(a.region_id)) ?? own[0];
    const al = side(a.attacker_id);
    return { id: a.id, from: from?.id ?? null, to: a.region_id, color: campaignColor(al), traitor: al === "chaos" };
  });
  const { compact } = useViewMode();
  const bar = data && !inWarp && <CampaignLegend regions={bodyRegions} players={data.players} />;
  return (
    <div className={traitor ? "side-traitor" : ""}>
    <div className={`relative w-full overflow-hidden ${compact ? "aspect-[4/5]" : "aspect-[16/9]"}`}>
      <img src={bridgeImageFor(race, faction)} alt={`Puente de la nave de ${factionName}`} width={1600} height={640} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_55%,_transparent_30%,_oklch(0_0_0/0.55)_90%)]" />

      {/* holo projector beam from table */}
      <div className={`holo-beam absolute left-1/2 top-[38%] h-[30%] -translate-x-1/2 ${compact ? "w-[58%]" : "w-[26%]"}`} />

      {/* holographic planet */}
      {inWarp ? (
        <div role="status" aria-label="Nave en el warp, mapa sin conexión" className={`holo-planet absolute left-1/2 top-[34%] flex aspect-square -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-primary/40 font-mono ${compact ? "w-[52%]" : "w-[22%]"}`}>
          <div className="holo-lines absolute inset-0 rounded-full" />
          <span className="threat-blink text-lg font-bold uppercase tracking-[0.4em] text-primary glow md:text-2xl">Offline</span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.3em] text-primary/80">En el warp</span>
        </div>
      ) : (
      <button
        type="button"
        onClick={() => onPlanetClick?.(body)}
        title={`Estado de ${bodyName(body)}`}
        aria-label={`Abrir el mapa de ${bodyName(body)}`}
        className={`holo-planet group absolute left-1/2 top-[34%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none ${compact ? "w-[52%]" : "w-[22%]"}`}
      >
        <div className="pointer-events-none absolute -inset-[7%] opacity-90 mix-blend-screen [filter:saturate(1.3)_brightness(1.15)_drop-shadow(0_0_8px_oklch(0.8_0.2_150/0.6))]">
          <Globe map={BODY_MAPS[body]} texture={BODY_TEXTURES[body]} styleFor={styleFor} selected={null} onSelect={() => {}} attacks={attacks} interactive={false} />
        </div>
        <div className="holo-lines absolute inset-0 rounded-full" />
        <div className="absolute inset-0 rounded-full shadow-[0_0_40px_oklch(0.8_0.2_150/0.6),inset_0_0_30px_oklch(0.85_0.2_150/0.7)] transition group-hover:shadow-[0_0_70px_oklch(0.85_0.22_150/0.9),inset_0_0_40px_oklch(0.9_0.2_150/0.9)]" />
        <div className="orbit-ring absolute -inset-[18%] rounded-full border border-primary/50">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
            <div className="orbit-counter flex flex-col items-center">
              <div className={`orbit-ship relative ${threats?.naval ? "orbit-ship-hit" : ""}`}>
                <span className="orbit-ship-engine" aria-hidden />
                <img src={fleetFor(race,faction).image} alt="" width={768} height={512} className="relative h-14 w-24 object-contain" />
              </div>
              <span className="mt-0.5 whitespace-nowrap font-mono text-[9px] uppercase tracking-widest text-primary glow">{shipName ?? "Tu nave"}</span>
            </div>
          </div>
        </div>
        {!compact && <span className="absolute -bottom-[38%] left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.3em] text-primary opacity-70 group-hover:opacity-100">{bodyName(body)}</span>}
      </button>
      )}

      {!compact && bar && (
        <div className="absolute left-1/2 top-[57%] w-[70%] -translate-x-1/2 font-mono">{bar}</div>
      )}

      {hit && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="threat-vignette absolute inset-0" />
          <div className="threat-scan absolute inset-x-0 h-[12%]" />
          <div className="absolute inset-x-0 top-3 text-center font-mono text-xs uppercase tracking-[0.4em] text-destructive md:text-sm">
            <span className="threat-blink">⚠ Alerta roja · {[threats!.planet ? `${threats!.planet} región(es) bajo ataque` : "", threats!.naval ? "nave hostil en contacto" : ""].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
      )}

      {!compact && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-between px-4 font-mono text-[10px] uppercase tracking-widest text-primary/80">
          <span className={`animate-pulse ${hit ? "text-destructive" : ""}`}>&gt; {hit ? "Enlace orbital · amenaza detectada" : "Enlace orbital activo"}</span>
        </div>
      )}
    </div>
    {compact && (
      <div className="space-y-2 border-t border-primary/40 bg-background/80 p-3 font-mono text-[10px] uppercase tracking-widest">
        <p className="text-center text-primary">{inWarp ? "En el warp · mapa sin conexión" : `${bodyName(body)} · toca el planeta para abrir el mapa`}</p>
        {bar}
        <p className="animate-pulse text-primary/80">&gt; Enlace orbital activo</p>
      </div>
    )}
    </div>
  );
}
