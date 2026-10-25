import { useEffect, useMemo, useRef, useState } from "react";
import type { FleetId } from "@/lib/ship-identity";
import { TopDownShip } from "./TopDownShip";
import { BAND_EDGES } from "@/lib/naval3/factions";
import { rawFire } from "@/lib/naval3/engine";
import type { ForecastStep } from "@/lib/naval3/advisor";
import type { SideState, Vec } from "@/lib/naval3/types";
import { FxEngine, type P } from "./fx";

export const MAP_W = 400;
export const MAP_H = 300;

export interface Projection {
  pt: (v: Vec) => P;
  /** Píxeles del SVG por unidad de distancia. */
  scale: number;
}

/** Encaja un conjunto de puntos del plano en el lienzo (norte arriba), con margen. */
export function makeProjection(points: Vec[], minSpan = 18): Projection {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const span = Math.max(
    minSpan,
    (maxX - minX) * 1.25 + 4,
    ((maxY - minY) * 1.25 + 4) * (MAP_W / MAP_H),
  );
  const scale = MAP_W / span;
  return {
    scale,
    pt: (v) => ({ x: MAP_W / 2 + (v.x - cx) * scale, y: MAP_H / 2 - (v.y - cy) * scale }),
  };
}

/** Escala para que, con tu nave siempre en el centro, quepan todos los puntos relevantes. */
export function centeredScale(points: Vec[], minSpan = 16): number {
  let d = 0;
  for (const a of points)
    for (const b of points)
      d = Math.max(d, Math.abs(a.x - b.x), Math.abs(a.y - b.y) * (MAP_W / MAP_H));
  return MAP_W / Math.max(minSpan, d * 2 * 1.08 + 4);
}

/** Proyección norte arriba centrada en un punto (tu nave). */
export function centeredProjection(center: Vec, scale: number): Projection {
  return {
    scale,
    pt: (v) => ({
      x: MAP_W / 2 + (v.x - center.x) * scale,
      y: MAP_H / 2 - (v.y - center.y) * scale,
    }),
  };
}

const SHIP = "M0 -11 L7 6 L3 4 L0 9 L-3 4 L-7 6 Z";

/** Envolvente convexa (cadena monótona). */
function hull(pts: P[]): P[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: P[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0)
      lower.pop();
    lower.push(q);
  }
  const upper: P[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0)
      upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function wedge(c: P, r: number, from: number, to: number) {
  const p = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${c.x + r * Math.sin(a)} ${c.y - r * Math.cos(a)}`;
  };
  return `M${c.x} ${c.y} L${p(from)} A${r} ${r} 0 0 1 ${p(to)} Z`;
}

const ARCS = [
  { from: -45, to: 45, mid: 0 },
  { from: 45, to: 135, mid: 90 },
  { from: 135, to: 225, mid: 180 },
  { from: -135, to: -45, mid: -90 },
];

/** Conos de fuego de una nave: largo = alcance útil (hasta Media), intensidad = daño. */
function Arcs({
  s,
  at,
  scale,
  color,
  faint = false,
}: {
  s: SideState;
  at: P;
  scale: number;
  color: string;
  faint?: boolean;
}) {
  const h = s.heading * 45;
  return (
    <g>
      {ARCS.map((a) => {
        const best = Math.max(
          ...[0, 1, 2, 3].map((b) => rawFire(s, a.mid, b as 0 | 1 | 2 | 3).value),
        );
        if (best <= 0) return null;
        const reach = rawFire(s, a.mid, 2).value > 0 ? BAND_EDGES[2] : BAND_EDGES[1];
        return (
          <path
            key={a.mid}
            d={wedge(at, reach * scale, h + a.from + 8, h + a.to - 8)}
            fill={color}
            fillOpacity={Math.min(0.14, best / 60)}
            stroke={color}
            strokeOpacity={0.3}
            strokeWidth={0.6}
            strokeDasharray={faint ? "2 3" : undefined}
          />
        );
      })}
    </g>
  );
}

export interface Pose {
  pos: Vec;
  heading: number;
}

/** Tramo de movimiento de una nave durante una ronda (para animarlo de forma continua). */
export interface Segment {
  from: Pose;
  to: Pose;
}

export interface Motion {
  own: Segment;
  foe: Segment;
  /** performance.now() al empezar. */
  start: number;
  /** Duración en ms. */
  dur: number;
}

const dir = (h: number) => {
  const a = (h * Math.PI) / 4;
  return { x: Math.sin(a), y: Math.cos(a) };
};

/** Posición y rumbo (grados) en la fracción t de un tramo: curva suave que respeta rumbo inicial y final. */
export function poseAt(seg: Segment, t: number): { pos: Vec; deg: number } {
  const a = seg.from.pos;
  const b = seg.to.pos;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const d0 = dir(seg.from.heading);
  const d1 = dir(seg.to.heading);
  const c = {
    x: (a.x + d0.x * L * 0.5 + b.x - d1.x * L * 0.5) / 2,
    y: (a.y + d0.y * L * 0.5 + b.y - d1.y * L * 0.5) / 2,
  };
  const u = 1 - t;
  const pos = {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
  let deg: number;
  if (L > 0.3) {
    const tx = 2 * u * (c.x - a.x) + 2 * t * (b.x - c.x);
    const ty = 2 * u * (c.y - a.y) + 2 * t * (b.y - c.y);
    deg = (Math.atan2(tx, ty) * 180) / Math.PI;
  } else {
    const h0 = seg.from.heading * 45;
    let h1 = seg.to.heading * 45;
    while (h1 - h0 > 180) h1 -= 360;
    while (h1 - h0 < -180) h1 += 360;
    deg = h0 + (h1 - h0) * Math.min(1, t * 1.6);
  }
  return { pos, deg };
}

/** Rumbo en grados del lienzo (0 = arriba) → rotación SVG equivalente. */
function GhostShip({
  at,
  deg,
  color,
  n,
  active,
}: {
  at: P;
  deg: number;
  color: string;
  n: number;
  active: boolean;
}) {
  return (
    <g transform={`translate(${at.x} ${at.y})`} opacity={active ? 1 : 0.5}>
      <g transform={`rotate(${deg})`}>
        <path
          d={SHIP}
          transform="scale(0.9)"
          fill="none"
          stroke={color}
          strokeWidth={active ? 1.3 : 0.9}
          strokeDasharray="2 1.5"
        />
      </g>
      <text y={3} textAnchor="middle" className="text-[8px] font-bold" fill={color}>
        {n}
      </text>
    </g>
  );
}

/** Fase del portal disforme sobre una nave: se forma, carga y, al saltar, la engulle. */
export type PortalStage = "forma" | "carga" | "salta";

function WarpPortal({ size, stage, uid }: { size: number; stage: PortalStage; uid: string }) {
  const r = size * (stage === "forma" ? 0.75 : stage === "carga" ? 1.05 : 1.3);
  return (
    <g pointerEvents="none">
      <defs>
        <radialGradient id={`portal-${uid}`}>
          <stop offset="0" stopColor="#05000a" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#3b0764" stopOpacity="0.8" />
          <stop offset="0.75" stopColor="#a21caf" stopOpacity="0.45" />
          <stop offset="1" stopColor="#f0abfc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g
        style={{
          transform: `scale(${r / size})`,
          transition: "transform 1.8s cubic-bezier(.3,0,.2,1)",
        }}
      >
        <circle r={size} fill={`url(#portal-${uid})`}>
          <animate
            attributeName="opacity"
            values="0.75;1;0.75"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </circle>
        {[0.95, 0.72, 0.5].map((k, i) => (
          <g key={k}>
            <ellipse
              rx={size * k}
              ry={size * k * 0.82}
              fill="none"
              stroke={i === 0 ? "#f0abfc" : "#c084fc"}
              strokeWidth={i === 0 ? 1.6 : 1}
              strokeDasharray={`${size * 0.5} ${size * 0.25}`}
              opacity={0.85 - i * 0.2}
            />
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={i % 2 ? "360" : "0"}
              to={i % 2 ? "0" : "360"}
              dur={`${2.4 + i}s`}
              repeatCount="indefinite"
            />
          </g>
        ))}
      </g>
    </g>
  );
}

function RealShip({
  at,
  deg,
  fleet,
  size,
  power,
  label,
  color,
  uid,
  portal,
}: {
  at: P;
  deg: number;
  fleet: FleetId;
  size: number;
  power: number;
  label: string;
  color: string;
  uid: string;
  portal?: PortalStage | undefined;
}) {
  const gone = portal === "salta";
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      {portal && <WarpPortal size={size} stage={portal} uid={uid} />}
      <g
        style={{
          transform: gone ? "scale(0) rotate(200deg)" : "scale(1)",
          opacity: gone ? 0 : 1,
          transition: gone
            ? "transform 1.6s cubic-bezier(.6,0,.9,.4) 1.2s, opacity 1.6s ease-in 1.2s"
            : "none",
        }}
      >
        <g transform={`rotate(${deg})`}>
          <TopDownShip fleet={fleet} size={size} power={portal ? 0 : power} uid={uid} />
        </g>
      </g>
      <text
        y={-size / 2 - 5}
        textAnchor="middle"
        className="text-[9px]"
        fill={color}
        stroke="#000"
        strokeWidth={2.5}
        paintOrder="stroke"
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Mapa táctico visto desde arriba (norte arriba): las dos naves, sus conos de fuego, tu trayectoria
 * ronda a ronda, la trayectoria más probable del enemigo y la zona que puede alcanzar.
 * Con `motion`, las naves se desplazan de forma continua siguiendo una curva suave.
 */
export function TacticalMap({
  own,
  foe,
  ownLabel = "Tu nave",
  foeLabel,
  steps,
  envelope,
  selected = 0,
  fitPoints,
  motion,
  portals,
  ownUpTo,
  onFx,
  onProjection,
  caption,
}: {
  own: SideState;
  foe: SideState;
  ownLabel?: string;
  foeLabel: string;
  steps?: ForecastStep[] | undefined;
  envelope?: Vec[][] | undefined;
  selected?: number;
  /** Puntos extra para el encuadre (p. ej. todo el recorrido de la repetición). */
  fitPoints?: Vec[] | undefined;
  motion?: Motion | null | undefined;
  /** Portal disforme abierto sobre cada nave. */
  portals?: { own?: PortalStage | undefined; foe?: PortalStage | undefined } | undefined;
  /** Rondas de nuestra trayectoria ya decididas (las demás no se dibujan). */
  ownUpTo?: number | undefined;
  onFx?: (fx: FxEngine | null) => void;
  onProjection?: (p: Projection) => void;
  caption?: string | undefined;
}) {
  const fitKey = [own.pos, foe.pos, ...(fitPoints ?? [])]
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join("|");
  const scale = useMemo(
    () => centeredScale([own.pos, foe.pos, ...(fitPoints ?? [])]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fitKey],
  );
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !onFx) return;
    const fx = new FxEngine(canvas.current, MAP_W, MAP_H);
    const ro = new ResizeObserver(() => fx.resize());
    ro.observe(canvas.current);
    onFx(fx);
    return () => {
      ro.disconnect();
      fx.destroy();
      onFx(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Animación continua de las naves
  const [t, setT] = useState(1);
  useEffect(() => {
    if (!motion) return;
    let raf = 0;
    const tick = () => {
      const v = Math.min(1, (performance.now() - motion.start) / motion.dur);
      setT(v);
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [motion]);
  const ownPose = motion ? poseAt(motion.own, t) : { pos: own.pos, deg: own.heading * 45 };
  const foePose = motion ? poseAt(motion.foe, t) : { pos: foe.pos, deg: foe.heading * 45 };
  // Tú eres el protagonista: la vista sigue siempre a tu nave (norte arriba)
  const proj = centeredProjection(ownPose.pos, scale);
  useEffect(() => {
    onProjection?.(proj);
  });
  const segLen = (sg?: Segment) =>
    sg ? Math.hypot(sg.to.pos.x - sg.from.pos.x, sg.to.pos.y - sg.from.pos.y) : 0;
  const s = proj.scale;
  const ownP = proj.pt(ownPose.pos);
  const foeP = proj.pt(foePose.pos);
  const shipPx = Math.max(26, Math.min(46, 2.4 * s));
  const gridPx = 5 * s;
  const sel = steps?.[selected];
  const env = envelope?.[selected] ?? [];
  return (
    <figure className="w-full">
      <div className="relative overflow-hidden rounded border border-primary/40 bg-[#02060a]">
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          role="img"
          aria-label="Mapa táctico"
          className="block h-auto w-full"
        >
          <defs>
            <pattern
              id="map-grid"
              width={gridPx}
              height={gridPx}
              patternUnits="userSpaceOnUse"
              x={proj.pt({ x: 0, y: 0 }).x}
              y={proj.pt({ x: 0, y: 0 }).y}
            >
              <path
                d={`M ${gridPx} 0 L 0 0 0 ${gridPx}`}
                fill="none"
                stroke="#3fd08a"
                strokeOpacity="0.07"
                strokeWidth="0.6"
              />
            </pattern>
            <radialGradient id="map-neb" cx="70%" cy="25%" r="70%">
              <stop offset="0" stopColor="#1d2b4a" stopOpacity="0.55" />
              <stop offset="1" stopColor="#02060a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width={MAP_W} height={MAP_H} fill="url(#map-neb)" />
          <MapStars />
          <rect width={MAP_W} height={MAP_H} fill="url(#map-grid)" />
          <text
            x={MAP_W - 6}
            y={12}
            textAnchor="end"
            className="text-[8px]"
            fill="#3fd08a"
            opacity={0.6}
          >
            N ↑ · cuadrícula 5 u
          </text>
          {[BAND_EDGES[0], BAND_EDGES[1], BAND_EDGES[2]].map((r, i) => (
            <g key={r}>
              <circle
                cx={ownP.x}
                cy={ownP.y}
                r={r * s}
                fill="none"
                stroke="#38bdf8"
                strokeOpacity={0.22}
                strokeDasharray="3 3"
              />
              <text
                x={ownP.x + r * s * 0.71 + 2}
                y={ownP.y - r * s * 0.71}
                className="text-[7px]"
                fill="#7dd3fc"
                opacity={0.55}
              >
                {["Contacto", "Cerca", "Media"][i]}
              </text>
            </g>
          ))}
          {env.length > 2 && (
            <polygon
              points={hull(env.map(proj.pt))
                .map((q) => `${q.x},${q.y}`)
                .join(" ")}
              fill="#ef4444"
              fillOpacity={0.1}
              stroke="#ef4444"
              strokeOpacity={0.35}
              strokeDasharray="3 3"
            />
          )}
          {!motion && <Arcs s={own} at={ownP} scale={s} color="#38bdf8" />}
          {steps && steps.length > 0 && (
            <>
              <defs>
                <marker
                  id="arrow-own"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M0 0 L10 5 L0 10 z" fill="#38bdf8" />
                </marker>
              </defs>
              <path
                d={curvePath(
                  [
                    { pos: own.pos, heading: own.heading },
                    ...steps
                      .slice(0, ownUpTo ?? steps.length)
                      .map((x) => ({ pos: x.own.pos, heading: x.own.heading })),
                  ],
                  proj,
                )}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2}
                strokeOpacity={0.85}
                markerEnd="url(#arrow-own)"
              />

              {steps.map((x, i) => (
                <g key={i}>
                  {i < (ownUpTo ?? steps.length) && (
                    <GhostShip
                      at={proj.pt(x.own.pos)}
                      deg={x.own.heading * 45}
                      color="#7dd3fc"
                      n={i + 1}
                      active={i === selected}
                    />
                  )}
                </g>
              ))}
            </>
          )}
          <RealShip
            at={foeP}
            deg={foePose.deg}
            fleet={foe.fleet}
            size={shipPx}
            power={motion ? Math.min(1, segLen(motion.foe) / 6) : 0.3}
            label={foeLabel}
            color="#fca5a5"
            uid="foe"
            portal={portals?.foe}
          />
          <RealShip
            at={ownP}
            deg={ownPose.deg}
            fleet={own.fleet}
            size={shipPx}
            power={motion ? Math.min(1, segLen(motion.own) / 6) : 0.3}
            label={ownLabel}
            color="#7dd3fc"
            uid="own"
            portal={portals?.own}
          />
        </svg>
        {onFx && (
          <canvas
            ref={canvas}
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        )}
      </div>
      {caption && (
        <figcaption className="mt-1 text-center text-xs text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** Trazado curvo a través de las poses (misma curva que la animación). */
function curvePath(poses: Pose[], proj: Projection): string {
  let d = "";
  for (let i = 0; i < poses.length - 1; i++) {
    const seg = { from: poses[i]!, to: poses[i + 1]! };
    for (let k = 0; k <= 10; k++) {
      const q = proj.pt(poseAt(seg, k / 10).pos);
      d += `${i === 0 && k === 0 ? "M" : "L"}${q.x.toFixed(1)} ${q.y.toFixed(1)} `;
    }
  }
  return d;
}

/** Estrellas de fondo fijas del mapa. */
const STARS = (() => {
  let a = 99;
  const rnd = () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
  return Array.from({ length: 140 }, () => ({
    x: rnd() * MAP_W,
    y: rnd() * MAP_H,
    r: rnd() < 0.9 ? 0.4 + rnd() * 0.4 : 0.9 + rnd() * 0.5,
    o: 0.2 + rnd() * 0.6,
  }));
})();

function MapStars() {
  return (
    <g>
      {STARS.map((st, i) => (
        <circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#dfe8ff" opacity={st.o} />
      ))}
    </g>
  );
}
