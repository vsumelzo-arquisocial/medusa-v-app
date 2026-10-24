import { useEffect, useRef } from "react";
import { bandOf, dist, rawFire, relBearing } from "@/lib/naval3/engine";
import { RANGE_NAMES, type Range, type SideState } from "@/lib/naval3/types";
import { FxEngine, type P } from "./fx";

/** Radio en pantalla de cada límite de banda (2, 5, 9 y 15 unidades). */
const EDGE_R = [30, 70, 110, 148];
const EDGE_D = [2, 5, 9, 15];

export function radiusOf(d: number): number {
  let prevD = 0;
  let prevR = 0;
  for (let i = 0; i < 4; i++) {
    if (d <= EDGE_D[i]!) return prevR + ((d - prevD) / (EDGE_D[i]! - prevD)) * (EDGE_R[i]! - prevR);
    prevD = EDGE_D[i]!;
    prevR = EDGE_R[i]!;
  }
  return 150;
}

/** Punto del radar para un rumbo relativo (grados, 0 = proa) y una distancia. */
export function radarPoint(rel: number, d: number): P {
  const r = radiusOf(d);
  const a = (rel * Math.PI) / 180;
  return { x: 160 + r * Math.sin(a), y: 160 - r * Math.cos(a) };
}

export interface Geo {
  rel: number;
  distance: number;
  /** Rumbo del enemigo respecto al nuestro (grados). */
  foeHeading: number;
  /** Ángulo al que nos ve el enemigo (grados, respecto a su proa). */
  relFoe: number;
}

export function geoOf(own: SideState, foe: SideState): Geo {
  return {
    rel: relBearing(own, foe.pos),
    distance: dist(own.pos, foe.pos),
    foeHeading: ((foe.heading - own.heading) * 45 + 360) % 360,
    relFoe: relBearing(foe, own.pos),
  };
}

const WEDGES = [
  { arc: "proa", from: -45, to: 45, mid: 0 },
  { arc: "estribor", from: 45, to: 135, mid: 90 },
  { arc: "popa", from: 135, to: 225, mid: 180 },
  { arc: "babor", from: -135, to: -45, mid: -90 },
] as const;

function wedgePath(cx: number, cy: number, r: number, from: number, to: number, rot = 0) {
  const p = (deg: number) => {
    const a = ((deg + rot) * Math.PI) / 180;
    return `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
  };
  return `M${cx} ${cy} L${p(from)} A${r} ${r} 0 0 1 ${p(to)} Z`;
}

const SHIP = "M0 -11 L7 6 L3 4 L0 9 L-3 4 L-7 6 Z";

/**
 * Auspex circular en el marco de nuestra nave (proa arriba).
 * Cuñas azules: potencia de nuestras armas en cada arco a la distancia actual.
 * Conos rojos: los arcos de fuego del enemigo.
 */
export function Radar({
  own,
  foe,
  geo,
  ghost,
  ghosts,
  selected = 0,
  foeLabel,
  approaching = false,
  torpedoesOut = 0,
  torpedoesIn = 0,
  caption,
  onFx,
  compact = false,
}: {
  own: SideState;
  foe: SideState;
  /** Geometría a mostrar (por defecto la del estado; en la repetición, la de la fase). */
  geo?: Geo | undefined;
  ghost?: Geo | null;
  /** Pronóstico: posición relativa del enemigo al final de cada ronda (en el marco de nuestra nave prevista). */
  ghosts?: Geo[] | undefined;
  selected?: number;
  foeLabel: string;
  approaching?: boolean;
  torpedoesOut?: number;
  torpedoesIn?: number;
  caption?: string;
  onFx?: (fx: FxEngine | null) => void;
  compact?: boolean;
}) {
  const g = geo ?? geoOf(own, foe);
  const band: Range = bandOf(g.distance);
  const foeP = approaching ? radarPoint(g.rel, 15.5) : radarPoint(g.rel, g.distance);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvas.current || !onFx) return;
    const fx = new FxEngine(canvas.current);
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
  const ours = WEDGES.map((w) => ({ ...w, v: rawFire(own, w.mid, band).value }));
  const theirs = WEDGES.map((w) => ({ ...w, v: rawFire(foe, w.mid, band).value }));
  const gp = ghost ? radarPoint(ghost.rel, ghost.distance) : null;
  return (
    <figure className={`mx-auto w-full ${compact ? "max-w-[300px]" : "max-w-[440px]"}`}>
      <div className="relative">
        <svg
          viewBox="0 0 320 320"
          role="img"
          aria-label={`Auspex: enemigo a ${Math.round(g.distance)} unidades (${approaching ? "aproximación" : RANGE_NAMES[band]}), ${Math.round(Math.abs(g.rel))}° a ${g.rel >= 0 ? "estribor" : "babor"}`}
          className="h-auto w-full"
        >
          <defs>
            <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0f2a1c" />
              <stop offset="100%" stopColor="#030806" />
            </radialGradient>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.12" />
            </linearGradient>
          </defs>
          <circle cx="160" cy="160" r="152" fill="url(#radar-bg)" />
          {/* Nuestros arcos de fuego */}
          {ours.map((w) => (
            <path
              key={w.arc}
              d={wedgePath(160, 160, 148, w.from, w.to)}
              className="fill-sky-400"
              fillOpacity={Math.min(0.32, w.v / 22)}
            />
          ))}
          <g className="text-primary">
            {[0, 1, 2, 3].map((r) => (
              <circle
                key={r}
                cx="160"
                cy="160"
                r={EDGE_R[r]}
                fill="none"
                stroke="currentColor"
                strokeOpacity={r === band && !approaching ? 0.85 : 0.3}
                strokeDasharray={r === 3 ? "4 4" : undefined}
              />
            ))}
            {[45, 135].map((a) => (
              <g key={a} stroke="currentColor" strokeOpacity="0.14">
                <line
                  x1={160 - 150 * Math.sin((a * Math.PI) / 180)}
                  y1={160 + 150 * Math.cos((a * Math.PI) / 180)}
                  x2={160 + 150 * Math.sin((a * Math.PI) / 180)}
                  y2={160 - 150 * Math.cos((a * Math.PI) / 180)}
                />
              </g>
            ))}
            <g
              style={{ transformOrigin: "160px 160px" }}
              className="motion-safe:animate-[spin_6s_linear_infinite]"
            >
              <path d="M160 160 L312 160 A152 152 0 0 0 290 82 Z" fill="url(#sweep)" />
            </g>
            {[0, 1, 2, 3].map((r) => (
              <text
                key={r}
                x={160 + 4}
                y={160 - EDGE_R[r]! + 10}
                className="fill-current text-[8px] uppercase tracking-widest"
                opacity={0.6}
              >
                {RANGE_NAMES[r]}
              </text>
            ))}
            {/* Brújula: norte del sistema */}
            <g transform={`rotate(${-own.heading * 45} 160 160)`}>
              <text
                x="160"
                y="17"
                textAnchor="middle"
                className="fill-current text-[9px]"
                opacity="0.5"
              >
                N
              </text>
            </g>
            <text
              x="160"
              y="316"
              textAnchor="middle"
              className="fill-current text-[8px] uppercase"
              opacity="0.5"
            >
              popa
            </text>
            <text x="10" y="163" className="fill-current text-[8px] uppercase" opacity="0.5">
              babor
            </text>
            <text
              x="310"
              y="163"
              textAnchor="end"
              className="fill-current text-[8px] uppercase"
              opacity="0.5"
            >
              estribor
            </text>
          </g>
          {/* Potencia de nuestras armas por arco */}
          {ours.map((w) =>
            w.v > 0 ? (
              <text
                key={w.arc}
                x={160 + 40 * Math.sin((w.mid * Math.PI) / 180)}
                y={163 - 40 * Math.cos((w.mid * Math.PI) / 180)}
                textAnchor="middle"
                className="fill-sky-200 text-[10px] font-semibold"
              >
                {w.v.toFixed(0)}
              </text>
            ) : null,
          )}
          {/* Torpedos en vuelo */}
          {!approaching &&
            torpedoesOut > 0 &&
            Array.from({ length: Math.min(torpedoesOut, 6) }, (_, i) => {
              const p = radarPoint(g.rel + (i % 2 ? 4 : -4), g.distance * (0.3 + 0.08 * i));
              return (
                <circle
                  key={`o${i}`}
                  cx={p.x}
                  cy={p.y}
                  r="2.3"
                  className="fill-amber-300 motion-safe:animate-pulse"
                />
              );
            })}
          {!approaching &&
            torpedoesIn > 0 &&
            Array.from({ length: Math.min(torpedoesIn, 6) }, (_, i) => {
              const p = radarPoint(g.rel + (i % 2 ? 6 : -6), g.distance * (0.62 - 0.08 * i));
              return (
                <circle
                  key={`i${i}`}
                  cx={p.x}
                  cy={p.y}
                  r="2.3"
                  className="fill-red-400 motion-safe:animate-pulse"
                />
              );
            })}
          {/* Pronóstico de las rondas */}
          {ghosts && ghosts.length > 0 && (
            <g>
              <polyline
                points={[foeP, ...ghosts.map((x) => radarPoint(x.rel, x.distance))]
                  .map((p) => `${p.x},${p.y}`)
                  .join(" ")}
                fill="none"
                stroke="#f87171"
                strokeDasharray="3 3"
                strokeOpacity={0.7}
              />
              {ghosts.map((x, i) => {
                const p = radarPoint(x.rel, x.distance);
                return (
                  <g
                    key={i}
                    transform={`translate(${p.x} ${p.y})`}
                    opacity={i === selected ? 1 : 0.5}
                  >
                    <g transform={`rotate(${x.foeHeading})`}>
                      <path
                        d={SHIP}
                        fill="none"
                        stroke="#fca5a5"
                        strokeDasharray="2 1.5"
                        strokeWidth={i === selected ? 1.4 : 0.8}
                      />
                    </g>
                    <text y={3} textAnchor="middle" className="fill-red-200 text-[8px] font-bold">
                      {i + 1}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
          {/* Posición prevista */}
          {gp && ghost && (
            <g transform={`translate(${gp.x} ${gp.y}) rotate(${ghost.foeHeading})`} opacity="0.6">
              <path d={SHIP} fill="none" stroke="#fca5a5" strokeDasharray="2 2" />
            </g>
          )}
          {/* Enemigo y sus arcos */}
          <g
            style={{
              transform: `translate(${foeP.x}px, ${foeP.y}px)`,
              transition: "transform 1100ms cubic-bezier(.4,0,.2,1)",
            }}
          >
            <g
              style={{
                transform: `rotate(${g.foeHeading}deg)`,
                transition: "transform 1100ms cubic-bezier(.4,0,.2,1)",
              }}
            >
              {!approaching &&
                theirs.map((w) =>
                  w.v > 0 ? (
                    <path
                      key={w.arc}
                      d={wedgePath(0, 0, 30, w.from + 8, w.to - 8)}
                      className="fill-red-500"
                      fillOpacity={Math.min(0.4, w.v / 16)}
                    />
                  ) : null,
                )}
              <path
                d={SHIP}
                className="fill-red-500"
                stroke="white"
                strokeOpacity="0.7"
                strokeWidth="0.8"
              />
            </g>
            <text y="-16" textAnchor="middle" className="fill-red-200 text-[10px]">
              {foeLabel}
            </text>
          </g>
          {/* Nuestra nave */}
          <path
            d={SHIP}
            transform="translate(160 160) scale(1.15)"
            className="fill-sky-400"
            stroke="white"
            strokeOpacity="0.8"
            strokeWidth="0.8"
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
      {!compact && (
        <figcaption className="mt-1 flex flex-wrap justify-center gap-x-3 text-[11px] text-muted-foreground">
          <span>
            <span className="inline-block size-2 bg-sky-400/60" /> nuestros arcos (número = daño a
            esta distancia)
          </span>
          <span>
            <span className="inline-block size-2 bg-red-500/60" /> arcos enemigos
          </span>
          <span>
            <span className="inline-block size-2 rounded-full bg-amber-300" /> nuestros torpedos
          </span>
          <span>
            <span className="inline-block size-2 rounded-full bg-red-400" /> torpedos enemigos
          </span>
        </figcaption>
      )}
    </figure>
  );
}
