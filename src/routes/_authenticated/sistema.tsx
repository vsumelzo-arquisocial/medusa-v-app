import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { EmblemIcon } from "@/components/EmblemIcon";
import { CampaignLegend } from "@/components/planet/CampaignLegend";
import { profileQuery } from "@/lib/profile";
import { campaignQuery } from "@/lib/campaign-queries";
import { BODIES, bodyById, bodyName, formatDuration, type BodyInfo } from "@/lib/system";
import { BODY_TEXTURES } from "@/lib/system-art";
import { CAMPAIGN_FORCES, FORCE_CLASSES, FORCE_NAMES, regionForce } from "@/lib/campaign-forces";

export const Route = createFileRoute("/_authenticated/sistema")({
  head: () => ({
    meta: [
      { title: "Sistema Medusa — Campaña · Atalaya" },
      { name: "description", content: "Vista del Sistema Medusa: el sol, nueve planetas y sus lunas, naves en órbita y el dominio de cada bando." },
      { property: "og:title", content: "Sistema Medusa — Campaña" },
      { property: "og:description", content: "Planetas en órbita, naves localizadas y control de cada bando en todo el sistema." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(profileQuery), context.queryClient.ensureQueryData(campaignQuery)]),
  component: Sistema,
});

const ASPECT = 1.6, TILT = 0.5;
const orbitRadius = (o: number) => 6 + o * 4.4; // % of width
function position(b: BodyInfo, t: number): { x: number; y: number } {
  if (b.kind === "moon" && b.parent) {
    const p = position(bodyById(b.parent)!, t);
    const k = b.id.endsWith("b") ? 1 : 0;
    const a = t / (9 + k * 4) + k * Math.PI;
    const r = 3.4 + k * 1.2;
    return { x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) * TILT * ASPECT };
  }
  const r = orbitRadius(b.orbit);
  const a = (t * 2 * Math.PI) / (40 + b.orbit * 30) + b.orbit * 1.7;
  return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) * TILT * ASPECT };
}

function Sistema() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data } = useSuspenseQuery(campaignQuery);
  const navigate = useNavigate();
  const me = prof.user.id;
  const [t, setT] = useState(0);
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (now: number) => { setT((now - start) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const status = (id: string) => data.bodies.find((b) => b.id === id)?.status;
  const regionsOf = (id: string) => data.regions.filter((r) => r.body_id === id);
  const fleetAt = (id: string) => data.fleet.filter((f) => f.body_id === id);
  const inWarp = data.fleet.filter((f) => !f.body_id);
  const myShip = data.fleet.find((f) => f.user_id === me);
  const phase = data.campaign?.phase ?? "aproximacion";
  const share = (id: string) => {
    const rs = regionsOf(id); const n = rs.length || 1;
    return [...CAMPAIGN_FORCES, "neutral" as const].map((f) => ({ f, pct: Math.round((100 * rs.filter((r) => regionForce(r.owner_id, data.players) === f).length) / n) }));
  };
  const sel = focus ? bodyById(focus) : null;

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Campaña nº {data.campaign?.number ?? 1}</p>
          <h1 className="text-2xl text-primary glow md:text-3xl">Sistema Medusa</h1>
        </div>
        <div className={`border px-3 py-1 text-xs uppercase ${phase === "conquista" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
          {phase === "conquista" ? "Campaña en curso" : phase === "finalizada" ? "Campaña finalizada" : "Fase 0 · Preparación"}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Panel>
          <div className="system-space relative w-full overflow-hidden" style={{ aspectRatio: `${ASPECT}` }}>
            <svg viewBox="0 0 100 62.5" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {[...new Set(BODIES.filter((b) => b.kind === "planet").map((b) => b.orbit))].map((o) => (
                <ellipse key={o} cx="50" cy="31.25" rx={orbitRadius(o)} ry={orbitRadius(o) * TILT} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.15" className="text-primary" />
              ))}
            </svg>
            <div className="system-sun absolute left-1/2 top-1/2 aspect-square w-[7%] -translate-x-1/2 -translate-y-1/2 rounded-full" aria-hidden="true" />
            {[...BODIES].sort((a, b) => position(a, t).y - position(b, t).y).map((b) => {
              const p = position(b, t);
              const w = (b.kind === "moon" ? 2.2 : 4.2) * b.size + (b.kind === "moon" ? 0.8 : 0);
              const locked = b.playable && status(b.id) !== "open";
              const ships = fleetAt(b.id);
              const lx = 50 + (50 - p.x) * 0.8, ly = 50 + (50 - p.y) * 0.8;
              return (
                <button key={b.id} type="button" onClick={() => setFocus(b.id)} onDoubleClick={() => b.playable && navigate({ to: "/planeta/$body", params: { body: b.id } })}
                  title={b.name} aria-label={`${b.name}${locked ? " (bloqueado)" : ""}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none ${focus === b.id ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${w}%`, aspectRatio: "1" }}>
                  <span className="planet-spin absolute inset-0 rounded-full" style={{ backgroundImage: `url(${BODY_TEXTURES[b.id]})`, animationDuration: `${20 + b.orbit * 6}s` }} />
                  <span className="planet-shade absolute inset-0 rounded-full" style={{ ["--lx" as string]: `${lx}%`, ["--ly" as string]: `${ly}%` }} />
                  {locked && <Lock className="absolute -right-1 -top-1 h-3 w-3 text-muted-foreground" aria-hidden="true" />}
                  {ships.length > 0 && <span className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 gap-0.5">{ships.slice(0, 4).map((s) => <EmblemIcon key={s.user_id} id={s.map_emblem} color={s.map_color} size={12} />)}</span>}
                  {b.kind === "planet" && <span className="pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-wider text-muted-foreground">{b.name.replace(" (Medusa I)", "")}</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Pulsa un planeta o luna para ver su estado; doble clic o «Ver regiones» para abrir su mapa.</p>
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Dominio global del sistema</p>
            <CampaignLegend regions={data.regions} players={data.players} />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title={sel ? sel.name : "Cuerpo celeste"}>
            {!sel && <p className="text-sm text-muted-foreground">&gt; Selecciona un planeta o una luna.</p>}
            {sel && (
              <div className="space-y-2 text-sm">
                <p className="text-primary">{sel.kind === "moon" ? `Luna de ${bodyName(sel.parent)}` : `Planeta · órbita ${sel.orbit}`}</p>
                <p className="text-xs text-muted-foreground">{sel.biome}</p>
                {!sel.playable && <p className="text-xs text-muted-foreground">No habitable: no se puede desembarcar ni viajar aquí.</p>}
                {sel.playable && <>
                  <p className="text-xs">{regionsOf(sel.id).length} regiones · {status(sel.id) === "open" ? <span className="text-primary">Abierto a la conquista</span> : <span className="text-muted-foreground">Bloqueado</span>}</p>
                  <ul className="grid grid-cols-2 gap-1 text-xs">{share(sel.id).map(({ f, pct }) => <li key={f} className={FORCE_CLASSES[f]}>■ {FORCE_NAMES[f]} {pct} %</li>)}</ul>
                  <p className="text-xs">Naves en órbita: {fleetAt(sel.id).map((s) => s.name).join(", ") || "ninguna"}</p>
                  <Link to="/planeta/$body" params={{ body: sel.id }} className="block border border-primary px-3 py-2 text-center text-xs uppercase text-primary">Ver regiones</Link>
                </>}
              </div>
            )}
          </Panel>

          <Panel title="Tu nave">
            {!myShip && <p className="text-sm">&gt; Aún no tienes nave. <Link to="/nave" className="text-primary underline">Ir a Nave</Link></p>}
            {myShip?.body_id && <p className="text-sm"><Link to="/planeta/$body" params={{ body: myShip.body_id }} className="text-primary underline underline-offset-4">Estacionada en {bodyName(myShip.body_id)}</Link>.</p>}
            {myShip && !myShip.body_id && <p className="text-sm">En el warp rumbo a <span className="text-primary">{bodyName(myShip.destination)}</span>{myShip.arrives_at && <> · llega en {formatDuration(Math.max(0, (new Date(myShip.arrives_at).getTime() - Date.now()) / 1000))}</>}.</p>}
            {myShip && <Link to="/mando" className="mt-2 block text-xs text-primary underline">Poner rumbo desde Mando</Link>}
          </Panel>

          <Panel title={`En el warp (${inWarp.length})`}>
            {!inWarp.length && <p className="text-sm text-muted-foreground">&gt; Ninguna nave viajando.</p>}
            <ul className="space-y-1 text-sm">{inWarp.map((s) => <li key={s.user_id}><EmblemIcon id={s.map_emblem} color={s.map_color} size={14} /> {s.name} · <span className="text-xs text-muted-foreground">{s.user_id === me ? `rumbo a ${bodyName(s.destination)}` : `salió de ${bodyName(s.travel_from)} · destino desconocido`}</span></li>)}</ul>
          </Panel>

          <Panel title="Planetas y lunas">
            <ul className="space-y-1 text-xs">
              {BODIES.filter((b) => b.playable).map((b) => {
                const s = share(b.id); const lead = s.filter((x) => x.f !== "neutral").sort((a, z) => z.pct - a.pct)[0];
                return <li key={b.id} className="flex justify-between gap-2">
                  <Link to="/planeta/$body" params={{ body: b.id }} className="text-primary underline">{b.kind === "moon" ? "↳ " : ""}{b.name}</Link>
                  <span className="text-muted-foreground">{status(b.id) === "open" ? "abierto" : "bloqueado"}{lead && lead.pct > 0 ? ` · ${FORCE_NAMES[lead.f]} ${lead.pct} %` : ""}</span>
                </li>;
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </CommandShell>
  );
}
