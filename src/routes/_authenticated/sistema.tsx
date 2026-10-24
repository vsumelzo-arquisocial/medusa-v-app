import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { EmblemIcon } from "@/components/EmblemIcon";
import { CampaignLegend } from "@/components/planet/CampaignLegend";
import { profileQuery } from "@/lib/profile";
import { campaignQuery } from "@/lib/campaign-queries";
import { BODIES, bodyById, bodyName, formatDuration } from "@/lib/system";
import {
  SystemView3D,
  type BodyOverlay,
  type SystemLayers,
} from "@/components/system/SystemView3D";
import { CAMPAIGN_FORCES, FORCE_CLASSES, FORCE_NAMES, regionForce } from "@/lib/campaign-forces";

export const Route = createFileRoute("/_authenticated/sistema")({
  head: () => ({
    meta: [
      { title: "Sistema Medusa — Campaña · Atalaya" },
      {
        name: "description",
        content:
          "Vista del Sistema Medusa: el sol, nueve planetas y sus lunas, naves en órbita y el dominio de cada bando.",
      },
      { property: "og:title", content: "Sistema Medusa — Campaña" },
      {
        property: "og:description",
        content:
          "Planetas en órbita, naves localizadas y control de cada bando en todo el sistema.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(profileQuery),
      context.queryClient.ensureQueryData(campaignQuery),
    ]),
  component: Sistema,
});

function Sistema() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data } = useSuspenseQuery(campaignQuery);
  const navigate = useNavigate();
  const me = prof.user.id;
  const [focus, setFocus] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [layers, setLayers] = useState<SystemLayers>(() => {
    try {
      const v = localStorage.getItem("sistema-capas");
      if (v)
        return {
          labels: true,
          ships: true,
          locks: true,
          ...(JSON.parse(v) as Partial<SystemLayers>),
        };
    } catch {
      /* sin almacenamiento */
    }
    return { labels: true, ships: true, locks: true };
  });
  useEffect(() => {
    try {
      localStorage.setItem("sistema-capas", JSON.stringify(layers));
    } catch {
      /* sin almacenamiento */
    }
  }, [layers]);

  const status = (id: string) => data.bodies.find((b) => b.id === id)?.status;
  const regionsOf = (id: string) => data.regions.filter((r) => r.body_id === id);
  const fleetAt = (id: string) => data.fleet.filter((f) => f.body_id === id);
  const inWarp = data.fleet.filter((f) => !f.body_id);
  const myShip = data.fleet.find((f) => f.user_id === me);
  const phase = data.campaign?.phase ?? "aproximacion";
  const share = (id: string) => {
    const rs = regionsOf(id);
    const n = rs.length || 1;
    return [...CAMPAIGN_FORCES, "neutral" as const].map((f) => ({
      f,
      pct: Math.round(
        (100 * rs.filter((r) => regionForce(r.owner_id, data.players) === f).length) / n,
      ),
    }));
  };
  const sel = focus ? bodyById(focus) : null;
  const overlays = Object.fromEntries(
    BODIES.map((b) => {
      const ships = fleetAt(b.id);
      return [
        b.id,
        {
          locked: b.playable && status(b.id) !== "open",
          ships: ships.length ? (
            <>
              {ships.slice(0, 5).map((s) => (
                <EmblemIcon key={s.user_id} id={s.map_emblem} color={s.map_color} size={14} />
              ))}
              {ships.length > 5 && (
                <span className="text-[9px] text-white/70">+{ships.length - 5}</span>
              )}
            </>
          ) : null,
        },
      ];
    }),
  ) as Record<string, BodyOverlay>;

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Campaña nº {data.campaign?.number ?? 1}
          </p>
          <h1 className="text-2xl text-primary glow md:text-3xl">Sistema Medusa</h1>
        </div>
        <div
          className={`border px-3 py-1 text-xs uppercase ${phase === "conquista" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          {phase === "conquista"
            ? "Campaña en curso"
            : phase === "finalizada"
              ? "Campaña finalizada"
              : "Fase 0 · Preparación"}
        </div>
      </div>

      <section
        className="relative -mx-4 overflow-hidden border-y border-primary/30 sm:mx-0 sm:border"
        aria-label="Vista del Sistema Medusa"
      >
        <div className="relative h-[68vh] min-h-[420px] w-full md:h-auto md:aspect-[16/9] md:max-h-[82vh]">
          <SystemView3D
            overlays={overlays}
            layers={layers}
            selected={focus}
            onSelect={setFocus}
            onOpen={(id) => navigate({ to: "/planeta/$body", params: { body: id } })}
            resetSignal={reset}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3">
            <div
              className="pointer-events-auto flex flex-wrap gap-1"
              role="group"
              aria-label="Capas del mapa"
            >
              {(
                [
                  ["labels", "Nombres"],
                  ["ships", "Naves"],
                  ["locks", "Bloqueos"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={layers[k]}
                  onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}
                  className={`border px-2 py-1 font-mono text-[10px] uppercase tracking-widest backdrop-blur ${layers[k] ? "border-primary/70 bg-black/50 text-primary" : "border-white/15 bg-black/30 text-white/50"}`}
                >
                  {l}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  setLayers((x) =>
                    x.labels || x.ships || x.locks
                      ? { labels: false, ships: false, locks: false }
                      : { labels: true, ships: true, locks: true },
                  )
                }
                className="border border-white/15 bg-black/30 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/70 backdrop-blur"
              >
                {layers.labels || layers.ships || layers.locks ? "Vista limpia" : "Mostrar todo"}
              </button>
            </div>
            {focus && (
              <button
                type="button"
                onClick={() => {
                  setFocus(null);
                  setReset((n) => n + 1);
                }}
                className="pointer-events-auto border border-primary/70 bg-black/50 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-primary backdrop-blur"
              >
                ← Vista general
              </button>
            )}
          </div>
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center font-mono text-[10px] uppercase tracking-widest text-white/40">
            Arrastra para girar · rueda o pellizco para acercar · pulsa un planeta · doble clic abre
            sus regiones
          </p>
        </div>
      </section>

      <div className="mt-4 space-y-4">
        <Panel>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            Dominio global del sistema
          </p>
          <CampaignLegend regions={data.regions} players={data.players} />
        </Panel>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Panel title={sel ? sel.name : "Cuerpo celeste"}>
            {!sel && (
              <p className="text-sm text-muted-foreground">
                &gt; Selecciona un planeta o una luna.
              </p>
            )}
            {sel && (
              <div className="space-y-2 text-sm">
                <p className="text-primary">
                  {sel.kind === "moon"
                    ? `Luna de ${bodyName(sel.parent)}`
                    : `Planeta · órbita ${sel.orbit}`}
                </p>
                <p className="text-xs text-muted-foreground">{sel.biome}</p>
                {!sel.playable && (
                  <p className="text-xs text-muted-foreground">
                    No conquistable: tu nave puede viajar y orbitar aquí, pero no hay regiones donde
                    desembarcar.
                  </p>
                )}
                {sel.playable && (
                  <>
                    <p className="text-xs">
                      {regionsOf(sel.id).length} regiones ·{" "}
                      {status(sel.id) === "open" ? (
                        <span className="text-primary">Abierto a la conquista</span>
                      ) : (
                        <span className="text-muted-foreground">Bloqueado</span>
                      )}
                    </p>
                    <ul className="grid grid-cols-2 gap-1 text-xs">
                      {share(sel.id).map(({ f, pct }) => (
                        <li key={f} className={FORCE_CLASSES[f]}>
                          ■ {FORCE_NAMES[f]} {pct} %
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs">
                      Naves en órbita:{" "}
                      {fleetAt(sel.id)
                        .map((s) => s.name)
                        .join(", ") || "ninguna"}
                    </p>
                    <Link
                      to="/planeta/$body"
                      params={{ body: sel.id }}
                      className="block border border-primary px-3 py-2 text-center text-xs uppercase text-primary"
                    >
                      Ver regiones
                    </Link>
                  </>
                )}
              </div>
            )}
          </Panel>

          <Panel title="Tu nave">
            {!myShip && (
              <p className="text-sm">
                &gt; Aún no tienes nave.{" "}
                <Link to="/nave" className="text-primary underline">
                  Ir a Nave
                </Link>
              </p>
            )}
            {myShip?.body_id && (
              <p className="text-sm">
                <Link
                  to="/planeta/$body"
                  params={{ body: myShip.body_id }}
                  className="text-primary underline underline-offset-4"
                >
                  Estacionada en {bodyName(myShip.body_id)}
                </Link>
                .
              </p>
            )}
            {myShip && !myShip.body_id && (
              <p className="text-sm">
                En el warp rumbo a{" "}
                <span className="text-primary">{bodyName(myShip.destination)}</span>
                {myShip.arrives_at && (
                  <>
                    {" "}
                    · llega en{" "}
                    {formatDuration(
                      Math.max(0, (new Date(myShip.arrives_at).getTime() - Date.now()) / 1000),
                    )}
                  </>
                )}
                .
              </p>
            )}
            {myShip && (
              <Link to="/mando" className="mt-2 block text-xs text-primary underline">
                Poner rumbo desde Mando
              </Link>
            )}
          </Panel>

          <Panel title={`En el warp (${inWarp.length})`}>
            {!inWarp.length && (
              <p className="text-sm text-muted-foreground">&gt; Ninguna nave viajando.</p>
            )}
            <ul className="space-y-1 text-sm">
              {inWarp.map((s) => (
                <li key={s.user_id}>
                  <EmblemIcon id={s.map_emblem} color={s.map_color} size={14} /> {s.name} ·{" "}
                  <span className="text-xs text-muted-foreground">
                    {s.user_id === me
                      ? `rumbo a ${bodyName(s.destination)}`
                      : `salió de ${bodyName(s.travel_from)} · destino desconocido`}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Planetas y lunas">
            <ul className="space-y-1 text-xs">
              {BODIES.filter((b) => b.playable).map((b) => {
                const s = share(b.id);
                const lead = s.filter((x) => x.f !== "neutral").sort((a, z) => z.pct - a.pct)[0];
                return (
                  <li key={b.id} className="flex justify-between gap-2">
                    <Link
                      to="/planeta/$body"
                      params={{ body: b.id }}
                      className="text-primary underline"
                    >
                      {b.kind === "moon" ? "↳ " : ""}
                      {b.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {status(b.id) === "open" ? "abierto" : "bloqueado"}
                      {lead && lead.pct > 0 ? ` · ${FORCE_NAMES[lead.f]} ${lead.pct} %` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </CommandShell>
  );
}
