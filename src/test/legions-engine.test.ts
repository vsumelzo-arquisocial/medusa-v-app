import { describe, expect, it } from "vitest";
import type { ArmyList, Detachment, Formation, FormationSlot } from "@/types/legions";
import { addLoadout, applyDetachment, availableFormations, emptySlot, formationStrength, listWarnings, slotCost, slotSize, type Db } from "@/lib/legions/engine";

const tactical: Detachment = {
  id: 1, name: "Legion Tactical Detachment", faction: "Legiones Astartes", subfaction: null, allegiance: null, unique: false,
  detachment_type: ["Core"], base_cost: 35, td_ek: 5, base_size: 4, max_size: 12,
  main_unit: [], related_unit: [], dataslate_loadout: [],
  upgrade_options: [{ name: "Additional Tactical Legionaries", unit_ref: 0, options: [{ number: 4, cost: 24, td_ek: 2, size: 4 }] }],
  loadout_options: [], datasheet_info: [],
};
const slot: FormationSlot = { id: 10, type: "Core", faction: "Legiones Astartes", restricted: false, options: [] };
const forms: Formation[] = [
  { id: 1, name: "Std", faction: "Legiones Astartes", subfaction: null, allegiance: null, formation_slots: [{ slot_type: "compulsory", slot_id: [10] }], rules: [] },
  { id: 4001, name: "TD", faction: "Legiones Astartes", subfaction: null, allegiance: null, formation_slots: [], rules: [] },
  { id: 2, name: "Traitor only", faction: "Legiones Astartes", subfaction: null, allegiance: "Traitor", formation_slots: [], rules: [] },
];
const db: Db = {
  formations: forms, detachments: [tactical],
  formationById: new Map(forms.map((f) => [f.id, f])),
  slotById: new Map([[10, slot]]),
  detachmentById: new Map([[1, tactical]]),
};

const withUpgrade = () => ({ ...applyDetachment(emptySlot(10), tactical), upgrades: [{ name: "Additional Tactical Legionaries", number: 4 }] });

describe("army builder rules", () => {
  it("tactical detachment + 4 additional legionaries = 59 pts, size 8", () => {
    const s = withUpgrade();
    expect(slotCost(db, s, "standard")).toBe(59);
    expect(slotSize(db, s)).toBe(8);
  });
  it("titandeath adds td_ek to detachment and upgrade", () => {
    expect(slotCost(db, withUpgrade(), "titandeath")).toBe(66);
  });
  it("titandeath only offers formations 4000-4999", () => {
    expect(availableFormations(db, { gamemode: "titandeath", allegiance: "Loyalist" }).map((f) => f.id)).toEqual([4001]);
  });
  it("excludes formations of the other allegiance", () => {
    expect(availableFormations(db, { gamemode: "standard", allegiance: "Loyalist" }).map((f) => f.id)).not.toContain(2);
  });
  it("break point is half the strength rounded up", () => {
    const lf = { uid: "a", formation_id: 1, nickname: "", subfaction: null, groups: [{ slot_type: "compulsory" as const, text: "", slots: [withUpgrade()] }] };
    expect(formationStrength(db, lf)).toEqual({ strength: 8, breakPoint: 4 });
  });
  it("loadouts cannot exceed detachment size", () => {
    const s = addLoadout(applyDetachment(emptySlot(10), tactical), 4, [{ location: "a", weapon: "x" }])!;
    expect(s.loadouts[0]!.count).toBe(4);
    expect(addLoadout(s, 4, [{ location: "a", weapon: "y" }])).toBeNull();
  });
  it("warns when main faction is under 70% in standard", () => {
    const list: ArmyList = { id: "", user_id: "", name: "", points: 3000, gamemode: "standard", faction: "Legiones Astartes", allegiance: "Loyalist", formations: [], created_at: "", updated_at: "" };
    expect(listWarnings(db, list)).toContain("La facción principal debe ser al menos el 70 % de la lista");
    expect(listWarnings(db, { ...list, gamemode: "titandeath" })).not.toContain("La facción principal debe ser al menos el 70 % de la lista");
  });
});
