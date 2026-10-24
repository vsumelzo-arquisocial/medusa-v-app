import type { FleetId } from "@/lib/ship-identity";

/**
 * Naves capitales vistas desde arriba (proa hacia arriba, eslora ≈ 48 u de dibujo, de −24 a +24).
 * Ilustraciones vectoriales con volumen (degradados, baterías, torres, luces y motores encendidos).
 */

interface Palette {
  hull: [string, string, string];
  trim: string;
  glow: string;
  window: string;
}

const PAL: Record<FleetId, Palette> = {
  imperium: {
    hull: ["#e8e0cc", "#a59c86", "#4d4738"],
    trim: "#c9a227",
    glow: "#9fd4ff",
    window: "#ffd98a",
  },
  chaos: {
    hull: ["#7a2a26", "#4a1416", "#1c0708"],
    trim: "#c0a060",
    glow: "#ff6a4a",
    window: "#ff9b5a",
  },
  tau: {
    hull: ["#f1e3c4", "#c79c5c", "#6b4a26"],
    trim: "#3a5f86",
    glow: "#7fc8ff",
    window: "#bfe6ff",
  },
  aeldari: {
    hull: ["#eaf7f6", "#7fbfc0", "#2c5a63"],
    trim: "#d6b45a",
    glow: "#7fffd4",
    window: "#c8fff1",
  },
  drukhari: {
    hull: ["#5a4a70", "#2a2236", "#0d0a12"],
    trim: "#9fe6c8",
    glow: "#b48cff",
    window: "#9fe6c8",
  },
  orks: {
    hull: ["#a8763e", "#6b4523", "#2e1c0d"],
    trim: "#c02020",
    glow: "#ffb04a",
    window: "#ffde7a",
  },
  necrons: {
    hull: ["#5f676b", "#2d3336", "#0e1112"],
    trim: "#3cff7a",
    glow: "#3cff7a",
    window: "#7dffad",
  },
  tyranids: {
    hull: ["#c9b6a0", "#7a4f7d", "#2d1630"],
    trim: "#d84f9a",
    glow: "#ff7ad9",
    window: "#ffb0e0",
  },
  daemons: {
    hull: ["#e05a8a", "#8a1f4a", "#2d0617"],
    trim: "#ffd27a",
    glow: "#ff5acb",
    window: "#ffd0f0",
  },
  votann: {
    hull: ["#d9c79a", "#8a7a52", "#3a321f"],
    trim: "#ff8a3c",
    glow: "#ffb070",
    window: "#ffd59a",
  },
  genestealer: {
    hull: ["#d8c25a", "#8a7a32", "#3a3412"],
    trim: "#7a5ab0",
    glow: "#c8a0ff",
    window: "#ffe58a",
  },
};

function Defs({ id, p }: { id: string; p: Palette }) {
  return (
    <defs>
      <linearGradient id={`${id}-h`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor={p.hull[2]} />
        <stop offset="0.35" stopColor={p.hull[1]} />
        <stop offset="0.5" stopColor={p.hull[0]} />
        <stop offset="0.65" stopColor={p.hull[1]} />
        <stop offset="1" stopColor={p.hull[2]} />
      </linearGradient>
      <linearGradient id={`${id}-v`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={p.hull[0]} stopOpacity="0.5" />
        <stop offset="1" stopColor="#000" stopOpacity="0.35" />
      </linearGradient>
      <radialGradient id={`${id}-g`}>
        <stop offset="0" stopColor="#fff" />
        <stop offset="0.3" stopColor={p.glow} />
        <stop offset="1" stopColor={p.glow} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-x`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={p.glow} stopOpacity="0.9" />
        <stop offset="1" stopColor={p.glow} stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

/** Motores: halo y estela hacia popa (+y). */
function Engines({
  id,
  xs,
  y,
  power,
  r = 2.4,
}: {
  id: string;
  xs: number[];
  y: number;
  power: number;
  r?: number;
}) {
  return (
    <g className="motion-safe:animate-[pulse_1.4s_ease-in-out_infinite]">
      {xs.map((x) => (
        <g key={x}>
          <path
            d={`M${x - r * 0.8} ${y} L${x} ${y + 6 + power * 14} L${x + r * 0.8} ${y} Z`}
            fill={`url(#${id}-x)`}
            opacity={0.4 + power * 0.5}
          />
          <circle cx={x} cy={y} r={r * (1.2 + power)} fill={`url(#${id}-g)`} />
        </g>
      ))}
    </g>
  );
}

function Windows({ p, pts }: { p: Palette; pts: [number, number][] }) {
  return (
    <g fill={p.window} opacity={0.85}>
      {pts.map(([x, y], i) => (
        <rect key={i} x={x - 0.35} y={y - 0.35} width={0.7} height={0.7} />
      ))}
    </g>
  );
}

const range = (a: number, b: number, step: number) => {
  const out: number[] = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(v);
  return out;
};

function body(fleet: FleetId, id: string, p: Palette, power: number) {
  const H = `url(#${id}-h)`;
  const V = `url(#${id}-v)`;
  switch (fleet) {
    case "imperium":
      return (
        <>
          <Engines id={id} xs={[-4, 0, 4]} y={22} power={power} />
          {/* Casco: proa de espolón y flancos con baterías */}
          <path
            d="M0 -26 L3 -19 L4 -12 L7 -9 L7 14 L5 21 L-5 21 L-7 14 L-7 -9 L-4 -12 L-3 -19 Z"
            fill={H}
            stroke="#000"
            strokeOpacity={0.6}
            strokeWidth={0.4}
          />
          <path
            d="M0 -26 L3 -19 L4 -12 L7 -9 L7 14 L5 21 L-5 21 L-7 14 L-7 -9 L-4 -12 L-3 -19 Z"
            fill={V}
          />
          {/* Baterías de costado */}
          {range(-6, 11, 3.4).map((y) => (
            <g key={y}>
              <rect
                x={-9}
                y={y}
                width={2.2}
                height={2.2}
                fill={p.hull[1]}
                stroke="#000"
                strokeWidth={0.25}
              />
              <rect
                x={6.8}
                y={y}
                width={2.2}
                height={2.2}
                fill={p.hull[1]}
                stroke="#000"
                strokeWidth={0.25}
              />
              <line x1={-9} y1={y + 1.1} x2={-11} y2={y + 1.1} stroke="#222" strokeWidth={0.5} />
              <line x1={9} y1={y + 1.1} x2={11} y2={y + 1.1} stroke="#222" strokeWidth={0.5} />
            </g>
          ))}
          {/* Espina con torres góticas */}
          <rect x={-1.6} y={-16} width={3.2} height={30} fill={p.hull[0]} opacity={0.6} />
          {[-12, -4, 4].map((y) => (
            <path
              key={y}
              d={`M0 ${y - 3} L2 ${y} L0 ${y + 2.5} L-2 ${y} Z`}
              fill={p.hull[2]}
              stroke={p.trim}
              strokeWidth={0.3}
            />
          ))}
          {/* Puente-catedral */}
          <path
            d="M-3.5 9 L3.5 9 L3 15 L-3 15 Z"
            fill={p.hull[2]}
            stroke={p.trim}
            strokeWidth={0.4}
          />
          <circle cx={0} cy={12} r={1.3} fill={p.trim} />
          {/* Águila dorada en la proa */}
          <path d="M-2.5 -20 L0 -22 L2.5 -20 L0 -19 Z" fill={p.trim} />
          <Windows
            p={p}
            pts={range(-14, 12, 2).flatMap(
              (y) =>
                [
                  [-4.5, y],
                  [4.5, y],
                ] as [number, number][],
            )}
          />
        </>
      );
    case "chaos":
      return (
        <>
          <Engines id={id} xs={[-3, 3]} y={22} power={power} />
          <path
            d="M0 -25 L4 -16 L8 -14 L6 -8 L9 -2 L7 4 L9 10 L6 21 L-6 21 L-9 10 L-7 4 L-9 -2 L-6 -8 L-8 -14 L-4 -16 Z"
            fill={H}
            stroke="#000"
            strokeWidth={0.4}
          />
          <path
            d="M0 -25 L4 -16 L8 -14 L6 -8 L9 -2 L7 4 L9 10 L6 21 L-6 21 L-9 10 L-7 4 L-9 -2 L-6 -8 L-8 -14 L-4 -16 Z"
            fill={V}
          />
          {[-14, -2, 10].map((y) => (
            <g key={y} fill={p.hull[2]}>
              <path d={`M8 ${y} L13 ${y - 2} L9 ${y + 2} Z`} />
              <path d={`M-8 ${y} L-13 ${y - 2} L-9 ${y + 2} Z`} />
            </g>
          ))}
          <path d="M-2 -12 L2 -12 L1 14 L-1 14 Z" fill={p.hull[2]} />
          <circle cx={0} cy={4} r={2.2} fill="none" stroke={p.trim} strokeWidth={0.5} />
          <path
            d="M0 1.8 L0 6.2 M-2.2 4 L2.2 4 M-1.5 2.5 L1.5 5.5 M1.5 2.5 L-1.5 5.5"
            stroke={p.trim}
            strokeWidth={0.4}
          />
          <Windows
            p={p}
            pts={range(-10, 16, 2.6).flatMap(
              (y) =>
                [
                  [-4, y],
                  [4, y],
                ] as [number, number][],
            )}
          />
        </>
      );
    case "tau":
      return (
        <>
          <Engines id={id} xs={[-4.5, 0, 4.5]} y={19} power={power} r={2.8} />
          <path
            d="M-2.5 -25 C-1 -24 -1 -20 -1.5 -16 L1.5 -16 C1 -20 1 -24 2.5 -25 C6 -20 9 -10 9 2 C9 12 7 18 4 20 L-4 20 C-7 18 -9 12 -9 2 C-9 -10 -6 -20 -2.5 -25 Z"
            fill={H}
            stroke="#000"
            strokeWidth={0.35}
          />
          <path
            d="M-2.5 -25 C-1 -24 -1 -20 -1.5 -16 L1.5 -16 C1 -20 1 -24 2.5 -25 C6 -20 9 -10 9 2 C9 12 7 18 4 20 L-4 20 C-7 18 -9 12 -9 2 C-9 -10 -6 -20 -2.5 -25 Z"
            fill={V}
          />
          <path d="M-6 -2 C-6 -8 6 -8 6 -2 C6 6 -6 6 -6 -2 Z" fill={p.trim} opacity={0.7} />
          <ellipse cx={0} cy={-2} rx={3} ry={2} fill={p.window} opacity={0.6} />
          <path d="M-8 8 L-11 12 L-8 14 Z M8 8 L11 12 L8 14 Z" fill={p.hull[1]} />
          <Windows
            p={p}
            pts={[
              [-5, 8],
              [5, 8],
              [-4, 12],
              [4, 12],
              [-6, -12],
              [6, -12],
            ]}
          />
        </>
      );
    case "aeldari":
      return (
        <>
          <Engines id={id} xs={[0]} y={18} power={power * 0.6} r={2} />
          {/* Vela solar */}
          <path
            d="M0 -6 L-14 10 L0 6 L14 10 Z"
            fill={p.trim}
            opacity={0.35}
            stroke={p.trim}
            strokeWidth={0.4}
          />
          <path d="M0 -6 L0 6" stroke={p.trim} strokeWidth={0.5} />
          {/* Casco esbelto con aletas */}
          <path
            d="M0 -26 C2 -20 3 -10 3 0 C3 8 4 14 2 18 L-2 18 C-4 14 -3 8 -3 0 C-3 -10 -2 -20 0 -26 Z"
            fill={H}
            stroke="#000"
            strokeWidth={0.3}
          />
          <path d="M3 -4 L8 2 L3 4 Z M-3 -4 L-8 2 L-3 4 Z" fill={p.hull[1]} />
          <path d="M0 -20 L1.2 -12 L0 -10 L-1.2 -12 Z" fill={p.window} />
          <circle cx={0} cy={2} r={1.2} fill={p.glow} />
        </>
      );
    case "drukhari":
      return (
        <>
          <Engines id={id} xs={[-2, 2]} y={20} power={power * 0.7} r={1.8} />
          <path
            d="M0 -27 L2 -14 L6 -10 L3 -6 L4 8 L8 14 L3 14 L2 20 L-2 20 L-3 14 L-8 14 L-4 8 L-3 -6 L-6 -10 L-2 -14 Z"
            fill={H}
            stroke="#000"
            strokeWidth={0.3}
          />
          <path
            d="M0 -27 L2 -14 L6 -10 L3 -6 L4 8 L8 14 L3 14 L2 20 L-2 20 L-3 14 L-8 14 L-4 8 L-3 -6 L-6 -10 L-2 -14 Z"
            fill={V}
          />
          <path
            d="M0 -6 L-10 4 L0 2 L10 4 Z"
            fill={p.hull[2]}
            opacity={0.8}
            stroke={p.trim}
            strokeWidth={0.3}
          />
          <path d="M0 -24 L0 16" stroke={p.trim} strokeWidth={0.4} opacity={0.8} />
        </>
      );
    case "orks":
      return (
        <>
          <Engines id={id} xs={[-5, -1, 3, 6]} y={21} power={power * 1.2} r={2.2} />
          <path
            d="M-1 -26 L4 -22 L6 -16 L9 -14 L8 -6 L10 0 L8 6 L10 12 L7 20 L-6 21 L-9 14 L-8 6 L-10 -1 L-7 -8 L-8 -15 L-5 -19 Z"
            fill={H}
            stroke="#000"
            strokeWidth={0.5}
          />
          <path
            d="M-1 -26 L4 -22 L6 -16 L9 -14 L8 -6 L10 0 L8 6 L10 12 L7 20 L-6 21 L-9 14 L-8 6 L-10 -1 L-7 -8 L-8 -15 L-5 -19 Z"
            fill={V}
          />
          {/* Espolón rojo y chapas */}
          <path d="M-4 -22 L-1 -29 L3 -23 Z" fill={p.trim} stroke="#000" strokeWidth={0.4} />
          {[
            [-6, -10, 5, 4],
            [1, -4, 6, 5],
            [-7, 4, 6, 6],
            [2, 8, 5, 5],
          ].map(([x, y, w, h], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={h}
              fill={i % 2 ? p.hull[2] : p.hull[0]}
              opacity={0.5}
              stroke="#000"
              strokeWidth={0.3}
              transform={`rotate(${((i * 7) % 11) - 5} ${x! + w! / 2} ${y! + h! / 2})`}
            />
          ))}
          {[-12, -2, 8].map((y) => (
            <g key={y} stroke="#222" strokeWidth={0.8}>
              <line x1={-9} y1={y} x2={-13} y2={y - 1} />
              <line x1={9} y1={y} x2={13} y2={y + 1} />
            </g>
          ))}
          <circle cx={1} cy={14} r={2} fill={p.trim} />
        </>
      );
    case "necrons":
      return (
        <>
          <path
            d="M0 -24 C10 -16 12 0 6 18 L0 12 L-6 18 C-12 0 -10 -16 0 -24 Z"
            fill={H}
            stroke="#000"
            strokeWidth={0.4}
          />
          <path d="M0 -24 C10 -16 12 0 6 18 L0 12 L-6 18 C-12 0 -10 -16 0 -24 Z" fill={V} />
          <path
            d="M0 -20 L0 10 M-6 -8 L6 -8 M-7 2 L7 2 M-4 -16 L4 -16"
            stroke={p.glow}
            strokeWidth={0.5}
            opacity={0.9}
            className="motion-safe:animate-pulse"
          />
          <circle cx={0} cy={-2} r={2.4} fill={p.glow} opacity={0.8} />
          <circle cx={0} cy={-2} r={5} fill={`url(#${id}-g)`} opacity={0.4 + power * 0.3} />
        </>
      );
    case "tyranids":
      return (
        <>
          <Engines id={id} xs={[0]} y={20} power={power * 0.5} r={2.6} />
          {/* Tentáculos */}
          {[-4, -2, 2, 4].map((x, i) => (
            <path
              key={x}
              d={`M${x} 16 C${x * 1.5} 22 ${x * 0.5} 26 ${x * 1.8} 30`}
              fill="none"
              stroke={p.hull[1]}
              strokeWidth={1}
              className="motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
          <path
            d="M0 -25 C6 -22 9 -14 8 -4 C10 4 8 12 4 17 L-4 17 C-8 12 -10 4 -8 -4 C-9 -14 -6 -22 0 -25 Z"
            fill={H}
            stroke="#000"
            strokeWidth={0.35}
          />
          {range(-18, 12, 4).map((y) => (
            <path
              key={y}
              d={`M-7 ${y} C-3 ${y - 2} 3 ${y - 2} 7 ${y}`}
              fill="none"
              stroke={p.hull[2]}
              strokeWidth={0.7}
            />
          ))}
          <path d="M-3 -25 L-5 -30 M3 -25 L5 -30" stroke={p.hull[0]} strokeWidth={1} />
          <circle cx={-2.5} cy={-19} r={0.9} fill={p.trim} />
          <circle cx={2.5} cy={-19} r={0.9} fill={p.trim} />
        </>
      );
    case "daemons":
      return (
        <>
          <Engines id={id} xs={[-3, 3]} y={20} power={power} r={2.2} />
          <path
            d="M0 -26 C5 -20 9 -12 7 -4 C11 2 10 12 5 20 L-5 20 C-10 12 -11 2 -7 -4 C-9 -12 -5 -20 0 -26 Z"
            fill={H}
            stroke="#000"
            strokeWidth={0.35}
          />
          <path
            d="M0 -26 C5 -20 9 -12 7 -4 C11 2 10 12 5 20 L-5 20 C-10 12 -11 2 -7 -4 C-9 -12 -5 -20 0 -26 Z"
            fill={V}
          />
          <path
            d="M-6 -12 C-12 -16 -12 -22 -9 -26 M6 -12 C12 -16 12 -22 9 -26"
            fill="none"
            stroke={p.trim}
            strokeWidth={1.1}
          />
          <circle cx={0} cy={0} r={3} fill="none" stroke={p.trim} strokeWidth={0.5} />
          <circle
            cx={0}
            cy={0}
            r={6}
            fill={`url(#${id}-g)`}
            opacity={0.5}
            className="motion-safe:animate-pulse"
          />
        </>
      );
    case "votann":
      return (
        <>
          <Engines id={id} xs={[-4, 4]} y={21} power={power} r={2.6} />
          <path
            d="M-3 -24 L3 -24 L7 -18 L8 -6 L9 12 L6 21 L-6 21 L-9 12 L-8 -6 L-7 -18 Z"
            fill={H}
            stroke="#000"
            strokeWidth={0.45}
          />
          <path
            d="M-3 -24 L3 -24 L7 -18 L8 -6 L9 12 L6 21 L-6 21 L-9 12 L-8 -6 L-7 -18 Z"
            fill={V}
          />
          {range(-16, 14, 6).map((y) => (
            <rect
              key={y}
              x={-6}
              y={y}
              width={12}
              height={4}
              fill="none"
              stroke={p.hull[2]}
              strokeWidth={0.4}
            />
          ))}
          <rect x={-2.5} y={-4} width={5} height={8} fill={p.trim} opacity={0.8} />
          <Windows
            p={p}
            pts={range(-14, 14, 3).flatMap(
              (y) =>
                [
                  [-7, y],
                  [7, y],
                ] as [number, number][],
            )}
          />
        </>
      );
    case "genestealer":
      return (
        <>
          <Engines id={id} xs={[-4, 0, 4]} y={22} power={power} r={2.2} />
          <path
            d="M-4 -18 L4 -18 L7 -12 L8 14 L5 21 L-5 21 L-8 14 L-7 -12 Z"
            fill={H}
            stroke="#000"
            strokeWidth={0.45}
          />
          <path d="M-4 -18 L4 -18 L7 -12 L8 14 L5 21 L-5 21 L-8 14 L-7 -12 Z" fill={V} />
          {/* Taladro de minería */}
          <path d="M-4 -18 L0 -28 L4 -18 Z" fill="#888" stroke="#222" strokeWidth={0.4} />
          {[-26, -23, -20].map((y) => (
            <line
              key={y}
              x1={-((y + 28) / 10) * 4}
              y1={y}
              x2={((y + 28) / 10) * 4}
              y2={y + 1}
              stroke="#333"
              strokeWidth={0.5}
            />
          ))}
          {range(-10, 12, 3.6).map((y) => (
            <g key={y}>
              <rect
                x={-10}
                y={y}
                width={2.4}
                height={2.2}
                fill={p.hull[1]}
                stroke="#000"
                strokeWidth={0.25}
              />
              <rect
                x={7.6}
                y={y}
                width={2.4}
                height={2.2}
                fill={p.hull[1]}
                stroke="#000"
                strokeWidth={0.25}
              />
            </g>
          ))}
          <path d="M-2 0 L2 0 L0 -4 Z M0 -1 L0 6" stroke={p.trim} strokeWidth={0.6} fill={p.trim} />
          <path
            d="M-6 -12 L6 -12 M-6 8 L6 8"
            stroke="#222"
            strokeWidth={0.8}
            strokeDasharray="1 1"
          />
        </>
      );
  }
}

/** Nave cenital. `power` 0–1 controla la estela de los motores. `size` = eslora en px. */
/** Fotos cenitales reales (src/assets/topdown/<flota>.png|webp): si existen, sustituyen a la ilustración. */
const PHOTOS: Partial<Record<FleetId, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../../../assets/topdown/*.{png,webp}", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  ).map(([path, url]) => [
    path
      .split("/")
      .pop()!
      .replace(/\.(png|webp)$/, ""),
    url,
  ]),
);

export const hasTopDownPhoto = (fleet: FleetId) => !!PHOTOS[fleet];

export function TopDownShip({
  fleet,
  size,
  power = 0.5,
  uid,
}: {
  fleet: FleetId;
  size: number;
  power?: number;
  uid: string;
}) {
  const photo = PHOTOS[fleet];
  if (photo) {
    const glow = PAL[fleet].glow;
    const len = size * (0.12 + power * 0.35);
    return (
      <g>
        <defs>
          <radialGradient id={`tdp-${uid}`} cx="50%" cy="0%" r="100%">
            <stop offset="0" stopColor="#fff" stopOpacity={0.95} />
            <stop offset="0.25" stopColor={glow} stopOpacity={0.8} />
            <stop offset="1" stopColor={glow} stopOpacity={0} />
          </radialGradient>
        </defs>
        {/* Estela de motores a popa */}
        <ellipse
          cx={0}
          cy={size / 2 + len / 2 - size * 0.04}
          rx={size * 0.09}
          ry={len / 2}
          fill={`url(#tdp-${uid})`}
        />
        <image
          href={photo}
          x={-size / 2}
          y={-size / 2}
          width={size}
          height={size}
          preserveAspectRatio="xMidYMid meet"
          style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,.8))" }}
        />
      </g>
    );
  }
  const p = PAL[fleet];
  const id = `tds-${uid}`;
  const k = size / 48;
  return (
    <g transform={`scale(${k})`}>
      <Defs id={id} p={p} />
      {/* Sombra difusa para separarla del fondo */}
      <ellipse cx={0} cy={0} rx={11} ry={26} fill="#000" opacity={0.35} />
      {body(fleet, id, p, power)}
    </g>
  );
}
