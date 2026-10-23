import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { armySelectionLabels } from "@/lib/warhammer40k-onboarding";
import { OrbitalView } from "@/components/bridge/OrbitalView";
import { DailyIncome } from "@/components/ship/DailyIncome";
import { ThreatAlerts, useThreats } from "@/components/bridge/ThreatAlerts";
import { dailyIncomeQuery } from "@/lib/daily-income";
import { bridgeImageFor } from "@/lib/bridges";
import { RegionBonuses } from "@/components/planet/RegionBonuses";

export const Route = createFileRoute("/_authenticated/puente")({
  head: () => ({ meta: [{ title: "Puente de mando — Atalaya" }, { name: "description", content: "Tu puente de mando en órbita sobre Medusa V." }, { property: "og:title", content: "Puente de mando — Atalaya" }, { property: "og:description", content: "Tu nave y el estado de conquista de Medusa V." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(profileQuery);
    await context.queryClient.ensureQueryData(dailyIncomeQuery);
  },
  component: Puente,
});

const STATIONS = [
  ["/sistema", "Cartografía", "Conquista del Sistema Medusa."],
  ["/nave", "Ingeniería", "Módulos y obras de la nave."],
  ["/partidas", "Táctica", "Desafíos y batallas."],
  ["/listas", "Estado mayor", "Listas de ejército."],
  ["/reclutar", "Reclutamiento", "Recluta las unidades de tus listas."],
  ["/unidades", "Unidades", "Fichas, bajas, reparaciones e historial de tus unidades."],
] as const;

function Puente() {
  const { data } = useSuspenseQuery(profileQuery);
  const p = data.profile;

  if (!p?.approved) {
    return (
      <CommandShell isAdmin={data.isAdmin}>
        <Panel title="Acceso pendiente">
          <p>&gt; Tu registro ha llegado a la noosfera.</p>
          <p className="mt-2 text-muted-foreground">Un administrador del club debe aprobar tu cuenta antes de que puedas elegir tu ejército. Vuelve más tarde.</p>
          <p className="mt-4 text-xs text-muted-foreground">{data.user.email}</p>
        </Panel>
      </CommandShell>
    );
  }
  if (!p.oath_sworn_at || !p.army_faction) return <Navigate to="/juramento" />;

  return <Bridge data={data} />;
}

function Bridge({ data }: { data: any }) {
  const p = data.profile;
  const army = armySelectionLabels(p.army_race, p.army_faction, p.army_variant);
  const navigate = useNavigate();
  const { data: ship } = useQuery({ queryKey: ["ship-name", data.user.id], queryFn: async () => (await supabase.from("ships").select("name").eq("user_id", data.user.id).maybeSingle()).data });
  const { data: ownedTypes } = useQuery({ queryKey: ["owned-region-types", data.user.id], queryFn: async () => ((await supabase.from("regions").select("type").eq("owner_id", data.user.id)).data ?? []).map((r) => r.type) });
  const t = useThreats(data.user.id);
  const threats = { planet: t.regionAttacks.length, naval: t.naval.length };
  return (
    <CommandShell isAdmin={data.isAdmin}>
      <section className="relative -mx-4 overflow-hidden border border-border sm:mx-0">
        <img src={bridgeImageFor(p.army_race, p.army_faction)} alt="" aria-hidden width={1600} height={640} className="pointer-events-none absolute inset-x-0 top-0 h-[420px] w-full object-cover opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative p-4 md:p-6">
          <ThreatAlerts uid={data.user.id} />
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Sanctum de mando · cubierta principal</p>
              <h1 className="text-2xl text-primary glow md:text-3xl">Puente de mando</h1>
            </div>
            <p className="text-xs uppercase text-muted-foreground">{p.force_name}</p>
          </div>
          <div className="relative w-full border border-primary/40 shadow-[0_0_60px_color-mix(in_oklab,var(--primary)_25%,transparent)]">
            <OrbitalView race={p.army_race} faction={p.army_faction} shipName={ship?.name ?? null} onPlanetClick={(body) => navigate({ to: "/planeta/$body", params: { body } })} threats={threats} />
          </div>

          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
              <Panel>
                <Link to="/perfil" className="flex items-center gap-3">
                  {data.portraitUrl && <img src={data.portraitUrl} alt={p.leader_name ?? "Líder"} className="h-16 w-16 shrink-0 border border-border object-cover" />}
                  <div className="min-w-0">
                    <h2 className="truncate text-lg text-primary glow">{p.leader_name}</h2>
                    <p className="truncate text-xs uppercase text-primary">{army.race} · {army.faction}</p>
                    {army.variant && <p className="truncate text-xs text-muted-foreground">{army.variant}</p>}
                  </div>
                </Link>
              </Panel>
              <Panel title="Créditos imperiales"><p className="text-3xl text-primary glow">{p.imperial_credits}</p><DailyIncome /></Panel>
              <Panel title="Renombre"><p className="text-3xl text-primary glow">{p.renown}</p></Panel>
            </div>
            <div className="space-y-4">
              <Panel title="Bonificaciones de región"><RegionBonuses owned={ownedTypes ?? []} /></Panel>
              <Panel title="Estaciones del puente">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {STATIONS.map(([to, t, d]) => (
                    <Link key={to} to={to} className="group border border-border bg-background/60 p-3 transition hover:border-primary hover:bg-accent">
                      <div className="text-sm text-primary group-hover:glow">▸ {t}</div>
                      <div className="text-xs text-muted-foreground">{d}</div>
                    </Link>
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </section>
    </CommandShell>
  );
}

