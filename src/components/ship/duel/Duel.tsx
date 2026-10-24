import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ArrowUp,
  Crosshair,
  Flame,
  Gauge,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  RotateCcw,
  RotateCw,
  Shield,
  SkipBack,
  SkipForward,
  Sparkles,
  Undo2,
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
import { FLEETS, type FleetId } from "@/lib/ship-identity";
import {
  ACTION_INFO,
  FLEET_PROFILES,
  PHASES_PER_BLOCK,
  SECOND,
  SPEED_INFO,
} from "@/lib/naval3/factions";
import { bandOf, maxTurn, normalizeState, other, unitsFor, warpChance } from "@/lib/naval3/engine";
import {
  STANCES,
  arcLabel,
  briefing,
  phaseAdvice,
  predictPath,
  suggestPlan,
  blockDebrief,
  type Advice,
  type Debrief,
  type PathStep,
  type Stance,
} from "@/lib/naval3/advisor";
import { endLine, narratePhase, type Line } from "@/lib/naval3/narrate";
import {
  RANGE_NAMES,
  type Action,
  type BlockPlan,
  type DuelEnd,
  type DuelState,
  type Helm,
  type PhaseEvent,
  type PhasePlan,
  type Side,
  type SideState,
  type Speed,
} from "@/lib/naval3/types";
import { mainArc } from "@/lib/naval3/engine";
import { submitDuelPlan } from "@/lib/naval3.functions";
import {
  audioReady,
  play,
  preloadAudio,
  startLoop,
  stopAllLoops,
  stopLoop,
  unlockAudio,
} from "@/lib/sfx/engine";
import { Radar, geoOf, type Geo } from "./Radar";
import type { FxEngine } from "./fx";
import { MOVE_AT, PHASE_SECONDS, phaseCues } from "./stage";
import { DuelHelp } from "./Help";
import { SoundControls } from "./SoundControls";

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
  escudos: Shield,
  evasion: Wind,
  embestir: Zap,
  reparar: Wrench,
  saltar: Sparkles,
};
const ACTIONS = Object.keys(ACTION_ICON) as Action[];
const HELMS: { helm: Helm; label: string; hint: string; icon: LucideIcon }[] = [
  {
    helm: "encarar",
    label: "Encarar",
    hint: "Gira para poner la proa hacia el enemigo (nos acerca)",
    icon: Crosshair,
  },
  {
    helm: "costado",
    label: "Costado",
    hint: "Gira para presentarle el costado (andanadas; la distancia apenas cambia)",
    icon: ArrowLeftRight,
  },
  {
    helm: "huir",
    label: "Alejarse",
    hint: "Gira para darle la espalda y alejarte (¡expone la popa!)",
    icon: Undo2,
  },
  { helm: 0, label: "Recto", hint: "Mantiene el rumbo actual", icon: ArrowUp },
];
const MANUAL: { helm: Helm; label: string; icon: LucideIcon }[] = [
  { helm: -2, label: "90°", icon: RotateCcw },
  { helm: -1, label: "45°", icon: RotateCcw },
  { helm: 1, label: "45°", icon: RotateCw },
  { helm: 2, label: "90°", icon: RotateCw },
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
      className={`rounded border p-3 ${pleading ? "border-red-500 bg-red-950/30 motion-safe:animate-pulse" : "border-primary/40 bg-accent/30"}`}
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
  return "optima";
}

const helmLabel = (h: Helm) =>
  typeof h === "number"
    ? h === 0
      ? "Recto"
      : `${h < 0 ? "Babor" : "Estribor"} ${Math.abs(h) * 45}°`
    : HELMS.find((x) => x.helm === h)!.label;

function sideName(rel: number) {
  const a = mainArc(rel);
  return a === "proa" ? "a proa" : a === "popa" ? "a popa" : `a ${a}`;
}

/** Resumen compacto de una fase prevista. */
function PhaseChip({
  i,
  p,
  step,
  active,
  onSelect,
  onHover,
}: {
  i: number;
  p: PhasePlan;
  step: PathStep;
  active: boolean;
  onSelect: () => void;
  onHover: (h: boolean) => void;
}) {
  const Icon = ACTION_ICON[p.action];
  const good = step.ourHit - step.theirHit;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`flex min-w-0 flex-col items-center gap-0.5 rounded border px-1 py-1.5 text-[10px] ${active ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground"}`}
    >
      <span className="font-semibold">Fase {i + 1}</span>
      <Icon className="size-4" />
      <span className="truncate">{RANGE_NAMES[step.band]}</span>
      <span className={good > 0.5 ? "text-emerald-300" : good < -0.5 ? "text-red-300" : ""}>
        {step.ourHit.toFixed(1)}/{step.theirHit.toFixed(1)}
      </span>
    </button>
  );
}

/** Planificador de las 5 fases: velocidad, timón y acción, con previsión de posición. */
function Planner({
  state,
  side,
  raidId,
  block,
  jumpSignal,
  onGhost,
  onDone,
}: {
  state: DuelState;
  side: Side;
  raidId: string;
  block: number;
  jumpSignal: number;
  onGhost: (g: Geo | null) => void;
  onDone: () => void;
}) {
  const own = state[side];
  const voice = SECOND[own.fleet];
  const [stance, setStance] = useState<Stance>(() => defaultStance(state, side));
  const [plan, setPlan] = useState<BlockPlan>(() =>
    suggestPlan(state, side, defaultStance(state, side)),
  );
  const [sel, setSel] = useState(0);
  const [sending, setSending] = useState(false);
  const path = useMemo(() => predictPath(state, side, plan.phases), [state, side, plan]);
  useEffect(() => {
    if (!jumpSignal) return;
    setPlan((p) => ({
      ...p,
      phases: p.phases.map((x, k) => (k === 0 ? { speed: 0, turn: 0, action: "saltar" } : x)),
    }));
    setSel(0);
    toast.warning("Salto disforme fijado en la fase 1. Revisa y confirma las órdenes.");
  }, [jumpSignal]);
  useEffect(() => {
    const st = path[sel];
    onGhost(st ? geoOf(st.own, st.foe) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, sel]);
  const setPhase = (i: number, patch: Partial<PhasePlan>) => {
    play("click");
    setPlan((p) => ({ ...p, phases: p.phases.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));
  };
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
  const p = plan.phases[sel]!;
  const step = path[sel]!;
  const prevBand =
    sel === 0 ? bandOf(geoOf(state[side], state[other(side)]).distance) : path[sel - 1]!.band;
  const advice = phaseAdvice(state, side, plan.phases, sel, path);
  const locked = p.action === "embestir" || p.action === "saltar";
  const cap = maxTurn(own, p.speed);
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
                play("click");
                setStance(s);
                setPlan((pl) => ({
                  ...suggestPlan(state, side, s),
                  emergencyJump: pl.emergencyJump,
                }));
              }}
            >
              <span className="font-semibold">{STANCES[s].label}</span>
              <span className="text-[10px] text-muted-foreground">{STANCES[s].text}</span>
            </Button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          El Segundo rellena el plan; toca una fase para cambiarla. Las cifras son daño previsto
          nuestro/suyo si el enemigo mantiene rumbo.
        </p>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {plan.phases.map((ph, i) => (
          <PhaseChip
            key={i}
            i={i}
            p={ph}
            step={path[i]!}
            active={i === sel}
            onSelect={() => setSel(i)}
            onHover={(h) =>
              onGhost(
                h
                  ? geoOf(path[i]!.own, path[i]!.foe)
                  : path[sel]
                    ? geoOf(path[sel]!.own, path[sel]!.foe)
                    : null,
              )
            }
          />
        ))}
      </div>
      <div className="space-y-2 rounded border border-primary/50 p-2">
        <div className="flex flex-wrap items-baseline justify-between gap-1 text-xs">
          <span className="font-semibold text-primary">Fase {sel + 1}</span>
          <span className="text-muted-foreground">
            {RANGE_NAMES[prevBand]} →{" "}
            <span className="text-foreground">{RANGE_NAMES[step.band]}</span> (
            {step.distance.toFixed(1)} u) · enemigo {sideName(step.rel)} · nosotros{" "}
            {sideName(step.relFoe)} de él
          </span>
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Gauge className="size-3" /> Máquinas
          </p>
          <div
            className="grid grid-cols-3 gap-1"
            role="group"
            aria-label={`Velocidad de la fase ${sel + 1}`}
          >
            {SPEED_INFO.map((sp, k) => (
              <Button
                key={k}
                size="sm"
                variant="outline"
                title={sp.text}
                aria-pressed={p.speed === k}
                disabled={locked}
                className={`h-auto flex-col px-1 py-1 text-[11px] ${p.speed === k ? (k === 2 ? "border-orange-400 bg-orange-500/15 text-orange-200" : "border-primary bg-accent text-primary") : ""}`}
                onClick={() =>
                  setPhase(sel, { speed: k as Speed, ...(k === 2 ? { turn: 0 } : {}) })
                }
              >
                {sp.short}
                <span className="text-[9px] text-muted-foreground">
                  {unitsFor(own, k as Speed)} u/fase
                </span>
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Timón {p.speed === 2 ? "· bloqueado a avante toda" : `· hasta ${cap * 45}°`}
          </p>
          <div
            className="grid grid-cols-4 gap-1"
            role="group"
            aria-label={`Timón de la fase ${sel + 1}`}
          >
            {HELMS.map((h) => {
              const Icon = h.icon;
              const on = p.turn === h.helm;
              return (
                <Button
                  key={String(h.helm)}
                  size="sm"
                  variant="outline"
                  title={h.hint}
                  aria-pressed={on}
                  disabled={locked || p.speed === 2}
                  className={`h-8 px-1 text-[11px] ${on ? "border-primary bg-accent text-primary" : ""}`}
                  onClick={() => setPhase(sel, { turn: h.helm })}
                >
                  <Icon className="size-3.5" />
                  {h.label}
                </Button>
              );
            })}
            {MANUAL.map((h) => {
              const Icon = h.icon;
              const on = p.turn === h.helm;
              const n = Math.abs(h.helm as number);
              return (
                <Button
                  key={String(h.helm)}
                  size="sm"
                  variant="outline"
                  title={`${(h.helm as number) < 0 ? "Babor" : "Estribor"} ${n * 45}°`}
                  aria-pressed={on}
                  disabled={locked || n > cap}
                  className={`h-7 px-1 text-[10px] ${on ? "border-primary bg-accent text-primary" : "text-muted-foreground"}`}
                  onClick={() => setPhase(sel, { turn: h.helm })}
                >
                  <Icon className="size-3" />
                  {(h.helm as number) < 0 ? "B" : "E"} {h.label}
                </Button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Acción</p>
          <div
            className="grid grid-cols-4 gap-1 sm:grid-cols-7"
            role="group"
            aria-label={`Acción de la fase ${sel + 1}`}
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
                    setPhase(
                      sel,
                      a === "embestir"
                        ? { action: a, speed: 2, turn: 0 }
                        : a === "saltar"
                          ? { action: a, speed: 0, turn: 0 }
                          : { action: a },
                    )
                  }
                >
                  <Icon className="size-4" />
                  {ACTION_INFO[a]!.short}
                </Button>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {SPEED_INFO[p.speed].name} · {helmLabel(p.turn)} · {ACTION_INFO[p.action]!.name}.
          Disparamos con {arcLabel(mainArc(step.rel))}:{" "}
          <span className="text-sky-300">{step.ourHit.toFixed(1)}</span> · ellos nos hacen{" "}
          <span className="text-red-300">{step.theirHit.toFixed(1)}</span>
        </p>
        {advice && <p className={`border-l-2 pl-2 text-xs ${TONE[advice.tone]}`}>{advice.text}</p>}
      </div>
      <div className="rounded border border-border p-2">
        <label className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>Salto de emergencia si el casco baja de</span>
          <select
            className="rounded border border-border bg-background px-2 py-1 text-sm"
            value={plan.emergencyJump}
            onChange={(e) => setPlan((pl) => ({ ...pl, emergencyJump: Number(e.target.value) }))}
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

/** Estado reconstruido de cada nave tras una fase (para el radar de la repetición). */
function sideAt(base: SideState, e: PhaseEvent, s: Side): SideState {
  return { ...base, pos: e[s].pos, heading: e[s].heading, hull: e[s].hullAfter };
}

type LogLine = Line & { id: number; who?: "segundo" | "fase" | "informe" | undefined };

/** Frases del registro de unas fases, sin animación (para saltar o retroceder). */
function staticLines(
  events: DuelEventRow[],
  me: Side,
  names: Record<Side, string>,
  from: number,
  to: number,
): Line[] {
  const out: (Line & { who?: "fase" })[] = [];
  for (let i = from; i < to; i++) {
    const e = events[i]!;
    out.push({
      side: null,
      tone: "neutral",
      text: `Fase ${e.phase} · ${RANGE_NAMES[e.rangeBefore]}`,
      who: "fase",
    });
    out.push(...narratePhase(e, me, names));
  }
  return out;
}

/**
 * Repetición fase a fase: el radar mueve las naves, los efectos muestran cada disparo de principio
 * a fin, suena todo con panorama estéreo y el registro se va escribiendo con los comentarios del Segundo.
 */
function useReplay(opts: {
  events: DuelEventRow[];
  me: Side;
  start: DuelState | null;
  end: DuelEnd | null;
  fx: React.RefObject<FxEngine | null>;
  names: Record<Side, string>;
  epilogue: (Line & { who?: "segundo" | "informe" })[];
}) {
  const { events, me, start, end, fx, names, epilogue } = opts;
  const [idx, setIdx] = useState(-1);
  const [moved, setMoved] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [log, setLog] = useState<LogLine[]>([]);
  const timers = useRef<number[]>([]);
  const lineId = useRef(0);
  const foe = other(me);
  const clear = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };
  useEffect(() => clear, []);
  const geos = useMemo(() => {
    if (!start) return [];
    const s0 = normalizeState(start);
    const out: {
      before: Geo;
      after: Geo;
      own: SideState;
      foe: SideState;
      ownBefore: SideState;
      foeBefore: SideState;
    }[] = [];
    let prevOwn = s0[me];
    let prevFoe = s0[foe];
    for (const e of events) {
      if (e.before) {
        prevOwn = { ...prevOwn, ...e.before[me] };
        prevFoe = { ...prevFoe, ...e.before[foe] };
      }
      const own = sideAt(prevOwn, e, me);
      const f = sideAt(prevFoe, e, foe);
      out.push({
        before: geoOf(prevOwn, prevFoe),
        after: geoOf(own, f),
        own,
        foe: f,
        ownBefore: prevOwn,
        foeBefore: prevFoe,
      });
      prevOwn = own;
      prevFoe = f;
    }
    return out;
  }, [events, start, me, foe]);
  const push = (lines: (Line & { who?: LogLine["who"] })[]) =>
    setLog((l) => [...l, ...lines.map((x) => ({ ...x, id: ++lineId.current }))]);

  function runPhase(i: number, auto: boolean, spd: number) {
    clear();
    fx.current?.clear();
    if (fx.current) fx.current.speed = spd;
    if (!start || !geos[i] || !events[i]) return;
    setIdx(i);
    setMoved(false);
    const k = 1000 / spd;
    const last = i === events.length - 1;
    const cues = phaseCues({
      e: events[i],
      me,
      fleets: { attacker: start.attacker.fleet, defender: start.defender.fleet },
      names,
      before: geos[i].before,
      after: geos[i].after,
      fx: () => fx.current,
      end,
      last,
      maxHull: { attacker: start.attacker.maxHull, defender: start.defender.maxHull },
    });
    timers.current.push(window.setTimeout(() => setMoved(true), MOVE_AT * k));
    for (const c of cues)
      timers.current.push(
        window.setTimeout(() => {
          c.run?.();
          if (c.line) push([c.line]);
        }, c.t * k),
      );
    const tail = (PHASE_SECONDS + (last && end?.reason === "destruida" ? 3 : 0)) * k;
    if (auto)
      timers.current.push(
        window.setTimeout(() => {
          if (!last) runPhase(i + 1, true, spd);
          else {
            setPlaying(false);
            push(epilogue);
          }
        }, tail),
      );
    else if (last) timers.current.push(window.setTimeout(() => push(epilogue), tail));
  }

  return {
    idx,
    playing,
    speed,
    log,
    frame:
      idx >= 0 && geos[idx]
        ? {
            geo: moved ? geos[idx].after : geos[idx].before,
            own: moved ? geos[idx].own : geos[idx].ownBefore,
            foe: moved ? geos[idx].foe : geos[idx].foeBefore,
          }
        : null,
    play: () => {
      unlockAudio();
      const from = idx < 0 || idx >= events.length - 1 ? 0 : idx + 1;
      if (from === 0) setLog([]);
      setPlaying(true);
      runPhase(from, true, speed);
    },
    pause: () => {
      clear();
      setPlaying(false);
      setMoved(true);
    },
    step: (d: number) => {
      unlockAudio();
      setPlaying(false);
      const target = Math.max(0, Math.min(events.length - 1, idx + d));
      if (d < 0)
        setLog(
          staticLines(events, me, names, 0, target).map((x) => ({ ...x, id: ++lineId.current })),
        );
      runPhase(target, false, speed);
    },
    skip: () => {
      clear();
      fx.current?.clear();
      setPlaying(false);
      setIdx(events.length - 1);
      setMoved(true);
      setLog(
        [...staticLines(events, me, names, 0, events.length), ...epilogue].map((x) => ({
          ...x,
          id: ++lineId.current,
        })),
      );
    },
    toggleSpeed: () => setSpeed((s) => (s === 1 ? 2 : 1)),
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
    <div className="flex flex-wrap items-center justify-center gap-1">
      <Button
        size="icon"
        variant="outline"
        aria-label="Fase anterior"
        onClick={() => r.step(-1)}
        disabled={r.idx <= 0}
      >
        <SkipBack />
      </Button>
      {r.playing ? (
        <Button size="sm" variant="outline" onClick={r.pause}>
          <Pause /> Pausa
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={r.play} disabled={!total}>
          <Play /> {r.idx >= 0 && r.idx < total - 1 ? "Continuar" : label}
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
      <Button
        size="sm"
        variant="outline"
        aria-label="Velocidad de la repetición"
        onClick={r.toggleSpeed}
      >
        ×{r.speed}
      </Button>
      <Button size="sm" variant="ghost" onClick={r.skip} disabled={!total}>
        Ver todo
      </Button>
    </div>
  );
}

/** Texto que se escribe letra a letra. */
function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const step = Math.max(1, Math.round(text.length / 45));
    const t = window.setInterval(
      () => setN((x) => (x >= text.length ? (clearInterval(t), x) : x + step)),
      16,
    );
    return () => clearInterval(t);
  }, [text]);
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="opacity-60">▌</span>}
    </>
  );
}

/** Registro de combate en directo. */
function LiveLog({ lines, empty }: { lines: LogLine[]; empty: string }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);
  return (
    <section aria-label="Registro de combate" className="rounded border border-border bg-black/30">
      <p className="border-b border-border px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Registro de combate
      </p>
      <ol
        ref={box}
        aria-live="polite"
        className="max-h-64 space-y-1 overflow-y-auto p-2 font-mono text-xs"
      >
        {!lines.length && <li className="text-muted-foreground">{empty}</li>}
        {lines.map((l, i) => {
          const latest = i === lines.length - 1;
          const body = latest ? <Typewriter text={l.text} /> : l.text;
          if (l.who === "fase")
            return (
              <li key={l.id} className="pt-1 text-[10px] uppercase tracking-widest text-primary">
                ── {body}
              </li>
            );
          if (l.who === "segundo" || l.who === "informe")
            return (
              <li
                key={l.id}
                className={`border-l-2 pl-2 ${l.tone === "bad" ? "border-red-500 text-red-200" : l.tone === "good" ? "border-emerald-500 text-emerald-200" : "border-amber-400 text-amber-100"}`}
              >
                {body}
              </li>
            );
          return (
            <li key={l.id} className={LINE_TONE[l.tone]}>
              {body}
            </li>
          );
        })}
      </ol>
    </section>
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

/** Informe del Segundo tras el último bloque. */
function DebriefPanel({ d, title }: { d: Debrief; title: string }) {
  return (
    <section aria-label={title} className="rounded border border-amber-500/50 bg-amber-950/10 p-3">
      <p className="mb-1 text-xs uppercase tracking-[0.2em] text-amber-300">{title}</p>
      <ul className="space-y-1">
        {d.notes.map((n, i) => (
          <li key={i} className={`border-l-2 pl-2 text-sm ${TONE[n.tone]}`}>
            {n.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

const debriefLines = (d: Debrief | null, title: string): (Line & { who: "informe" })[] =>
  d
    ? [
        { side: null, tone: "neutral", text: title, who: "informe" },
        ...d.notes.map((n) => ({
          side: null,
          tone: (n.tone === "good"
            ? "good"
            : n.tone === "info"
              ? "neutral"
              : "bad") as Line["tone"],
          text: n.text,
          who: "informe" as const,
        })),
      ]
    : [];

const seenKey = (id: string) => `naval3-seen-${id}`;

/** Ambiente de puente y música (tensión en la aproximación, combate después). Arranca tras el primer gesto. */
function useBattleAmbience(status: string | null, raidId: string) {
  useEffect(() => {
    if (!status) return;
    preloadAudio();
    const music = status === "pendiente" ? "musica_tension" : "musica_combate";
    const start = () => {
      unlockAudio();
      stopLoop(music === "musica_combate" ? "musica_tension" : "musica_combate");
      startLoop("puente");
      startLoop(music, 3);
      if (status === "enfrentado") {
        let heard = false;
        try {
          heard = localStorage.getItem(`naval3-braam-${raidId}`) === "1";
          localStorage.setItem(`naval3-braam-${raidId}`, "1");
        } catch {
          /* sin almacenamiento */
        }
        if (!heard) play("inicio_combate");
      }
    };
    if (audioReady()) start();
    else window.addEventListener("pointerdown", start, { once: true });
    return () => window.removeEventListener("pointerdown", start);
  }, [status, raidId]);
  useEffect(() => () => stopAllLoops(), []);
}

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
  const state = useMemo(
    () => (raid.duel_state ? normalizeState(raid.duel_state) : null),
    [raid.duel_state],
  );
  const events = useMemo(() => raid.report?.v3_events ?? [], [raid.report]);
  const lastBlock = useMemo(
    () => events.filter((e) => e.block === raid.block_number - 1),
    [events, raid.block_number],
  );
  const foeName = name(foeId);
  const names = useMemo(
    () => ({ [side]: "Tu nave", [foeSide]: foeName }) as Record<Side, string>,
    [side, foeSide, foeName],
  );
  const debrief = useMemo(
    () => (state ? blockDebrief(lastBlock, side, state) : null),
    [lastBlock, side, state],
  );
  const epilogue = useMemo(
    () => debriefLines(debrief, `Informe del bloque ${raid.block_number - 1}`),
    [debrief, raid.block_number],
  );
  const fx = useRef<FxEngine | null>(null);
  const replay = useReplay({
    events: lastBlock,
    me: side,
    start: state,
    end: null,
    fx,
    names,
    epilogue,
  });
  const [ghost, setGhost] = useState<Geo | null>(null);
  const [jumpSignal, setJumpSignal] = useState(0);
  useBattleAmbience(state ? raid.status : null, raid.id);
  useEffect(() => {
    if (!lastBlock.length) return;
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(seenKey(raid.id)) ?? 0);
    } catch {
      /* sin almacenamiento */
    }
    if (seen < raid.block_number - 1) {
      const t = window.setTimeout(() => replay.play(), 400);
      try {
        localStorage.setItem(seenKey(raid.id), String(raid.block_number - 1));
      } catch {
        /* sin almacenamiento */
      }
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raid.id, raid.block_number]);
  if (!state)
    return (
      <article className="rounded border border-destructive p-4 text-sm">
        Contacto con {foeName} · preparando el duelo…
      </article>
    );
  const own = state[side];
  const foe = state[foeSide];
  const myReady = side === "attacker" ? raid.attacker_ready : raid.defender_ready;
  const foeReady = side === "attacker" ? raid.defender_ready : raid.attacker_ready;
  const approaching = raid.status === "pendiente";
  const frame = replay.frame;
  const shownPhase = replay.idx >= 0 ? lastBlock[replay.idx] : null;
  return (
    <article
      className="space-y-4 rounded border border-destructive/70 p-3 sm:p-4"
      aria-label={`Duelo contra ${foeName}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg text-primary">
            {side === "attacker" ? "Ofensiva contra" : "Atacado por"} {foeName}
          </h3>
          <p className="text-xs text-muted-foreground">
            {FLEETS[foe.fleet].name} · {FLEET_PROFILES[foe.fleet].trait}
          </p>
        </div>
        <div className="flex gap-1">
          <DuelHelp fleet={own.fleet} />
          <SoundControls />
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <HullBar
          label="Tu nave"
          hull={shownPhase ? shownPhase[side].hullAfter : own.hull}
          max={own.maxHull}
          mine
        />
        <HullBar
          label={foeName}
          hull={shownPhase ? shownPhase[foeSide].hullAfter : foe.hull}
          max={foe.maxHull}
          mine={false}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-2 md:sticky md:top-2 md:self-start">
          <Radar
            own={frame?.own ?? own}
            foe={frame?.foe ?? foe}
            geo={frame?.geo}
            ghost={frame ? null : ghost}
            foeLabel={foeName}
            approaching={approaching && !frame}
            torpedoesOut={frame ? 0 : own.torpedoesInFlight}
            torpedoesIn={frame ? 0 : foe.torpedoesInFlight}
            onFx={(f) => (fx.current = f)}
            caption={
              shownPhase
                ? `Bloque ${shownPhase.block} · fase ${replay.idx + 1} de ${lastBlock.length}`
                : approaching
                  ? `Aproximación · contacto en ${remaining(raid.deadline)}`
                  : `Ahora: ${RANGE_NAMES[bandOf(geoOf(own, foe).distance)]} · torpedos ${own.torpedoesLoaded ? "cargados" : "sin cargar"}${ghost ? " · silueta discontinua: previsión de la fase elegida" : ""}`
            }
          />
          {lastBlock.length > 0 && (
            <ReplayControls
              r={replay}
              total={lastBlock.length}
              label={`Ver bloque ${raid.block_number - 1}`}
            />
          )}
          {(lastBlock.length > 0 || replay.log.length > 0) && (
            <LiveLog
              lines={replay.log}
              empty={`Pulsa «Ver bloque ${raid.block_number - 1}» para revivir el último bloque.`}
            />
          )}
        </div>
        <div className="space-y-3">
          {debrief && !replay.playing && (
            <DebriefPanel d={debrief} title={`Informe del bloque ${raid.block_number - 1}`} />
          )}
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
                  : `Esperando a ${foeName} · plazo ${remaining(raid.deadline)}. Si no responde, pierde el duelo.`}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {approaching
                  ? `En aproximación: ya puedes fijar el primer bloque. Contacto en ${remaining(raid.deadline)}.`
                  : `Plazo ${remaining(raid.deadline)}. ${foeReady ? `${foeName} ya ha dado sus órdenes.` : ""} Si no das órdenes a tiempo, pierdes el duelo.`}
              </p>
              <Planner
                state={state}
                side={side}
                raidId={raid.id}
                block={raid.block_number}
                jumpSignal={jumpSignal}
                onGhost={setGhost}
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
  const events = useMemo(() => raid.report?.v3_events ?? [], [raid.report]);
  const end = raid.report?.v3_end ?? null;
  const foeName = name(foeId);
  const names = useMemo(
    () => ({ [side]: "Tu nave", [foeSide]: foeName }) as Record<Side, string>,
    [side, foeSide, foeName],
  );
  const start = useMemo<DuelState | null>(() => {
    if (!raid.duel_state) return null;
    const s = normalizeState(raid.duel_state);
    const b = events[0]?.before;
    for (const sd of ["attacker", "defender"] as const) {
      if (b) {
        s[sd].pos = b[sd].pos;
        s[sd].heading = b[sd].heading;
      }
      s[sd].hull = s[sd].maxHull;
    }
    return s;
  }, [raid.duel_state, events]);
  const epilogue = useMemo(() => {
    const out: (Line & { who?: "segundo" | "informe" })[] = [];
    if (end) out.push({ ...endLine(end, side, names), who: "informe" });
    if (raid.duel_state)
      out.push(...debriefLines(blockDebrief(events, side, raid.duel_state), "Balance del duelo"));
    return out;
  }, [end, side, names, raid.duel_state, events]);
  const fx = useRef<FxEngine | null>(null);
  const replay = useReplay({ events, me: side, start, end, fx, names, epilogue });
  const e = replay.idx >= 0 ? events[replay.idx] : null;
  const frame = replay.frame;
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) {
          stopAllLoops();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary">Duelo contra {foeName}</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-1">
          {start && <DuelHelp fleet={start[side].fleet} />}
          <SoundControls />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            {start && (
              <Radar
                own={frame?.own ?? start[side]}
                foe={frame?.foe ?? start[foeSide]}
                geo={frame?.geo}
                foeLabel={foeName}
                onFx={(f) => (fx.current = f)}
                compact
                caption={e ? `Bloque ${e.block} · fase ${e.phase}` : `${events.length} fases`}
              />
            )}
            <ReplayControls r={replay} total={events.length} label="Reproducir duelo" />
          </div>
          <LiveLog lines={replay.log} empty="Pulsa «Reproducir duelo» o «Ver todo»." />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Cómo funciona, en corto. */
export function DuelRules({ fleet }: { fleet: FleetId }) {
  const p = FLEET_PROFILES[fleet];
  return (
    <details className="rounded border border-border p-3 text-sm">
      <summary className="cursor-pointer text-primary">Cómo funciona el combate naval</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          Duelo entre naves capitales en bloques de {PHASES_PER_BLOCK} fases: los dos dais las
          órdenes a ciegas y se resuelve en cuanto ambos confirmáis (máximo 24 h).
        </li>
        <li>
          Cada fase eliges <b>máquinas</b> (parar, avante, avante toda), <b>timón</b> y{" "}
          <b>acción</b>. El timón puede ser una intención —encarar, presentar el costado, alejarse—
          que se ajusta sola a dónde esté el enemigo, o un giro fijo de 45°/90°.
        </li>
        <li>
          Las armas van por <b>arcos</b>: proa, costados (babor y estribor) y popa. El radar pinta
          en azul la potencia de cada arco y en rojo los del enemigo. Atacar su popa hace más daño;
          darle la tuya, también.
        </li>
        <li>
          <b>Avante toda</b> fuerza los motores para dar caza o escapar: mucha más velocidad, pero
          sin girar y con el fuego a la mitad. Parado se gira 45° más.
        </li>
        <li>
          Los torpedos solo salen por la proa, llegan en la fase siguiente (de cerca, al instante) y
          pueden esquivarse. Después hay que recargar. Embestir exige tenerle a proa.
        </li>
        <li>
          Se pierde de dos formas: <b>la nave estalla</b> (casco a 0: el perfil se reinicia por
          completo) o <b>saltas al disforme</b> (pierdes el duelo, salvas la nave). El salto es
          instantáneo, pero puede fallar.
        </li>
        <li>Si no das órdenes a tiempo pierdes el duelo (si nadie las da, pierde el atacante).</li>
      </ul>
      <p className="mt-2 text-xs">
        <span className="text-primary">Tu flota · {p.trait}:</span> {p.traitText} Velocidad{" "}
        {p.speed} (avante toda {p.speed + p.burn}), giro {p.agility * 45}°, esquiva {p.dodge} %.
        Proa: {p.prowName}. Costados: {p.broadsideName}. {p.torpedoes} {p.torpedoName} por salva.
      </p>
    </details>
  );
}
