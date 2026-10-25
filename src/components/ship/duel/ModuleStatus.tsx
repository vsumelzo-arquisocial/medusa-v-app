import { SECTION_INFO } from "@/lib/naval3/factions";
import { SECTIONS, type Section, type SideState } from "@/lib/naval3/types";

const ON = "#34d399";
const OFF = "#ef4444";

/** Esquema simplificado de la nave (proa arriba) con el estado de cada sección. */
export function ModuleStatus({ s, label }: { s: SideState; label: string }) {
  const off = new Set<Section>(s.disabled ?? []);
  const c = (sec: Section) => (off.has(sec) ? OFF : ON);
  const lvl = (m: keyof SideState["modules"]) => s.modules[m] ?? 0;
  const levels: Record<Section, number> = {
    puente: lvl("puente"),
    baterias: lvl("baterias"),
    torpedos: lvl("lanza_proa"),
    motores: lvl("motores_plasma"),
    escudos: lvl("camara_escudos"),
  };
  const down = SECTIONS.filter((x) => off.has(x));
  return (
    <div
      className="flex items-center gap-2"
      role="img"
      aria-label={`${label}: ${down.length ? `fuera de combate ${down.map((x) => SECTION_INFO[x].name).join(", ")}` : "todas las secciones operativas"}`}
    >
      <svg viewBox="0 0 40 64" className="h-14 w-9 shrink-0" aria-hidden>
        {/* Escudos: contorno */}
        <ellipse
          cx="20"
          cy="33"
          rx="18"
          ry="30"
          fill="none"
          stroke={c("escudos")}
          strokeOpacity={off.has("escudos") ? 0.9 : 0.45}
          strokeDasharray={off.has("escudos") ? "2 2" : undefined}
        />
        {/* Casco */}
        <path
          d="M20 6 L28 22 L29 50 L24 56 L16 56 L11 50 L12 22 Z"
          fill="#0b1520"
          stroke="#64748b"
          strokeWidth="0.8"
        />
        {/* Torpedos: proa */}
        <path d="M20 7 L25 18 L15 18 Z" fill={c("torpedos")} fillOpacity={0.85} />
        {/* Puente */}
        <rect x="16.5" y="21" width="7" height="7" rx="1" fill={c("puente")} fillOpacity={0.85} />
        {/* Baterías: costados */}
        <rect
          x="12.5"
          y="30"
          width="4"
          height="14"
          rx="1"
          fill={c("baterias")}
          fillOpacity={0.85}
        />
        <rect
          x="23.5"
          y="30"
          width="4"
          height="14"
          rx="1"
          fill={c("baterias")}
          fillOpacity={0.85}
        />
        {/* Motores: popa */}
        <rect x="15" y="48" width="10" height="6" rx="1" fill={c("motores")} fillOpacity={0.85} />
        {down.map((sec) => {
          const at: Record<Section, [number, number]> = {
            torpedos: [20, 13],
            puente: [20, 24.5],
            baterias: [20, 37],
            motores: [20, 51],
            escudos: [34, 10],
          };
          const [x, y] = at[sec];
          return (
            <text
              key={sec}
              x={x}
              y={y + 2.5}
              textAnchor="middle"
              fontSize="8"
              fontWeight="bold"
              fill="#fff"
              stroke="#000"
              strokeWidth="1.5"
              paintOrder="stroke"
            >
              ✕
            </text>
          );
        })}
      </svg>
      <ul className="grid grid-cols-1 gap-x-2 text-[10px] leading-tight sm:grid-cols-2">
        {SECTIONS.map((sec) => (
          <li
            key={sec}
            className={off.has(sec) ? "font-semibold text-red-300" : "text-muted-foreground"}
          >
            <span className="inline-block w-2" style={{ color: c(sec) }}>
              ●
            </span>{" "}
            {SECTION_INFO[sec].name}
            {off.has(sec) ? " · fuera" : levels[sec] ? ` · nv ${levels[sec]}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
