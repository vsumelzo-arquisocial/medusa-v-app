import { describe, expect, it } from "vitest";
import { sideIntegrity, totalVp, emptyBattle } from "@/lib/battle";
import type { Db } from "@/lib/legions/engine";

const db = {
  detachmentById: new Map([[1, { id: 1, name: "A", base_size: 4, break_strength: undefined, upgrade_options: [] }]]),
  slotById: new Map([[1, { id: 1, type: "Core" }]]),
} as unknown as Db;
const f = { uid: "f", formation_id: 1, nickname: "", subfaction: null, groups: [{ slot_type: "Core", text: "", slots: [{ uid: "s", slot_id: 1, detachment_id: 1, upgrades: [], loadouts: [] }] }] } as never;

describe("integridad", () => {
  it("formación quebrada al perder la mitad de su fuerza", () => {
    expect(sideIntegrity(db, "creator", [f], { "creator:s": 1 }, () => "F").rows[0]!.broken).toBe(false);
    const r = sideIntegrity(db, "creator", [f], { "creator:s": 2 }, () => "F");
    expect(r.rows[0]!.broken).toBe(true);
    expect(r.defeated).toBe(true);
  });
  it("suma de puntos de victoria", () => {
    const b = emptyBattle(); b.vp.creator = [2, 3];
    expect(totalVp(b, "creator")).toBe(5);
  });
});

import { engineProfile, expectedHits, unitForDetachment, clampEngine } from "@/lib/battle";
describe("motores de guerra", () => {
  it("titán con 6 escudos de vacío", () => {
    const e = engineProfile({ name: "Warlord Battle Titan", wounds: 6, special_rules: [{ name: ": Void Shields", value: "6" }] });
    expect(e).toMatchObject({ kind: "titan", maxShields: 6, maxWounds: 6 });
  });
  it("caballero sin escudos de vacío", () => {
    expect(engineProfile({ name: "Questoris Knight", wounds: 3, special_rules: [{ name: "Ion Shields", value: "4+" }] })).toMatchObject({ kind: "knight", maxShields: 0, ion: "4+" });
  });
  it("escudos no superan el máximo al regenerar", () => {
    expect(clampEngine({ shields: 9, wounds: -1 }, 6, 6)).toEqual({ shields: 6, wounds: 0 });
  });
  it("vincula destacamento por nombre", () => {
    expect(unitForDetachment({ name: "Questoris Knight Banner" }, [{ id: 1, name: "Knight" }, { id: 2, name: "Questoris Knight" }])?.id).toBe(2);
  });
  it("impactos esperados: 6 dados a 4+ con salvación 4+ y FP -1", () => {
    const r = expectedHits(6, 4, 0, 4, -1);
    expect(r.hits).toBe(3);
    expect(r.unsaved).toBeCloseTo(1.5 + 0.5); // salvación 5+: falla 2/3 → 2
  });
});
describe("vínculo por palabras", () => {
  it("Dire Wolf Heavy Scout Titan → Dire Wolf Titan", () => {
    expect(unitForDetachment({ name: "Dire Wolf Heavy Scout Titan" }, [{ id: 66, name: "Dire Wolf Titan" }])?.id).toBe(66);
  });
});
import { schematicKind } from "@/lib/schematics";
describe("esquemas", () => {
  it("clasifica unidades", () => {
    expect(schematicKind({ name: "Warhound Scout Titan" })).toBe("titan-warhound");
    expect(schematicKind({ name: "Questoris Knight" })).toBe("knight");
    expect(schematicKind({ name: "Thunderhawk Gunship" })).toBe("flyer");
    expect(schematicKind({ name: "Legion Predator" })).toBe("vehicle");
    expect(schematicKind({ name: "Legion Fellblade" })).toBe("superheavy");
    expect(schematicKind({ name: "Contemptor Dreadnought" })).toBe("walker");
    expect(schematicKind({ name: "Tactical Legionaries" })).toBe("infantry");
  });
});
