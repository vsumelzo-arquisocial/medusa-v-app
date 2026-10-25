import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Anchor,
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
import { ACTION_INFO, FLEET_PROFILES, SECOND } from "@/lib/naval3/factions";
import {
  blockRounds,
  expectedHit,
  inWarp,
  isOff,
  mainArc,
  normalizeState,
  other,
  warpPlan,
} from "@/lib/naval3/engine";
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
import { MANEUVERS, maneuverMove, maneuverOf, type ManeuverId } from "@/lib/naval3/maneuvers";
import { endLine, narratePhase, type Line } from "@/lib/naval3/narrate";
import {
  RANGE_NAMES,
  type Action,
  type BlockPlan,
  type DuelEnd,
  type DuelMode,
  type DuelState,
  type PhaseEvent,
  type PhasePlan,
  type Side,
  type SideState,
} from "@/lib/naval3/types";
import { chooseDuelMode, submitDuelPlan, switchDuelToThree } from "@/lib/naval3.functions";
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
import { TacticalMap, poseAt, type Motion, type PortalStage, type Projection } from "./TacticalMap";
import { ShipSchematic } from "./ShipSchematic";
import { ModuleStatus } from "./ModuleStatus";
import { VoiceComms } from "./VoiceComms";
import { useDuelLink } from "./live";
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
  attacker_mode?: number | null;
  defender_mode?: number | null;
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
  abordar: Anchor,
};
/** «Recargar» ya no es una orden: Torpedos recarga solo cuando los tubos están vacíos. */
const ACTIONS: Action[] = [
  "fuego",
  "torpedos",
  "abordar",
  "escudos",
  "evasion",
  "embestir",
  "reparar",
  "saltar",
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

/** Sugerencia del Primer Oficial: lo esencial de la situación y tres posturas que rellenan las órdenes. */
function FirstOfficer({
  state,
  side,
  stance,
  onSuggest,
}: {
  state: DuelState;
  side: Side;
  stance: Stance | null;
  onSuggest?: ((s: Stance) => void) | undefined;
}) {
  const own = state[side];
  const voice = SECOND[own.fleet];
  const [more, setMore] = useState(false);
  const rank = { danger: 0, warn: 1, good: 2, info: 3 } as const;
  const advice = [...briefing(state, side)].sort((a, b) => rank[a.tone] - rank[b.tone]);
  const shown = more ? advice : advice.slice(0, 2);
  const pleading = own.hull / own.maxHull <= 0.35;
  return (
    <section
      data-tour="segundo"
      aria-label={`Sugerencia del ${voice.title}`}
      className={`rounded border p-3 ${pleading ? "border-red-500 bg-red-950/30" : "border-primary/40 bg-accent/30"}`}
    >
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-primary">
        Sugerencia del {voice.title}
      </p>
      <ul className="space-y-1">
        {shown.map((a, i) => (
          <li key={i} className={`border-l-2 pl-2 text-sm ${TONE[a.tone]}`}>
            {a.text}
          </li>
        ))}
      </ul>
      {advice.length > 2 && (
        <button
          type="button"
          className="mt-1 text-xs text-muted-foreground underline"
          onClick={() => setMore((m) => !m)}
        >
          {more ? "Menos" : `Más (${advice.length - 2})`}
        </button>
      )}
      {onSuggest && (
        <div data-tour="posturas" className="mt-3">
          <p className="mb-1 text-[11px] text-muted-foreground">
            Pulsa una y decido las órdenes por ti:
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(STANCES) as Stance[]).map((s) => (
              <Button
                key={s}
                variant="outline"
                size="sm"
                aria-pressed={stance === s}
                title={STANCES[s].text}
                className={`h-auto whitespace-normal px-1 py-2 text-xs ${stance === s ? "border-primary bg-accent text-primary" : ""}`}
                onClick={() => {
                  play("click");
                  onSuggest(s);
                }}
              >
                {STANCES[s].label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Órdenes de una ronda aún sin decidir (null) o decididas. */
interface DraftRound {
  m: ManeuverId | null;
  a: Action | null;
}

const emptyDraft = (n: number): DraftRound[] =>
  Array.from({ length: n }, () => ({ m: null, a: null }));

/** Ronda bloqueada porque una anterior declara el salto (la nave queda en modo salto). */
const warpLocked = (d: DraftRound[], i: number) => d.slice(0, i).some((r) => r.a === "saltar");

/** Borrador → plan del motor (lo no decidido se rellena con «recto + disparar» solo para el pronóstico). */
function draftToPlan(d: DraftRound[], own: SideState, emergencyJump: number): BlockPlan {
  return {
    emergencyJump,
    phases: d.map((r, i) => {
      if (r.a === "saltar" || warpLocked(d, i))
        return { ...maneuverMove("parar", own), action: "saltar" as const };
      if (r.a === "embestir")
        return { ...maneuverMove("avante_toda", own), action: "embestir" as const };
      return { ...maneuverMove(r.m ?? "recto", own), action: r.a ?? "fuego" };
    }),
  };
}

/** Plan del Segundo → borrador completo. */
function planToDraft(plan: BlockPlan, n: number): DraftRound[] {
  return plan.phases.slice(0, n).map((p) => ({
    m: p.action === "embestir" ? "avante_toda" : p.action === "saltar" ? "parar" : maneuverOf(p),
    a: p.action,
  }));
}

const roundReady = (d: DraftRound[], i: number) =>
  warpLocked(d, i) || d[i]!.a === "saltar" || d[i]!.a === "embestir" || (!!d[i]!.m && !!d[i]!.a);

/** Rondas iniciales con trayectoria decidida (para dibujarla en el mapa). */
const decidedPath = (d: DraftRound[]) => {
  let k = 0;
  while (
    k < d.length &&
    (d[k]!.m || d[k]!.a === "saltar" || d[k]!.a === "embestir" || warpLocked(d, k))
  )
    k++;
  return k;
};

/** Planificador: maniobra + acción por ronda, con el pronóstico de cada una. */
function Planner({
  state,
  side,
  draft,
  setDraft,
  emergencyJump,
  setEmergencyJump,
  selected,
  setSelected,
  steps,
  block,
  submitLabel,
  onSubmit,
}: {
  state: DuelState;
  side: Side;
  draft: DraftRound[];
  setDraft: (f: (d: DraftRound[]) => DraftRound[]) => void;
  emergencyJump: number;
  setEmergencyJump: (v: number) => void;
  selected: number;
  setSelected: (i: number) => void;
  steps: PathStep[];
  block: number;
  submitLabel?: string | undefined;
  onSubmit: (plan: BlockPlan) => Promise<void>;
}) {
  const own = state[side];
  const single = draft.length === 1;
  const [sending, setSending] = useState(false);
  const setRound = (i: number, patch: Partial<DraftRound>) => {
    play("click");
    setSelected(i);
    setDraft((d) => d.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  };
  const missing = draft.findIndex((_, i) => !roundReady(draft, i));
  async function send() {
    if (
      draft.some((r) => r.a === "saltar") &&
      !confirm(
        "Salto disforme: esta ronda y la siguiente la nave queda quieta y sin defensas; después salta. Pierdes el duelo pero salvas la nave. ¿Confirmar?",
      )
    )
      return;
    setSending(true);
    try {
      await onSubmit(draftToPlan(draft, own, emergencyJump));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron fijar las órdenes");
    } finally {
      setSending(false);
    }
  }
  return (
    <section aria-label={`Órdenes del bloque ${block}`} className="space-y-3">
      <div data-tour="rondas" className={`grid gap-2 ${single ? "" : "lg:grid-cols-3"}`}>
        {draft.map((r, i) => {
          const st = steps[i]!;
          const locked = warpLocked(draft, i);
          const moveLock = locked || r.a === "embestir" || r.a === "saltar";
          return (
            <div
              key={i}
              role="group"
              aria-label={single ? "Órdenes de la ronda" : `Ronda ${i + 1}`}
              onClick={() => setSelected(i)}
              className={`cursor-pointer space-y-1.5 rounded border p-2 ${i === selected && !single ? "border-primary bg-accent/20" : "border-border"} ${locked ? "opacity-70" : ""}`}
            >
              {!single && (
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-sm font-semibold text-primary">Ronda {i + 1}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {RANGE_NAMES[st.band]} · {st.distance.toFixed(0)} u
                  </span>
                </div>
              )}
              {locked ? (
                <p className="rounded border border-fuchsia-500/60 bg-fuchsia-950/30 p-2 text-center text-sm text-fuchsia-200">
                  Modo salto: sin órdenes
                </p>
              ) : (
                <>
                  <div data-tour={i === 0 ? "maniobra" : undefined}>
                    <div className="grid grid-cols-7 gap-0.5">
                      {MANEUVERS.map((mv) => (
                        <button
                          key={mv.id}
                          type="button"
                          title={`${mv.name}: ${mv.text}`}
                          aria-label={mv.name}
                          aria-pressed={r.m === mv.id}
                          disabled={moveLock}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRound(i, { m: mv.id });
                          }}
                          className={`flex items-center justify-center rounded border leading-none disabled:opacity-40 ${single ? "h-12 text-2xl" : "h-9 text-lg"} ${r.m === mv.id ? (mv.id === "avante_toda" ? "border-orange-400 bg-orange-500/20 text-orange-200" : "border-sky-400 bg-sky-500/20 text-sky-100") : "border-border text-muted-foreground hover:text-foreground"}`}
                        >
                          {mv.glyph}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div data-tour={i === 0 ? "accion" : undefined}>
                    <div
                      className={`grid gap-0.5 ${single ? "grid-cols-4 sm:grid-cols-8" : "grid-cols-4"}`}
                    >
                      {ACTIONS.map((a) => {
                        const Icon = ACTION_ICON[a];
                        const on = r.a === a;
                        const charges = own.boardingLeft ?? 0;
                        const blocked =
                          (a === "abordar" && charges <= 0) ||
                          (a === "torpedos" && isOff(own, "torpedos")) ||
                          (a === "embestir" && isOff(own, "motores"));
                        return (
                          <button
                            key={a}
                            type="button"
                            disabled={blocked}
                            title={
                              blocked
                                ? a === "abordar"
                                  ? "Sin cápsulas de abordaje"
                                  : `${a === "torpedos" ? "Torpedos" : "Motores"} fuera de combate`
                                : a === "torpedos" && !own.torpedoesLoaded && i === 0
                                  ? "Tubos vacíos: recarga y dispara a media potencia"
                                  : ACTION_INFO[a]!.text
                            }
                            aria-label={ACTION_INFO[a]!.short}
                            aria-pressed={on}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRound(
                                i,
                                a === "embestir"
                                  ? { a, m: "avante_toda" }
                                  : a === "saltar"
                                    ? { a, m: "parar" }
                                    : { a },
                              );
                            }}
                            className={`relative flex min-w-0 flex-col items-center gap-0.5 rounded border px-0.5 py-1 text-[9px] disabled:opacity-30 ${on ? (a === "saltar" ? "border-fuchsia-400 bg-fuchsia-500/20 text-fuchsia-200" : "border-primary bg-accent text-primary") : "border-border text-muted-foreground hover:text-foreground"}`}
                          >
                            <Icon className={single ? "size-5" : "size-3.5"} />
                            <span className="truncate">
                              {a === "torpedos" && !own.torpedoesLoaded && i === 0
                                ? "Recargar"
                                : ACTION_INFO[a]!.short}
                            </span>
                            {a === "abordar" && charges > 0 && (
                              <span className="absolute right-0.5 top-0.5 rounded bg-amber-500/80 px-0.5 text-[8px] font-bold leading-none text-black">
                                {charges}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {!single && (
                    <p
                      data-tour={i === 0 ? "pronostico" : undefined}
                      className="rounded bg-black/30 px-2 py-1 text-[11px]"
                    >
                      <span className="text-sky-300">−{st.ourHit.toFixed(1)}</span> ·{" "}
                      <span className="text-red-300">−{st.theirHit.toFixed(1)}</span> · enemigo{" "}
                      {sideName(st.rel)}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div
        data-tour="salto"
        className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2 text-sm"
      >
        <span>Salto automático si el casco baja de</span>
        <select
          className="rounded border border-border bg-background px-2 py-1 text-sm"
          value={emergencyJump}
          onChange={(e) => setEmergencyJump(Number(e.target.value))}
        >
          {[0, 20, 30, 40, 50].map((v) => (
            <option key={v} value={v}>
              {v ? `${v} %` : "Nunca"}
            </option>
          ))}
        </select>
        {emergencyJump === 0 && (
          <span className="w-full text-xs text-amber-300">
            Sin red: si la nave cae a 0, se pierde la nave y sus mejoras (24 h de astillero).
          </span>
        )}
      </div>
      <Button
        data-tour="confirmar"
        className="h-auto w-full whitespace-normal py-3"
        disabled={sending || missing >= 0}
        onClick={() => void send()}
      >
        {missing >= 0
          ? single
            ? "Elige maniobra y acción"
            : `Faltan órdenes en la ronda ${missing + 1}`
          : (submitLabel ?? (single ? "Fijar orden" : `Fijar órdenes del bloque ${block}`))}
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
  single,
  onContinue,
  onJump,
}: {
  state: DuelState;
  side: Side;
  foeName: string;
  single: boolean;
  onContinue: () => void;
  onJump: () => Promise<void>;
}) {
  const own = state[side];
  const foe = state[other(side)];
  const voice = SECOND[own.fleet];
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ownPct = Math.round((own.hull / own.maxHull) * 100);
  const foePct = Math.round((foe.hull / foe.maxHull) * 100);
  const advice =
    ownPct <= 30 && foePct > ownPct
      ? "El casco no aguantará mucho más. Yo saltaría."
      : foePct < ownPct
        ? `${foeName} está peor que nosotros. A rematar.`
        : "La batalla sigue abierta.";
  return (
    <section
      aria-label="Decisión tras el bloque"
      className="space-y-2 rounded border border-amber-500/60 bg-amber-950/10 p-3"
    >
      <p className="text-sm">
        <span className="text-primary">{voice.title}:</span> «{advice}»
        <span className="ml-2 text-xs text-muted-foreground">
          Tú {ownPct} % · {foeName} {foePct} %
        </span>
      </p>
      {!confirming ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button size="lg" onClick={onContinue}>
            {single ? "Planificar siguiente ronda" : "Planificar siguiente asalto"}
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
            <Sparkles /> Saltar al disforme
          </Button>
        </div>
      ) : (
        <div role="alertdialog" aria-label="Confirmar salto" className="space-y-2">
          <p className="text-sm text-fuchsia-200">
            Se abre el portal: esta ronda y la siguiente la nave queda quieta y sin defensas (el
            enemigo puede seguir disparando). Después saltas: pierdes el duelo pero salvas la nave.
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
              {busy ? "Abriendo el portal…" : "Declarar el salto"}
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

/** Elección del modo de combate al iniciar el duelo. */
export function ModePicker({
  mine,
  theirs,
  peerName,
  online,
  onChoose,
}: {
  mine: DuelMode | null;
  theirs: DuelMode | null;
  peerName: string;
  online: boolean | null;
  onChoose: (m: DuelMode) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const opts: { m: DuelMode; title: string; text: string }[] = [
    {
      m: 1,
      title: "De una en una",
      text: "Más fluido e intuitivo: decides cada ronda viendo lo que acaba de pasar. Para cuando los dos estáis conectados (15 min por ronda).",
    },
    {
      m: 3,
      title: "De tres en tres",
      text: "Más rápido y con más azar: das tres rondas de órdenes a ciegas. Para cuando estáis a otras cosas (24 h por bloque).",
    },
  ];
  return (
    <section
      aria-label="Modo de combate"
      className="space-y-2 rounded border border-amber-500/60 p-3"
    >
      <p className="text-sm text-primary">¿Cómo queréis combatir?</p>
      <p className="text-xs text-muted-foreground">
        {online
          ? `${peerName} está conectado ahora: de una en una es buena opción.`
          : online === false
            ? `${peerName} no está conectado: mejor de tres en tres.`
            : "Comprobando si tu rival está conectado…"}{" "}
        Solo se juega de una en una si los dos lo elegís.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {opts.map((o) => (
          <button
            key={o.m}
            type="button"
            disabled={busy || mine !== null}
            aria-pressed={mine === o.m}
            onClick={async () => {
              setBusy(true);
              try {
                await onChoose(o.m);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "No se pudo elegir el modo");
              } finally {
                setBusy(false);
              }
            }}
            className={`rounded border p-3 text-left disabled:cursor-default ${mine === o.m ? "border-primary bg-accent" : "border-border hover:border-primary/60"} ${mine !== null && mine !== o.m ? "opacity-50" : ""}`}
          >
            <span className="block font-semibold text-primary">{o.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{o.text}</span>
            {theirs === o.m && (
              <span className="mt-1 block text-xs text-amber-200">{peerName} ha elegido esta</span>
            )}
          </button>
        ))}
      </div>
      {mine !== null && (
        <p role="status" className="text-xs text-amber-200">
          {theirs === null ? `Esperando a que ${peerName} elija…` : "Modo decidido."}
        </p>
      )}
    </section>
  );
}

/** Indicador de si el rival está conectado ahora mismo. */
export function PresenceBadge({ online, name }: { online: boolean | null; name: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${online ? "border-emerald-500/60 text-emerald-200" : "border-border text-muted-foreground"}`}
    >
      <span
        className={`size-2 rounded-full ${online ? "bg-emerald-400 motion-safe:animate-pulse" : "bg-zinc-500"}`}
      />
      {name} {online ? "en línea" : online === false ? "desconectado" : "…"}
    </span>
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
  /** Cabecera extra (presencia del rival). */
  badge?: ReactNode;
  /** Sustituye a las órdenes (p. ej. la elección de modo). */
  gate?: ReactNode;
  /** Bajo el registro (mensajes de voz). */
  comms?: ReactNode;
}

const STAGE_PORTAL: Record<"declara" | "carga" | "salta", PortalStage> = {
  declara: "forma",
  carga: "carga",
  salta: "salta",
};
const chargePortal = (s: SideState): PortalStage | undefined =>
  (s.warpCharge ?? 0) >= 2 ? "carga" : (s.warpCharge ?? 0) === 1 ? "forma" : undefined;

export function DuelBoard(p: DuelBoardProps) {
  const { state, side, foeName } = p;
  const foeSide = other(side);
  const own = state[side];
  const foe = state[foeSide];
  const rounds = blockRounds(state);
  const single = rounds === 1;
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
  const [stance, setStance] = useState<Stance | null>(null);
  const [draft, setDraftState] = useState<DraftRound[]>(() => emptyDraft(rounds));
  const setDraft = useCallback((f: (d: DraftRound[]) => DraftRound[]) => {
    setStance(null);
    setDraftState(f);
  }, []);
  const [emergencyJump, setEmergencyJump] = useState(30);
  const [selected, setSelected] = useState(0);
  const [tour, setTour] = useState(false);
  /** Tras ver un bloque: ¿seguimos combatiendo o saltamos? (antes del primer bloque no se pregunta) */
  const [decided, setDecided] = useState(p.replayEvents.length === 0);
  useEffect(() => setDecided(p.replayEvents.length === 0), [p.block, p.replayEvents.length]);
  useEffect(() => {
    setDraftState(emptyDraft(rounds));
    setStance(null);
    setSelected(0);
  }, [p.block, state.phase, rounds]);
  const plan = useMemo(() => draftToPlan(draft, own, emergencyJump), [draft, own, emergencyJump]);
  const fc = useMemo(() => forecast(state, side, plan.phases), [state, side, plan]);
  const planningFit = useMemo(
    () => [...reachable(own, single ? 1 : 2).flat(), ...reachable(foe, single ? 1 : 2).flat()],
    [own, foe, single],
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
  const over = !!state.finished || p.status === "terminado";
  const warping = inWarp(own) && !over;
  const needDecision =
    p.canPlan && !!p.onSubmit && !decided && p.status !== "pendiente" && !warping && !p.gate;
  const showPlan = p.canPlan && !frame && !needDecision && !warping && !p.gate;
  const shownPhase = replay.idx >= 0 ? p.replayEvents[replay.idx] : null;
  const last = fc.steps[fc.steps.length - 1];
  const selStep = fc.steps[selected];
  const ownUpTo = decidedPath(draft);
  const planReady = draft.every((_, i) => roundReady(draft, i));
  const portals = shownPhase
    ? {
        own: shownPhase[side].warp?.stage ? STAGE_PORTAL[shownPhase[side].warp!.stage!] : undefined,
        foe: shownPhase[foeSide].warp?.stage
          ? STAGE_PORTAL[shownPhase[foeSide].warp!.stage!]
          : undefined,
      }
    : frame
      ? undefined
      : { own: chargePortal(own), foe: chargePortal(foe) };
  const jumpPlan = (): BlockPlan =>
    draftToPlan(
      draft.map((r, k) => (k === 0 ? { m: "parar", a: "saltar" } : r)),
      own,
      emergencyJump,
    );
  return (
    <article
      className="space-y-4 rounded border border-destructive/70 p-3 sm:p-4"
      aria-label={`Duelo contra ${foeName}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg text-primary">{p.title}</h3>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {FLEETS[foe.fleet].name}
            {state.mode && <span>· {single ? "de una en una" : "de tres en tres"}</span>}
            {p.badge}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => setTour(true)} aria-label="Tutorial">
            <GraduationCap />
          </Button>
          <DuelHelp fleet={own.fleet} />
          <SoundControls />
        </div>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <HullBar
            label="Tu nave"
            hull={shownPhase ? shownPhase[side].hullAfter : own.hull}
            max={own.maxHull}
            mine
            projected={showPlan && planReady ? last?.ownHull : undefined}
          />
          <ModuleStatus s={own} label="Tu nave" />
        </div>
        <div className="space-y-1.5">
          <HullBar
            label={foeName}
            hull={shownPhase ? shownPhase[foeSide].hullAfter : foe.hull}
            max={foe.maxHull}
            mine={false}
            projected={showPlan && planReady ? last?.foeHull : undefined}
          />
          <ModuleStatus s={foe} label={foeName} />
        </div>
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
              ownUpTo={ownUpTo}
              motion={replay.motion}
              portals={portals}
              fitPoints={
                showPlan ? planningFit : replay.fitPoints.length ? replay.fitPoints : undefined
              }
              onFx={(f) => (fx.current = f)}
              onProjection={(pr) => (proj.current = pr)}
              caption={
                shownPhase
                  ? `Repetición · ronda ${replay.idx + 1} de ${p.replayEvents.length}`
                  : showPlan
                    ? "Azul: tu ruta · zona roja: hasta dónde puede llegar el enemigo"
                    : undefined
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
          {p.comms}
        </div>
        <div className="space-y-3">
          <div data-tour="radar">
            <Radar
              own={frame?.own ?? own}
              foe={frame?.foe ?? foe}
              geo={frame?.geo}
              foeLabel={foeName}
              approaching={p.status === "pendiente" && !frame && !showPlan}
              torpedoesOut={frame ? 0 : own.torpedoesInFlight}
              torpedoesIn={frame ? 0 : foe.torpedoesInFlight}
              compact
              simple
              ourDamage={frame ? undefined : expectedHit(own, foe)}
              theirDamage={frame ? undefined : expectedHit(foe, own)}
              alarm={showPlan}
              caption={frame ? "Situación en la repetición" : "Situación actual"}
            />
          </div>
          {!over && (
            <FirstOfficer
              state={state}
              side={side}
              stance={stance}
              onSuggest={
                showPlan
                  ? (s) => {
                      setDraftState(
                        planToDraft(suggestPlan(state, side, s), rounds).map((r) =>
                          r.a === "embestir" || r.a === "saltar" ? r : { ...r },
                        ),
                      );
                      setStance(s);
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>
      {p.infoText && <p className="text-xs text-muted-foreground">{p.infoText}</p>}
      {replay.playing ? (
        <p role="status" className="rounded border border-amber-500/50 p-3 text-sm text-amber-200">
          Reproduciendo lo ocurrido…
        </p>
      ) : p.gate ? (
        p.gate
      ) : warping && p.status !== "terminado" ? (
        <p
          role="status"
          className="rounded border border-fuchsia-500/60 bg-fuchsia-950/30 p-3 text-sm text-fuchsia-200"
        >
          <Sparkles className="mr-1 inline size-4" />
          Modo salto: el portal se está abriendo. La nave aguanta quieta y sin órdenes;{" "}
          {(own.warpCharge ?? 0) >= 2
            ? "saltará al empezar la siguiente ronda."
            : "queda una ronda de aguante."}
          {p.status === "practica" && p.onSubmit && (
            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={() => void p.onSubmit?.(warpPlan(rounds))}
            >
              Siguiente ronda
            </Button>
          )}
        </p>
      ) : needDecision && p.onSubmit ? (
        <DecisionGate
          state={state}
          side={side}
          foeName={foeName}
          single={single}
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
            try {
              await p.onSubmit?.(jumpPlan());
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "No se pudo ordenar el salto");
            }
          }}
        />
      ) : showPlan && p.onSubmit ? (
        <Planner
          state={state}
          side={side}
          draft={draft}
          setDraft={setDraft}
          emergencyJump={emergencyJump}
          setEmergencyJump={setEmergencyJump}
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
      {!over && <ShipSchematic own={own} foe={foe} foeName={foeName} />}
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
  const foeName = name(foeId);
  const qc = useQueryClient();
  const link = useDuelLink(raid.id, uid, foeId, (s) => {
    if (s === "voice") void qc.invalidateQueries({ queryKey: ["naval-voice", raid.id] });
    else onChanged();
  });
  if (!state)
    return (
      <article className="rounded border border-destructive p-4 text-sm">
        Contacto con {foeName} · preparando el duelo…
      </article>
    );
  const myReady = side === "attacker" ? raid.attacker_ready : raid.defender_ready;
  const foeReady = side === "attacker" ? raid.defender_ready : raid.attacker_ready;
  const approaching = raid.status === "pendiente";
  const asMode = (v: number | null | undefined) => (v === 1 || v === 3 ? v : null);
  const mineMode = asMode(side === "attacker" ? raid.attacker_mode : raid.defender_mode);
  const theirMode = asMode(side === "attacker" ? raid.defender_mode : raid.attacker_mode);
  const single = state.mode === 1;
  const gate = !state.mode ? (
    <ModePicker
      mine={mineMode}
      theirs={theirMode}
      peerName={foeName}
      online={link.online}
      onChoose={async (mode) => {
        await chooseDuelMode({ data: { raidId: raid.id, mode } });
        link.send("mode");
        onChanged();
      }}
    />
  ) : undefined;
  const unit = single ? "ronda" : "bloque";
  return (
    <DuelBoard
      title={`${side === "attacker" ? "Ofensiva contra" : "Atacado por"} ${foeName}`}
      state={state}
      side={side}
      foeName={foeName}
      badge={<PresenceBadge online={link.online} name={foeName} />}
      gate={gate}
      replayEvents={lastBlock}
      replayStart={state}
      replayLabel={single ? "Ver ronda" : `Ver bloque ${raid.block_number - 1}`}
      status={approaching ? "pendiente" : "enfrentado"}
      block={raid.block_number}
      canPlan={!myReady}
      infoText={
        myReady || !state.mode
          ? undefined
          : approaching
            ? `En aproximación: contacto en ${remaining(raid.deadline)}.`
            : `Plazo ${remaining(raid.deadline)}.${foeReady ? ` ${foeName} ya ha dado sus órdenes.` : ""}${single ? " Si nadie responde a tiempo, se pasa a tres en tres." : " Si no das órdenes a tiempo, pierdes el duelo."}`
      }
      waitingText={`Órdenes fijadas. ${approaching ? `El combate empieza al llegar (${remaining(raid.deadline)}).` : foeReady ? "Resolviendo…" : `Esperando a ${foeName} · ${remaining(raid.deadline)}.`}`}
      onSubmit={async (plan) => {
        await submitDuelPlan({ data: { raidId: raid.id, block: raid.block_number, plan } });
        link.send("orders");
        toast.success("Órdenes fijadas");
        onChanged();
      }}
      storageKey={raid.id}
      autoplay
      epilogueTitle={`Informe ${single ? "de la ronda" : `del bloque ${raid.block_number - 1}`}`}
      comms={
        <VoiceComms
          raidId={raid.id}
          uid={uid}
          peerId={foeId}
          peerName={foeName}
          block={raid.block_number}
          onSent={() => link.send("voice")}
        />
      }
      footer={
        single && !approaching ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (!confirm(`¿Pasar a tres en tres? Se descartan las órdenes de esta ${unit}.`))
                return;
              try {
                await switchDuelToThree({ data: { raidId: raid.id } });
                link.send("mode");
                onChanged();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "No se pudo cambiar el modo");
              }
            }}
          >
            Pasar a tres en tres
          </Button>
        ) : undefined
      }
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
          Al empezar, cada uno elige <b>de una en una</b> (fluido, ambos conectados, 15 min por
          ronda) o <b>de tres en tres</b> (rápido, a ciegas, 24 h por bloque). De una en una solo si
          los dos lo elegís.
        </li>
        <li>
          <b>Aproximación:</b> en el mismo planeta, 5 min más 1 h por cada zona de desembarco del
          defensor allí (máx. 4 h); desde otro planeta, lo que dure el viaje. Mientras tanto nada se
          bloquea salvo viajar. Durante el combate, las obras y mejoras quedan en pausa.
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
          Se pierde si <b>la nave estalla</b> (casco a 0: pierdes la nave y sus mejoras y pasa 24 h
          en el astillero; conquistas, créditos y unidades siguen) o si <b>saltas al disforme</b>{" "}
          (pierdes el duelo, salvas la nave). El salto tarda: declaras, aguantas una ronda quieto y
          sin defensas, y luego saltas.
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
