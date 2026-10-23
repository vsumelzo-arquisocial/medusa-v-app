import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { EmblemIcon } from "@/components/EmblemIcon";
import { get40kFaction } from "@/lib/warhammer40k-factions";
import { campaignQuery } from "@/lib/campaign-queries";
import { campaignForce, CAMPAIGN_FORCES, FORCE_NAMES, FORCE_CLASSES } from "@/lib/campaign-forces";
import { CampaignLegend } from "@/components/planet/CampaignLegend";

const strategosQuery = {
  queryKey: ["strategos"],
  queryFn: async () => {
    const [{ data: rows, error }, { data: camp }, { count }] = await Promise.all([
      supabase.rpc("strategos"),
      supabase.from("campaign").select("phase").eq("id", 1).maybeSingle(),
      supabase.from("regions").select("id", { count: "exact", head: true }),
    ]);
    if (error) throw error;
    const paths = (rows ?? []).map((r) => r.portrait_path).filter(Boolean) as string[];
    const urls: Record<string, string> = {};
    if (paths.length) {
      const { data } = await supabase.storage.from("portraits").createSignedUrls(paths, 3600);
      data?.forEach((d) => { if (d.path && d.signedUrl) urls[d.path] = d.signedUrl; });
    }
    return { rows: rows ?? [], urls, phase: camp?.phase ?? "aproximacion", total: count ?? 42 };
  },
};

export const Route = createFileRoute("/_authenticated/estrategos")({
  head: () => ({ meta: [
    { title: "Estrategos · Atalaya" },
    { name: "description", content: "Los comandantes del club: bando, facción, méritos y conquistas en Medusa V." },
    { property: "og:title", content: "Estrategos · Atalaya" },
    { property: "og:description", content: "Los comandantes del club y sus méritos." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(profileQuery), context.queryClient.ensureQueryData(strategosQuery), context.queryClient.ensureQueryData(campaignQuery)]),
  component: Strategos,
});

type Row = { battles: number; wins: number; losses: number; draws: number; renown: number; regions: number; spaceport: string | null };

/** Medals earned from the record. */
function medals(r: Row): [string, string][] {
  const m: [string, string][] = [];
  if (r.battles >= 1) m.push(["⚔", "Bautismo de fuego"]);
  if (r.battles >= 10) m.push(["✦", "Veterano (10 batallas)"]);
  if (r.wins >= 1) m.push(["✠", "Primera victoria"]);
  if (r.wins >= 5) m.push(["❖", "Laurel de victoria (5)"]);
  if (r.wins >= 10) m.push(["♛", "Triunfador (10)"]);
  if (r.renown >= 50) m.push(["☼", "Héroe renombrado"]);
  if (r.regions >= 5) m.push(["⚑", "Conquistador (5 regiones)"]);
  if (r.spaceport) m.push(["✈", `Desembarco en ${r.spaceport}`]);
  return m;
}

function Strategos() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data } = useSuspenseQuery(strategosQuery);
  const { data: campaign } = useSuspenseQuery(campaignQuery);
  const forceFor = (id: string) => campaignForce(campaign.players.find(p => p.id === id)?.army_faction);
  const conquest = data.phase === "conquista";
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel("strategos-regions")
      .on("postgres_changes", { event: "*", schema: "public", table: "regions" }, () => qc.invalidateQueries({ queryKey: ["strategos"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  const owned = data.rows.reduce((a, r) => a + r.regions, 0);
  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Registro del estado mayor</p>
      <h1 className="mb-4 text-2xl text-primary glow md:text-3xl">Estrategos</h1>
      {conquest && (
        <Panel title="Conquista de Medusa V · en directo">
          {(() => {
            const T = data.total || 1;
            const grouped = CAMPAIGN_FORCES.map(force => data.rows.filter(r => forceFor(r.id) === force && r.regions));
            const me = data.rows.find((r) => r.id === prof.user.id);
            const myForceTotal = data.rows.filter(r => me && forceFor(r.id) === forceFor(me.id)).reduce((sum, r) => sum + r.regions, 0);
            const seg = (r: (typeof data.rows)[number]) => (
              <div key={r.id} title={`${r.leader_name}: ${r.regions} regiones`} style={{ width: `${(r.regions / T) * 100}%`, background: r.map_color }} className={r.id === prof.user.id ? "relative z-10 outline outline-2 outline-foreground" : "border-r border-background/60"} />
            );
            return (
              <div>
                <div className="mb-1"><CampaignLegend regions={campaign.regions} players={campaign.players} /></div>
                <div className="flex h-5 w-full border border-border bg-muted/30">
                  {grouped.flatMap(rows => rows.map(seg))}<div className="flex-1" />
                </div>
                {me && me.regions > 0 && (
                  <p className="mt-1 text-xs text-primary">▣ Tu aporte (recuadrado): {Math.round((me.regions / T) * 100)} % del planeta · {Math.round((me.regions / (myForceTotal || 1)) * 100)} % de tu bando</p>
                )}
              </div>
            );
          })()}
          <p className="mt-2 text-xs text-muted-foreground">{data.total - owned} regiones neutrales. Si cae el Espaciopuerto de un comandante, pierde todas sus regiones y su porcentaje hasta que vuelva a aterrizar.</p>
        </Panel>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.rows.map((r) => {
          const force = forceFor(r.id);
          const faction = campaign.players.find(p => p.id === r.id)?.army_faction;
          const pct = Math.round((r.regions / (data.total || 1)) * 100);
          const md = medals(r);
          return (
            <Panel key={r.id}>
              <div className="flex gap-3">
                {r.portrait_path && data.urls[r.portrait_path]
                  ? <img src={data.urls[r.portrait_path]} alt={r.leader_name ?? ""} className="h-24 w-24 shrink-0 border border-border object-cover" />
                  : <div className="grid h-24 w-24 shrink-0 place-items-center border border-border text-3xl text-muted-foreground">?</div>}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <EmblemIcon id={r.map_emblem} color={r.map_color} size={22} />
                    <h2 className="truncate text-lg text-primary">{r.leader_name}</h2>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{r.force_name}</p>
                  {force && <p className={`mt-1 text-xs uppercase ${FORCE_CLASSES[force]}`}>{FORCE_NAMES[force]}</p>}
                  <p className="text-xs text-muted-foreground">{get40kFaction(faction ?? '')?.name ?? '—'}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1 text-center text-xs">
                <div className="border border-border p-1"><div className="text-lg text-primary">{r.battles}</div>Batallas</div>
                <div className="border border-border p-1"><div className="text-lg text-primary">{r.wins}</div>Victorias</div>
                <div className="border border-border p-1"><div className="text-lg text-primary">{r.losses}</div>Derrotas</div>
                <div className="border border-border p-1"><div className="text-lg text-primary">{r.renown}</div>Renombre</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {md.length ? md.map(([g, t]) => <span key={t} title={t} className="border border-primary/50 px-1.5 py-0.5 text-[10px] text-primary">{g} {t}</span>)
                  : <span className="text-[10px] text-muted-foreground">Sin medallas todavía.</span>}
              </div>
              {conquest && (
                <div className="mt-3 text-xs">
                  <p>Espaciopuerto: <span className="text-primary">{r.spaceport ?? "sin aterrizar"}</span></p>
                  <div className="mt-1 h-2 w-full border border-border"><div className="h-full" style={{ width: `${pct}%`, background: r.map_color }} /></div>
                  <p className="mt-0.5 text-muted-foreground">{r.regions} regiones · {pct} % de Medusa V</p>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </CommandShell>
  );
}
