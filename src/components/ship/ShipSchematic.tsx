import blueprint from "@/assets/ship/blueprint.jpg";
import blueprintTraitor from "@/assets/ship/blueprint-traitor.jpg";
import { useViewMode } from "@/hooks/use-view-mode";

/** Position (% of blueprint) and footprint of each module on the schematic. */
export const MODULE_SPOTS: Record<string, { x: number; y: number; w: number; h: number; code: string }> = {
  puente: { x: 27, y: 18, w: 9, h: 16, code: "A1" },
  templo: { x: 18, y: 30, w: 7, h: 12, code: "A2" },
  astropatico: { x: 38, y: 24, w: 6, h: 14, code: "A3" },
  baterias: { x: 60, y: 39, w: 18, h: 8, code: "B1" },
  barracones: { x: 66, y: 52, w: 10, h: 9, code: "B2" },
  bodegas: { x: 48, y: 52, w: 14, h: 9, code: "B3" },
  forja: { x: 8, y: 50, w: 10, h: 18, code: "C1" },
  talleres: { x: 22, y: 68, w: 7, h: 13, code: "C2" },
  hangar_titanes: { x: 34, y: 66, w: 30, h: 12, code: "D1" },
  establos: { x: 74, y: 64, w: 9, h: 10, code: "D2" },
  gruas: { x: 82, y: 52, w: 9, h: 14, code: "E1" },
  bahia_pods: { x: 52, y: 80, w: 10, h: 8, code: "F2" },
  camara_escudos: { x: 46, y: 28, w: 8, h: 8, code: "G1" },
  cubierta_abordaje: { x: 78, y: 42, w: 8, h: 8, code: "G2" },
  motores_plasma: { x: 2, y: 72, w: 12, h: 10, code: "G3" },
  lanza_proa: { x: 88, y: 32, w: 9, h: 6, code: "G4" },
  blindaje_proa: { x: 86, y: 70, w: 10, h: 8, code: "G5" },
};

export const TRAITOR_SPOTS: typeof MODULE_SPOTS = {
  puente: { x: 26, y: 8, w: 10, h: 20, code: "A1" },
  templo: { x: 15, y: 26, w: 8, h: 12, code: "A2" },
  astropatico: { x: 40, y: 18, w: 7, h: 13, code: "A3" },
  baterias: { x: 55, y: 30, w: 24, h: 8, code: "B1" },
  barracones: { x: 66, y: 42, w: 10, h: 9, code: "B2" },
  bodegas: { x: 45, y: 42, w: 15, h: 9, code: "B3" },
  forja: { x: 3, y: 30, w: 10, h: 22, code: "C1" },
  talleres: { x: 14, y: 46, w: 7, h: 10, code: "C2" },
  hangar_titanes: { x: 24, y: 55, w: 30, h: 8, code: "D1" },
  establos: { x: 58, y: 54, w: 12, h: 8, code: "D2" },
  gruas: { x: 84, y: 40, w: 10, h: 14, code: "E1" },
  bahia_pods: { x: 52, y: 82, w: 10, h: 8, code: "F2" },
  camara_escudos: { x: 48, y: 20, w: 8, h: 8, code: "G1" },
  cubierta_abordaje: { x: 76, y: 52, w: 8, h: 8, code: "G2" },
  motores_plasma: { x: 2, y: 56, w: 10, h: 10, code: "G3" },
  lanza_proa: { x: 86, y: 26, w: 10, h: 6, code: "G4" },
  blindaje_proa: { x: 84, y: 60, w: 10, h: 8, code: "G5" },
};

type Mod = { id: string; name: string; level: number; building: boolean; max: number; damaged?: boolean };

export function ShipSchematic({ mods, selected, onSelect, traitor = false }: { traitor?: boolean; mods: Mod[]; selected: string | null; onSelect: (id: string) => void }) {
  const { compact } = useViewMode();
  const built = mods.filter((m) => m.level > 0).reduce((a, m) => a + m.level, 0);
  const total = mods.reduce((a, m) => a + m.max, 0);
  const spots = traitor ? TRAITOR_SPOTS : MODULE_SPOTS;
  const integrity = Math.round((built / total) * 100);
  return (
    <div className={traitor ? "side-traitor" : ""}>
    <div className="relative w-full overflow-hidden border border-primary/50 bg-background">
      <img
        src={traitor ? blueprintTraitor : blueprint}
        alt="Esquema de ingeniería de la nave fortaleza"
        width={1920}
        height={768}
        className="block w-full"
        style={{ filter: `brightness(${0.55 + 0.5 * (built / total)}) saturate(${0.6 + built / total})` }}
      />
      {mods.map((m) => {
        const s = spots[m.id];
        if (!s) return null;
        const sel = selected === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            className={`schem-spot lvl-${m.level} ${m.building ? "is-building" : ""} ${m.damaged ? "animate-pulse !border-destructive !bg-destructive/30" : ""} ${sel ? "is-selected" : ""} absolute`}
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}
            aria-label={`${m.name}, nivel ${m.level}`}
          >
            {m.level >= 2 && <span className="schem-inner" />}
            {m.level >= 3 && <span className="schem-inner2" />}
            {!compact && (
              <span className="schem-tag">
                {s.code} · {m.name}
                <span className="schem-pips">
                  {Array.from({ length: m.max }, (_, i) => <i key={i} className={i < m.level ? "on" : ""} />)}
                </span>
                {m.building && <span className="ml-1">⚙</span>}
              </span>
            )}
          </button>
        );
      })}
      {!compact && (
        <>
          <div className="pointer-events-none absolute left-3 top-2 font-mono text-[10px] uppercase tracking-widest text-primary/80">
            {traitor ? "Esquema · Mechanicum Oscuro" : "Esquema · Adeptus Mechanicus"} · integridad estructural {integrity} %
          </div>
          <div className="pointer-events-none absolute bottom-2 right-3 flex gap-3 font-mono text-[9px] uppercase text-muted-foreground">
            <span><span className="schem-spot schem-legend lvl-0" /> vacío</span>
            <span><span className="schem-spot schem-legend lvl-1" /> N1</span>
            <span><span className="schem-spot schem-legend lvl-2" /> N2</span>
            <span><span className="schem-spot schem-legend lvl-3" /> N3</span>
            <span><span className="schem-spot schem-legend is-building" /> obras</span>
          </div>
        </>
      )}
    </div>
    {compact && (
      <div className="border border-t-0 border-primary/50 p-2">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-primary/80">Integridad estructural {integrity} % · toca un módulo</p>
        <div className="grid grid-cols-2 gap-1">
          {mods.filter((m) => spots[m.id]).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              className={`min-w-0 border px-2 py-2 text-left text-xs ${selected === m.id ? "border-primary bg-accent text-primary" : "border-border"} ${m.level === 0 ? "text-muted-foreground" : ""}`}
            >
              <div className="truncate">{spots[m.id]!.code} · {m.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{m.level ? `N${m.level}/${m.max}` : "Vacío"}{m.building ? " · ⚙ obras" : ""}</div>
            </button>
          ))}
        </div>
      </div>
    )}
    </div>
  );
}
