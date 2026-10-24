import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronsDown,
  ChevronsUp,
  Equal,
  Flame,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  SkipBack,
  SkipForward,
  Sparkles,
  Wind,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FLEETS } from "@/lib/ship-identity";
import { ACTION_INFO, FLEET_PROFILES, PHASES_PER_BLOCK, SECOND } from "@/lib/naval3/factions";
import { other, stats, warpChance } from "@/lib/naval3/engine";
import {
  STANCES,
  bestRange,
  briefing,
  phaseAdvice,
  predictRanges,
  rangeTable,
  suggestPlan,
  type Advice,
  type Stance,
} from "@/lib/naval3/advisor";
import { endLine, narratePhase, type Line } from "@/lib/naval3/narrate";
import {
  RANGE_NAMES,
  type Action,
  type BlockPlan,
  type DuelEnd,
  type DuelState,
  type Move,
  type PhaseEvent,
  type Range,
  type Side,
} from "@/lib/naval3/types";
import { submitDuelPlan } from "@/lib/naval3.functions";
import { Radar, type RadarFx } from "./Radar";

export type DuelEventRow = PhaseEvent & { block: number };
export interface DuelRaid {
  id: string;
  attacker_id: string;
  defender_id: string;
  status: string;
  block_number: number;
  attacker_ready: boolean;
  defender_ready: boolean;
  deadline: string;
  duel_state?: DuelState | null;
  report: { v3_events?: DuelEventRow[]; v3_end?: DuelEnd } | null;
}

const ACTION_ICON: Record<Action, LucideIcon> = {
  fuego: Flame,
  torpedos: Rocket,
  recargar: RefreshCw,
  evasion: Wind,
  embestir: Zap,
  reparar: Wrench,
  saltar: Sparkles,
};
const ACTIONS = Object.keys(ACTION_ICON) as Action[];
const MOVES: { move: Move; label: string; hint: string; icon: LucideIcon }[] = [
  { move: -1, label: "Acercarse", hint: "Nos acerca al enemigo", icon: ChevronsDown },
  {
    move: 0,
    label: "Mantener",
    hint: "Rumbo fijo (si ellos se mueven, la distancia cambia)",
    icon: Equal,
  },
  { move: 1, label: "Alejarse", hint: "Nos aleja del enemigo", icon: ChevronsUp },
];
const TONE: Record<Advice["tone"], string> = {
  info: "border-border text-foreground",
  good: "border-emerald-500/60 text-emerald-200",
  warn: "border-amber-500/70 text-amber-200",
  danger: "border-red-500 text-red-200",
};
const LINE_TONE: Record<Line["tone"], string> = {
  neutral: "text-muted-foreground",
  good: "text-emerald-300",
  bad: "text-red-300",
};

function HullBar({
  label,
  hull,
  max,
  mine,
}: {
  label: string;
  hull: number;
  max: number;
  mine: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (hull / Math.max(1, max)) * 100));
  const color = pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-xs">
        <span className={mine ? "text-sky-300" : "text-red-300"}>{label}</span>
        <span className="tabular-nums">
          {hull}/{max}
        </span>
      </div>
      <div
        className="mt-1 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={hull}
        aria-valuemax={max}
        aria-label={`Casco de ${label}`}
      >
        <div
          className={`h-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Panel del Segundo al mando. */
function Second({
  state,
  side,
  onJump,
}: {
  state: DuelState;
  side: Side;
  onJump?: (() => void) | undefined;
}) {
  const own = state[side];
  const voice = SECOND[own.fleet];
  const advice = briefing(state, side);
  const pleading = own.hull / own.maxHull <= 0.35;
  return (
    <section
      aria-label={voice.title}
      className={`rounded border p-3 ${pleading ? "animate-pulse border-red-500 bg-red-950/30" : "border-primary/40 bg-accent/30"}`}
    >
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-primary">{voice.title}</p>
      <ul className="space-y-1.5">
        {advice.map((a, i) => (
          <li key={i} className={`border-l-2 pl-2 text-sm ${TONE[a.tone]}`}>
            {a.text}
          </li>
        ))}
      </ul>
      {pleading && onJump && (
        <Button
          variant="destructive"
          className="mt-3 h-auto w-full whitespace-normal py-3"
          onClick={onJump}
        >
          <Sparkles />
          Saltar al disforme en la primera fase ({warpChance(own)} %)
        </Button>
      )}
    </section>
  );
}

function defaultStance(state: DuelState, side: Side): Stance {
  const own = state[side];
  if (own.hull / own.maxHull < 0.35) return "defensiva";
  return bestRange(own, state[other(side)]) === 0 ? "asalto" : "optima";
}

/** Planificador de las 5 fases con previsión de distancia y consejos. */
function Planner({
  state,
  side,
  raidId,
  block,
  jumpSignal,
  onFocus,
  onDone,
}: {
  state: DuelState;
  side: Side;
  raidId: string;
  block: number;
  jumpSignal: number;
  onFocus: (r: Range | null) => void;
  onDone: () => void;
}) {
  const own = state[side];
  const voice = SECOND[own.fleet];
  const [stance, setStance] = useState<Stance>(() => defaultStance(state, side));
  const [plan, setPlan] = useState<BlockPlan>(() =>
    suggestPlan(state, side, defaultStance(state, side)),
  );
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!jumpSignal) return;
    setPlan((p) => ({
      ...p,
      phases: p.phases.map((x, k) => (k === 0 ? { move: 0, action: "saltar" } : x)),
    }));
    toast.warning("Salto disforme fijado en la fase 1. Revisa y confirma las órdenes.");
  }, [jumpSignal]);
  const ranges = predictRanges(state, side, plan.phases);
  const setPhase = (i: number, patch: Partial<BlockPlan["phases"][number]>) =>
    setPlan((p) => ({ ...p, phases: p.phases.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  async function send() {
    if (
      plan.phases.some((p) => p.action === "saltar") &&
      !confirm(
        "Hay un salto disforme en el plan. Si sale bien, pierdes el duelo pero salvas la nave. ¿Confirmar?",
      )
    )
      return;
    setSending(true);
    try {
      await submitDuelPlan({ data: { raidId, block, plan } });
      toast.success("Órdenes fijadas");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron fijar las órdenes");
    } finally {
      setSending(false);
    }
  }
  return (
    <section aria-label={`Órdenes del bloque ${block}`} className="space-y-3">
      <div>
        <p className="text-sm">
          <span className="text-primary">{voice.title}:</span> «{voice.lord}, ¿cómo encaramos las
          próximas {PHASES_PER_BLOCK} fases?»
        </p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(Object.keys(STANCES) as Stance[]).map((s) => (
            <Button
              key={s}
              variant="outline"
              aria-pressed={stance === s}
              className={`h-auto flex-col whitespace-normal px-2 py-2 text-xs ${stance === s ? "border-primary bg-accent text-primary" : ""}`}
              onClick={() => {
                setStance(s);
                setPlan((p) => ({
                  ...suggestPlan(state, side, s),
                  emergencyJump: p.emergencyJump,
                }));
              }}
            >
              <span className="font-semibold">{STANCES[s].label}</span>
              <span className="text-[10px] text-muted-foreground">{STANCES[s].text}</span>
            </Button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          El Segundo rellena el plan; puedes cambiar cualquier fase.
        </p>
      </div>
      <ol className="space-y-2">
        {plan.phases.map((p, i) => {
          const advice = phaseAdvice(state, side, plan.phases, i, ranges);
          const from = i === 0 ? state.range : ranges[i - 1]!;
          return (
            <li
              key={i}
              className="rounded border border-border p-2"
              onMouseEnter={() => onFocus(ranges[i]!)}
              onMouseLeave={() => onFocus(null)}
              onFocus={() => onFocus(ranges[i]!)}
            >
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-xs">
                <span className="font-semibold text-primary">Fase {i + 1}</span>
                <span className="text-muted-foreground">
                  {RANGE_NAMES[from]} →{" "}
                  <span className="text-foreground">{RANGE_NAMES[ranges[i]!]}</span> (previsto)
                </span>
              </div>
              <div
                className="grid grid-cols-3 gap-1"
                role="group"
                aria-label={`Maniobra de la fase ${i + 1}`}
              >
                {MOVES.map((m) => {
                  const Icon = m.icon;
                  const on = p.move === m.move;
                  return (
                    <Button
                      key={m.move}
                      size="sm"
                      variant="outline"
                      title={m.hint}
                      aria-pressed={on}
                      disabled={p.action === "embestir" || p.action === "saltar"}
                      className={`h-8 px-1 text-[11px] ${on ? (m.move === -1 ? "border-red-400 bg-red-500/15 text-red-200" : m.move === 1 ? "border-sky-400 bg-sky-500/15 text-sky-200" : "border-primary bg-accent text-primary") : ""}`}
                      onClick={() => setPhase(i, { move: m.move })}
                    >
                      <Icon className="size-3.5" />
                      {m.label}
                    </Button>
                  );
                })}
              </div>
              <div
                className="mt-1 grid grid-cols-4 gap-1 sm:grid-cols-7"
                role="group"
                aria-label={`Acción de la fase ${i + 1}`}
              >
                {ACTIONS.map((a) => {
                  const Icon = ACTION_ICON[a];
                  const on = p.action === a;
                  return (
                    <Button
                      key={a}
                      size="sm"
                      variant="outline"
                      title={ACTION_INFO[a]!.text}
                      aria-pressed={on}
                      className={`h-auto min-w-0 flex-col gap-0.5 px-0.5 py-1.5 text-[10px] ${on ? (a === "saltar" ? "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200" : "border-primary bg-accent text-primary") : "text-muted-foreground"}`}
                      onClick={() =>
                        setPhase(i, a === "embestir" ? { action: a, move: -1 } : { action: a })
                      }
                    >
                      <Icon className="size-4" />
                      {ACTION_INFO[a]!.short}
                    </Button>
                  );
                })}
              </div>
              {advice && (
                <p className={`mt-1.5 border-l-2 pl-2 text-xs ${TONE[advice.tone]}`}>
                  {advice.text}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <div className="rounded border border-border p-2">
        <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>Salto de emergencia si el casco baja de</span>
          <select
            className="rounded border border-border bg-background px-2 py-1 text-sm"
            value={plan.emergencyJump}
            onChange={(e) => setPlan((p) => ({ ...p, emergencyJump: Number(e.target.value) }))}
          >
            {[0, 20, 30, 40, 50].map((v) => (
              <option key={v} value={v}>
                {v ? `${v} %` : "Nunca"}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          «Si las cosas se tuercen a mitad del bloque, saltaré por vos.» Con el casco al 25 % el
          salto tendría un {warpChance({ ...own, hull: Math.ceil(own.maxHull * 0.25) })} % de éxito.{" "}
          {plan.emergencyJump === 0 && (
            <span className="text-amber-300">
              Sin red: si la nave cae a 0, se pierde todo el perfil.
            </span>
          )}
        </p>
      </div>
      <Button
        className="h-auto w-full whitespace-normal py-3"
        disabled={sending}
        onClick={() => void send()}
      >
        Fijar órdenes del bloque {block}
      </Button>
    </section>
  );
}

interface Frame {
  range: Range;
  fx: RadarFx;
  torpedoesOut: number;
  torpedoesIn: number;
}

function frameOf(
  e: DuelEventRow,
  me: Side,
  prevHull: Record<Side, number>,
  end: DuelEnd | null,
  last: boolean,
): Frame {
  const foe = other(me);
  const lostMe = prevHull[me] - e[me].hullAfter;
  const lostFoe = prevHull[foe] - e[foe].hullAfter;
  let fx: RadarFx = null;
  if (last && end?.reason === "destruida")
    fx = end.destroyed.includes(me) ? "boom-us" : "boom-them";
  else if (e[me].warp?.success) fx = "warp-us";
  else if (e[foe].warp?.success) fx = "warp-them";
  else if (e[me].ram?.hit || e[foe].ram?.hit) fx = "ram";
  else if (lostMe > lostFoe) fx = "hit-us";
  else if (lostFoe > 0) fx = "hit-them";
  return {
    range: e.rangeAfter,
    fx,
    torpedoesOut: e[me].instantTorpedoes ? 0 : e[me].torpedoesLaunched,
    torpedoesIn: e[foe].instantTorpedoes ? 0 : e[foe].torpedoesLaunched,
  };
}

/** Repetición fase a fase sobre el radar con narración. */
function useReplay(events: DuelEventRow[], me: Side, start: DuelState | null, end: DuelEnd | null) {
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!playing) return;
    if (idx >= events.length - 1) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(() => setIdx((i) => i + 1), idx < 0 ? 300 : 2600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, idx, events.length]);
  const hulls = useMemo(() => {
    const out: Record<Side, number>[] = [];
    let prev: Record<Side, number> = {
      attacker: start?.attacker.maxHull ?? 0,
      defender: start?.defender.maxHull ?? 0,
    };
    for (const e of events) {
      out.push(prev);
      prev = { attacker: e.attacker.hullAfter, defender: e.defender.hullAfter };
    }
    return out;
  }, [events, start]);
  const frame =
    idx >= 0 && events[idx]
      ? frameOf(events[idx], me, hulls[idx]!, end, idx === events.length - 1)
      : null;
  return {
    idx,
    playing,
    frame,
    play: () => {
      if (idx >= events.length - 1) setIdx(-1);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    step: (d: number) => {
      setPlaying(false);
      setIdx((i) => Math.max(-1, Math.min(events.length - 1, i + d)));
    },
  };
}

function ReplayControls({
  r,
  total,
  label,
}: {
  r: ReturnType<typeof useReplay>;
  total: number;
  label: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        size="icon"
        variant="outline"
        aria-label="Fase anterior"
        onClick={() => r.step(-1)}
        disabled={r.idx < 0}
      >
        <SkipBack />
      </Button>
      {r.playing ? (
        <Button size="sm" variant="outline" onClick={r.pause}>
          <Pause /> Pausa
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={r.play} disabled={!total}>
          <Play /> {label}
        </Button>
      )}
      <Button
        size="icon"
        variant="outline"
        aria-label="Fase siguiente"
        onClick={() => r.step(1)}
        disabled={r.idx >= total - 1}
      >
        <SkipForward />
      </Button>
    </div>
  );
}

function PhaseLines({ e, me, names }: { e: DuelEventRow; me: Side; names: Record<Side, string> }) {
  return (
    <ul className="space-y-0.5">
      {narratePhase(e, me, names).map((l, i) => (
        <li key={i} className={`text-xs ${LINE_TONE[l.tone]}`}>
          {l.text}
        </li>
      ))}
    </ul>
  );
}

const seenKey = (id: string) => `naval3-seen-${id}`;

export function DuelCard({
  raid,
  uid,
  name,
  remaining,
  onChanged,
}: {
  raid: DuelRaid;
  uid: string;
  name: (id: string) => string;
  remaining: (deadline: string) => string;
  onChanged: () => void;
}) {
  const side: Side = raid.attacker_id === uid ? "attacker" : "defender";
  const foeSide = other(side);
  const foeId = side === "attacker" ? raid.defender_id : raid.attacker_id;
  const state = raid.duel_state ?? null;
  const events = raid.report?.v3_events ?? [];
  const lastBlock = events.filter((e) => e.block === raid.block_number - 1);
  const names: Record<Side, string> = { [side]: "Tu nave", [foeSide]: name(foeId) } as Record<
    Side,
    string
  >;
  const replay = useReplay(lastBlock, side, null, null);
  const [focus, setFocus] = useState<Range | null>(null);
  const [jumpSignal, setJumpSignal] = useState(0);
  useEffect(() => {
    if (!lastBlock.length) return;
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(seenKey(raid.id)) ?? 0);
    } catch {
      /* sin almacenamiento */
    }
    if (seen < raid.block_number - 1) {
      replay.play();
      try {
        localStorage.setItem(seenKey(raid.id), String(raid.block_number - 1));
      } catch {
        /* sin almacenamiento */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raid.id, raid.block_number]);
  if (!state)
    return (
      <article className="rounded border border-destructive p-4 text-sm">
        Contacto con {name(foeId)} · preparando el duelo…
      </article>
    );
  const own = state[side];
  const foe = state[foeSide];
  const myReady = side === "attacker" ? raid.attacker_ready : raid.defender_ready;
  const foeReady = side === "attacker" ? raid.defender_ready : raid.attacker_ready;
  const approaching = raid.status === "pendiente";
  const table = rangeTable(own, foe);
  const frame = replay.frame;
  const shownPhase = replay.idx >= 0 ? lastBlock[replay.idx] : null;
  return (
    <article
      className="space-y-4 rounded border border-destructive/70 p-3 sm:p-4"
      aria-label={`Duelo contra ${name(foeId)}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg text-primary">
          {side === "attacker" ? "Ofensiva contra" : "Atacado por"} {name(foeId)}
        </h3>
        <p className="text-xs text-muted-foreground">
          {FLEETS[foe.fleet].name} · {FLEET_PROFILES[foe.fleet].trait} · velocidad{" "}
          {stats(foe).speed} contra {stats(own).speed}
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <HullBar
          label="Tu nave"
          hull={shownPhase ? shownPhase[side].hullAfter : own.hull}
          max={own.maxHull}
          mine
        />
        <HullBar
          label={name(foeId)}
          hull={shownPhase ? shownPhase[foeSide].hullAfter : foe.hull}
          max={foe.maxHull}
          mine={false}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-2">
          <Radar
            range={frame?.range ?? state.range}
            ghost={frame ? null : focus}
            table={table}
            foeLabel={name(foeId)}
            approaching={approaching && !frame}
            torpedoesOut={frame ? frame.torpedoesOut : own.torpedoesInFlight}
            torpedoesIn={frame ? frame.torpedoesIn : foe.torpedoesInFlight}
            fx={frame?.fx ?? null}
            caption={
              shownPhase
                ? `Bloque ${shownPhase.block} · fase ${replay.idx + 1} de ${lastBlock.length}`
                : approaching
                  ? `Aproximación · contacto en ${remaining(raid.deadline)}`
                  : `Distancia actual: ${RANGE_NAMES[state.range]} · torpedos ${own.torpedoesLoaded ? "cargados" : "sin cargar"}`
            }
          />
          {lastBlock.length > 0 && (
            <ReplayControls
              r={replay}
              total={lastBlock.length}
              label={`Ver bloque ${raid.block_number - 1}`}
            />
          )}
          {shownPhase && (
            <div className="rounded border border-border p-2" aria-live="polite">
              <PhaseLines e={shownPhase} me={side} names={names} />
            </div>
          )}
        </div>
        <div className="space-y-3">
          <Second
            state={state}
            side={side}
            onJump={!myReady ? () => setJumpSignal((x) => x + 1) : undefined}
          />
          {myReady ? (
            <p role="status" className="rounded border border-primary/50 p-3 text-sm">
              Órdenes del bloque {raid.block_number} fijadas.{" "}
              {approaching
                ? `El combate empieza al llegar (${remaining(raid.deadline)}).`
                : foeReady
                  ? "Resolviendo…"
                  : `Esperando a ${name(foeId)} · plazo ${remaining(raid.deadline)}. Si no responde, pierde el duelo.`}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {approaching
                  ? `En aproximación: ya puedes fijar el primer bloque. Contacto en ${remaining(raid.deadline)}.`
                  : `Plazo ${remaining(raid.deadline)}. ${foeReady ? `${name(foeId)} ya ha dado sus órdenes.` : ""} Si no das órdenes a tiempo, pierdes el duelo.`}
              </p>
              <Planner
                state={state}
                side={side}
                raidId={raid.id}
                block={raid.block_number}
                jumpSignal={jumpSignal}
                onFocus={setFocus}
                onDone={onChanged}
              />
            </>
          )}
        </div>
      </div>
      {events.length > lastBlock.length && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Registro completo · {events.length} fases
          </summary>
          <FullLog events={events} me={side} names={names} />
        </details>
      )}
    </article>
  );
}

function FullLog({
  events,
  me,
  names,
}: {
  events: DuelEventRow[];
  me: Side;
  names: Record<Side, string>;
}) {
  return (
    <ol className="mt-2 space-y-2">
      {events.map((e) => (
        <li key={e.phase} className="border-l border-border pl-2">
          <p className="mb-0.5 text-[11px] font-semibold text-primary">
            Bloque {e.block} · fase {e.phase}
          </p>
          <PhaseLines e={e} me={me} names={names} />
        </li>
      ))}
    </ol>
  );
}

export function DuelArchiveDialog({
  raid,
  uid,
  name,
  summary,
  onClose,
}: {
  raid: DuelRaid;
  uid: string;
  name: (id: string) => string;
  summary: string;
  onClose: () => void;
}) {
  const side: Side = raid.attacker_id === uid ? "attacker" : "defender";
  const foeSide = other(side);
  const foeId = side === "attacker" ? raid.defender_id : raid.attacker_id;
  const events = raid.report?.v3_events ?? [];
  const end = raid.report?.v3_end ?? null;
  const names: Record<Side, string> = { [side]: "Tu nave", [foeSide]: name(foeId) } as Record<
    Side,
    string
  >;
  const replay = useReplay(events, side, raid.duel_state ?? null, end);
  const e = replay.idx >= 0 ? events[replay.idx] : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary">Duelo contra {name(foeId)}</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        <Radar
          range={replay.frame?.range ?? 3}
          foeLabel={name(foeId)}
          fx={replay.frame?.fx ?? null}
          torpedoesOut={replay.frame?.torpedoesOut ?? 0}
          torpedoesIn={replay.frame?.torpedoesIn ?? 0}
          caption={e ? `Bloque ${e.block} · fase ${e.phase}` : `${events.length} fases`}
        />
        <ReplayControls r={replay} total={events.length} label="Reproducir duelo" />
        {e && (
          <div className="rounded border border-border p-2" aria-live="polite">
            <PhaseLines e={e} me={side} names={names} />
          </div>
        )}
        {end && (!e || replay.idx === events.length - 1) && (
          <p className={`text-sm ${LINE_TONE[endLine(end, side, names).tone]}`}>
            {endLine(end, side, names).text}
          </p>
        )}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Registro completo</summary>
          <FullLog events={events} me={side} names={names} />
        </details>
      </DialogContent>
    </Dialog>
  );
}

/** Cómo funciona, en corto. */
export function DuelRules({ fleet }: { fleet: keyof typeof FLEET_PROFILES }) {
  const p = FLEET_PROFILES[fleet];
  return (
    <details className="rounded border border-border p-3 text-sm">
      <summary className="cursor-pointer text-primary">Cómo funciona el combate naval</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          Duelo entre naves capitales. El combate va en bloques de {PHASES_PER_BLOCK} fases: los dos
          dais las órdenes a ciegas y se resuelve en cuanto ambos confirmáis (máximo 24 h).
        </li>
        <li>
          Cada fase eliges <b>maniobra</b> (acercarse, mantener, alejarse) y <b>acción</b>. Si
          tiráis en sentidos opuestos, decide la nave más rápida.
        </li>
        <li>
          Cada flota es más letal a una distancia: el radar pinta de verde donde les superas y de
          rojo donde te superan.
        </li>
        <li>
          Los torpedos se lanzan cargados, llegan en la fase siguiente (de cerca, al instante) y
          pueden esquivarse. Después hay que recargar.
        </li>
        <li>Embestir solo funciona en Cerca o Contacto. Hace mucho daño, también a ti.</li>
        <li>
          Se pierde de dos formas: <b>la nave estalla</b> (casco a 0: el perfil se reinicia por
          completo) o <b>saltas al disforme</b> (pierdes el duelo, salvas la nave). El salto es
          instantáneo, pero puede fallar y cuanto más dañado estés, peor.
        </li>
        <li>Si no das órdenes a tiempo pierdes el duelo (si nadie las da, pierde el atacante).</li>
      </ul>
      <p className="mt-2 text-xs">
        <span className="text-primary">Tu flota · {p.trait}:</span> {p.traitText} Velocidad{" "}
        {p.speed}, esquiva {p.dodge} %, {p.torpedoes} {p.torpedoName} por salva.
      </p>
    </details>
  );
}
