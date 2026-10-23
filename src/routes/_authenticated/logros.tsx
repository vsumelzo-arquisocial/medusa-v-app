import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { EmblemIcon } from "@/components/EmblemIcon";
import { ACHIEVEMENTS, score, TIER_POINTS, type PlayerStats } from "@/lib/achievements";

const logrosQuery = {
  queryKey: ["logros"],
  queryFn: async () => {
    const [{ data: st, error }, { data: rec }, { data: nv }] = await Promise.all([
      supabase.rpc("achievement_stats"),
      supabase.from("battle_records").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.rpc("naval_stats"),
    ]);
    if (error) throw error;
    return { stats: st ?? [], records: rec ?? [], naval: nv ?? [] };
  },
};

export const Route = createFileRoute("/_authenticated/logros")({
  head: () => ({ meta: [
    { title: "Medallas y méritos · Atalaya" },
    { name: "description", content: "Logros, ranking de comandantes, mejores batallas y unidades más destacadas del club." },
    { property: "og:title", content: "Medallas y méritos · Atalaya" },
    { property: "og:description", content: "Logros y ranking del club Atalaya Vigía." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(profileQuery), context.queryClient.ensureQueryData(logrosQuery)]),
  component: Logros,
});

const TIER_CLS = { bronce: "border-[#b87333] text-[#d9955a]", plata: "border-[#a8b0b8] text-[#d0d6dc]", oro: "border-[#d4af37] text-[#f0cf5a]" } as const;

const navalOf = (n?: { raids_won: number; defenses_won: number; loot: number }) => ({ raidsWon: n?.raids_won ?? 0, defensesWon: n?.defenses_won ?? 0, lootTotal: n?.loot ?? 0 });

function Logros() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data } = useSuspenseQuery(logrosQuery);
  const me = prof.user.id;
  const stats = data.stats.map((r) => {
    const s: PlayerStats = { battles: r.battles, wins: r.wins, losses: r.losses, draws: r.draws, renown: r.renown, regions: r.regions, spaceport: r.spaceport, conquestWins: r.conquest_wins, bigBattles: r.big_battles, enginesDestroyed: r.engines_destroyed, bestMargin: r.best_margin, honoursUsed: r.honours_used, ...navalOf(data.naval.find((n) => n.id === r.id)) };
    return { r, s, pts: score(s), done: ACHIEVEMENTS.filter((a) => a.done(s)) };
  }).sort((a, b) => b.pts - a.pts);
  const [who, setWho] = useState(me);
  const sel = stats.find((x) => x.r.id === who) ?? stats[0];
  const name = (id: string) => data.stats.find((p) => p.id === id)?.leader_name ?? "—";

  const best = [...data.records].filter((b) => b.result === "victoria").sort((a, b) => (b.vp_for - b.vp_against) - (a.vp_for - a.vp_against) || b.points - a.points).slice(0, 5);
  const mvps = new Map<string, number>();
  data.records.forEach((b) => { if (b.mvp) mvps.set(b.mvp, (mvps.get(b.mvp) ?? 0) + 1); });
  const topUnits = [...mvps].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Archivo de honores</p>
      <h1 className="mb-4 text-2xl text-primary glow md:text-3xl">Medallas y méritos</h1>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Ranking de comandantes">
          <ol className="space-y-1 text-sm">
            {stats.map((x, i) => (
              <li key={x.r.id}>
                <button onClick={() => setWho(x.r.id)} className={`flex w-full items-center gap-2 border px-2 py-1 text-left ${x.r.id === sel?.r.id ? "border-primary bg-accent" : "border-transparent"}`}>
                  <span className="w-5 text-muted-foreground">{i + 1}.</span>
                  <EmblemIcon id={x.r.map_emblem} color={x.r.map_color} size={18} />
                  <span className="flex-1 truncate">{x.r.leader_name}</span>
                  <span className="text-xs text-muted-foreground">★ {x.done.length}</span>
                  <span className="text-primary">{x.pts}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[10px] text-muted-foreground">Puntos = logros (bronce {TIER_POINTS.bronce} · plata {TIER_POINTS.plata} · oro {TIER_POINTS.oro}) + 10 por victoria + 3 por batalla + 5 por región + Renombre.</p>
        </Panel>
        <Panel title="Mejores batallas">
          {!best.length && <p className="text-sm text-muted-foreground">&gt; Aún no hay victorias registradas.</p>}
          <ol className="space-y-2 text-sm">
            {best.map((b) => (
              <li key={`${b.game_id}${b.user_id}`} className="border border-border p-2">
                <div className="text-primary">{name(b.user_id)} · {b.vp_for}–{b.vp_against} PV</div>
                <div className="text-xs text-muted-foreground">{b.points} pts{b.conquest ? " · Campaña" : ""} · {new Date(b.created_at).toLocaleDateString("es-ES")}{b.mvp ? ` · MVP: ${b.mvp}` : ""}</div>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Mejores unidades">
          {!topUnits.length && <p className="text-sm text-muted-foreground">&gt; Elige la unidad destacada al finalizar cada batalla.</p>}
          <ol className="space-y-1 text-sm">
            {topUnits.map(([u, n], i) => <li key={u} className="flex justify-between"><span>{i + 1}. {u}</span><span className="text-primary">{n}× MVP</span></li>)}
          </ol>
        </Panel>
      </div>

      {sel && (
        <Panel title={`Logros de ${sel.r.leader_name} · ${sel.done.length}/${ACHIEVEMENTS.length}`}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {ACHIEVEMENTS.map((a) => {
              const ok = a.done(sel.s); const pr = a.progress?.(sel.s);
              return (
                <div key={a.id} className={`flex gap-3 border p-2 ${ok ? TIER_CLS[a.tier] : "border-border opacity-50 grayscale"}`}>
                  <div className={`grid h-12 w-12 shrink-0 place-items-center border-2 text-2xl ${ok ? TIER_CLS[a.tier] : "border-border"}`}>{a.icon}</div>
                  <div className="min-w-0">
                    <div className="text-sm">{a.name}</div>
                    <div className="text-[11px] text-muted-foreground">{a.text}</div>
                    <div className="text-[10px] uppercase">{a.tier} · {TIER_POINTS[a.tier]} pts{!ok && pr ? ` · ${Math.min(pr[0], pr[1])}/${pr[1]}` : ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </CommandShell>
  );
}
