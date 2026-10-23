import { describe, expect, it } from "vitest";
import type { Detachment } from "@/types/legions";
import { canAfford, modelsUsed, shortfalls } from "@/lib/legions/collection";
import { applyDetachment, emptySlot, type Db } from "@/lib/legions/engine";

const jet: Detachment = {
  id: 2, name: "Jetbikes", faction: "Legiones Astartes", subfaction: null, allegiance: null, unique: false,
  detachment_type: ["Vanguard"], base_cost: 35, base_size: 3, max_size: 9, main_unit: [27], related_unit: [],
  dataslate_loadout: [], loadout_options: [], datasheet_info: [],
  upgrade_options: [{ name: "Extra", unit_ref: 27, options: [{ number: 3, cost: 35, size: 3 }] }],
};
const db: Db = { formations: [], detachments: [jet], formationById: new Map(), slotById: new Map(), detachmentById: new Map([[2, jet]]) };

describe("collection mode", () => {
  it("counts base size plus upgrades against the unit", () => {
    const s = { ...applyDetachment(emptySlot(0), jet), upgrades: [{ name: "Extra", number: 3 }] };
    expect(modelsUsed(db, [s]).get(27)).toBe(6);
  });
  it("flags missing models and blocks additions beyond owned", () => {
    const used = modelsUsed(db, [applyDetachment(emptySlot(0), jet)]);
    const owned = new Map([[27, 4]]);
    expect(shortfalls(used, owned)).toEqual([]);
    expect(canAfford(used, owned, 27, 3)).toBe(false);
    expect(canAfford(used, owned, 27, 1)).toBe(true);
    expect(shortfalls(used, new Map([[27, 2]]))).toEqual([{ unitId: 27, need: 3, have: 2 }]);
  });
});

import { formationWarnings } from "@/lib/legions/engine";
describe("formation validation", () => {
  const mk = (slot_type: "compulsory" | "choice", text: string, ids: [number, number | null][]) => ({
    uid: "f", formation_id: 1, nickname: "", subfaction: null,
    groups: [{ slot_type, text, slots: ids.map(([slot_id, detachment_id]) => ({ uid: String(slot_id), slot_id, detachment_id, upgrades: [], loadouts: [] })) }],
  });
  it("compulsory slot empty → incomplete", () => {
    expect(formationWarnings(mk("compulsory", "", [[1, 5], [2, null]]))).toContain("Faltan destacamentos obligatorios");
    expect(formationWarnings(mk("compulsory", "", [[1, 5], [2, 6]]))).toEqual([]);
  });
  it("choice: ONE Support or TWO Vanguard cannot mix", () => {
    const t = "ONE Support slot or TWO Vanguard slots";
    expect(formationWarnings(mk("choice", t, [[1, null], [2, 7], [2, 7]]))).toEqual([]);
    expect(formationWarnings(mk("choice", t, [[1, 5], [2, 7], [2, null]])).length).toBe(1);
  });
});
