import type { EngineState } from "@/lib/battle";
import warlordImg from "@/assets/engines/warlord.jpg";
import reaverImg from "@/assets/engines/reaver.jpg";
import warhoundImg from "@/assets/engines/warhound.jpg";
import knightImg from "@/assets/engines/knight.jpg";

const CLASS = ["Exploración", "Exploración", "Batalla", "Batalla", "Batalla", "Batalla pesado"];

function blueprintFor(name: string, kind: "titan" | "knight") {
  const n = name.toLowerCase();
  if (kind === "knight") return knightImg;
  if (n.includes("warhound") || n.includes("dire wolf")) return warhoundImg;
  if (n.includes("reaver") || n.includes("warbringer")) return reaverImg;
  return warlordImg;
}

/** Ficha de Titán o Caballero: esquema técnico, escudos, estructura y efectos de daño. */
export function EngineCard({ name, kind, rank, ion, maxShields, maxWounds, state, active, onChange, owner }: {
  name: string; kind: "titan" | "knight"; rank: number; ion: string | null; maxShields: number; maxWounds: number;
  state: EngineState; active: boolean; owner: string; onChange: (s: EngineState) => void;
}) {
  const dead = state.wounds <= 0;
  const ratio = maxWounds ? state.wounds / maxWounds : 0;
  const level = dead ? "dead" : ratio <= 0.34 ? "critical" : ratio <= 0.67 ? "damaged" : "ok";
  const status = { ok: "OPERATIVO", damaged: "DAÑADO", critical: "CRÍTICO · REACTOR INESTABLE", dead: "DESTRUIDO" }[level];
  const statusCls = level === "ok" ? "text-primary" : "text-destructive";
  const btn = "border border-border px-2 py-1 text-[11px] uppercase tracking-wider hover:border-primary hover:text-primary disabled:opacity-30";
  const height = kind === "titan" ? 240 + rank * 18 : 220;

  return (
    <div className={`relative overflow-hidden border bg-background ${dead ? "border-destructive" : level === "critical" ? "border-destructive glow-box" : kind === "titan" ? "border-primary glow-box" : "border-border"}`}>
      {/* cabecera */}
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <div className="font-display text-base leading-tight text-primary glow">{name}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {kind === "titan" ? `Legio Titanicus · Clase ${CLASS[rank] ?? "—"}` : "Questoris Familia · Caballero"} · {owner}
          </div>
        </div>
        <div className="text-right">
          {kind === "titan" && <div className="text-xs text-primary">{"◆".repeat(Math.min(6, rank + 1))}</div>}
          <div className={`text-[10px] tracking-widest ${statusCls} ${level !== "ok" ? "engine-alarm" : ""}`} style={level !== "ok" ? { opacity: 1 } : undefined}>■ {status}</div>
        </div>
      </div>

      {/* esquema */}
      <div className="relative engine-scan" style={{ height }}>
        <div className={`absolute inset-0 flex items-center justify-center ${level === "critical" ? "engine-flicker" : ""}`}>
          <img src={blueprintFor(name, kind)} alt={`Esquema de ${name}`} loading="lazy" width={768} height={1024}
            className="h-full w-auto object-contain mix-blend-screen"
            style={{ filter: dead ? "grayscale(1) brightness(.35)" : level === "critical" ? "hue-rotate(-120deg) saturate(1.6) brightness(.9)" : level === "damaged" ? "hue-rotate(-60deg) saturate(1.2)" : "none" }} />
        </div>

        {/* escudos de vacío */}
        {maxShields > 0 && !dead && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            {Array.from({ length: maxShields }, (_, i) => {
              const up = i < state.shields;
              return <ellipse key={i} cx={50} cy={52} rx={47 - i * 2.2} ry={48 - i * 2.2} fill="none"
                stroke={up ? "var(--primary)" : "var(--destructive)"} strokeWidth={up ? 0.5 : 0.25}
                strokeDasharray={up ? "none" : "1 2"} opacity={up ? 0.7 : 0.35} className={up ? "shield-pulse" : ""} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
        )}
        {kind === "knight" && ion && !dead && (
          <div className="pointer-events-none absolute right-3 top-1/3 h-24 w-8 rounded-[50%] border-r-2 border-primary shield-pulse" />
        )}

        {/* daño */}
        {(level === "damaged" || level === "critical") && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
            <g stroke="var(--destructive)" strokeWidth={0.5} fill="none" vectorEffect="non-scaling-stroke">
              <path d="M40 30 l4 6 -3 5 5 7 -2 6" /><path d="M62 58 l-5 4 2 6 -4 5" />
              {level === "critical" && <><path d="M30 65 l6 2 2 7 6 3" /><path d="M55 25 l-3 7 4 4 -2 8 5 3" /><path d="M45 80 l3 -6 5 1 2 -5" /></>}
            </g>
          </svg>
        )}
        {level === "critical" && (
          <>
            <div className="engine-alarm pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 50% 45%, color-mix(in oklab, var(--destructive) 55%, transparent), transparent 65%)" }} />
            {[30, 55, 68].map((l, i) => (
              <span key={l} className="engine-smoke pointer-events-none absolute h-10 w-10 rounded-full"
                style={{ left: `${l}%`, top: "35%", animationDelay: `${i * 0.9}s`, background: "radial-gradient(circle, color-mix(in oklab, var(--muted-foreground) 60%, transparent), transparent 70%)" }} />
            ))}
          </>
        )}
        {dead && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="-rotate-12 border-4 border-destructive px-4 py-1 font-display text-2xl tracking-widest text-destructive">DESTRUIDO</span>
          </div>
        )}

        {/* telemetría */}
        <div className="pointer-events-none absolute left-2 top-2 space-y-0.5 text-[9px] uppercase tracking-widest text-muted-foreground">
          <div>Estructura {Math.round(ratio * 100)}%</div>
          {maxShields > 0 && <div>Vacío {state.shields}/{maxShields}</div>}
          {ion && <div>Iónico {ion}</div>}
        </div>
      </div>

      {/* controles */}
      <div className="space-y-3 border-t border-border p-3 text-xs">
        {maxShields > 0 && (
          <div>
            <div className="mb-1 flex justify-between uppercase tracking-wider text-muted-foreground"><span>Escudos de vacío</span><span className="text-primary">{state.shields}/{maxShields}</span></div>
            <div className="mb-2 flex gap-1">{Array.from({ length: maxShields }, (_, i) => (
              <span key={i} className={`h-3 flex-1 border ${i < state.shields ? "border-primary bg-primary shield-pulse" : "border-destructive/60"}`} />
            ))}</div>
            {active && !dead && <div className="flex flex-wrap gap-1">
              <button className={btn} disabled={!state.shields} onClick={() => onChange({ ...state, shields: state.shields - 1 })}>Colapsar</button>
              <button className={btn} disabled={state.shields >= maxShields} onClick={() => onChange({ ...state, shields: state.shields + 1 })}>Regenerar</button>
              <button className={btn} disabled={state.shields >= maxShields} onClick={() => onChange({ ...state, shields: maxShields })}>Restaurar todos</button>
            </div>}
          </div>
        )}
        <div>
          <div className="mb-1 flex justify-between uppercase tracking-wider text-muted-foreground"><span>Puntos de estructura</span><span className={statusCls}>{state.wounds}/{maxWounds} · faltan {maxWounds - state.wounds}</span></div>
          <div className="mb-2 flex gap-1">{Array.from({ length: maxWounds }, (_, i) => (
            <span key={i} className={`h-4 flex-1 border ${i < state.wounds ? (level === "ok" ? "border-primary bg-primary/70" : "border-destructive bg-destructive/70") : "border-border bg-transparent"}`} />
          ))}</div>
          {active && <div className="flex gap-1">
            <button className={btn} disabled={dead} onClick={() => onChange({ ...state, wounds: state.wounds - 1 })}>−1 herida</button>
            <button className={btn} disabled={state.wounds >= maxWounds} onClick={() => onChange({ ...state, wounds: state.wounds + 1 })}>Reparar</button>
          </div>}
        </div>
      </div>
    </div>
  );
}
