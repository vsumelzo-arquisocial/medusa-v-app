import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Minimize, Rocket, Swords } from "lucide-react";
import { EmblemIcon } from "@/components/EmblemIcon";
import { Globe } from "@/components/planet/Globe";
import { SystemView3D, type BodyOverlay } from "@/components/system/SystemView3D";
import { BODIES, bodyName } from "@/lib/system";
import { BODY_MAPS } from "@/lib/planet";
import { BODY_TEXTURES } from "@/lib/system-art";
import logo from "@/assets/atalaya-logo.png";

export interface DashPlayer {
  id: string;
  force_name: string | null;
  leader_name: string | null;
  army_faction: string | null;
  map_color: string | null;
  map_emblem: string | null;
}
export interface DashboardData {
  server_now: string;
  campaign: { number: number; phase: string } | null;
  bodies: { id: string; status: string; playable: boolean }[];
  players: DashPlayer[];
  regions: { id: number; body_id: string; owner_id: string | null; is_spaceport: boolean }[];
  fleet: {
    user_id: string;
    name: string;
    body_id: string | null;
    travel_from: string | null;
    force_name: string | null;
    map_color: string | null;
    map_emblem: string | null;
  }[];
  naval: {
    id: string;
    status: "pendiente" | "enfrentado";
    attacker_id: string;
    defender_id: string;
    block: number;
    deadline: string;
    attacker_hull: number | null;
    attacker_max: number | null;
    defender_hull: number | null;
    defender_max: number | null;
    mode: number | null;
  }[];
  ground: {
    id: string;
    kind: "claim" | "attack";
    region: string;
    body_id: string;
    attacker_id: string;
    defender_id: string | null;
    deadline: string;
  }[];
}

const CYCLE_MS = 30_000;

function useClock(serverNow: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const [skew, setSkew] = useState(0);
  useEffect(() => {
    if (serverNow) setSkew(new Date(serverNow).getTime() - Date.now());
  }, [serverNow]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now + skew;
}

function left(deadline: string, now: number) {
  const s = Math.max(0, Math.round((new Date(deadline).getTime() - now) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min ${s % 60} s`;
}

function Frame({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative flex min-h-0 flex-col overflow-hidden border border-primary/30 bg-black/60 ${className}`}
    >
      <h2 className="flex items-center gap-2 border-b border-primary/20 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.35em] text-primary/90">
        {icon}
        {title}
      </h2>
      <div className="relative min-h-0 flex-1">{children}</div>
    </section>
  );
}

/** Planeta que va cambiando: globo girando con las regiones de cada jugador y el reparto de conquista. */
function PlanetSpotlight({ data, idx }: { data: DashboardData; idx: number }) {
  const playable = BODIES.filter((b) => b.playable);
  const body = playable[idx % playable.length]!;
  const regions = data.regions.filter((r) => r.body_id === body.id);
  const owner = (id: string | null) => data.players.find((p) => p.id === id);
  const status = data.bodies.find((b) => b.id === body.id)?.status;
  const rows = useMemo(() => {
    const n = regions.length || 1;
    const by = new Map<string, number>();
    for (const r of regions) if (r.owner_id) by.set(r.owner_id, (by.get(r.owner_id) ?? 0) + 1);
    const out = [...by.entries()]
      .map(([id, c]) => ({ p: owner(id), c, pct: Math.round((c * 100) / n) }))
      .filter((x) => x.p)
      .sort((a, b) => b.c - a.c);
    const free = regions.filter((r) => !r.owner_id).length;
    return { out, free, freePct: Math.round((free * 100) / n), total: regions.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body.id, data.regions, data.players]);
  const styleFor = (id: number) => {
    const r = regions.find((x) => x.id === id);
    const p = owner(r?.owner_id ?? null);
    return { fill: p?.map_color ?? "transparent", label: r?.is_spaceport ? "✠" : undefined };
  };
  const ships = data.fleet.filter((f) => f.body_id === body.id);
  return (
    <div key={body.id} className="dash-fade flex h-full min-h-0 flex-col gap-3 p-4 lg:flex-row">
      <div className="relative mx-auto aspect-square w-[min(44%,34vh)] min-w-[140px] shrink-0 self-center">
        <div className="absolute inset-0 rounded-full shadow-[0_0_60px_rgba(120,190,255,.25)]" />
        {BODY_MAPS[body.id] ? (
          <Globe
            map={BODY_MAPS[body.id]}
            texture={BODY_TEXTURES[body.id]}
            styleFor={styleFor}
            selected={null}
            onSelect={() => {}}
            interactive={false}
          />
        ) : (
          <div
            className="planet-surface h-full w-full rounded-full shadow-[inset_-18px_-12px_36px_rgba(0,0,0,.85)]"
            style={{ backgroundImage: `url(${BODY_TEXTURES[body.id]})` }}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {body.kind === "moon"
            ? `Luna de ${bodyName(body.parent)}`
            : `Planeta · órbita ${body.orbit}`}{" "}
          · {body.biome}
        </p>
        <h3 className="text-2xl text-primary glow xl:text-3xl">{body.name}</h3>
        <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {rows.total} regiones ·{" "}
          {status === "open" ? (
            <span className="text-primary">abierto a la conquista</span>
          ) : (
            "bloqueado"
          )}
        </p>
        <ul className="min-h-0 flex-1 space-y-2 overflow-hidden">
          {rows.out.map(({ p, c, pct }) => (
            <li key={p!.id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <EmblemIcon id={p!.map_emblem} color={p!.map_color ?? undefined} size={18} />
                  <span className="truncate">{p!.force_name ?? p!.leader_name}</span>
                </span>
                <span className="whitespace-nowrap font-mono tabular-nums text-muted-foreground">
                  {c} · {pct} %
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden bg-white/10">
                <div
                  className="h-full transition-[width] duration-1000"
                  style={{
                    width: `${pct}%`,
                    background: p!.map_color ?? "#888",
                    boxShadow: `0 0 8px ${p!.map_color ?? "#888"}`,
                  }}
                />
              </div>
            </li>
          ))}
          <li className="pt-1 font-mono text-xs text-muted-foreground">
            Sin conquistar: {rows.free} ({rows.freePct} %)
          </li>
        </ul>
        {ships.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            En órbita:
            {ships.map((s) => (
              <span key={s.user_id} className="flex items-center gap-1 text-foreground">
                <EmblemIcon id={s.map_emblem} color={s.map_color ?? undefined} size={14} /> {s.name}
              </span>
            ))}
          </p>
        )}
        <div className="mt-3 flex gap-1" aria-hidden>
          {playable.map((b, i) => (
            <span
              key={b.id}
              className={`h-1 flex-1 ${i === idx % playable.length ? "bg-primary" : "bg-white/15"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HullMini({
  hull,
  max,
  color,
}: {
  hull: number | null;
  max: number | null;
  color: string;
}) {
  if (hull === null || !max) return null;
  const pct = Math.max(0, Math.min(100, (hull / max) * 100));
  return (
    <div className="mt-1 h-1 w-full overflow-hidden bg-white/10">
      <div className="h-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** Desplaza despacio una lista que no cabe (pantalla sin ratón), con pausa arriba y abajo. */
function useAutoScroll() {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    let pause = 120;
    const t = window.setInterval(() => {
      const el = ref.current;
      if (!el || el.scrollHeight <= el.clientHeight + 2) return;
      if (pause > 0) {
        pause--;
        return;
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        pause = 120;
        el.scrollTop = 0;
      } else el.scrollTop += 1;
    }, 50);
    return () => clearInterval(t);
  }, []);
  return ref;
}

function Battles({ data, now }: { data: DashboardData; now: number }) {
  const listRef = useAutoScroll();
  const p = (id: string | null) => data.players.find((x) => x.id === id);
  const name = (id: string | null) => p(id)?.force_name ?? p(id)?.leader_name ?? "Neutral";
  const total = data.naval.length + data.ground.length;
  if (!total)
    return (
      <div className="flex h-full items-center justify-center p-6 text-center font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Sin batallas en curso · el sistema guarda silencio
      </div>
    );
  return (
    <ul ref={listRef} className="h-full space-y-2 overflow-hidden p-3">
      {data.naval.map((n) => (
        <li
          key={n.id}
          className={`border-l-2 bg-white/5 p-2 ${n.status === "enfrentado" ? "border-red-500" : "border-amber-400"}`}
        >
          <p className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest">
            <span className={n.status === "enfrentado" ? "text-red-300" : "text-amber-200"}>
              <Rocket className="mr-1 inline size-3" />
              {n.status === "enfrentado"
                ? `Duelo naval · ${n.mode === 1 ? `ronda ${n.block}` : `bloque ${n.block}`}`
                : "Nave hostil en aproximación"}
            </span>
            <span className="text-muted-foreground">{left(n.deadline, now)}</span>
          </p>
          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
            <div className="min-w-0">
              <span className="flex items-center gap-1 truncate">
                <EmblemIcon
                  id={p(n.attacker_id)?.map_emblem}
                  color={p(n.attacker_id)?.map_color ?? undefined}
                  size={14}
                />
                {name(n.attacker_id)}
              </span>
              <HullMini
                hull={n.attacker_hull}
                max={n.attacker_max}
                color={p(n.attacker_id)?.map_color ?? "#7dd3fc"}
              />
            </div>
            <Swords className="size-4 text-muted-foreground" />
            <div className="min-w-0 text-right">
              <span className="flex items-center justify-end gap-1 truncate">
                {name(n.defender_id)}
                <EmblemIcon
                  id={p(n.defender_id)?.map_emblem}
                  color={p(n.defender_id)?.map_color ?? undefined}
                  size={14}
                />
              </span>
              <HullMini
                hull={n.defender_hull}
                max={n.defender_max}
                color={p(n.defender_id)?.map_color ?? "#fca5a5"}
              />
            </div>
          </div>
        </li>
      ))}
      {data.ground.map((g) => (
        <li key={g.id} className="border-l-2 border-orange-400 bg-white/5 p-2">
          <p className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest">
            <span className="text-orange-200">
              <Swords className="mr-1 inline size-3" />
              {g.kind === "claim" ? "Desembarco" : "Asalto"} · {g.region} · {bodyName(g.body_id)}
            </span>
            <span className="text-muted-foreground">{left(g.deadline, now)}</span>
          </p>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <EmblemIcon
              id={p(g.attacker_id)?.map_emblem}
              color={p(g.attacker_id)?.map_color ?? undefined}
              size={14}
            />
            <span className="truncate">{name(g.attacker_id)}</span>
            <span className="text-muted-foreground">contra</span>
            <span className="truncate">
              {g.defender_id ? name(g.defender_id) : "defensas neutrales"}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}

/** Dashboard de campaña para el televisor del club: sistema en vivo, planeta destacado y batallas. */
export function CampaignDashboard({
  data,
  error,
}: {
  data: DashboardData | undefined;
  error: boolean;
}) {
  const now = useClock(data?.server_now);
  const [idx, setIdx] = useState(0);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => i + 1), CYCLE_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    // Recarga completa cada 6 h para que una pantalla encendida días no acumule memoria
    const r = window.setTimeout(() => location.reload(), 6 * 3600_000);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      clearTimeout(r);
    };
  }, []);
  const overlays = useMemo(() => {
    const out: Record<string, BodyOverlay> = {};
    for (const b of BODIES) {
      const ships = data?.fleet.filter((f) => f.body_id === b.id) ?? [];
      out[b.id] = {
        locked: !!b.playable && data?.bodies.find((x) => x.id === b.id)?.status !== "open",
        ships: ships.length ? (
          <>
            {ships.slice(0, 6).map((s) => (
              <EmblemIcon
                key={s.user_id}
                id={s.map_emblem}
                color={s.map_color ?? undefined}
                size={16}
              />
            ))}
          </>
        ) : null,
      };
    }
    return out;
  }, [data]);
  const inWarp = data?.fleet.filter((f) => !f.body_id) ?? [];
  const clock = new Date(now);
  return (
    <main className="dash flex h-screen flex-col gap-3 overflow-hidden bg-black p-3 text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="size-10" />
          <div>
            <h1 className="text-xl text-primary glow">
              Sistema Medusa · Campaña nº {data?.campaign?.number ?? 1}
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
              {data?.campaign?.phase === "conquista" ? "Campaña en curso" : "Fase de preparación"} ·{" "}
              {data?.players.length ?? 0} comandantes · {data?.fleet.length ?? 0} naves
              {error && <span className="ml-2 text-amber-300">· sin conexión, reintentando…</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl tabular-nums text-primary">
            {clock.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            type="button"
            className="dash-tool border border-primary/40 p-2 text-primary"
            aria-label={full ? "Salir de pantalla completa" : "Pantalla completa"}
            onClick={() =>
              document.fullscreenElement
                ? void document.exitFullscreen()
                : void document.documentElement.requestFullscreen()
            }
          >
            {full ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
          <a
            href="/"
            className="dash-tool border border-primary/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-primary"
          >
            Salir
          </a>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[2fr_1fr] lg:grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Frame
          title="Sistema Medusa · posiciones en directo"
          className="min-h-[50vh] lg:row-span-2 lg:min-h-0"
        >
          <SystemView3D
            overlays={overlays}
            layers={{ labels: true, ships: true, locks: true }}
            selected={null}
            onSelect={() => {}}
            onOpen={() => {}}
            resetSignal={0}
          />
          {inWarp.length > 0 && (
            <div className="pointer-events-none absolute bottom-3 left-3 max-w-[60%] border border-fuchsia-400/40 bg-black/60 px-3 py-2 backdrop-blur">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-fuchsia-200">
                En el warp
              </p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {inWarp.map((s) => (
                  <li key={s.user_id} className="flex items-center gap-1">
                    <EmblemIcon id={s.map_emblem} color={s.map_color ?? undefined} size={14} />{" "}
                    {s.name}
                    {s.travel_from && (
                      <span className="text-muted-foreground">
                        · salió de {bodyName(s.travel_from)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Frame>
        <Frame title="Estado de conquista">
          {data ? <PlanetSpotlight data={data} idx={idx} /> : <Loading />}
        </Frame>
        <Frame
          title={`Batallas en curso${data ? ` · ${data.naval.length + data.ground.length}` : ""}`}
          icon={<Swords className="size-3.5" />}
        >
          {data ? <Battles data={data} now={now} /> : <Loading />}
        </Frame>
      </div>
    </main>
  );
}

function Loading() {
  return (
    <p className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground motion-safe:animate-pulse">
      Estableciendo enlace…
    </p>
  );
}
