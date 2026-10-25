import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Wrench, Boxes, Shield, Radio, Command, Hammer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommandShell } from "@/components/CommandShell";
import { Button } from "@/components/ui/button";
import { profileQuery } from "@/lib/profile";
import { shipQuery } from "@/lib/ship-queries";
import { fleetFor, fleetId, moduleName, hullRepairCost } from "@/lib/ship-identity";
import { raidError } from "@/lib/naval";
import { ShipWorkQueue } from "@/components/ship/ShipWorkQueue";
import { DailyIncome } from "@/components/ship/DailyIncome";
import { dailyIncomeQuery } from "@/lib/daily-income";
import { shipUpgradeCost } from "@/lib/ship-upgrade-cost";
import {
  ShipBlueprint,
  STATE_COLOR,
  STATE_LABEL,
  moduleState,
} from "@/components/ship/ShipBlueprint";
import { ShipIncome } from "@/components/ship/ShipIncome";
import { moduleEffect } from "@/lib/module-effects";

export const Route = createFileRoute("/_authenticated/nave")({
  head: () => ({
    meta: [
      { title: "Nave capital — Atalaya 40.000" },
      {
        name: "description",
        content:
          "Tu nave racial: casco persistente, bodega de unidades por OC, módulos y reparaciones.",
      },
      { property: "og:title", content: "Nave capital — Atalaya 40.000" },
      {
        property: "og:description",
        content: "Gestiona tu nave, protege tus créditos y prepara el combate naval de Medusa V.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(profileQuery),
      context.queryClient.ensureQueryData(shipQuery),
      context.queryClient.ensureQueryData(dailyIncomeQuery),
    ]),
  component: Nave,
});
function until(value: string) {
  return new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}
function Nave() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data } = useSuspenseQuery(shipQuery);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("puente");
  const [busy, setBusy] = useState(false);
  const identity = fleetId(prof.profile?.army_race, prof.profile?.army_faction);
  const fleet = fleetFor(prof.profile?.army_race, prof.profile?.army_faction);
  const refresh = () => {
    for (const key of ["ship", "profile", "daily-income", "naval-raids", "income-breakdown"])
      void qc.invalidateQueries({ queryKey: [key] });
  };
  async function action(
    fn: () => PromiseLike<{ error: { message: string } | null }>,
    success: string,
  ) {
    setBusy(true);
    try {
      const result = await fn();
      if (result.error) toast.error(raidError(result.error.message));
      else {
        toast.success(success);
        refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  const effective = (id: string) => {
    const m = data.modules.find((x) => x.module === id);
    return m?.damaged ? 0 : (m?.level ?? 0);
  };
  const t = data.types.find((x) => x.id === selected);
  const m = data.modules.find((x) => x.module === selected);
  const queued = data.queue.filter((x) => x.module === selected && x.kind === "build");
  const projected = (m?.level ?? 0) + queued.length;
  const queueFull = data.queue.length >= 5;
  const hullQueued = data.queue.some((x) => x.kind === "hull_repair");
  const repairQueued = data.queue.some((x) => x.module === selected && x.kind === "module_repair");
  const used =
    data.modules.filter(
      (x) => data.types.some((t) => t.id === x.module) && (x.level > 0 || x.building_until),
    ).length +
    new Set(
      data.queue
        .filter(
          (q) =>
            q.kind === "build" &&
            !data.modules.some((m) => m.module === q.module && (m.level > 0 || m.building_until)),
        )
        .map((q) => q.module),
    ).size;
  const ship = data.ship;
  const missing = Math.max(0, data.status.max_hull - (ship?.hull_hp ?? 0));
  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <div className={fleet.theme}>
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase text-muted-foreground">{fleet.name} · Medusa V</p>
            <h1 className="font-display text-3xl text-primary">
              {ship?.name ?? "Tu nave capital"}
            </h1>
          </div>
          {ship && (
            <Button
              variant="ghost"
              size="icon"
              title="Renombrar nave"
              aria-label="Renombrar nave"
              onClick={() => {
                const n = prompt("Nombre de la nave", ship.name);
                if (n)
                  void action(() => supabase.rpc("rename_ship", { _name: n }), "Nombre guardado");
              }}
            >
              <Pencil />
            </Button>
          )}
        </header>
        {ship ? (
          <div className="mb-5">
            <ShipBlueprint
              fleet={identity}
              fleetName={fleet.name}
              shipName={ship.name}
              modules={data.modules}
              maxLevels={Object.fromEntries(data.types.map((x) => [x.id, x.max_level]))}
              hull={ship.hull_hp ?? data.status.max_hull}
              maxHull={data.status.max_hull}
              selected={selected}
              onSelect={(id) => {
                setSelected(id);
                document
                  .getElementById("module-detail")
                  ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
            />
          </div>
        ) : (
          <div className="relative mb-5 overflow-hidden bg-ship-space">
            <img
              src={fleet.image}
              alt={fleet.name}
              width={768}
              height={512}
              className="mx-auto aspect-[3/2] max-h-[440px] w-full object-contain"
            />
            <div className="absolute bottom-3 left-3 border-l-2 border-primary bg-background/90 px-3 py-2 text-xs">
              <p className="text-primary">{fleet.specialty}</p>
              <p className="text-muted-foreground">Casco racial {fleet.hull} · Órbita alta</p>
            </div>
          </div>
        )}
        {!ship ? (
          <form
            className="flex flex-wrap gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void action(() => supabase.rpc("create_ship", { _name: name }), "Nave preparada");
            }}
          >
            <input
              aria-label="Nombre de la nueva nave"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={100}
              required
              placeholder="Nombre de tu nave"
              className="min-w-0 flex-1 border border-input bg-background px-3 py-2"
            />
            <Button disabled={busy} type="submit">
              <Command />
              Tomar el mando
            </Button>
          </form>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 border-y border-border py-4 lg:grid-cols-4">
              <div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield size={16} />
                  Casco
                </p>
                <p className="mt-1 text-2xl text-primary">
                  {ship.hull_hp}/{data.status.max_hull}
                </p>
                <progress
                  className="ship-progress mt-2 w-full"
                  value={ship.hull_hp ?? 0}
                  max={data.status.max_hull}
                />
                {ship.hull_repair_until ? (
                  <p className="mt-2 text-xs">Reparando hasta {until(ship.hull_repair_until)}</p>
                ) : (
                  missing > 0 && (
                    <Button
                      className="mt-2 h-auto whitespace-normal text-xs"
                      variant="outline"
                      disabled={busy || data.status.busy || queueFull || hullQueued}
                      onClick={() =>
                        void action(
                          () => supabase.rpc("repair_hull"),
                          "Reparación de casco añadida a la cola",
                        )
                      }
                    >
                      <Wrench />
                      {hullQueued ? "En cola" : "Reparar"} · {hullRepairCost(missing)} cr ·{" "}
                      {Math.ceil(missing * 2 * (1 - 0.15 * effective("forja")))} min
                    </Button>
                  )
                )}
              </div>
              <div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Boxes size={16} />
                  Bodega
                </p>
                <p
                  className={`mt-1 text-2xl ${data.status.used_oc > data.status.capacity ? "text-destructive" : "text-primary"}`}
                >
                  {data.status.used_oc}/{data.status.capacity} OC
                </p>
                <progress
                  className="ship-progress mt-2 w-full"
                  value={Math.min(data.status.used_oc, data.status.capacity)}
                  max={data.status.capacity}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {Math.max(0, data.status.capacity - data.status.used_oc)} OC libres
                  {data.status.unknown_oc
                    ? ` · ${data.status.unknown_oc} unidades sin OC verificable`
                    : ""}
                </p>
                <Button asChild variant="link" className="px-0">
                  <Link to="/unidades">Ver unidades →</Link>
                </Button>
              </div>
              <div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield size={16} />
                  Créditos seguros
                </p>
                <p className="mt-1 text-2xl text-primary">{data.status.protected_credits} cr</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {data.status.exposed_credits} cr expuestos · protección{" "}
                  {effective("caja_creditos") * 10}%
                </p>
                <DailyIncome />
              </div>
              <div>
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Command size={16} />
                  Control y logística
                </p>
                <p className="mt-1 text-2xl text-primary">
                  {used}/{2 + 2 * effective("puente")} ranuras
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Radio size={14} />
                  Reclutamiento −{data.status.recruitment_reduction}%
                </p>
                <Button asChild variant="link" className="px-0">
                  <Link to="/reclutar">Reclutar →</Link>
                </Button>
              </div>
            </div>
            {data.status.busy && (
              <p className="mb-5 border-l-2 border-destructive py-2 pl-3 text-sm text-destructive">
                Nave enfrentada: las obras y reparaciones están suspendidas.
              </p>
            )}
            <section className="mb-6">
              <h2 className="mb-3 text-xl text-primary">Sistemas de la nave</h2>
              <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {data.types.map((type) => {
                    const mod = data.modules.find((x) => x.module === type.id);
                    const st = moduleState(mod);
                    return (
                      <Button
                        key={type.id}
                        variant="outline"
                        aria-pressed={selected === type.id}
                        className={`h-auto min-h-20 min-w-0 flex-col items-start whitespace-normal border-l-4 p-3 text-left ${selected === type.id ? "border-primary bg-accent" : ""}`}
                        style={{ borderLeftColor: STATE_COLOR[st] }}
                        onClick={() => setSelected(type.id)}
                      >
                        <span className="text-xs text-muted-foreground">
                          {STATE_LABEL[st].toUpperCase()} · N{mod?.level ?? 0}/{type.max_level}
                        </span>
                        <span className="text-sm text-primary">
                          {moduleName(type.id, identity)}
                        </span>
                        <span className="text-xs text-muted-foreground">{type.name}</span>
                      </Button>
                    );
                  })}
                </div>
                {t && (
                  <aside id="module-detail" className="scroll-mt-4 border-l border-border pl-4">
                    <p className="text-xs uppercase text-muted-foreground">{t.name}</p>
                    <h3 className="text-lg text-primary">{moduleName(t.id, identity)}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
                    <dl className="mt-3 space-y-1 text-xs">
                      <div>
                        <dt className="inline text-muted-foreground">Ahora: </dt>
                        <dd className="inline">
                          {(m?.level ?? 0) > 0
                            ? moduleEffect(t.id, effective(t.id))
                            : "sin construir"}
                        </dd>
                      </div>
                      {projected < t.max_level && (
                        <div>
                          <dt className="inline text-muted-foreground">Con N{projected + 1}: </dt>
                          <dd className="inline text-primary">
                            {moduleEffect(t.id, projected + 1)}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <p className="mt-3 text-sm">
                      Nivel {m?.level ?? 0}/{t.max_level}
                    </p>
                    {m?.building_until && (
                      <p className="mt-2 text-xs">Obra: {until(m.building_until)}</p>
                    )}
                    {m?.damaged_until ? (
                      <p className="mt-2 text-xs text-destructive">
                        Reparación: {until(m.damaged_until)}
                      </p>
                    ) : (
                      m?.damaged && (
                        <Button
                          variant="outline"
                          className="mt-3 h-auto whitespace-normal text-destructive"
                          disabled={
                            busy ||
                            data.status.busy ||
                            queueFull ||
                            repairQueued ||
                            queued.length > 0
                          }
                          onClick={() =>
                            void action(
                              () => supabase.rpc("repair_module", { _module: t.id }),
                              "Reparación añadida a la cola",
                            )
                          }
                        >
                          <Wrench />
                          {repairQueued ? "En cola" : "Reparar"} ·{" "}
                          {Math.max(50, Math.floor((t.base_cost * Math.max(1, m.level)) / 2))} cr ·{" "}
                          {Math.max(1, Math.floor((t.base_hours * Math.max(1, m.level)) / 2))} h
                        </Button>
                      )
                    )}
                    {projected < t.max_level && (
                      <Button
                        className="mt-4 h-auto w-full whitespace-normal py-3"
                        disabled={
                          busy || data.status.busy || queueFull || (!!m?.damaged && !repairQueued)
                        }
                        onClick={() =>
                          void action(
                            () => supabase.rpc("build_module", { _module: t.id }),
                            "Obra añadida",
                          )
                        }
                      >
                        <Hammer />
                        {projected ? `Mejorar a N${projected + 1}` : "Construir"} ·{" "}
                        {shipUpgradeCost(t.base_cost, projected + 1)} cr ·{" "}
                        {Math.max(
                          1,
                          Math.round(
                            t.base_hours * (projected + 1) * (1 - 0.15 * effective("forja")),
                          ),
                        )}{" "}
                        h
                      </Button>
                    )}
                    {(m?.level ?? 0) > 0 &&
                      t.id !== "puente" &&
                      !m?.building_until &&
                      !data.queue.some((q) => q.module === t.id) && (
                        <Button
                          variant="ghost"
                          className="mt-2 text-destructive"
                          disabled={busy || data.status.busy}
                          onClick={() => {
                            if (
                              confirm(
                                `¿Desmantelar ${moduleName(t.id, identity)}? Recuperas la mitad de lo invertido.`,
                              )
                            )
                              void action(
                                () => supabase.rpc("demolish_module", { _module: t.id }),
                                "Módulo desmantelado",
                              );
                          }}
                        >
                          <Trash2 />
                          Desmantelar
                        </Button>
                      )}
                  </aside>
                )}
              </div>
            </section>
            <ShipIncome
              onAntenna={() => {
                setSelected("astropatico");
                document
                  .getElementById("module-detail")
                  ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
            />
            <ShipWorkQueue
              jobs={data.queue}
              identity={identity}
              disabled={busy || data.status.busy}
              onCancel={(id) =>
                void action(
                  () => supabase.rpc("cancel_queued", { _id: id }),
                  "Trabajo cancelado y créditos devueltos",
                )
              }
            />
            <Button
              asChild
              variant="destructive"
              className="mt-3 h-auto w-full whitespace-normal py-4"
            >
              <Link to="/mando">Mando de la nave · combate naval →</Link>
            </Button>
          </>
        )}
      </div>
    </CommandShell>
  );
}
