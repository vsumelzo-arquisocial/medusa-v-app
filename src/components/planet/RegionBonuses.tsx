import { useQuery } from "@tanstack/react-query";
import { REGION_TYPES, type RegionType } from "@/lib/planet";
import { incomeBreakdownQuery } from "@/lib/income";

/**
 * Bonificaciones que dan tus regiones de todos los planetas, ya reducidas por la distancia a la nave
 * (calculadas en el servidor; esto solo las muestra). `owned` se mantiene por compatibilidad.
 */
export function RegionBonuses(_props: { owned?: string[] }) {
  const { data } = useQuery(incomeBreakdownQuery);
  if (!data) return null;
  const mines = data.regions.filter((r) => r.type === "mina");
  const mineCredits = Math.floor(mines.reduce((a, r) => a + data.mine_credits * r.factor, 0));
  const list = (Object.entries(data.rates) as [RegionType, number][])
    .filter(([, r]) => r > 0)
    .map(([t, r]) => {
      const pct = Math.round(r * 100);
      const value =
        t === "puerto" ? `+${Math.round(r * 60)} h` : t === "bastion" ? `+${pct} %` : `−${pct} %`;
      const n = data.regions.filter((x) => x.type === t).length;
      return { t, label: `${REGION_TYPES[t].name} ×${n}: ${value} ${REGION_TYPES[t].effect}` };
    });
  if (!mines.length && !list.length)
    return (
      <p className="text-xs text-muted-foreground">
        Sin bonificaciones de región. Conquista minas, forjas, diques, arsenales… para obtenerlas.
      </p>
    );
  return (
    <ul className="space-y-1 text-xs">
      {mines.length > 0 && (
        <li className="text-primary">
          {REGION_TYPES.mina.glyph} Mina ×{mines.length}: +{mineCredits} créditos diarios
        </li>
      )}
      {list.map((b) => (
        <li key={b.t} className="text-primary">
          {REGION_TYPES[b.t].glyph} {b.label}
        </li>
      ))}
      <li className="text-[10px] text-muted-foreground">
        Cuentan todos tus planetas; los lejanos aportan menos según la distancia a la nave.
      </li>
    </ul>
  );
}
