import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Flame,
  GraduationCap,
  Pause,
  Play,
  RefreshCw,
  Rocket,
  Shield,
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
import { FLEETS, type FleetId } from "@/lib/ship-identity";
import { ACTION_INFO, FLEET_PROFILES, PHASES_PER_BLOCK, SECOND } from "@/lib/naval3/factions";
import { mainArc, normalizeState, other, warpChance } from "@/lib/naval3/engine";
import {
  STANCES,
  blockDebrief,
  briefing,
  forecast,
  phaseAdvice,
  reachable,
  suggestPlan,
  type Advice,
  type Debrief,
  type PathStep,
  type Stance,
} from "@/lib/naval3/advisor";
import { MANEUVERS, maneuverMove, maneuverOf } from "@/lib/naval3/maneuvers";
import { endLine, narratePhase, type Line } from "@/lib/naval3/narrate";
import {
  RANGE_NAMES,
  type Action,
  type BlockPlan,
  type DuelEnd,
  type DuelState,
  type PhaseEvent,
  type PhasePlan,
  type Side,
  type SideState,
} from "@/lib/naval3/types";
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
import { TacticalMap, poseAt, type Motion, type Projection } from "./TacticalMap";
import type { FxEngine } from "./fx";
import { MOVE_AT, PHASE_SECONDS, phaseCues } from "./stage";
import { SoundControls } from "./SoundControls";
import { DuelHelp } from "./Help";
import { Tutorial, tutorialSeen } from "./Tutorial";

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

const sideName = (rel: number) => {
  const a = mainArc(rel);
  return a === "proa" ? "a proa" : a === "popa" ? "a popa" : `a ${a}`;
};

function HullBar({
  label,
  hull,
  max,
  mine,
  projected,
}: {
  label: string;
  hull: number;
  max: number;
  mine: boolean;
  projected?: number | undefined;
}) {
  const pct = Math.max(0, Math.min(100, (hull / Math.max(1, max)) * 100));
  const pp =
    projected !== undefined
      ? Math.max(0, Math.min(100, (projected / Math.max(1, max)) * 100))
      : null;
  const color = pct > 60 ? "bg-emerald-500" : pct > 30 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="min-w-0">
      <div className="flex justify-between text-xs">
        <span className={mine ? "text-sky-300" : "text-red-300"}>{label}</span>
        <span className="tabular-nums">
          {hull}/{max}
          {projected !== undefined && Math.round(projected) !== hull && (
            <span className="text-muted-foreground">
              {" "}
              → ~{Math.round(projected)} tras el bloque
            </span>
          )}
        </span>
      </div>
      <div
        className="relative mt-1 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={hull}
        aria-valuemax={max}
        aria-label={`Casco de ${label}`}
      >
        <div
          className={`h-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
        {pp !== null && pp < pct && (
          <div
            className="absolute top-0 h-full bg-white/30 motion-safe:animate-pulse"
            style={{ left: `${pp}%`, width: `${pct - pp}%` }}
            title="Daño previsto"
          />
        )}
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
      data-tour="segundo"
      aria-label={voice.title}
      className={`rounded border p-3 ${pleading ? "border-red-500 bg-red-950/30" : "border-primary/40 bg-accent/30"}`}
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
          className="mt-3 h-auto w-full whitespace-normal py-3 motion-safe:animate-pulse"
          onClick={onJump}
        >
          <Sparkles />
          Saltar al disforme en la primera ronda ({warpChance(own)} %)
        </Button>
      )}
    </section>
  );
}

function defaultStance(state: DuelState, side: Side): Stance {
  return state[side].hull / state[side].maxHull < 0.35 ? "defensiva" : "optima";
}

/** Convierte un plan del Segundo a maniobras de la interfaz (velocidad + giro numérico). */
function normalizePlan(plan: BlockPlan, own: SideState): BlockPlan {
  return {
    ...plan,
    phases: plan.phases.map((p) => {
      const m =
        p.action === "embestir" ? "avante_toda" : p.action === "saltar" ? "parar" : maneuverOf(p);
      return { ...maneuverMove(m, own), action: p.action };
    }),
  };
}

/** Planificador: 3 rondas de maniobra + acción con pronóstico de cada una. */
function Planner({
  state,
  side,
  plan,
  setPlan,
  stance,
  setStance,
  selected,
  setSelected,
  steps,
  block,
  submitLabel,
  onSubmit,
}: {
  state: DuelState;
  side: Side;
  plan: BlockPlan;
  setPlan: (f: (p: BlockPlan) => BlockPlan) => void;
  stance: Stance;
  setStance: (s: Stance) => void;
  selected: number;
  setSelected: (i: number) => void;
  steps: PathStep[];
  block: number;
  submitLabel?: string | undefined;
  onSubmit: (plan: BlockPlan) => Promise<void>;
}) {
  const own = state[side];
  const voice = SECOND[own.fleet];
  const [sending, setSending] = useState(false);
  const setPhase = (i: number, patch: Partial<PhasePlan>) => {
    play("click");
    setSelected(i);
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
      await onSubmit(plan);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron fijar las órdenes");
    } finally {
      setSending(false);
    }
  }
  return (
    <section aria-label={`Órdenes del bloque ${block}`} className="space-y-3">
      <div data-tour="posturas">
        <p className="text-sm">
          <span className="text-primary">{voice.title}:</span> «{voice.lord}, ¿cómo encaramos las
          próximas {PHASES_PER_BLOCK} rondas?»
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
                  ...normalizePlan(suggestPlan(state, side, s), own),
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
          El Segundo rellena las rondas; cambia lo que quieras y mira el mapa: tu nave prevista en
          azul (1, 2, 3) y lo más probable del enemigo en rojo discontinuo.
        </p>
      </div>
      <div data-tour="rondas" className="grid gap-2 lg:grid-cols-3">
        {plan.phases.map((p, i) => {
          const st = steps[i]!;
          const adv = phaseAdvice(state, side, plan.phases, i, steps);
          const m = maneuverOf(p);
          const lock = p.action === "embestir" || p.action === "saltar";
          return (
            <div
              key={i}
              role="group"
              aria-label={`Ronda ${i + 1}`}
              onClick={() => setSelected(i)}
              className={`cursor-pointer space-y-1.5 rounded border p-2 ${i === selected ? "border-primary bg-accent/20" : "border-border"}`}
            >
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-sm font-semibold text-primary">Ronda {i + 1}</span>
                <span className="text-[11px] text-muted-foreground">
                  {RANGE_NAMES[st.band]} · {st.distance.toFixed(0)} u
                </span>
              </div>
              <div data-tour={i === 0 ? "maniobra" : undefined}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Maniobra
                </p>
                <div className="grid grid-cols-7 gap-0.5">
                  {MANEUVERS.map((mv) => (
                    <button
                      key={mv.id}
                      type="button"
                      title={`${mv.name}: ${mv.text}`}
                      aria-label={mv.name}
                      aria-pressed={m === mv.id}
                      disabled={lock}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPhase(i, { ...maneuverMove(mv.id, own) });
                      }}
                      className={`flex h-9 items-center justify-center rounded border text-lg leading-none disabled:opacity-40 ${m === mv.id ? (mv.id === "avante_toda" ? "border-orange-400 bg-orange-500/20 text-orange-200" : "border-sky-400 bg-sky-500/20 text-sky-100") : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {mv.glyph}
                    </button>
                  ))}
                </div>
                <p className="mt-0.5 text-[10px] text-sky-200">
                  {MANEUVERS.find((x) => x.id === m)!.name}
                </p>
              </div>
              <div data-tour={i === 0 ? "accion" : undefined}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Acción</p>
                <div className="grid grid-cols-4 gap-0.5">
                  {ACTIONS.map((a) => {
                    const Icon = ACTION_ICON[a];
                    const on = p.action === a;
                    return (
                      <button
                        key={a}
                        type="button"
                        title={ACTION_INFO[a]!.text}
                        aria-pressed={on}
                        onClick={(e) => {
                          e.stopPropagation();
                          setPhase(
                            i,
                            a === "embestir"
                              ? { action: a, ...maneuverMove("avante_toda", own) }
                              : a === "saltar"
                                ? { action: a, ...maneuverMove("parar", own) }
                                : { action: a },
                          );
                        }}
                        className={`flex min-w-0 flex-col items-center gap-0.5 rounded border px-0.5 py-1 text-[9px] ${on ? (a === "saltar" ? "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200" : "border-primary bg-accent text-primary") : "border-border text-muted-foreground hover:text-foreground"}`}
                      >
                        <Icon className="size-3.5" />
                        <span className="truncate">{ACTION_INFO[a]!.short}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                data-tour={i === 0 ? "pronostico" : undefined}
                className="rounded bg-black/30 px-2 py-1 text-[11px]"
              >
                <p>
                  Enemigo {sideName(st.rel)} · nos ve {sideName(st.relFoe)}
                </p>
                <p>
                  <span className="text-sky-300">Les hacemos ~{st.ourHit.toFixed(1)}</span> ·{" "}
                  <span className="text-red-300">nos hacen ~{st.theirHit.toFixed(1)}</span>
                </p>
              </div>
              {adv && <p className={`border-l-2 pl-2 text-[11px] ${TONE[adv.tone]}`}>{adv.text}</p>}
            </div>
          );
        })}
      </div>
      <div data-tour="salto" className="rounded border border-border p-2">
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
        data-tour="confirmar"
        className="h-auto w-full whitespace-normal py-3"
        disabled={sending}
        onClick={() => void send()}
      >
        {submitLabel ?? `Fijar órdenes del bloque ${block}`}
      </Button>
    </section>
  );
}

// ───────────── Repetición ─────────────

function sideAt(base: SideState, e: PhaseEvent, s: Side): SideState {
  return { ...base, pos: e[s].pos, heading: e[s].heading, hull: e[s].hullAfter };
}

type LogLine = Line & { id: number; who?: "segundo" | "fase" | "informe" | undefined };

function staticLines(
  events: DuelEventRow[],
  me: Side,
  names: Record<Side, string>,
  from: number,
  to: number,
): (Line & { who?: "fase" })[] {
  const out: (Line & { who?: "fase" })[] = [];
  for (let i = from; i < to; i++) {
    const e = events[i]!;
    out.push({
      side: null,
      tone: "neutral",
      text: `Ronda ${e.phase} · ${RANGE_NAMES[e.rangeBefore]}`,
      who: "fase",
    });
    out.push(...narratePhase(e, me, names));
  }
  return out;
}

interface Geos {
  before: Geo;
  after: Geo;
  own: SideState;
  foe: SideState;
  ownBefore: SideState;
  foeBefore: SideState;
}

function useReplay(opts: {
  events: DuelEventRow[];
  me: Side;
  start: DuelState | null;
  end: DuelEnd | null;
  fx: React.RefObject<FxEngine | null>;
  proj: React.RefObject<Projection | null>;
  names: Record<Side, string>;
  epilogue: (Line & { who?: "segundo" | "informe" })[];
}) {
  const { events, me, start, end, fx, proj, names, epilogue } = opts;
  const [idx, setIdx] = useState(-1);
  const [moved, setMoved] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [log, setLog] = useState<LogLine[]>([]);
  const [motion, setMotionState] = useState<Motion | null>(null);
  const motionRef = useRef<Motion | null>(null);
  const setMotion = (m: Motion | null) => {
    motionRef.current = m;
    setMotionState(m);
  };
  const timers = useRef<number[]>([]);
  const lineId = useRef(0);
  const foe = other(me);
  const clear = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };
  useEffect(() => clear, []);
  const geos = useMemo(() => {
    if (!start) return [] as Geos[];
    const s0 = normalizeState(start);
    const out: Geos[] = [];
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
  const fitPoints = useMemo(
    () => geos.flatMap((g) => [g.own.pos, g.foe.pos, g.ownBefore.pos, g.foeBefore.pos]),
    [geos],
  );
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
    const g = geos[i];
    // Las naves recorren su trayectoria de forma continua durante toda la ronda
    const m: Motion = {
      own: {
        from: { pos: g.ownBefore.pos, heading: g.ownBefore.heading },
        to: { pos: g.own.pos, heading: g.own.heading },
      },
      foe: {
        from: { pos: g.foeBefore.pos, heading: g.foeBefore.heading },
        to: { pos: g.foe.pos, heading: g.foe.heading },
      },
      start: performance.now(),
      dur: PHASE_SECONDS * k,
    };
    setMotion(m);
    const cues = phaseCues({
      e: events[i],
      me,
      fleets: { attacker: start.attacker.fleet, defender: start.defender.fleet },
      names,
      before: g.before,
      after: g.after,
      fx: () => fx.current,
      end,
      last,
      maxHull: { attacker: start.attacker.maxHull, defender: start.defender.maxHull },
      pt: (s) => {
        const p = proj.current;
        const t = Math.min(1, Math.max(0, (performance.now() - m.start) / m.dur));
        const w = poseAt(s === me ? m.own : m.foe, t).pos;
        return p ? p.pt(w) : { x: 200, y: 150 };
      },
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
    fitPoints,
    motion,
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
      setMotion(null);
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
      setMotion(null);
      setPlaying(false);
      setIdx(-1);
      setMoved(true);
      setLog(
        [...staticLines(events, me, names, 0, events.length), ...epilogue].map((x) => ({
          ...x,
          id: ++lineId.current,
        })),
      );
    },
    exit: () => {
      clear();
      setMotion(null);
      fx.current?.clear();
      setPlaying(false);
      setIdx(-1);
      setMoved(true);
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
        aria-label="Ronda anterior"
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
        aria-label="Ronda siguiente"
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
      {r.idx >= 0 && !r.playing && (
        <Button size="sm" variant="ghost" onClick={r.exit}>
          Volver al plan
        </Button>
      )}
    </div>
  );
}

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

function LiveLog({ lines, empty }: { lines: LogLine[]; empty: string }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [lines.length]);
  return (
    <section
      data-tour="registro"
      aria-label="Registro de combate"
      className="rounded border border-border bg-black/30"
    >
      <p className="border-b border-border px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Registro de combate
      </p>
      <ol
        ref={box}
        aria-live="polite"
        className="max-h-56 space-y-1 overflow-y-auto p-2 font-mono text-xs"
      >
        {!lines.length && <li className="text-muted-foreground">{empty}</li>}
        {lines.map((l, i) => {
          const body = i === lines.length - 1 ? <Typewriter text={l.text} /> : l.text;
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

/** Ambiente de puente y música (tensión en la aproximación, combate después). Arranca tras el primer gesto. */
function useBattleAmbience(status: string | null, key: string) {
  useEffect(() => {
    if (!status || status === "terminado") return;
    preloadAudio();
    const music = status === "pendiente" ? "musica_tension" : "musica_combate";
    const start = () => {
      unlockAudio();
      stopLoop(music === "musica_combate" ? "musica_tension" : "musica_combate");
      startLoop("puente");
      startLoop(music, 3);
      if (status !== "pendiente") {
        let heard = false;
        try {
          heard = localStorage.getItem(`naval3-braam-${key}`) === "1";
          localStorage.setItem(`naval3-braam-${key}`, "1");
        } catch {
          /* sin almacenamiento */
        }
        if (!heard) play("inicio_combate");
      }
    };
    if (audioReady()) start();
    else window.addEventListener("pointerdown", start, { once: true });
    return () => window.removeEventListener("pointerdown", start);
  }, [status, key]);
  useEffect(() => () => stopAllLoops(), []);
}

/** Al terminar cada bloque: seguir combatiendo o saltar al disforme. */
function DecisionGate({
  state,
  side,
  foeName,
  onContinue,
  onJump,
}: {
  state: DuelState;
  side: Side;
  foeName: string;
  onContinue: () => void;
  onJump: () => Promise<void>;
}) {
  const own = state[side];
  const foe = state[other(side)];
  const voice = SECOND[own.fleet];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const chance = warpChance(own);
  const ownPct = Math.round((own.hull / own.maxHull) * 100);
  const foePct = Math.round((foe.hull / foe.maxHull) * 100);
  const advice =
    ownPct <= 30 && foePct > ownPct
      ? `${voice.lord}, el casco no aguantará mucho más. Yo saltaría.`
      : foePct < ownPct
        ? `${voice.lord}, ${foeName} está peor que nosotros. Es el momento de rematar.`
        : `${voice.lord}, la batalla sigue abierta. Planifiquemos el siguiente asalto.`;
  return (
    <section
      aria-label="Decisión tras el bloque"
      className="space-y-3 rounded border border-amber-500/60 bg-amber-950/10 p-3"
    >
      <p className="text-sm">
        <span className="text-primary">{voice.title}:</span> «{advice}»
      </p>
      <p className="text-xs text-muted-foreground">
        Casco: tu nave {ownPct} % · {foeName} {foePct} %
      </p>
      {!confirming ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" onClick={onContinue}>
            Planificar siguiente asalto
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-fuchsia-500/70 text-fuchsia-200"
            onClick={() => {
              play("click");
              setConfirming(true);
            }}
          >
            Saltar al disforme ({chance} %)
          </Button>
        </div>
      ) : (
        <div role="alertdialog" aria-label="Confirmar salto" className="space-y-2">
          <p className="text-sm text-fuchsia-200">
            Si el salto sale bien ({chance} % con el casco actual) pierdes el duelo pero salvas la
            nave. Si falla, la disformidad os daña y el combate sigue.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onJump();
                setBusy(false);
              }}
            >
              {busy ? "Abriendo la brecha…" : "Confirmar salto"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Volver
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ───────────── Tablero del duelo (duelos reales, simulacros y archivo) ─────────────

export interface DuelBoardProps {
  title: ReactNode;
  state: DuelState;
  side: Side;
  foeName: string;
  /** Rondas a reproducir (el último bloque, o todo el duelo en el archivo). */
  replayEvents: DuelEventRow[];
  /** Estado al empezar la repetición. */
  replayStart: DuelState;
  replayLabel: string;
  status: "pendiente" | "enfrentado" | "practica" | "terminado";
  block: number;
  canPlan: boolean;
  waitingText?: string | undefined;
  infoText?: string | undefined;
  submitLabel?: string | undefined;
  onSubmit?: ((plan: BlockPlan) => Promise<void>) | undefined;
  /** Clave para no repetir la reproducción automática. */
  storageKey: string;
  autoplay?: boolean;
  end?: DuelEnd | null;
  epilogueTitle: string;
  footer?: ReactNode;
}

export function DuelBoard(p: DuelBoardProps) {
  const { state, side, foeName } = p;
  const foeSide = other(side);
  const own = state[side];
  const foe = state[foeSide];
  const names = useMemo(
    () => ({ [side]: "Tu nave", [foeSide]: foeName }) as Record<Side, string>,
    [side, foeSide, foeName],
  );
  const debrief = useMemo(
    () => blockDebrief(p.replayEvents, side, state),
    [p.replayEvents, side, state],
  );
  const epilogue = useMemo(() => {
    const out: (Line & { who?: "segundo" | "informe" })[] = [];
    if (p.end) out.push({ ...endLine(p.end, side, names), who: "informe" });
    out.push(...debriefLines(debrief, p.epilogueTitle));
    return out;
  }, [p.end, side, names, debrief, p.epilogueTitle]);
  const fx = useRef<FxEngine | null>(null);
  const proj = useRef<Projection | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);
  const replay = useReplay({
    events: p.replayEvents,
    me: side,
    start: p.replayStart,
    end: p.end ?? null,
    fx,
    proj,
    names,
    epilogue,
  });
  const [stance, setStance] = useState<Stance>(() => defaultStance(state, side));
  const [plan, setPlanState] = useState<BlockPlan>(() =>
    normalizePlan(suggestPlan(state, side, defaultStance(state, side)), own),
  );
  const setPlan = useCallback((f: (p: BlockPlan) => BlockPlan) => setPlanState(f), []);
  const [selected, setSelected] = useState(0);
  const [tour, setTour] = useState(false);
  /** Tras ver un bloque: ¿seguimos combatiendo o saltamos? (antes del primer bloque no se pregunta) */
  const [decided, setDecided] = useState(p.replayEvents.length === 0);
  useEffect(() => setDecided(p.replayEvents.length === 0), [p.block, p.replayEvents.length]);
  useEffect(() => {
    setPlanState(normalizePlan(suggestPlan(state, side, defaultStance(state, side)), state[side]));
    setStance(defaultStance(state, side));
    setSelected(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.block, state.phase]);
  const fc = useMemo(() => forecast(state, side, plan.phases), [state, side, plan]);
  const planningFit = useMemo(
    () => [...reachable(own, 2).flat(), ...reachable(foe, 2).flat()],
    [own, foe],
  );
  useBattleAmbience(p.status, p.storageKey);
  useEffect(() => {
    if (!p.autoplay || !p.replayEvents.length) return undefined;
    let seen = "";
    try {
      seen = localStorage.getItem(`naval3-seen-${p.storageKey}`) ?? "";
    } catch {
      /* sin almacenamiento */
    }
    const mark = `${p.block}`;
    if (seen === mark) return undefined;
    try {
      localStorage.setItem(`naval3-seen-${p.storageKey}`, mark);
    } catch {
      /* sin almacenamiento */
    }
    const t = window.setTimeout(() => {
      mapBox.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      replay.play();
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.storageKey, p.block, p.replayEvents.length]);
  useEffect(() => {
    if (p.canPlan && !tutorialSeen()) setTour(true);
  }, [p.canPlan]);
  const frame = replay.frame;
  const needDecision = p.canPlan && !!p.onSubmit && !decided && p.status !== "pendiente";
  const showPlan = p.canPlan && !frame && !needDecision;
  const shownPhase = replay.idx >= 0 ? p.replayEvents[replay.idx] : null;
  const last = fc.steps[fc.steps.length - 1];
  const selStep = fc.steps[selected];
  return (
    <article
      className="space-y-4 rounded border border-destructive/70 p-3 sm:p-4"
      aria-label={`Duelo contra ${foeName}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg text-primary">{p.title}</h3>
          <p className="text-xs text-muted-foreground">
            {FLEETS[foe.fleet].name} · {FLEET_PROFILES[foe.fleet].trait}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => setTour(true)}>
            <GraduationCap /> Tutorial
          </Button>
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
          projected={showPlan ? last?.ownHull : undefined}
        />
        <HullBar
          label={foeName}
          hull={shownPhase ? shownPhase[foeSide].hullAfter : foe.hull}
          max={foe.maxHull}
          mine={false}
          projected={showPlan ? last?.foeHull : undefined}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <div data-tour="mapa" ref={mapBox}>
            <TacticalMap
              own={frame?.own ?? own}
              foe={frame?.foe ?? foe}
              foeLabel={foeName}
              steps={showPlan ? fc.steps : undefined}
              envelope={showPlan ? fc.envelope : undefined}
              selected={selected}
              motion={replay.motion}
              fitPoints={
                showPlan ? planningFit : replay.fitPoints.length ? replay.fitPoints : undefined
              }
              onFx={(f) => (fx.current = f)}
              onProjection={(pr) => (proj.current = pr)}
              caption={
                shownPhase
                  ? `Repetición · ronda ${replay.idx + 1} de ${p.replayEvents.length}`
                  : showPlan
                    ? `Ronda ${selected + 1}: azul = dónde acabará tu nave · rojo discontinuo = lo más probable del enemigo · nube roja = adónde podría ir`
                    : "Mapa táctico (norte arriba)"
              }
            />
          </div>
          {p.replayEvents.length > 0 && (
            <ReplayControls r={replay} total={p.replayEvents.length} label={p.replayLabel} />
          )}
          {(p.replayEvents.length > 0 || replay.log.length > 0) && (
            <LiveLog
              lines={replay.log}
              empty={`Pulsa «${p.replayLabel}» para revivir lo ocurrido.`}
            />
          )}
        </div>
        <div className="space-y-3">
          <div data-tour="radar">
            <Radar
              own={frame?.own ?? (showPlan && selStep ? selStep.own : own)}
              foe={frame?.foe ?? (showPlan && selStep ? selStep.foe : foe)}
              geo={frame?.geo}
              foeLabel={foeName}
              approaching={p.status === "pendiente" && !frame && !showPlan}
              torpedoesOut={frame ? 0 : own.torpedoesInFlight}
              torpedoesIn={frame ? 0 : foe.torpedoesInFlight}
              compact
              simple
              caption={
                frame
                  ? "Puente de mando"
                  : showPlan && selStep
                    ? `Puente al final de la ronda ${selected + 1}: enemigo ${sideName(selStep.rel)} a ${selStep.distance.toFixed(0)} u`
                    : "Puente de mando"
              }
            />
          </div>
          {debrief && !replay.playing && p.replayEvents.length > 0 && (
            <DebriefPanel d={debrief} title={p.epilogueTitle} />
          )}
          {p.status !== "terminado" && (
            <Second
              state={state}
              side={side}
              onJump={
                p.canPlan
                  ? () =>
                      setPlan((pl) => ({
                        ...pl,
                        phases: pl.phases.map((x, k) =>
                          k === 0 ? { ...maneuverMove("parar", own), action: "saltar" } : x,
                        ),
                      }))
                  : undefined
              }
            />
          )}
        </div>
      </div>
      {p.infoText && <p className="text-xs text-muted-foreground">{p.infoText}</p>}
      {replay.playing ? (
        <p role="status" className="rounded border border-amber-500/50 p-3 text-sm text-amber-200">
          Reproduciendo lo ocurrido… Cuando termine podrás dar las órdenes del siguiente bloque.
        </p>
      ) : needDecision && p.onSubmit ? (
        <DecisionGate
          state={state}
          side={side}
          foeName={foeName}
          onContinue={() => {
            play("click");
            replay.exit();
            setSelected(0);
            setDecided(true);
            window.setTimeout(
              () => mapBox.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
              60,
            );
          }}
          onJump={async () => {
            const jump: BlockPlan = {
              ...plan,
              phases: plan.phases.map((x, k) =>
                k === 0 ? { ...maneuverMove("parar", own), action: "saltar" } : x,
              ),
            };
            try {
              await p.onSubmit?.(jump);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "No se pudo ordenar el salto");
            }
          }}
        />
      ) : p.canPlan && p.onSubmit ? (
        <Planner
          state={state}
          side={side}
          plan={plan}
          setPlan={setPlan}
          stance={stance}
          setStance={setStance}
          selected={selected}
          setSelected={setSelected}
          steps={fc.steps as unknown as PathStep[]}
          block={p.block}
          submitLabel={p.submitLabel}
          onSubmit={p.onSubmit}
        />
      ) : (
        p.waitingText && (
          <p role="status" className="rounded border border-primary/50 p-3 text-sm">
            {p.waitingText}
          </p>
        )
      )}
      {p.footer}
      {tour && <Tutorial fleet={own.fleet} canPlan={p.canPlan} onClose={() => setTour(false)} />}
    </article>
  );
}

// ───────────── Duelo real (servidor) ─────────────

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
  if (!state)
    return (
      <article className="rounded border border-destructive p-4 text-sm">
        Contacto con {name(foeId)} · preparando el duelo…
      </article>
    );
  const myReady = side === "attacker" ? raid.attacker_ready : raid.defender_ready;
  const foeReady = side === "attacker" ? raid.defender_ready : raid.attacker_ready;
  const approaching = raid.status === "pendiente";
  const foeName = name(foeId);
  return (
    <DuelBoard
      title={`${side === "attacker" ? "Ofensiva contra" : "Atacado por"} ${foeName}`}
      state={state}
      side={side}
      foeName={foeName}
      replayEvents={lastBlock}
      replayStart={state}
      replayLabel={`Ver bloque ${raid.block_number - 1}`}
      status={approaching ? "pendiente" : "enfrentado"}
      block={raid.block_number}
      canPlan={!myReady}
      infoText={
        myReady
          ? undefined
          : approaching
            ? `En aproximación: ya puedes fijar el primer bloque. Contacto en ${remaining(raid.deadline)}.`
            : `Plazo ${remaining(raid.deadline)}. ${foeReady ? `${foeName} ya ha dado sus órdenes.` : ""} Si no das órdenes a tiempo, pierdes el duelo.`
      }
      waitingText={`Órdenes del bloque ${raid.block_number} fijadas. ${approaching ? `El combate empieza al llegar (${remaining(raid.deadline)}).` : foeReady ? "Resolviendo…" : `Esperando a ${foeName} · plazo ${remaining(raid.deadline)}. Si no responde, pierde el duelo.`}`}
      onSubmit={async (plan) => {
        await submitDuelPlan({ data: { raidId: raid.id, block: raid.block_number, plan } });
        toast.success("Órdenes fijadas");
        onChanged();
      }}
      storageKey={raid.id}
      autoplay
      epilogueTitle={`Informe del bloque ${raid.block_number - 1}`}
    />
  );
}

// ───────────── Archivo ─────────────

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
  const foeId = side === "attacker" ? raid.defender_id : raid.attacker_id;
  const events = useMemo(() => raid.report?.v3_events ?? [], [raid.report]);
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
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-primary">Duelo contra {name(foeId)}</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        {start && (
          <DuelBoard
            title="Repetición del duelo"
            state={start}
            side={side}
            foeName={name(foeId)}
            replayEvents={events}
            replayStart={start}
            replayLabel="Reproducir duelo"
            status="terminado"
            block={0}
            canPlan={false}
            storageKey={`archivo-${raid.id}`}
            end={raid.report?.v3_end ?? null}
            epilogueTitle="Balance del duelo"
          />
        )}
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
          Duelo entre naves capitales en bloques de {PHASES_PER_BLOCK} rondas: los dos dais las
          órdenes a ciegas y se resuelve en cuanto ambos confirmáis (máximo 24 h).
        </li>
        <li>
          Cada ronda eliges una <b>maniobra</b> (recto, virar 45°, giro cerrado de 90°, avante toda
          o parar) y una <b>acción</b> (disparar, torpedos, escudos, evasión, reparar, embestir,
          saltar).
        </li>
        <li>
          El <b>mapa táctico</b> te enseña dónde acabará tu nave en cada ronda, adónde irá
          probablemente el enemigo y el daño previsto. El <b>radar</b> te lo muestra desde tu
          puente.
        </li>
        <li>
          Las armas van por arcos (proa, costados, popa) y cada una rinde distinto según la
          distancia. Atacar su popa duele más; darle la tuya, también.
        </li>
        <li>
          Se pierde si <b>la nave estalla</b> (casco a 0: el perfil se reinicia por completo) o si{" "}
          <b>saltas al disforme</b> (pierdes el duelo, salvas la nave).
        </li>
        <li>
          ¿Primera vez? Prueba un <b>simulacro contra la IA</b>: sin riesgo y sin esperas.
        </li>
      </ul>
      <p className="mt-2 text-xs">
        <span className="text-primary">Tu flota · {p.trait}:</span> {p.traitText}
      </p>
    </details>
  );
}
