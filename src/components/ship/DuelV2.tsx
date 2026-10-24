import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FleetId } from "@/lib/ship-identity";
import { ESCORT_PROFILES, FLEET_PROFILES, ROUNDS_PER_BLOCK } from "@/lib/naval2/factions";
import { effectiveStats, leadership } from "@/lib/naval2/engine";
import type {
  BlockPlan,
  Crit,
  Doctrine,
  DuelState,
  Maneuver,
  Range,
  RoundEvent,
  RoundPlan,
  SideState,
  SpecialOrder,
} from "@/lib/naval2/types";
import { RANGE_NAMES } from "@/lib/naval2/types";
import { submitDuelPlan } from "@/lib/naval2.functions";

export type DuelEvent = RoundEvent & {
  block: number;
  auto?: { attacker: boolean; defender: boolean };
};

export const MANEUVERS: Record<Maneuver, { label: string; help: string }> = {
  acercarse: { label: "Acercarse", help: "Reduce la distancia una banda." },
  mantener: { label: "Mantener", help: "Conserva la distancia." },
  flanquear: {
    label: "Flanquear",
    help: "Si el rival no flanquea ni huye, disparas de costado (+50 % baterías) y le das en el blindaje lateral.",
  },
  romper: {
    label: "Romper contacto",
    help: "Aumenta la distancia; dos rondas seguidas en Lejos es una retirada.",
  },
};

export const ORDER_INFO: Record<
  Exclude<SpecialOrder, "faccion">,
  { label: string; help: string }
> = {
  fijar_blanco: { label: "¡Fijar blanco!", help: "Repite los fallos de baterías y lanzas." },
  avante_toda: {
    label: "¡Avante toda!",
    help: "Mueves 2 bandas y puedes embestir en Contacto. Baterías a la mitad.",
  },
  nuevo_rumbo: {
    label: "¡Nuevo rumbo!",
    help: "Ganas el flanco aunque el rival flanquee. Baterías a la mitad.",
  },
  recargar: { label: "¡Recargar artillería!", help: "Torpedos listos para la ronda siguiente." },
  prepararse: {
    label: "¡Prepararse para el impacto!",
    help: "Salvación 4+ contra cada impacto. Todo tu fuego a la mitad.",
  },
  control_danos: {
    label: "Control de daños",
    help: "Repara 1 crítico (2 con Astillero 2+) y apaga incendios. Baterías a la mitad.",
  },
};

export const CRIT_NAMES: Record<Crit, string> = {
  motores: "Motores dañados",
  baterias: "Baterías fuera de servicio",
  lanza: "Lanza fuera de servicio",
  incendio: "Incendio a bordo",
  puente: "Puente alcanzado",
  escudos: "Escudos colapsados",
};

const DOCTRINES: Record<Doctrine, { label: string; help: string }> = {
  ataque: { label: "Ataque", help: "Las escoltas suman su fuego." },
  pantalla: {
    label: "Pantalla",
    help: "Los primeros impactos contra tu capital van a las escoltas.",
  },
  flanqueo: { label: "Flanqueo", help: "Te dan el flanco si el rival no flanquea." },
};

/** Banda de distancia con las dos naves. */
export function RangeTrack({
  range,
  attackerName,
  defenderName,
}: {
  range: Range;
  attackerName: string;
  defenderName: string;
}) {
  return (
    <div
      className="grid grid-cols-4 gap-1 text-center text-[10px] uppercase"
      aria-label={`Distancia: ${RANGE_NAMES[range]}`}
    >
      {[0, 1, 2, 3].map((r) => (
        <div
          key={r}
          className={`border px-1 py-2 ${r === range ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground"}`}
        >
          {RANGE_NAMES[r as Range]}
          {r === range && (
            <div className="mt-1 normal-case text-foreground">
              {attackerName} ⟷ {defenderName}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SideSummary({ side, name, image }: { side: SideState; name: string; image: string }) {
  const st = effectiveStats(side);
  const p = FLEET_PROFILES[side.fleet];
  return (
    <div className="min-w-0 border border-border p-3 text-xs">
      <img src={image} alt="" className="mb-2 h-20 w-full object-contain" loading="lazy" />
      <p className="text-sm text-primary">{name}</p>
      <p>
        Casco {side.hull}/{side.maxHull} · Liderazgo {leadership(side)}
      </p>
      <progress className="ship-progress my-1 h-1.5 w-full" value={side.hull} max={side.maxHull} />
      <p className="text-muted-foreground">
        V{st.speed} · Escudos {st.shields} · Blindaje {st.armourFront}+/{st.armourSide}+ · Bat{" "}
        {st.batteries} · Lanzas {st.lances} · Torp {st.torpedoes}
        {side.torpedoesLoaded ? " (cargados)" : st.torpedoes ? " (sin cargar)" : ""} · Abordaje{" "}
        {st.boarding}
      </p>
      {side.escorts.some((e) => e.ships > 0) && (
        <p className="text-muted-foreground">
          Escoltas:{" "}
          {side.escorts
            .filter((e) => e.ships > 0)
            .map((e) => `${ESCORT_PROFILES[e.type].name} ×${e.ships}`)
            .join(" · ")}
        </p>
      )}
      {side.crits.length > 0 && (
        <p className="text-destructive">{side.crits.map((c) => CRIT_NAMES[c]).join(" · ")}</p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">{p.passive}</p>
    </div>
  );
}

const needsRange = (fleet: FleetId) =>
  fleet === "aeldari" || fleet === "necrons" || fleet === "daemons";

function defaultPlan(state: DuelState, mine: SideState): BlockPlan {
  const want = FLEET_PROFILES[mine.fleet].idealRange;
  const m: Maneuver =
    state.range > want ? "acercarse" : state.range < want ? "romper" : "flanquear";
  return {
    rounds: Array.from({ length: ROUNDS_PER_BLOCK }, () => ({
      maneuver: m,
      order: "fijar_blanco" as SpecialOrder,
      target: "capital" as const,
      preferredRange: want,
    })),
    doctrine: "ataque",
  };
}

/** Planificador de un bloque de 3 rondas. */
export function DuelPlanner({
  raidId,
  block,
  state,
  side,
  ready,
  rivalReady,
}: {
  raidId: string;
  block: number;
  state: DuelState;
  side: "attacker" | "defender";
  ready: boolean;
  rivalReady: boolean;
}) {
  const mine = side === "attacker" ? state.attacker : state.defender;
  const profile = FLEET_PROFILES[mine.fleet];
  const [plan, setPlan] = useState<BlockPlan>(() => defaultPlan(state, mine));
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const hasEscorts = mine.escorts.some((e) => e.ships > 0);
  const setRound = (i: number, patch: Partial<RoundPlan>) =>
    setPlan((p) => ({ ...p, rounds: p.rounds.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  async function confirm() {
    setBusy(true);
    try {
      await submitDuelPlan({ data: { raidId, block, plan } });
      toast.success(
        rivalReady
          ? "Órdenes fijadas: resolviendo el bloque"
          : "Órdenes fijadas: esperando al rival",
      );
      await qc.invalidateQueries({ queryKey: ["naval-raids"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron fijar las órdenes.");
    } finally {
      setBusy(false);
    }
  }

  if (ready)
    return (
      <p className="border border-border p-3 text-sm text-muted-foreground">
        Tus órdenes del bloque {block} están fijadas.{" "}
        {rivalReady
          ? "Resolviendo…"
          : "Esperando al rival (si no confirma antes del plazo, juega la IA por él)."}
      </p>
    );

  return (
    <div className="space-y-3">
      {plan.rounds.map((r, i) => (
        <fieldset key={i} className="border border-border p-3">
          <legend className="px-1 text-xs uppercase text-primary">Ronda {i + 1}</legend>
          <p className="mb-1 text-[11px] text-muted-foreground">Maniobra</p>
          <div className="mb-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
            {(Object.keys(MANEUVERS) as Maneuver[]).map((m) => (
              <Button
                key={m}
                size="sm"
                variant="outline"
                aria-pressed={r.maneuver === m}
                title={MANEUVERS[m].help}
                className={r.maneuver === m ? "border-primary bg-accent" : ""}
                onClick={() => setRound(i, { maneuver: m })}
              >
                {MANEUVERS[m].label}
              </Button>
            ))}
          </div>
          <label className="block text-[11px] text-muted-foreground">
            Orden especial (chequeo de Liderazgo {leadership(mine)} con 2d6)
            <select
              className="mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              value={r.order ?? ""}
              onChange={(e) =>
                setRound(i, { order: (e.target.value || null) as SpecialOrder | null })
              }
            >
              <option value="">Sin orden especial</option>
              {(Object.keys(ORDER_INFO) as (keyof typeof ORDER_INFO)[]).map((o) => (
                <option key={o} value={o}>
                  {ORDER_INFO[o].label} — {ORDER_INFO[o].help}
                </option>
              ))}
              <option value="faccion">
                {profile.orderName} — {profile.orderText}
              </option>
            </select>
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>Blanco:</span>
            {(["capital", "escoltas"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1">
                <input
                  type="radio"
                  name={`t-${raidId}-${i}`}
                  checked={r.target === t}
                  onChange={() => setRound(i, { target: t })}
                />
                {t === "capital" ? "Nave capital" : "Escoltas"}
              </label>
            ))}
            {r.order === "faccion" && needsRange(mine.fleet) && (
              <label className="flex items-center gap-1">
                Distancia deseada
                <select
                  className="border border-border bg-background px-1 py-0.5 text-foreground"
                  value={r.preferredRange ?? profile.idealRange}
                  onChange={(e) => setRound(i, { preferredRange: Number(e.target.value) as Range })}
                >
                  {RANGE_NAMES.map((n, k) => (
                    <option key={n} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </fieldset>
      ))}
      {hasEscorts && (
        <div className="text-xs">
          <p className="mb-1 text-muted-foreground">Doctrina de escoltas (todo el bloque)</p>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(DOCTRINES) as Doctrine[]).map((d) => (
              <Button
                key={d}
                size="sm"
                variant="outline"
                title={DOCTRINES[d].help}
                aria-pressed={plan.doctrine === d}
                className={plan.doctrine === d ? "border-primary bg-accent" : ""}
                onClick={() => setPlan({ ...plan, doctrine: d })}
              >
                {DOCTRINES[d].label}
              </Button>
            ))}
          </div>
        </div>
      )}
      <Button className="w-full" disabled={busy} onClick={() => void confirm()}>
        Fijar órdenes del bloque {block}
      </Button>
    </div>
  );
}

function sideLine(log: RoundEvent["attacker"], name: string) {
  const parts: string[] = [`${name}: ${MANEUVERS[log.maneuver].label}`];
  if (log.order)
    parts.push(
      `${log.order === "faccion" ? "orden de facción" : ORDER_INFO[log.order].label} ${log.orderPassed ? "✔" : "✘ (Liderazgo fallido)"}`,
    );
  if (log.flank) parts.push("flanco ganado");
  const f = log.fired;
  const shots = [
    f.batteries && `${f.batteries} dados de batería`,
    f.lances && `${f.lances} lanzas`,
    f.torpedoesLaunched && `${f.torpedoesLaunched} torpedos lanzados`,
    f.boarding && `abordaje ${f.boarding}`,
    f.ram && `embestida ${f.ram}`,
  ].filter(Boolean);
  if (shots.length) parts.push(shots.join(", "));
  return parts.join(" · ");
}

function damageLine(log: RoundEvent["attacker"]) {
  const r = log.received;
  const bits = [`${r.hull} de daño al casco`];
  if (r.absorbed) bits.push(`${r.absorbed} absorbidos por escudos`);
  if (r.saved) bits.push(`${r.saved} salvados`);
  if (r.torpedoesIntercepted) bits.push(`${r.torpedoesIntercepted} torpedos derribados`);
  if (r.escortsLost) bits.push(`${r.escortsLost} escoltas perdidas`);
  if (log.newCrits.length)
    bits.push(`crítico: ${log.newCrits.map((c) => CRIT_NAMES[c]).join(", ")}`);
  if (log.repaired.length)
    bits.push(`reparado: ${log.repaired.map((c) => CRIT_NAMES[c]).join(", ")}`);
  return `${bits.join(" · ")} → casco ${log.hullAfter}`;
}

/** Registro de rondas resueltas. */
export function DuelLog({
  events,
  attackerName,
  defenderName,
}: {
  events: DuelEvent[];
  attackerName: string;
  defenderName: string;
}) {
  if (!events.length)
    return <p className="text-sm text-muted-foreground">Aún no se ha resuelto ninguna ronda.</p>;
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={`${e.block}-${e.round}`} className="border-l-2 border-border pl-3 text-xs">
          <p className="mb-1 font-semibold text-primary">
            Bloque {e.block} · Ronda {e.round} · {RANGE_NAMES[e.rangeBefore]} →{" "}
            {RANGE_NAMES[e.rangeAfter]}
            {e.auto && (e.auto.attacker || e.auto.defender)
              ? ` · IA: ${[e.auto.attacker && attackerName, e.auto.defender && defenderName].filter(Boolean).join(", ")}`
              : ""}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p>{sideLine(e.attacker, attackerName)}</p>
              <p className="text-muted-foreground">Recibe: {damageLine(e.attacker)}</p>
            </div>
            <div>
              <p>{sideLine(e.defender, defenderName)}</p>
              <p className="text-muted-foreground">Recibe: {damageLine(e.defender)}</p>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Tarjeta de un duelo v2 activo. */
export function DuelCard({
  raid,
  uid,
  names,
  images,
  remaining,
  onWithdraw,
}: {
  raid: {
    id: string;
    attacker_id: string;
    defender_id: string;
    status: string;
    block_number: number;
    attacker_ready: boolean;
    defender_ready: boolean;
    deadline: string;
    duel_state: DuelState | null;
    report: { v2_events?: DuelEvent[] };
  };
  uid: string;
  names: (id: string) => string;
  images: (id: string) => string;
  remaining: (deadline: string) => string;
  onWithdraw: () => void;
}) {
  const side = raid.attacker_id === uid ? "attacker" : "defender";
  const state = raid.duel_state;
  const aName = names(raid.attacker_id);
  const dName = names(raid.defender_id);
  const ready = side === "attacker" ? raid.attacker_ready : raid.defender_ready;
  const rivalReady = side === "attacker" ? raid.defender_ready : raid.attacker_ready;
  return (
    <article className="space-y-4 border-l-2 border-destructive pl-3">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="text-primary">
          {aName} vs {dName}
        </h3>
        <span className="text-xs text-destructive">
          {raid.status === "pendiente"
            ? `Aproximación · el duelo empieza en ${remaining(raid.deadline)}`
            : `Bloque ${raid.block_number} · plazo ${remaining(raid.deadline)}`}
        </span>
      </div>
      {!state ? (
        <p className="text-sm text-muted-foreground">
          Las flotas se aproximan. Cuando llegue la hora, el duelo empezará en Lejos y podréis dar
          órdenes cada bloque de {ROUNDS_PER_BLOCK} rondas.
        </p>
      ) : (
        <>
          <RangeTrack range={state.range} attackerName={aName} defenderName={dName} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SideSummary side={state.attacker} name={aName} image={images(raid.attacker_id)} />
            <SideSummary side={state.defender} name={dName} image={images(raid.defender_id)} />
          </div>
          <DuelPlanner
            key={raid.block_number}
            raidId={raid.id}
            block={raid.block_number}
            state={state}
            side={side}
            ready={ready}
            rivalReady={rivalReady}
          />
          {!!raid.report.v2_events?.length && (
            <details>
              <summary className="cursor-pointer text-sm text-primary">
                Rondas anteriores · {raid.report.v2_events.length}
              </summary>
              <div className="mt-3">
                <DuelLog events={raid.report.v2_events} attackerName={aName} defenderName={dName} />
              </div>
            </details>
          )}
        </>
      )}
      <Button variant="outline" className="text-destructive" onClick={onWithdraw}>
        Retirada warp
      </Button>
    </article>
  );
}

/** Repetición (registro) de un duelo archivado. */
export function DuelLogDialog({
  open,
  onClose,
  events,
  attackerName,
  defenderName,
  summary,
}: {
  open: boolean;
  onClose: () => void;
  events: DuelEvent[];
  attackerName: string;
  defenderName: string;
  summary: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-[0.2em] text-primary">
            {attackerName} vs {defenderName}
          </DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        <DuelLog events={events} attackerName={attackerName} defenderName={defenderName} />
      </DialogContent>
    </Dialog>
  );
}

/** Ficha de reglas del combate v2 y de la flota propia. */
export function DuelRules({ fleet }: { fleet: FleetId }) {
  const p = FLEET_PROFILES[fleet];
  return (
    <section className="border-b border-border pb-6 text-sm">
      <h2 className="mb-3 text-xl text-primary">Doctrina de combate</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Cada bloque das órdenes para {ROUNDS_PER_BLOCK} rondas: maniobra, orden especial y
            blanco. Se resuelve cuando los dos confirmáis o vence el plazo de 24 h (si no confirmas,
            juega la IA por ti).
          </p>
          <p>
            Distancia: Contacto · Cerca · Media · Lejos. Las baterías rinden en Cerca–Media, las
            lanzas hasta Lejos, los torpedos en Cerca–Media y el abordaje solo en Contacto.
          </p>
          <p>
            Escudos absorben impactos cada ronda; el blindaje decide qué dados de batería impactan
            (de costado es más débil). Los 6 que llegan al casco causan críticos.
          </p>
          <p>
            Victoria: casco enemigo a 0, o el rival rompe contacto dos rondas seguidas en Lejos.
          </p>
        </div>
        <div className="border border-border p-3 text-xs">
          <p className="mb-1 text-sm text-primary">Tu flota</p>
          <p>
            Velocidad {p.speed} · Escudos {p.shields} · Blindaje {p.armourFront}+/{p.armourSide}+ ·
            Baterías {fleet === "orks" ? "2d6+1" : p.batteries} · Lanzas {p.lances} · Torpedos{" "}
            {p.torpedoes} · Torretas {p.turrets} · Abordaje {p.boarding} · Casco base {p.hull}
          </p>
          <p className="mt-2">{p.passive}</p>
          <p className="mt-1">
            <span className="text-primary">{p.orderName}:</span> {p.orderText}
          </p>
          <p className="mt-1 text-muted-foreground">
            Distancia preferida: {RANGE_NAMES[p.idealRange]}
          </p>
        </div>
      </div>
    </section>
  );
}
