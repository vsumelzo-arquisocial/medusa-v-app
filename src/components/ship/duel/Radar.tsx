import { RANGE_NAMES, type Range } from "@/lib/naval3/types";
import type { RangeRead } from "@/lib/naval3/advisor";

/** Radio del centro de cada banda (Contacto en el centro, Lejos fuera). */
const BAND = [26, 60, 94, 128];
const EDGE = [42, 77, 111, 145];
const ANGLE = -Math.PI / 4;
const at = (r: number, a = ANGLE) => ({ x: 160 + r * Math.cos(a), y: 160 + r * Math.sin(a) });

export type RadarFx =
  "hit-us" | "hit-them" | "ram" | "warp-us" | "warp-them" | "boom-us" | "boom-them" | null;

/**
 * Auspex circular: nuestra nave en el centro y el enemigo en el anillo de su distancia.
 * Los anillos se tiñen de verde donde les superamos y de rojo donde nos superan.
 */
export function Radar({
  range,
  ghost,
  table,
  foeLabel,
  approaching = false,
  torpedoesOut = 0,
  torpedoesIn = 0,
  fx = null,
  caption,
}: {
  range: Range;
  ghost?: Range | null;
  table?: RangeRead[];
  foeLabel: string;
  approaching?: boolean;
  torpedoesOut?: number;
  torpedoesIn?: number;
  fx?: RadarFx;
  caption?: string;
}) {
  const foeR = approaching ? 152 : BAND[range]!;
  const foe = at(foeR);
  const g = ghost != null && ghost !== range ? at(BAND[ghost]!) : null;
  return (
    <figure className="mx-auto w-full max-w-[420px]">
      <svg
        viewBox="0 0 320 320"
        role="img"
        aria-label={`Auspex: enemigo a distancia ${approaching ? "de aproximación" : RANGE_NAMES[range]}`}
        className="h-auto w-full"
      >
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.10" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </radialGradient>
          <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <g className="text-primary">
          <circle
            cx="160"
            cy="160"
            r="152"
            fill="url(#radar-bg)"
            stroke="currentColor"
            strokeOpacity="0.4"
          />
          {[0, 1, 2, 3].map((r) => {
            const e = table?.[r]?.edge ?? 0;
            const tint =
              e > 1 ? "stroke-emerald-500/25" : e < -1 ? "stroke-red-500/25" : "stroke-transparent";
            const inner = r === 0 ? 0 : EDGE[r - 1]!;
            return (
              <g key={r}>
                <circle
                  cx="160"
                  cy="160"
                  r={(inner + EDGE[r]!) / 2}
                  fill="none"
                  strokeWidth={EDGE[r]! - inner}
                  className={tint}
                />
                <circle
                  cx="160"
                  cy="160"
                  r={EDGE[r]}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={r === range && !approaching ? 0.9 : 0.35}
                  strokeDasharray={r === 3 ? "4 4" : undefined}
                />
              </g>
            );
          })}
          <line x1="8" y1="160" x2="312" y2="160" stroke="currentColor" strokeOpacity="0.12" />
          <line x1="160" y1="8" x2="160" y2="312" stroke="currentColor" strokeOpacity="0.12" />
          <g
            className="origin-center animate-[spin_6s_linear_infinite]"
            style={{ transformOrigin: "160px 160px" }}
          >
            <path d="M160 160 L312 160 A152 152 0 0 0 290 82 Z" fill="url(#sweep)" />
          </g>
          {[0, 1, 2, 3].map((r) => (
            <text
              key={r}
              x={160}
              y={160 + EDGE[r]! - 5}
              textAnchor="middle"
              className="fill-current text-[9px] uppercase tracking-widest"
              opacity={0.75}
            >
              {RANGE_NAMES[r]}
            </text>
          ))}
        </g>
        {/* Torpedos en vuelo */}
        {torpedoesOut > 0 && !approaching && (
          <g className="text-amber-300">
            {Array.from({ length: Math.min(torpedoesOut, 6) }, (_, i) => {
              const p = at(foeR * (0.35 + 0.08 * i), ANGLE + 0.05 * (i % 2 ? 1 : -1));
              return (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="2.4"
                  className="fill-current animate-pulse [transform-box:fill-box] [transform-origin:center]"
                />
              );
            })}
          </g>
        )}
        {torpedoesIn > 0 && !approaching && (
          <g className="text-red-400">
            {Array.from({ length: Math.min(torpedoesIn, 6) }, (_, i) => {
              const p = at(foeR * (0.6 - 0.08 * i), ANGLE + 0.09 * (i % 2 ? 1 : -1));
              return (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="2.4"
                  className="fill-current animate-pulse [transform-box:fill-box] [transform-origin:center]"
                />
              );
            })}
          </g>
        )}
        {/* Posición prevista */}
        {g && (
          <g opacity="0.55">
            <path
              d={`M${g.x} ${g.y - 8} L${g.x + 8} ${g.y} L${g.x} ${g.y + 8} L${g.x - 8} ${g.y} Z`}
              fill="none"
              stroke="currentColor"
              strokeDasharray="2 2"
              className="text-red-300"
            />
          </g>
        )}
        {/* Enemigo */}
        <g
          style={{
            transform: `translate(${foe.x}px, ${foe.y}px)`,
            transition: "transform 900ms cubic-bezier(.4,0,.2,1)",
          }}
          className={
            fx === "warp-them"
              ? "animate-ping [transform-box:fill-box] [transform-origin:center]"
              : ""
          }
        >
          <path
            d="M0 -10 L10 0 L0 10 L-10 0 Z"
            className={fx === "boom-them" ? "fill-orange-400" : "fill-red-500"}
            stroke="white"
            strokeOpacity="0.6"
          />
          {fx === "hit-them" && (
            <circle
              r="16"
              className="fill-orange-400/40 animate-ping [transform-box:fill-box] [transform-origin:center]"
            />
          )}
          {fx === "boom-them" && (
            <circle
              r="26"
              className="fill-orange-500/50 animate-ping [transform-box:fill-box] [transform-origin:center]"
            />
          )}
          <text y="-15" textAnchor="middle" className="fill-red-200 text-[10px]">
            {foeLabel}
          </text>
        </g>
        {/* Nuestra nave */}
        <g
          className={
            fx === "warp-us"
              ? "animate-ping [transform-box:fill-box] [transform-origin:center]"
              : ""
          }
          style={{ transformOrigin: "160px 160px" }}
        >
          <path
            d="M160 148 L170 170 L160 165 L150 170 Z"
            className={fx === "boom-us" ? "fill-orange-400" : "fill-sky-400"}
            stroke="white"
            strokeOpacity="0.7"
          />
          {fx === "hit-us" && (
            <circle
              cx="160"
              cy="160"
              r="18"
              className="fill-orange-400/40 animate-ping [transform-box:fill-box] [transform-origin:center]"
            />
          )}
          {fx === "boom-us" && (
            <circle
              cx="160"
              cy="160"
              r="30"
              className="fill-orange-500/50 animate-ping [transform-box:fill-box] [transform-origin:center]"
            />
          )}
          {fx === "ram" && (
            <circle
              cx={(160 + foe.x) / 2}
              cy={(160 + foe.y) / 2}
              r="20"
              className="fill-yellow-300/60 animate-ping [transform-box:fill-box] [transform-origin:center]"
            />
          )}
        </g>
      </svg>
      {caption && (
        <figcaption className="mt-1 text-center text-xs text-muted-foreground">
          {caption}
        </figcaption>
      )}
      {table && (
        <figcaption className="mt-1 flex flex-wrap justify-center gap-x-3 text-[11px] text-muted-foreground">
          <span>
            <span className="inline-block size-2 rounded-full bg-emerald-500/60" /> les superamos
          </span>
          <span>
            <span className="inline-block size-2 rounded-full bg-red-500/60" /> nos superan
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
