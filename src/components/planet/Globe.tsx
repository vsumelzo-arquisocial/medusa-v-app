import { useEffect, useMemo, useRef, useState } from "react";
import { BODY_MAPS, regionAtMap, type BodyMap, type Cell, type Vec3 } from "@/lib/planet";
import { emblemSrc } from "@/lib/emblems";
import mapUrl from "@/assets/planet/medusa-map.jpg";
import shipLoyal from "@/assets/planet/ship-loyal-real.png";
import shipTraitor from "@/assets/planet/ship-traitor-real.png";

export interface CellStyle { fill: string; stroke?: string | undefined; label?: string | undefined; pulse?: boolean }
export interface AttackArrow { id: string; from: number | null; to: number; color: string; mine?: boolean; traitor?: boolean }

function rot([x, y, z]: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}
/** Screen (view) direction back to planet coordinates. */
function unrot([r0, r1, r2]: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y = r1 * cp + r2 * sp, z1 = -r1 * sp + r2 * cp;
  return [r0 * cy - z1 * sy, y, r0 * sy + z1 * cy];
}
function hexRgb(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const o = Math.acos(d);
  if (o < 1e-4) return a;
  const s1 = Math.sin((1 - t) * o) / Math.sin(o), s2 = Math.sin(t * o) / Math.sin(o);
  return [a[0] * s1 + b[0] * s2, a[1] * s1 + b[1] * s2, a[2] * s1 + b[2] * s2];
}

const RES = 320;
const R = 280;

/** Realistic Medusa V: textured globe with continental regions, owner tints, borders and live attack animations. Drag to rotate. */
export function Globe({ styleFor, selected, onSelect, attacks = [], interactive = true, map: mapProp, texture: texProp }: { styleFor: (id: number) => CellStyle; selected: number | null; onSelect: (id: number) => void; attacks?: AttackArrow[]; interactive?: boolean; map?: BodyMap | undefined; texture?: string | undefined }) {
  const map = mapProp ?? BODY_MAPS["medusa-5"]!, texture = texProp ?? mapUrl;
  const CELLS = map.cells, GRID = map.grid;
  const cellOf = (id: number): Cell | undefined => CELLS[map.index.get(id) ?? -1];
  const SEA_ROUTES = useMemo(() => CELLS.flatMap((c) => c.sea.filter((n) => n > c.id).map((n) => [c.id, n] as [number, number])), [CELLS]);
  const selLocal = selected == null ? -1 : map.index.get(selected) ?? -1;
  const [view, setView] = useState({ yaw: 0.4, pitch: -0.35 });
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [auto, setAuto] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const tex = useRef<{ d: Uint8ClampedArray; w: number; h: number } | null>(null);
  const [texReady, setTexReady] = useState(false);

  useEffect(() => {
    if (selected === null) return;
    const cell = CELLS[map.index.get(selected) ?? -1];
    if (!cell) return;
    setAuto(false);
    setView((current) => {
      if (rot(cell.center, current.yaw, current.pitch)[2] > 0.25) return current;
      return { yaw: -Math.atan2(cell.center[0], cell.center[2]), pitch: Math.asin(Math.max(-1, Math.min(1, cell.center[1]))) };
    });
  }, [selected, CELLS, map.index]);

  useEffect(() => {
    setTexReady(false); tex.current = null;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 1024; c.height = 512;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0, 1024, 512);
      tex.current = { d: g.getImageData(0, 0, 1024, 512).data, w: 1024, h: 512 };
      setTexReady(true);
    };
    img.src = texture;
  }, [texture]);

  useEffect(() => {
    if (!auto) return;
    let raf = 0;
    const tick = () => { setView((v) => ({ ...v, yaw: v.yaw + 0.0012 })); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto]);

  const styles = CELLS.map((c) => styleFor(c.id));
  const tints = styles.map((s) => (s.fill === "transparent" ? null : hexRgb(s.fill)));
  const tintKey = tints.map((t) => t?.join(",") ?? "-").join("|") + selected + texture;

  useEffect(() => {
    const t = tex.current, cv = canvas.current;
    if (!t || !cv) return;
    const g = cv.getContext("2d")!;
    const out = g.createImageData(RES, RES);
    const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const h = RES / 2;
    const prevRow = new Int16Array(RES).fill(-2);
    for (let j = 0; j < RES; j++) {
      const r1 = -(j + 0.5 - h) / h;
      let left = -2;
      for (let i = 0; i < RES; i++) {
        const r0 = (i + 0.5 - h) / h;
        const q = r0 * r0 + r1 * r1;
        if (q > 1) { left = -2; prevRow[i] = -2; continue; }
        const r2 = Math.sqrt(1 - q);
        const y = r1 * cp + r2 * sp, z1 = -r1 * sp + r2 * cp;
        const x = r0 * cy - z1 * sy, z = r0 * sy + z1 * cy;
        const lon = Math.atan2(x, z), lat = Math.asin(Math.max(-1, Math.min(1, y)));
        const uu = lon / (2 * Math.PI) + 0.5, vv = 0.5 - lat / Math.PI;
        const si = ((Math.min(t.h - 1, (vv * t.h) | 0) * t.w) + Math.min(t.w - 1, (uu * t.w) | 0)) * 4;
        const gi = Math.min(GRID.h - 1, (vv * GRID.h) | 0) * GRID.w + Math.min(GRID.w - 1, (uu * GRID.w) | 0);
        const id = GRID.data[gi]!;
        const reg = id === 255 ? -1 : id;
        const light = 0.35 + 0.65 * Math.max(0, r0 * -0.35 + r1 * 0.35 + r2 * 0.87);
        let cr = t.d[si]!, cg = t.d[si + 1]!, cb = t.d[si + 2]!;
        if (reg >= 0) {
          const tint = tints[reg];
          if (tint) { cr = cr * 0.5 + tint[0] * 0.5; cg = cg * 0.5 + tint[1] * 0.5; cb = cb * 0.5 + tint[2] * 0.5; }
          if (reg === selLocal) { cr = Math.min(255, cr * 1.35 + 30); cg = Math.min(255, cg * 1.35 + 30); cb = Math.min(255, cb * 1.35 + 30); }
          const border = (left !== -2 && left !== reg) || (prevRow[i] !== -2 && prevRow[i] !== reg);
          if (border) {
            const bc = tint ?? [245, 230, 200];
            cr = bc[0]; cg = bc[1]; cb = bc[2];
            if (left === -1 || prevRow[i] === -1) { cr = 255; cg = 236; cb = 200; }
          }
        }
        left = reg; prevRow[i] = reg;
        const o = (j * RES + i) * 4;
        out.data[o] = cr * light; out.data[o + 1] = cg * light; out.data[o + 2] = cb * light; out.data[o + 3] = 255;
      }
    }
    g.putImageData(out, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, texReady, tintKey]);

  const proj = (p: Vec3, k = 1) => { const r = rot(p, view.yaw, view.pitch); return { x: r[0] * R * k, y: -r[1] * R * k, z: r[2] }; };

  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const el = svg.current; if (!el) return;
    const box = el.getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * 640 - 320, sy = ((e.clientY - box.top) / box.height) * 640 - 320;
    const r0 = sx / R, r1 = -sy / R, q = r0 * r0 + r1 * r1;
    if (q > 1) return;
    const id = regionAtMap(map, unrot([r0, r1, Math.sqrt(1 - q)], view.yaw, view.pitch));
    if (id !== null) onSelect(id);
  }

  const labels = CELLS.map((c, i) => ({ c, s: styles[i]!, p: proj(c.center) })).filter((k) => k.p.z > 0.25);

  return (
    <div className="relative w-full">
      <canvas ref={canvas} width={RES} height={RES} className="pointer-events-none absolute rounded-full" style={{ left: "6.25%", top: "6.25%", width: "87.5%", height: "87.5%" }} />
      <svg
        ref={svg}
        viewBox="-320 -320 640 640"
        className={`relative w-full select-none ${interactive ? "cursor-grab touch-none active:cursor-grabbing" : "pointer-events-none"}`}
        style={interactive ? { touchAction: "none", WebkitUserSelect: "none" } : undefined}
        onPointerDown={(e) => {
          if (!interactive) return;
          e.preventDefault();
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          setAuto(false);
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current; if (!d) return;
          const box = svg.current?.getBoundingClientRect();
          // Scale rotation to the rendered globe size so small screens turn at the same pace.
          const k = Math.PI / Math.max(200, box?.width ?? 400);
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
          d.x = e.clientX; d.y = e.clientY;
          setView((v) => ({ yaw: v.yaw + dx * k, pitch: Math.max(-1.4, Math.min(1.4, v.pitch + dy * k)) }));
        }}
        onPointerUp={(e) => { if (drag.current && !drag.current.moved) pick(e); drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <defs>
          <radialGradient id="globe-atmo" cx="50%" cy="50%" r="50%">
            <stop offset="88%" stopColor="#ff8a3c" stopOpacity="0" />
            <stop offset="100%" stopColor="#ff8a3c" stopOpacity="0.35" />
          </radialGradient>
          {attacks.map((a) => (
            <marker key={a.id} id={`arrow-${a.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={a.color} />
            </marker>
          ))}
        </defs>
        <circle r={R + 14} fill="url(#globe-atmo)" style={{ pointerEvents: "none" }} />
        <circle r={R} fill="none" stroke="#ffb070" strokeOpacity="0.35" style={{ pointerEvents: "none" }} />
        <g style={{ pointerEvents: "none" }}>
          {SEA_ROUTES.map(([x, y]) => {
            const ca = cellOf(x), cb = cellOf(y); if (!ca || !cb) return null;
            const a = ca.center, b = cb.center;
            const hot = selected === x || selected === y;
            let d = ""; let pen = false;
            for (let i = 0; i <= 20; i++) {
              const t = i / 20; const p = proj(slerp(a, b, t), 1 + 0.04 * Math.sin(Math.PI * t));
              if (p.z < 0) { pen = false; continue; }
              d += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)} `; pen = true;
            }
            return d ? <path key={`${x}-${y}`} d={d} fill="none" stroke="#bfe8ff" strokeWidth={hot ? 2 : 1} strokeOpacity={hot ? 0.85 : 0.3} strokeDasharray="2 5" /> : null;
          })}
          {labels.map(({ c, s, p }) => {
            const img = emblemSrc(s.label);
            const size = 24 * p.z + 8;
            return img
              ? <image key={c.id} href={img} x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} className={s.pulse ? "animate-pulse" : ""} />
              : s.label ? <text key={c.id} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={13 * p.z + 6} fill="#fff" stroke="#000" strokeWidth={2} paintOrder="stroke" className={s.pulse ? "animate-pulse" : ""}>{s.label}</text> : null;
          })}
          {attacks.map((a) => <AttackFx key={a.id} a={a} proj={proj} cellOf={cellOf} />)}
        </g>
      </svg>
    </div>
  );
}

/** Arrow from the attacking region and a strike cruiser dropping pods on the target. */
function AttackFx({ a, proj, cellOf }: { a: AttackArrow; proj: (p: Vec3, k?: number) => { x: number; y: number; z: number }; cellOf: (id: number) => Cell | undefined }) {
  const toCell = cellOf(a.to);
  if (!toCell) return null;
  const to = toCell.center;
  const target = proj(to);
  const from = a.from !== null ? cellOf(a.from)?.center : undefined;
  let path = "";
  if (from) {
    const pts = Array.from({ length: 25 }, (_, i) => { const t = i / 24; return proj(slerp(from, to, t), 1 + 0.12 * Math.sin(Math.PI * t)); });
    let pen = false;
    for (const p of pts) {
      if (p.z < -0.05) { pen = false; continue; }
      path += `${pen ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)} `; pen = true;
    }
  }
  if (target.z < 0.05) return path ? <path d={path} fill="none" stroke={a.color} strokeWidth={3} strokeDasharray="8 5" opacity={0.8} /> : null;
  const ship = proj(to, 1.45);
  const W = 78, H = 26;
  const glow = a.traitor ? "#ff5a2a" : "#7fd0ff";
  // 16 s cycle: hover, drop pods (~45-60 %), hover, orbital strike (~85-95 %).
  const cyc = "16s";
  const begin = `${(a.id.charCodeAt(0) % 8)}s`;
  return (
    <g>
      {path && (
        <path d={path} fill="none" stroke={a.color} strokeWidth={a.mine ? 3 : 2} strokeDasharray="10 6" markerEnd={`url(#arrow-${a.id})`} opacity={0.85} style={{ filter: `drop-shadow(0 0 3px ${a.color})` }}>
          <animate attributeName="stroke-dashoffset" from="32" to="0" dur="1.2s" repeatCount="indefinite" />
        </path>
      )}
      <circle cx={target.x} cy={target.y} r={8} fill="none" stroke={a.color} strokeWidth={1.5} opacity={0.6}>
        <animate attributeName="r" values="5;14;5" dur="3s" repeatCount="indefinite" />
      </circle>
      {/* orbital strike */}
      <line x1={ship.x} y1={ship.y + H / 3} x2={target.x} y2={target.y} stroke={glow} strokeWidth={3} opacity={0} style={{ filter: `drop-shadow(0 0 6px ${glow})` }}>
        <animate attributeName="opacity" values="0;0;1;0.6;0;0" keyTimes="0;0.85;0.86;0.9;0.93;1" dur={cyc} begin={begin} repeatCount="indefinite" />
      </line>
      <circle cx={target.x} cy={target.y} r={4} fill="#fff4c0" opacity={0}>
        <animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;0.86;0.88;0.96;1" dur={cyc} begin={begin} repeatCount="indefinite" />
        <animate attributeName="r" values="2;2;22;30;2" keyTimes="0;0.86;0.9;0.96;1" dur={cyc} begin={begin} repeatCount="indefinite" />
      </circle>
      {/* drop pods */}
      {[0, 1, 2].map((i) => (
        <g key={i} opacity={0}>
          <animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes={`0;${0.45 + i * 0.02};${0.46 + i * 0.02};${0.56 + i * 0.02};${0.58 + i * 0.02};1`} dur={cyc} begin={begin} repeatCount="indefinite" />
          <animateTransform attributeName="transform" type="translate" values={`${ship.x + (i - 1) * 10},${ship.y + 6};${ship.x + (i - 1) * 10},${ship.y + 6};${target.x + (i - 1) * 9},${target.y};${target.x + (i - 1) * 9},${target.y}`} keyTimes={`0;${0.46 + i * 0.02};${0.56 + i * 0.02};1`} dur={cyc} begin={begin} repeatCount="indefinite" />
          <path d="M0,-8 L-2.5,-4 L0,0 L2.5,-4 Z" fill="#ffb347" opacity={0.8} />
          <path d="M-2,0 L2,0 L1.5,4 L-1.5,4 Z" fill={a.color} stroke="#222" strokeWidth={0.5} />
        </g>
      ))}
      <g opacity={0.95}>
        <animateTransform attributeName="transform" type="translate" values="-6,0;6,-2;-6,0" dur="9s" repeatCount="indefinite" />
        <image href={a.traitor ? shipTraitor : shipLoyal} x={ship.x - W / 2} y={ship.y - H / 2} width={W} height={H} preserveAspectRatio="xMidYMid meet" style={{ filter: `drop-shadow(0 0 4px ${glow})` }} />
      </g>
    </g>
  );
}
