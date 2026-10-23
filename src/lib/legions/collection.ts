import type { ListSlot } from "@/types/legions";
import type { Db } from "./engine";

export type Owned = Map<number, number>;
export type ListMode = "libre" | "coleccion";

/** Models of each unit consumed by the list's detachments (base size → main unit, upgrades → unit_ref). */
export function modelsUsed(db: Db, slots: ListSlot[]): Map<number, number> {
  const used = new Map<number, number>();
  const add = (id: number | undefined, n: number) => {
    if (id === undefined || n <= 0) return;
    used.set(id, (used.get(id) ?? 0) + n);
  };
  for (const s of slots) {
    const d = s.detachment_id !== null ? db.detachmentById.get(s.detachment_id) : undefined;
    if (!d) continue;
    const main = d.main_unit[0];
    add(main, d.base_size);
    for (const u of s.upgrades) {
      const up = d.upgrade_options.find((o) => o.name === u.name);
      const opt = up?.options.find((o) => o.number === u.number);
      if (!up || !opt) continue;
      add(up.unit_ref && up.unit_ref > 0 ? up.unit_ref : main, opt.size);
    }
  }
  return used;
}

export function shortfalls(used: Map<number, number>, owned: Owned) {
  const out: { unitId: number; need: number; have: number }[] = [];
  for (const [unitId, need] of used) {
    const have = owned.get(unitId) ?? 0;
    if (need > have) out.push({ unitId, need, have });
  }
  return out;
}

/** In collection mode: can the list still afford `extra` models of `unitId`? Units with no unit id are never blocked. */
export function canAfford(used: Map<number, number>, owned: Owned, unitId: number | undefined, extra: number) {
  if (unitId === undefined) return true;
  return (used.get(unitId) ?? 0) + extra <= (owned.get(unitId) ?? 0);
}
