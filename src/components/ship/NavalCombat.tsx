import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  OBJECTIVE_LABEL,
  ORDERS,
  beats,
  hullPercentage,
  maxEvasion,
  RAID_COST,
  raidError,
  type NavalOrder,
  type RaidReport,
} from "@/lib/naval";
import { fleetFor, fleetId, moduleName } from "@/lib/ship-identity";
import { profileQuery } from "@/lib/profile";
import { BattleReplay, TrajectoryView } from "@/components/ship/NavalScenes";
import { sfx } from "@/lib/naval-audio";
import { Shield, Swords, Save, ArrowRight, LogOut, Play, Volume2 } from "lucide-react";
import { ShipExterior } from "@/components/ship/ShipExterior";
import { NavalCombatReport } from "@/components/ship/NavalCombatReport";
import { campaignQuery } from "@/lib/campaign-queries";
import { DuelArchiveDialog, DuelCard, DuelRules, type DuelRaid } from "@/components/ship/duel/Duel";
import { PracticeDuel } from "@/components/ship/duel/Practice";
import { duelTick } from "@/lib/naval3.functions";
import { FLEET_PROFILES } from "@/lib/naval3/factions";
import { newSide } from "@/lib/naval3/engine";
import { bestRange } from "@/lib/naval3/advisor";
import { RANGE_NAMES, type DuelState, type ModuleLevels } from "@/lib/naval3/types";
import { bodyName, formatDuration, travelSeconds } from "@/lib/system";

const DEFAULT: NavalOrder[] = ["escudos", "fuego", "abordaje", "fuego", "escudos"];
interface Raid {
  id: string;
  attacker_id: string;
  defender_id: string;
  status: string;
  block_number: number;
  attacker_ready: boolean;
  defender_ready: boolean;
  deadline: string;
  created_at: string;
  resolved_at: string | null;
  winner: string | null;
  loot: number;
  report: RaidReport;
  own_plan: NavalOrder[];
  engine_version?: number;
  duel_state?: DuelState | null | null;
}
export const raidsQuery = queryOptions({
  queryKey: ["naval-raids"],
  refetchInterval: 15000,
  queryFn: async () => {
    try {
      await duelTick();
    } catch {
      /* el estado se lee igualmente */
    }
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? "";
    const [raids, players, stance, mods, ships] = await Promise.all([
      supabase.rpc("naval_raids_view"),
      supabase.rpc("campaign_players_40k"),
      supabase.from("naval_stances").select("plan").eq("user_id", uid).maybeSingle(),
      supabase.from("ship_modules").select("module,level,damaged").eq("user_id", uid),
      supabase.from("ships").select("user_id,name,hull_hp,hull_repair_until"),
    ]);
    for (const result of [raids, players, stance, mods, ships])
      if (result.error) throw result.error;
    const view = raids.data as unknown as {
      raids: Raid[];
      server_now: string;
      fleet_status: {
        user_id: string;
        busy: boolean;
        warp_until: string | null;
        max_hull: number;
      }[];
    };
    return {
      uid,
      raids: view.raids ?? [],
      fleetStatus: view.fleet_status ?? [],
      serverNow: view.server_now,
      receivedAt: Date.now(),
      players: players.data ?? [],
      mods: mods.data ?? [],
      ships: ships.data ?? [],
      stance:
        Array.isArray(stance.data?.plan) && stance.data.plan.length === 5
          ? (stance.data.plan as NavalOrder[])
          : DEFAULT,
    };
  },
});
const KEYS = Object.keys(ORDERS) as NavalOrder[];
function OrderPicker({
  value,
  onChange,
  maxEva = 1,
  disabled = false,
}: {
  value: NavalOrder[];
  onChange: (p: NavalOrder[]) => void;
  maxEva?: number;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i}>
          <p className="mb-1 text-xs text-muted-foreground">Ronda {i + 1}</p>
          <div className="grid grid-cols-5 gap-1">
            {KEYS.map((o) => {
              const other = value.filter((x, j) => j !== i && x === o).length;
              return (
                <Button
                  key={o}
                  variant="outline"
                  title={ORDERS[o].effect}
                  aria-label={`Ronda ${i + 1}: ${ORDERS[o].short}`}
                  aria-pressed={value[i] === o}
                  disabled={
                    disabled ||
                    (o === "lanza" && other >= 1) ||
                    (o === "evasion" && other >= maxEva)
                  }
                  className={`h-auto min-h-16 min-w-0 flex-col gap-1 whitespace-normal px-1 py-2 ${value[i] === o ? "border-primary bg-accent text-primary" : "text-muted-foreground"}`}
                  onClick={() => {
                    sfx.ping();
                    const next = [...value];
                    next[i] = o;
                    onChange(next);
                  }}
                >
                  <span className="text-2xl">{ORDERS[o].icon}</span>
                  <span className="text-[9px] sm:text-xs">{ORDERS[o].short}</span>
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
function RoundSummary({
  report,
  attackerName,
  defenderName,
}: {
  report: RaidReport;
  attackerName: string;
  defenderName: string;
}) {
  const rounds = report.rounds ?? [];
  if (!rounds.length) return null;
  return (
    <section aria-label="Resumen de rondas anteriores" className="my-4 border-y border-border py-3">
      <h4 className="mb-2 text-sm text-primary">Rondas anteriores · {rounds.length}</h4>
      <p className="mb-3 text-xs text-muted-foreground">
        Daño causado: {attackerName} {rounds.reduce((total, r) => total + r.a_hits, 0)} ·{" "}
        {defenderName} {rounds.reduce((total, r) => total + r.d_hits, 0)}
      </p>
      <ol className="divide-y divide-border">
        {rounds.map((r, i) => (
          <li key={`${r.block ?? 1}-${r.round}-${i}`} className="py-2">
            <p className="mb-1 text-xs font-semibold text-primary">
              Bloque {r.block ?? Math.floor(i / 5) + 1} · Ronda {r.round}
            </p>
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              <p className="min-w-0 break-words">
                <span className="font-semibold">{attackerName}</span>: {ORDERS[r.a_order].short} ·
                causa {r.a_hits} de daño
                {(r.a_heal ?? 0) > 0 ? ` · repara ${r.a_heal} de casco` : ""} · casco final{" "}
                {r.a_hull}
              </p>
              <p className="min-w-0 break-words">
                <span className="font-semibold">{defenderName}</span>: {ORDERS[r.d_order].short} ·
                causa {r.d_hits} de daño
                {(r.d_heal ?? 0) > 0 ? ` · repara ${r.d_heal} de casco` : ""} · casco final{" "}
                {r.d_hull}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
export function NavalCommand() {
  const { data, error } = useQuery(raidsQuery);
  const { data: sys } = useQuery(campaignQuery);
  const { data: profile } = useQuery(profileQuery);
  const qc = useQueryClient();
  const [target, setTarget] = useState("");
  const [plan, setPlan] = useState<NavalOrder[]>([
    "fuego",
    "abordaje",
    "lanza",
    "fuego",
    "escudos",
  ]);
  const [stance, setStance] = useState<NavalOrder[] | null>(null);
  const [edits, setEdits] = useState<Record<string, NavalOrder[]>>({});
  const [replay, setReplay] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (error)
    return (
      <p role="alert" className="text-destructive">
        No se pudo consultar el mando naval.
      </p>
    );
  if (!data) return <p className="text-muted-foreground">Conectando con la flota…</p>;
  const identity = fleetId(profile?.profile?.army_race, profile?.profile?.army_faction);
  const fleet = fleetFor(profile?.profile?.army_race, profile?.profile?.army_faction);
  const player = (id: string) => data.players.find((p) => p.id === id);
  const name = (id: string) => player(id)?.leader_name ?? "Capitán";
  const playerFleet = (id: string) => fleetFor(undefined, player(id)?.army_faction);
  const playerImage = (id: string) => {
    const fac = player(id)?.army_faction;
    const race =
      fac === "tau-empire"
        ? "tau"
        : fac === "aeldari"
          ? "aeldari"
          : fac === "drukhari"
            ? "aeldari"
            : fac === "orks"
              ? "orks"
              : fac === "necrons"
                ? "necrons"
                : fac === "tyranids"
                  ? "tyranids"
                  : fac === "leagues-of-votann"
                    ? "votann"
                    : fac === "chaos-daemons"
                      ? "daemons"
                      : undefined;
    return fleetFor(race, fac).image;
  };
  const lvl = (id: string) => {
    const m = data.mods.find((m) => m.module === id);
    return m?.damaged ? 0 : (m?.level ?? 0);
  };
  const maxEva = maxEvasion(lvl("motores_plasma"), identity);
  const active = data.raids.filter((r) => r.status === "pendiente" || r.status === "enfrentado");
  const done = data.raids.filter((r) => r.status !== "pendiente" && r.status !== "enfrentado");
  const serverNow = new Date(data.serverNow).getTime() + now - data.receivedAt;
  const remaining = (deadline: string) => {
    const mins = Math.max(0, Math.ceil((new Date(deadline).getTime() - serverNow) / 60000));
    return `${Math.floor(mins / 60)} h ${mins % 60} min`;
  };
  const refresh = () => {
    setEdits({});
    for (const key of ["naval-raids", "ship", "profile"])
      void qc.invalidateQueries({ queryKey: [key] });
  };
  async function act(
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
  const replayRaid = data.raids.find((r) => r.id === replay);
  const archivedReplay =
    replayRaid && replayRaid.status !== "pendiente" && replayRaid.status !== "enfrentado";
  const ownShip = data.ships.find((s) => s.user_id === data.uid);
  const ownStatus = data.fleetStatus.find((s) => s.user_id === data.uid);
  const inWarp = !!ownStatus?.warp_until && new Date(ownStatus.warp_until).getTime() > serverNow;
  const traveling = active.some((r) => r.status === "pendiente" && r.attacker_id === data.uid);
  const targetStatus = data.fleetStatus.find((s) => s.user_id === target);
  /** Aproximación: mismo planeta 5 min + 1 h por zona de desembarco del defensor (máx. 4 h); otro planeta, el viaje. */
  const approachSeconds = (from: string, to: string, defender: string) =>
    from === to
      ? 300 +
        3600 *
          Math.min(
            4,
            (sys?.regions ?? []).filter(
              (r) => r.body_id === to && r.owner_id === defender && r.is_spaceport,
            ).length,
          )
      : Math.max(300, travelSeconds(from, to));
  const targetUnavailable =
    !!targetStatus?.busy ||
    (!!targetStatus?.warp_until && new Date(targetStatus.warp_until).getTime() > serverNow);
  // Estado de la escena exterior: órbita, viaje warp, duelo activo, reparación y naves vecinas.
  const sceneProps = () => {
    const mine = sys?.fleet.find((f) => f.user_id === data.uid);
    const duel = active.find((r) => r.status === "enfrentado");
    const foe = duel ? (duel.attacker_id === data.uid ? duel.defender_id : duel.attacker_id) : null;
    return {
      orbitBody: mine?.body_id ?? null,
      travel:
        mine && !mine.body_id && mine.arrives_at
          ? mine.destination && mine.destination === mine.travel_from
            ? ("return" as const)
            : ("warp" as const)
          : null,
      combat: foe ? { enemyImage: playerImage(foe), enemyName: name(foe) } : null,
      repairing:
        !!ownShip?.hull_repair_until && new Date(ownShip.hull_repair_until).getTime() > serverNow,
      shieldLevel: lvl("camara_escudos"),
    };
  };
  return (
    <div className={`${fleet.theme} space-y-7`}>
      {ownShip && (
        <>
          <ShipExterior
            image={fleet.image}
            name={ownShip.name}
            hull={ownShip.hull_hp ?? fleet.hull}
            maxHull={ownStatus?.max_hull ?? fleet.hull}
            fleet={identity}
            moving={traveling}
            warp={inWarp}
            damagedModules={data.mods.filter((m) => m.damaged).length}
            {...sceneProps()}
          />
          {inWarp && (
            <p role="status" className="border-y border-border py-3 text-primary">
              En el warp · protección restante {remaining(ownStatus?.warp_until ?? "")} · no puedes
              recibir ataques.
            </p>
          )}
          {active.length > 0 && (
            <p role="status" className="border-y border-destructive py-3 text-destructive">
              {active.some((r) => r.status === "enfrentado")
                ? "En combate · obras, mejoras y escoltas en pausa hasta que termine el duelo."
                : "Aproximación en curso · puedes seguir con obras, mejoras y combates en tierra, pero la nave no puede viajar ni entrar en otro duelo."}
            </p>
          )}
        </>
      )}
      <DuelRules fleet={identity} />
      {active.length === 0 && (
        <PracticeDuel
          fleet={identity}
          modules={
            Object.fromEntries(
              data.mods.map((m) => [m.module, m.damaged ? 0 : m.level]),
            ) as Partial<ModuleLevels>
          }
          maxHull={ownStatus?.max_hull ?? fleet.hull}
        />
      )}
      <section className="border-b border-border pb-6">
        <h2 className="mb-2 text-xl text-primary">Lanzar ofensiva</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Preparación {RAID_COST} cr · el combate empieza al llegar a su planeta (durante el viaje
          ya podéis dar las órdenes del primer bloque) · una ofensiva diaria · protección warp 48 h
          para el defensor tras terminar
        </p>
        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.players
            .filter((p) => p.id !== data.uid && data.ships.some((s) => s.user_id === p.id))
            .map((p) => {
              const ship = data.ships.find((s) => s.user_id === p.id);
              return (
                <Button
                  variant="outline"
                  key={p.id}
                  aria-pressed={target === p.id}
                  disabled={
                    busy ||
                    !sys?.fleet.find((f) => f.user_id === p.id)?.body_id ||
                    !!ship?.hull_repair_until ||
                    (ship?.hull_hp ?? 0) <= 0 ||
                    !!data.fleetStatus.find((s) => s.user_id === p.id)?.busy ||
                    new Date(
                      data.fleetStatus.find((s) => s.user_id === p.id)?.warp_until ?? "",
                    ).getTime() > serverNow
                  }
                  className={`h-auto min-w-0 flex-col items-start whitespace-normal p-2 ${target === p.id ? "border-primary bg-accent" : ""}`}
                  onClick={() => setTarget(p.id)}
                >
                  <img
                    src={playerImage(p.id)}
                    alt=""
                    width={768}
                    height={512}
                    loading="lazy"
                    className="h-24 w-full object-contain"
                  />
                  <span className="text-primary">{p.leader_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {ship?.name} · casco {ship?.hull_hp}
                  </span>
                  {(() => {
                    const loc = sys?.fleet.find((f) => f.user_id === p.id)?.body_id;
                    const mine = sys?.fleet.find((f) => f.user_id === data.uid)?.body_id;
                    return (
                      <span className="text-xs text-muted-foreground">
                        {loc
                          ? `${bodyName(loc)}${mine ? ` · contacto en ${formatDuration(approachSeconds(mine, loc, p.id)) || "5 min"}` : ""}`
                          : "En el warp · no localizable"}
                      </span>
                    );
                  })()}
                  <span className="text-xs text-muted-foreground">
                    {data.fleetStatus.find((s) => s.user_id === p.id)?.busy
                      ? "Ocupada en un duelo"
                      : new Date(
                            data.fleetStatus.find((s) => s.user_id === p.id)?.warp_until ?? "",
                          ).getTime() > serverNow
                        ? "En el warp · protegida"
                        : "Disponible"}
                  </span>
                </Button>
              );
            })}
        </div>
        {target &&
          (() => {
            const foeFleet = fleetId(undefined, player(target)?.army_faction);
            const fp = FLEET_PROFILES[foeFleet];
            const mods = Object.fromEntries(
              data.mods.map((m) => [m.module, m.damaged ? 0 : m.level]),
            ) as Partial<ModuleLevels>;
            const me = newSide(
              identity,
              mods,
              ownShip?.hull_hp ?? fleet.hull,
              ownStatus?.max_hull ?? fleet.hull,
            );
            const foe = newSide(foeFleet, {}, 1, 1);
            return (
              <section
                aria-label="Informe de la nave enemiga"
                className="mb-5 border-l-2 border-primary bg-accent/40 p-4"
              >
                <h3 className="text-sm font-semibold text-primary">
                  {name(target)} · {playerFleet(target).name}
                </h3>
                <p className="mt-1 text-sm">
                  <span className="text-primary">{fp.trait}:</span> {fp.traitText}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Velocidad {fp.speed} (tú {FLEET_PROFILES[identity].speed}) · esquiva {fp.dodge} %
                  · {fp.torpedoes} {fp.torpedoName} por salva
                </p>
                <p className="mt-2 text-sm">
                  Segundo al mando: «Les haremos más daño en {RANGE_NAMES[bestRange(me, foe)]};
                  ellos querrán llevarnos a {RANGE_NAMES[bestRange(foe, me)]}.»
                </p>
              </section>
            );
          })()}
        <Button
          variant="destructive"
          className="mt-4 h-auto w-full whitespace-normal py-4"
          disabled={busy || !target || active.length > 0 || targetUnavailable}
          onClick={() => {
            const from = sys?.fleet.find((f) => f.user_id === data.uid)?.body_id;
            const to = sys?.fleet.find((f) => f.user_id === target)?.body_id;
            const eta = from && to ? formatDuration(approachSeconds(from, to, target)) : "";
            if (
              confirm(
                `¿Lanzar ofensiva contra ${name(target)} por 100 créditos?${eta ? ` Contacto en ${eta}.` : ""}`,
              )
            )
              void act(
                () => supabase.rpc("declare_raid3" as never, { _defender: target } as never),
                "Ofensiva lanzada",
              );
          }}
        >
          <Swords />
          Lanzar ofensiva{target ? ` contra ${name(target)}` : ""}
        </Button>
      </section>
      <section>
        <h2 className="mb-4 text-xl text-primary">Contactos hostiles · {active.length}</h2>
        {!active.length && (
          <p className="text-sm text-muted-foreground">Sin enfrentamientos activos.</p>
        )}
        <div className="space-y-6">
          {active.map((r) =>
            r.engine_version !== 3 ? (
              <p
                key={r.id}
                className="rounded border border-border p-3 text-sm text-muted-foreground"
              >
                Duelo del sistema anterior contra{" "}
                {name(r.attacker_id === data.uid ? r.defender_id : r.attacker_id)}: se anulará con
                la actualización y se devolverán los créditos.
              </p>
            ) : (
              <DuelCard
                key={r.id}
                raid={r as unknown as DuelRaid}
                uid={data.uid}
                name={name}
                remaining={remaining}
                onChanged={refresh}
              />
            ),
          )}
        </div>
      </section>
      <section className="border-t border-border pt-5">
        <h2 className="mb-3 text-xl text-primary">Archivo de combate</h2>
        {!done.length && <p className="text-sm text-muted-foreground">Sin combates registrados.</p>}
        <ul className="space-y-2">
          {done.map((r) => {
            const mine = r.attacker_id === data.uid;
            const won = (r.winner === "atacante") === mine;
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-sm"
              >
                <div>
                  <span className={won ? "text-primary" : "text-destructive"}>
                    {r.status === "anulado"
                      ? "ANULADO"
                      : r.winner === "empate"
                        ? "EMPATE"
                        : won
                          ? "VICTORIA"
                          : "DERROTA"}
                  </span>{" "}
                  · contra {name(mine ? r.defender_id : r.attacker_id)}
                  <p className="text-xs text-muted-foreground">
                    Transferencia {r.loot} cr ·{" "}
                    {r.resolved_at ? new Date(r.resolved_at).toLocaleString("es-ES") : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={r.engine_version === 2 || r.status === "anulado"}
                  onClick={() => setReplay(r.id)}
                >
                  <Play />
                  Ver combate
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
      <Button asChild variant="outline" className="w-full">
        <Link to="/nave">Sistemas y reparaciones →</Link>
      </Button>
      {replayRaid && archivedReplay && replayRaid.engine_version === 3 && (
        <DuelArchiveDialog
          raid={replayRaid as unknown as DuelRaid}
          uid={data.uid}
          name={name}
          onClose={() => setReplay(null)}
          summary={`${replayRaid.winner === "empate" ? "Empate" : replayRaid.winner === "atacante" ? `Vence ${name(replayRaid.attacker_id)}` : `Vence ${name(replayRaid.defender_id)}`} · ${OBJECTIVE_LABEL[replayRaid.report?.objective ?? ""] ?? ""} · botín ${replayRaid.loot} cr`}
        />
      )}
      {replayRaid && archivedReplay && (replayRaid.engine_version ?? 1) === 1 && (
        <NavalCombatReport
          report={replayRaid.report}
          winner={replayRaid.winner}
          status={replayRaid.status}
          loot={replayRaid.loot}
          mine={replayRaid.attacker_id === data.uid}
          attackerName={name(replayRaid.attacker_id)}
          defenderName={name(replayRaid.defender_id)}
          attackerImage={playerImage(replayRaid.attacker_id)}
          defenderImage={playerImage(replayRaid.defender_id)}
          theme={fleet.theme}
          onClose={() => setReplay(null)}
        />
      )}
      {replayRaid && !archivedReplay && (
        <BattleReplay
          key={replayRaid.id}
          report={replayRaid.report}
          winner={replayRaid.winner}
          loot={replayRaid.loot}
          mine={replayRaid.attacker_id === data.uid}
          modNames={Object.fromEntries(
            [
              "puente",
              "bodegas",
              "casco",
              "baterias",
              "camara_escudos",
              "cubierta_abordaje",
              "motores_plasma",
              "lanza_proa",
              "blindaje_proa",
              "forja",
            ].map((id) => [id, moduleName(id, identity)]),
          )}
          attackerName={name(replayRaid.attacker_id)}
          defenderName={name(replayRaid.defender_id)}
          attackerTraitor={false}
          defenderTraitor={false}
          attackerImage={playerImage(replayRaid.attacker_id)}
          defenderImage={playerImage(replayRaid.defender_id)}
          onClose={() => setReplay(null)}
        />
      )}
    </div>
  );
}
export function NavalAlert({ onOpen }: { onOpen: () => void }) {
  const { data } = useQuery(raidsQuery);
  const incoming =
    data?.raids.filter(
      (r) =>
        (r.status === "pendiente" || r.status === "enfrentado") &&
        (r.defender_id === data.uid || r.status === "enfrentado"),
    ) ?? [];
  return incoming.length ? (
    <Button
      variant="outline"
      onClick={onOpen}
      className="mb-4 h-auto w-full justify-start whitespace-normal border-destructive py-3 text-destructive"
    >
      <Swords />
      Contacto hostil · {incoming.length} enfrentamiento(s) activos
    </Button>
  ) : null;
}
