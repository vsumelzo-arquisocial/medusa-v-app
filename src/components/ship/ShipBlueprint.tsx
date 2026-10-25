import { useEffect, useId, useRef, useState } from "react";
import profilesJson from "@/assets/blueprint/profiles.json";
import { MODULE_IDS, type FleetId } from "@/lib/ship-identity";

const ART = import.meta.glob<string>("../../assets/blueprint/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});
const art = (fleet: FleetId, view: View) =>
  ART[`../../assets/blueprint/${fleet}-${view}.webp`] ??
  ART[`../../assets/blueprint/imperium-${view}.webp`];

type View = "side" | "top";
type Edge = "top" | "mid" | "bottom";
interface Profile {
  aspect: number;
  cols: ([number, number] | null)[];
}
const PROFILES = profilesJson as unknown as Record<string, Record<View, Profile>>;

export interface BlueprintModule {
  module: string;
  level: number;
  damaged?: boolean | null;
  building_until?: string | null;
}

/** Dónde va cada módulo: vista, posición a lo largo del casco (0 popa → 1 proa) y borde. */
const PLACES: Record<string, { view: View; x: number; edge: Edge; label?: "top" | "bottom" }> = {
  motores_plasma: { view: "side", x: 0.03, edge: "mid", label: "bottom" },
  forja: { view: "side", x: 0.16, edge: "bottom" },
  astropatico: { view: "side", x: 0.22, edge: "top" },
  puente: { view: "side", x: 0.36, edge: "top" },
  bodegas: { view: "side", x: 0.5, edge: "mid", label: "bottom" },
  cubierta_abordaje: { view: "side", x: 0.68, edge: "bottom" },
  blindaje_proa: { view: "side", x: 0.84, edge: "bottom" },
  lanza_proa: { view: "side", x: 0.94, edge: "mid", label: "top" },
  caja_creditos: { view: "top", x: 0.28, edge: "mid", label: "bottom" },
  baterias: { view: "top", x: 0.52, edge: "top" },
  camara_escudos: { view: "top", x: 0.64, edge: "mid", label: "bottom" },
  casco: { view: "top", x: 0.8, edge: "top" },
};

export const SHORT: Record<string, string> = {
  puente: "Puente",
  bodegas: "Bodega",
  casco: "Casco",
  baterias: "Baterías",
  camara_escudos: "Escudos",
  cubierta_abordaje: "Abordaje",
  motores_plasma: "Motores",
  lanza_proa: "Torpedos",
  blindaje_proa: "Blindaje",
  caja_creditos: "Cámara cr.",
  astropatico: "Antena",
  forja: "Astillero",
};

export const STATE_COLOR = {
  ok: "#34d399",
  obra: "#fbbf24",
  averia: "#f87171",
  vacio: "#64748b",
} as const;
export type ModState = keyof typeof STATE_COLOR;
export function moduleState(m?: BlueprintModule): ModState {
  if (m?.damaged) return "averia";
  if (m?.building_until) return "obra";
  return (m?.level ?? 0) > 0 ? "ok" : "vacio";
}
export const STATE_LABEL: Record<ModState, string> = {
  ok: "Operativo",
  obra: "En obras",
  averia: "Avería",
  vacio: "Sin construir",
};

function integrityColor(p: number) {
  return p >= 0.66 ? "#7de1ff" : p >= 0.33 ? "#fbbf24" : "#f87171";
}

const W = 1000;
const PAD_X = 70;
const BAND = 96; // franja de etiquetas arriba y abajo

interface Geo {
  x0: number;
  dw: number;
  h: number;
}

function anchor(p: Profile, x: number, edge: Edge, g: Geo) {
  const n = p.cols.length;
  let i = Math.min(n - 1, Math.max(0, Math.round(x * (n - 1))));
  for (let d = 0; d < n && !p.cols[i]; d++) {
    const a = i - d,
      b = i + d;
    if (a >= 0 && p.cols[a]) {
      i = a;
      break;
    }
    if (b < n && p.cols[b]) {
      i = b;
      break;
    }
  }
  const c = p.cols[i] ?? [0.4, 0.6];
  const fy =
    edge === "top"
      ? c[0] + 0.06 * (c[1] - c[0])
      : edge === "bottom"
        ? c[1] - 0.06 * (c[1] - c[0])
        : (c[0] + c[1]) / 2;
  return { x: g.x0 + ((i + 0.5) / n) * g.dw, y: BAND + fy * g.h };
}

/** Reparte etiquetas en una franja sin que se pisen (mínimo `gap` unidades). */
function spread(xs: number[], gap: number) {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out = new Array<number>(xs.length);
  let last = -Infinity;
  for (const o of order) {
    const x = Math.max(o.x, last + gap, 60);
    out[o.i] = x;
    last = x;
  }
  // Si nos salimos por la derecha, empuja hacia la izquierda
  let right = W - 60;
  for (const o of [...order].reverse()) {
    if (out[o.i]! > right) out[o.i] = right;
    right = out[o.i]! - gap;
  }
  return out;
}

function BlueprintView({
  fleet,
  view,
  title,
  modules,
  maxLevels,
  integrity,
  selected,
  onSelect,
}: {
  fleet: FleetId;
  view: View;
  title: string;
  modules: BlueprintModule[];
  maxLevels: Record<string, number>;
  integrity: number;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const prof = PROFILES[fleet]?.[view] ?? PROFILES["imperium"]![view];
  const ref = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setCompact((e?.contentRect.width ?? 999) < 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Las naves anchas (p. ej. alas tau) no deben crecer en alto sin límite
  const full = W - 2 * PAD_X;
  const maxH = full / 1.7;
  const h = Math.min(full / prof.aspect, maxH);
  const dw = h * prof.aspect;
  const geo: Geo = { x0: (W - dw) / 2, dw, h };
  const H = h + 2 * BAND;
  const LW = compact ? 118 : 166; // ancho de etiqueta
  const LH = compact ? 50 : 50;
  const ids = Object.keys(PLACES).filter((id) => PLACES[id]!.view === view);
  const marks = ids.map((id) => {
    const pl = PLACES[id]!;
    const a = anchor(prof, pl.x, pl.edge, geo);
    const side = pl.label ?? (pl.edge === "bottom" ? "bottom" : "top");
    const m = modules.find((x) => x.module === id);
    return { id, a, side, m, state: moduleState(m) };
  });
  for (const side of ["top", "bottom"] as const) {
    const group = marks.filter((k) => k.side === side);
    const xs = spread(
      group.map((k) => k.a.x),
      LW + 10,
    );
    group.forEach((k, i) => ((k as { lx?: number }).lx = xs[i] ?? k.a.x));
  }
  const tint = integrityColor(integrity);
  const shields = modules.find((x) => x.module === "camara_escudos");
  const shieldLv = shields && !shields.damaged ? shields.level : 0;
  const motors = modules.find((x) => x.module === "motores_plasma");
  const motorLv = motors && !motors.damaged ? motors.level : 0;
  const stern = anchor(prof, 0, "mid", geo);
  const href = art(fleet, view);
  return (
    <figure ref={ref} className="min-w-0">
      <figcaption className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-sky-200/70">
        <span>{title}</span>
        <span>{view === "side" ? "Vista de babor" : "Vista cenital"}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label={title}>
        <defs>
          <mask id={`m${uid}`} maskUnits="userSpaceOnUse">
            <image
              href={href}
              x={geo.x0}
              y={BAND}
              width={dw}
              height={h}
              preserveAspectRatio="none"
            />
          </mask>
          <pattern
            id={`h${uid}`}
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="4" height="10" fill="#f87171" />
          </pattern>
        </defs>
        {/* Cotas */}
        <g stroke="#7de1ff" strokeOpacity="0.35" strokeWidth="1" fill="none">
          <line x1={geo.x0} y1={H - 6} x2={geo.x0 + dw} y2={H - 6} />
          <line x1={geo.x0} y1={H - 12} x2={geo.x0} y2={H} />
          <line x1={geo.x0 + dw} y1={H - 12} x2={geo.x0 + dw} y2={H} />
        </g>
        <text
          x={W / 2}
          y={H - 11}
          textAnchor="middle"
          fontSize={compact ? 22 : 14}
          fill="#7de1ff"
          fillOpacity="0.5"
          fontFamily="monospace"
        >
          {compact ? "POPA ── PROA" : "POPA ─────── ESLORA ─────── PROA"}
        </text>
        {/* Escudos */}
        {view === "top" && shieldLv > 0 && (
          <ellipse
            cx={W / 2}
            cy={BAND + h / 2}
            rx={dw / 2 + 22}
            ry={h / 2 + 18}
            fill="#38bdf8"
            fillOpacity={0.03 * shieldLv}
            stroke="#38bdf8"
            strokeOpacity={0.25 + 0.15 * shieldLv}
            strokeDasharray="6 8"
            className="blueprint-shield"
          />
        )}
        {/* Motores */}
        {motorLv > 0 && (
          <g className="blueprint-engine">
            <ellipse
              cx={stern.x - 14}
              cy={stern.y}
              rx={10 + 8 * motorLv}
              ry={6 + 2 * motorLv}
              fill="#38bdf8"
              fillOpacity="0.35"
            />
            <ellipse
              cx={stern.x - 8}
              cy={stern.y}
              rx={6 + 4 * motorLv}
              ry={3 + motorLv}
              fill="#e0f2fe"
              fillOpacity="0.7"
            />
          </g>
        )}
        {/* Casco: trazo coloreado por la integridad, y rayado rojo en la parte perdida (desde la proa) */}
        <rect x={geo.x0} y={BAND} width={dw} height={h} fill={tint} mask={`url(#m${uid})`} />
        {integrity < 1 && (
          <rect
            x={geo.x0 + integrity * dw}
            y={BAND}
            width={(1 - integrity) * dw}
            height={h}
            fill={`url(#h${uid})`}
            opacity="0.8"
            mask={`url(#m${uid})`}
          />
        )}
        {/* Módulos */}
        {marks.map((k) => {
          const lx = (k as { lx?: number }).lx ?? k.a.x;
          const ly = k.side === "top" ? 8 : H - BAND + 14;
          const join = k.side === "top" ? ly + LH : ly - 6;
          const col = STATE_COLOR[k.state];
          const max = maxLevels[k.id] ?? 3;
          const lvl = k.m?.level ?? 0;
          const on = selected === k.id;
          const code = `G${MODULE_IDS.indexOf(k.id as (typeof MODULE_IDS)[number]) + 1}`;
          const pts =
            k.id === "baterias" ? [k.a, anchor(prof, PLACES["baterias"]!.x, "bottom", geo)] : [k.a];
          return (
            <g
              key={k.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${SHORT[k.id]}: nivel ${lvl} de ${max}, ${STATE_LABEL[k.state]}`}
              className="cursor-pointer outline-none [&:focus-visible>rect.lbl]:stroke-white"
              onClick={() => onSelect(k.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(k.id);
                }
              }}
            >
              {pts.map((p, i) => (
                <g key={i}>
                  <polyline
                    points={`${p.x},${p.y} ${p.x},${join} ${lx},${join}`}
                    fill="none"
                    stroke={col}
                    strokeOpacity={on ? 0.95 : 0.5}
                    strokeWidth={on ? 2 : 1.2}
                    strokeDasharray={k.state === "vacio" ? "4 4" : undefined}
                  />
                  {on && (
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="16"
                      fill="none"
                      stroke={col}
                      strokeWidth="2"
                      className="blueprint-ping"
                    />
                  )}
                  <rect
                    x={p.x - 9}
                    y={p.y - 9}
                    width="18"
                    height="18"
                    rx="3"
                    fill={k.state === "vacio" ? "#0b1a2c" : col}
                    fillOpacity={k.state === "vacio" ? 0.9 : 0.85}
                    stroke={col}
                    strokeWidth="2"
                    className={k.state === "obra" ? "blueprint-blink" : undefined}
                  />
                  {k.state === "averia" && (
                    <path
                      d={`M${p.x - 5} ${p.y - 5} L${p.x + 5} ${p.y + 5} M${p.x + 5} ${p.y - 5} L${p.x - 5} ${p.y + 5}`}
                      stroke="#0b1a2c"
                      strokeWidth="2.5"
                    />
                  )}
                </g>
              ))}
              <rect
                className="lbl"
                x={lx - LW / 2}
                y={ly}
                width={LW}
                height={LH}
                rx="4"
                fill={on ? "#12324d" : "#0b1a2c"}
                stroke={col}
                strokeOpacity={on ? 1 : 0.6}
                strokeWidth={on ? 2.5 : 1.2}
              />
              {compact ? (
                <text
                  x={lx}
                  y={ly + 35}
                  fontSize="28"
                  textAnchor="middle"
                  fill={col}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  {code}·{k.state === "averia" ? "✕" : lvl}
                </text>
              ) : (
                <>
                  <text
                    x={lx - LW / 2 + 9}
                    y={ly + 20}
                    fontSize="17"
                    fill="#e0f2fe"
                    fontFamily="monospace"
                  >
                    <tspan fill={col} fontWeight="bold">
                      {code}
                    </tspan>{" "}
                    {SHORT[k.id]}
                  </text>
                  {Array.from({ length: max }, (_, i) => (
                    <rect
                      key={i}
                      x={lx - LW / 2 + 9 + i * 16}
                      y={ly + 30}
                      width="12"
                      height="10"
                      fill={i < lvl ? col : "none"}
                      stroke={col}
                      strokeOpacity="0.7"
                    />
                  ))}
                  <text
                    x={lx + LW / 2 - 8}
                    y={ly + 40}
                    fontSize="13"
                    textAnchor="end"
                    fill={col}
                    fontFamily="monospace"
                  >
                    {k.state === "ok"
                      ? `N${lvl}`
                      : k.state === "vacio"
                        ? "VACÍO"
                        : STATE_LABEL[k.state].toUpperCase()}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Plano de ingeniería de la nave racial: alzado lateral y planta, con módulos, nivel, salud e integridad. */
export function ShipBlueprint({
  fleet,
  fleetName,
  shipName,
  modules,
  maxLevels,
  hull,
  maxHull,
  selected,
  onSelect,
}: {
  fleet: FleetId;
  fleetName: string;
  shipName: string;
  modules: BlueprintModule[];
  maxLevels: Record<string, number>;
  hull: number;
  maxHull: number;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const integrity = Math.max(0, Math.min(1, hull / Math.max(1, maxHull)));
  const pct = Math.round(integrity * 100);
  const counts = { ok: 0, obra: 0, averia: 0, vacio: 0 } as Record<ModState, number>;
  for (const id of MODULE_IDS) counts[moduleState(modules.find((m) => m.module === id))]++;
  return (
    <div className="blueprint relative overflow-hidden border border-sky-400/30 p-3 sm:p-4">
      <div className="blueprint-scan" aria-hidden />
      <div className="relative mb-3 flex flex-wrap items-start justify-between gap-3 font-mono text-[11px] text-sky-100/80">
        <div>
          <p className="uppercase tracking-[0.25em] text-sky-300/70">
            Plano de ingeniería · {fleetName}
          </p>
          <p className="text-base text-sky-100">{shipName}</p>
        </div>
        <div className="min-w-[180px] flex-1 sm:max-w-[260px]">
          <div className="flex justify-between uppercase tracking-widest">
            <span>Integridad del casco</span>
            <span style={{ color: integrityColor(integrity) }}>{pct}%</span>
          </div>
          <div className="mt-1 h-2 w-full bg-sky-950">
            <div
              className="h-full transition-all"
              style={{ width: `${pct}%`, background: integrityColor(integrity) }}
            />
          </div>
          <p className="mt-1 text-sky-200/60">
            {hull}/{maxHull} puntos de casco
          </p>
        </div>
      </div>
      <div className="relative grid gap-4 xl:grid-cols-2">
        <BlueprintView
          fleet={fleet}
          view="side"
          title="Alzado lateral"
          modules={modules}
          maxLevels={maxLevels}
          integrity={integrity}
          selected={selected}
          onSelect={onSelect}
        />
        <BlueprintView
          fleet={fleet}
          view="top"
          title="Planta superior"
          modules={modules}
          maxLevels={maxLevels}
          integrity={integrity}
          selected={selected}
          onSelect={onSelect}
        />
      </div>
      <ul className="relative mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-sky-200/70">
        {(Object.keys(STATE_COLOR) as ModState[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5"
              style={{
                background: s === "vacio" ? "transparent" : STATE_COLOR[s],
                border: `1.5px solid ${STATE_COLOR[s]}`,
              }}
            />
            {STATE_LABEL[s]} · {counts[s]}
          </li>
        ))}
        <li className="ml-auto normal-case tracking-normal text-sky-200/50">
          Pulsa un módulo para mejorarlo
        </li>
      </ul>
    </div>
  );
}
