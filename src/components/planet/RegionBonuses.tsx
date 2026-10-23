import { activeRegionBonuses, REGION_TYPES } from "@/lib/planet";

/** Lists the bonuses the player's conquered regions currently grant (computed server-side; this only displays them). */
export function RegionBonuses({ owned }: { owned: string[] }) {
  const list = activeRegionBonuses(owned);
  if (!list.length) return <p className="text-xs text-muted-foreground">Sin bonificaciones de región. Conquista minas, forjas, diques, arsenales… para obtenerlas.</p>;
  return (
    <ul className="space-y-1 text-xs">
      {list.map((b) => <li key={b.type} className="text-primary">{REGION_TYPES[b.type].glyph} {b.label}</li>)}
    </ul>
  );
}
