import { useEffect, useMemo, useRef } from "react";
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

function Ship({
  at,
  heading,
  color,
  label,
  ghost = false,
  n,
}: {
  at: P;
  heading: number;
  color: string;
  label?: string;
  ghost?: boolean;
  n?: number;
}) {
  return (
    <g
      style={{
        transform: `translate(${at.x}px, ${at.y}px)`,
        transition: ghost ? undefined : "transform 1200ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <g
        style={{
          transform: `rotate(${heading * 45}deg)`,
          transition: ghost ? undefined : "transform 1200ms cubic-bezier(.4,0,.2,1)",
        }}
      >
        <path
          d={SHIP}
          transform={ghost ? "scale(0.9)" : "scale(1.5)"}
          fill={ghost ? "none" : color}
          stroke={ghost ? color : "white"}
          strokeOpacity={ghost ? 0.9 : 0.75}
          strokeWidth={ghost ? 1 : 0.8}
          strokeDasharray={ghost ? "2 1.5" : undefined}
        />
      </g>
      {n !== undefined && (
        <text y={3} textAnchor="middle" className="text-[8px] font-bold" fill={color}>
          {n}
        </text>
      )}
      {label && (
        <text y={-15} textAnchor="middle" className="text-[9px]" fill={color}>
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * Mapa táctico visto desde arriba (norte arriba): las dos naves, sus conos de fuego, tu trayectoria
 * ronda a ronda, la trayectoria más probable del enemigo y la zona que puede alcanzar.
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
  onFx?: (fx: FxEngine | null) => void;
  onProjection?: (p: Projection) => void;
  caption?: string;
}) {
  const fitKey = [own.pos, foe.pos, ...(fitPoints ?? [])]
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join("|");
  const proj = useMemo(
    () => makeProjection([own.pos, foe.pos, ...(fitPoints ?? [])]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fitKey],
  );
  useEffect(() => {
    onProjection?.(proj);
  }, [proj, onProjection]);
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
  const s = proj.scale;
  const ownP = proj.pt(own.pos);
  const foeP = proj.pt(foe.pos);
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
                strokeOpacity="0.09"
                strokeWidth="0.6"
              />
            </pattern>
          </defs>
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
          {/* Anillos de distancia alrededor de tu nave */}
          {[BAND_EDGES[0], BAND_EDGES[1], BAND_EDGES[2]].map((r, i) => (
            <g key={r}>
              <circle
                cx={ownP.x}
                cy={ownP.y}
                r={r * s}
                fill="none"
                stroke="#38bdf8"
                strokeOpacity={0.25}
                strokeDasharray="3 3"
              />
              <text
                x={ownP.x + r * s * 0.71 + 2}
                y={ownP.y - r * s * 0.71}
                className="text-[7px]"
                fill="#7dd3fc"
                opacity={0.6}
              >
                {["Contacto", "Cerca", "Media"][i]}
              </text>
            </g>
          ))}
          {/* Zona que el enemigo puede alcanzar en la ronda seleccionada */}
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
          {/* Conos de fuego */}
          <Arcs
            s={sel ? sel.foe : foe}
            at={sel ? proj.pt(sel.foe.pos) : foeP}
            scale={s}
            color="#ef4444"
            faint
          />
          <Arcs
            s={sel ? sel.own : own}
            at={sel ? proj.pt(sel.own.pos) : ownP}
            scale={s}
            color="#38bdf8"
          />
          {/* Trayectorias previstas */}
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
              <polyline
                points={[ownP, ...steps.map((x) => proj.pt(x.own.pos))]
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={2}
                strokeOpacity={0.85}
                markerMid="url(#arrow-own)"
                markerEnd="url(#arrow-own)"
              />
              <polyline
                points={[foeP, ...steps.map((x) => proj.pt(x.foe.pos))]
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke="#f87171"
                strokeWidth={1.3}
                strokeDasharray="4 3"
                strokeOpacity={0.8}
              />
              {steps.map((x, i) => (
                <g key={i} opacity={i === selected ? 1 : 0.55}>
                  <Ship
                    at={proj.pt(x.own.pos)}
                    heading={x.own.heading}
                    color="#7dd3fc"
                    ghost
                    n={i + 1}
                  />
                  <Ship
                    at={proj.pt(x.foe.pos)}
                    heading={x.foe.heading}
                    color="#fca5a5"
                    ghost
                    n={i + 1}
                  />
                </g>
              ))}
              {sel && (
                <g>
                  {sel.ourHit > 0.4 && (
                    <>
                      <line
                        x1={proj.pt(sel.own.pos).x}
                        y1={proj.pt(sel.own.pos).y}
                        x2={proj.pt(sel.foe.pos).x}
                        y2={proj.pt(sel.foe.pos).y}
                        stroke="#38bdf8"
                        strokeWidth={1}
                        strokeDasharray="1 3"
                      />
                      <text
                        x={proj.pt(sel.own.pos).x * 0.35 + proj.pt(sel.foe.pos).x * 0.65}
                        y={proj.pt(sel.own.pos).y * 0.35 + proj.pt(sel.foe.pos).y * 0.65 - 4}
                        textAnchor="middle"
                        className="text-[9px] font-bold"
                        fill="#7dd3fc"
                      >
                        −{sel.ourHit.toFixed(1)}
                      </text>
                    </>
                  )}
                  {sel.theirHit > 0.4 && (
                    <text
                      x={proj.pt(sel.own.pos).x * 0.65 + proj.pt(sel.foe.pos).x * 0.35}
                      y={proj.pt(sel.own.pos).y * 0.65 + proj.pt(sel.foe.pos).y * 0.35 + 10}
                      textAnchor="middle"
                      className="text-[9px] font-bold"
                      fill="#fca5a5"
                    >
                      −{sel.theirHit.toFixed(1)}
                    </text>
                  )}
                </g>
              )}
            </>
          )}
          {/* Naves */}
          <Ship at={foeP} heading={foe.heading} color="#ef4444" label={foeLabel} />
          <Ship at={ownP} heading={own.heading} color="#38bdf8" label={ownLabel} />
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
