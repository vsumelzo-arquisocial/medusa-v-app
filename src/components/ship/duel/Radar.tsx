import { useEffect, useRef } from "react";
import { bandOf, dist, rawFire, relBearing } from "@/lib/naval3/engine";
import { RANGE_NAMES, type Range, type SideState } from "@/lib/naval3/types";
import { FxEngine, type P } from "./fx";
import { play } from "@/lib/sfx/engine";
import { reachable } from "@/lib/naval3/advisor";
import { isOff, stats } from "@/lib/naval3/engine";
import { SECTION_INFO } from "@/lib/naval3/factions";

export interface Danger {
  id: string;
  level: "alarma" | "aviso";
  text: string;
}

/** Peligros para la nave en la ronda que viene: lo que el enemigo PUEDE hacer, no lo que hará. */
export function assessDangers(own: SideState, foe: SideState, g: Geo): Danger[] {
  const out: Danger[] = [];
  if (foe.torpedoesInFlight > 0)
    out.push({
      id: "torpedos",
      level: "alarma",
      text: `¡${foe.torpedoesInFlight} torpedos en camino! Impactan al empezar la ronda: Esquivar o avante toda.`,
    });
  const reach = reachable(foe, 1)[0] ?? [];
  const minD = reach.reduce(
    (m, p) => Math.min(m, Math.hypot(p.x - own.pos.x, p.y - own.pos.y)),
    g.distance,
  );
  const facingUs = Math.abs(g.relFoe) <= 60;
  if (minD <= 2 && facingUs && stats(foe).ram > 0 && !isOff(foe, "motores"))
    out.push({
      id: "embestida",
      level: "alarma",
      text: "Peligro de embestida: puede alcanzarnos de frente.",
    });
  if (minD <= 2 && (foe.boardingLeft ?? 0) > 0)
    out.push({
      id: "abordaje",
      level: g.distance < 2 ? "alarma" : "aviso",
      text: `Puede abordarnos si llega a Contacto (${foe.boardingLeft} cápsula${foe.boardingLeft === 1 ? "" : "s"}).`,
    });
  if (
    foe.torpedoesLoaded &&
    !isOff(foe, "torpedos") &&
    Math.abs(g.relFoe) <= 45 &&
    g.distance <= 9 &&
    stats(foe).torpedoes > 0
  )
    out.push({
      id: "salva",
      level: "aviso",
      text: "Su proa nos apunta y tiene torpedos cargados.",
    });
  if (Math.abs(g.rel) >= 135 && g.distance <= 9)
    out.push({
      id: "popa",
      level: "aviso",
      text: "Tenemos al enemigo a popa: nuestros motores quedan expuestos.",
    });
  for (const sec of own.disabled ?? [])
    out.push({
      id: `off-${sec}`,
      level: "aviso",
      text: `${SECTION_INFO[sec].name} fuera de combate (${SECTION_INFO[sec].effect}).`,
    });
  return out;
}

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
  simple = false,
  ourDamage,
  theirDamage,
  alarm = false,
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
  caption?: string | undefined;
  onFx?: (fx: FxEngine | null) => void;
  compact?: boolean;
  /** Vista guía: solo lo esencial (dónde está el enemigo, qué arco le apunta y el consejo). */
  simple?: boolean;
  /** Daño previsto de nuestras baterías / del enemigo en la ronda (si no, el de la posición actual). */
  ourDamage?: number | undefined;
  theirDamage?: number | undefined;
  /** Sonar la alarma cuando aparece un peligro grave. */
  alarm?: boolean;
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
  const relN = (((g.rel % 360) + 540) % 360) - 180;
  const inWedge = (w: (typeof WEDGES)[number]) =>
    w.arc === "popa" ? Math.abs(relN) >= 135 : relN >= w.from && relN < w.to;
  const facing = WEDGES.find(inWedge) ?? WEDGES[0];
  const ourNow = ours.find((w) => w.arc === facing.arc)?.v ?? 0;
  const best = [...ours].sort((a, b) => b.v - a.v)[0]!;
  const theirNow = theirDamage ?? rawFire(foe, g.relFoe, band).value;
  const ourShown = ourDamage ?? ourNow;
  const dangers = simple && !approaching ? assessDangers(own, foe, g) : [];
  const dangerKey = dangers.map((d) => d.id).join("|");
  useEffect(() => {
    if (alarm && dangers.some((d) => d.level === "alarma")) play("alarma", { gain: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dangerKey, alarm]);
  const ramDanger = dangers.some((d) => d.id === "embestida" || d.id === "abordaje");
  // Barrido del auspex: el eco del enemigo se ilumina al pasar el haz y se va apagando.
  const sweepRef = useRef<SVGGElement>(null);
  const echoRef = useRef<SVGGElement>(null);
  const relRef = useRef(g.rel);
  relRef.current = g.rel;
  useEffect(() => {
    let raf = 0;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const tick = () => {
      const ang = reduce ? 0 : ((performance.now() / 6000) * 360) % 360;
      sweepRef.current?.setAttribute("transform", `rotate(${ang} 160 160)`);
      if (echoRef.current) {
        const lead = (ang + 90) % 360;
        const since = (((lead - relRef.current) % 360) + 360) % 360;
        const v = reduce ? 0.9 : 0.38 + 0.62 * Math.exp(-since / 70);
        echoRef.current.style.opacity = v.toFixed(3);
      }
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
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
              fillOpacity={
                simple
                  ? !approaching && w.arc === facing.arc
                    ? 0.38
                    : 0.06
                  : Math.min(0.32, w.v / 22)
              }
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
            <g ref={sweepRef}>
              <path d="M160 160 L312 160 A152 152 0 0 0 290 82 Z" fill="url(#sweep)" />
            </g>
            {!simple &&
              [0, 1, 2, 3].map((r) => (
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
            w.v > 0 && !simple ? (
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
              const p = radarPoint(g.rel + (i % 2 ? 6 : -6), g.distance * (0.75 - 0.06 * i));
              return (
                <g key={`i${i}`}>
                  <circle r="2.6" className="fill-red-400">
                    <animate
                      attributeName="cx"
                      values={`${p.x};${160 + (p.x - 160) * 0.15}`}
                      dur="2.2s"
                      begin={`${i * 0.25}s`}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="cy"
                      values={`${p.y};${160 + (p.y - 160) * 0.15}`}
                      dur="2.2s"
                      begin={`${i * 0.25}s`}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="1;1;0"
                      dur="2.2s"
                      begin={`${i * 0.25}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              );
            })}
          {/* Peligro de embestida o abordaje: sector rojo intermitente hacia el enemigo */}
          {ramDanger && (
            <path
              d={wedgePath(160, 160, 120, g.rel - 22, g.rel + 22)}
              className="fill-red-500 motion-safe:animate-pulse"
              fillOpacity={0.28}
            />
          )}
          {dangers.some((d) => d.level === "alarma") && (
            <circle
              cx="160"
              cy="160"
              r="150"
              fill="none"
              className="stroke-red-500 motion-safe:animate-pulse"
              strokeWidth="3"
            />
          )}
          {/* Pronóstico de las rondas */}
          {!simple && ghosts && ghosts.length > 0 && (
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
              transition: "transform 2600ms cubic-bezier(.45,0,.55,1)",
            }}
          >
            <g
              style={{
                transform: `rotate(${g.foeHeading}deg)`,
                transition: "transform 2600ms cubic-bezier(.45,0,.55,1)",
              }}
            >
              {!approaching &&
                !simple &&
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
              {simple ? (
                <g ref={echoRef}>
                  <path d={SHIP} transform="scale(1.6)" fill="#4ade80" opacity="0.25" />
                  <path
                    d={SHIP}
                    transform="scale(1.25)"
                    fill="#86efac"
                    stroke="#dcfce7"
                    strokeWidth="0.6"
                    style={{ filter: "drop-shadow(0 0 4px #4ade80)" }}
                  />
                </g>
              ) : (
                <path
                  d={SHIP}
                  className="fill-red-500"
                  stroke="white"
                  strokeOpacity="0.7"
                  strokeWidth="0.8"
                />
              )}
            </g>
            <text
              y="-16"
              textAnchor="middle"
              className={`${simple ? "fill-emerald-200" : "fill-red-200"} text-[10px]`}
            >
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
      {simple && !approaching && (
        <div className="mt-2 space-y-1">
          <ul aria-live="polite" className="space-y-1">
            {dangers.length === 0 ? (
              <li className="rounded border border-emerald-500/40 bg-emerald-950/20 px-2 py-1 text-center text-[11px] text-emerald-200">
                Sin peligros inmediatos
              </li>
            ) : (
              dangers.map((d) => (
                <li
                  key={d.id}
                  className={`rounded border px-2 py-1 text-[11px] ${d.level === "alarma" ? "border-red-500 bg-red-950/40 font-semibold text-red-200 motion-safe:animate-pulse" : "border-amber-500/60 bg-amber-950/20 text-amber-200"}`}
                >
                  {d.level === "alarma" ? "⚠ " : "• "}
                  {d.text}
                </li>
              ))
            )}
          </ul>
          <dl className="grid grid-cols-3 gap-1 text-center text-[10px]">
            <div className="rounded border border-primary/30 p-1">
              <dt className="text-muted-foreground">Enemigo</dt>
              <dd className="font-semibold text-red-200">
                {facing.arc === "proa"
                  ? "a proa"
                  : facing.arc === "popa"
                    ? "a popa"
                    : `a ${facing.arc}`}{" "}
                · {RANGE_NAMES[band]}
              </dd>
            </div>
            <div className="rounded border border-sky-500/40 p-1">
              <dt className="text-muted-foreground">Le hacemos</dt>
              <dd className="text-sm font-bold text-sky-200">
                −{ourShown.toFixed(ourDamage !== undefined ? 1 : 0)}
              </dd>
            </div>
            <div className="rounded border border-red-500/40 p-1">
              <dt className="text-muted-foreground">Nos hacen</dt>
              <dd className="text-sm font-bold text-red-200">
                −{theirNow.toFixed(theirDamage !== undefined ? 1 : 0)}
              </dd>
            </div>
          </dl>
        </div>
      )}
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
