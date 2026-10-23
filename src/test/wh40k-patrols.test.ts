import { describe, expect, it } from "vitest";
import data from "@/data/warhammer40k/combat-patrols.json";
import { exportPatrol, patrolSelection, patrolsFor, type Patrol } from "@/lib/wh40k-patrols";

const all = (data as unknown as { patrols: Patrol[] }).patrols;

describe("patrullas de combate", () => {
  it("la patrulla T'au contiene exactamente sus 5 unidades oficiales", () => {
    const [tau] = patrolsFor(all, "tau-empire");
    expect(tau!.units.map((u) => [u.name, u.models])).toEqual([["Aun’Shar", 1], ["Shas’nel D’tano", 1], ["Ghostkeel Battlesuit", 1], ["Strike Team", 10], ["Stealth Battlesuits", 3]]);
  });
  it("solo se puede elegir la mejora por defecto o la alternativa", () => {
    const [tau] = patrolsFor(all, "tau-empire");
    expect(patrolSelection(tau!, { patrolId: tau!.id, enhancement: "default", objective: "default" }).enhancement?.name).toBe("DS13 EXPERIMENTAL DRONE (AURA)");
    expect(patrolSelection(tau!, { patrolId: tau!.id, enhancement: "optional", objective: "optional" }).enhancement?.name).toBe("DS15 EXPERIMENTAL DRONE (AURA)");
  });
  it("cada patrulla tiene unidades y la exportación las lista todas", () => {
    for (const p of all) {
      expect(p.units.length).toBeGreaterThan(1);
      const txt = exportPatrol("X", "F", p, { patrolId: p.id, enhancement: "default", objective: "default" });
      for (const u of p.units) expect(txt).toContain(u.name);
    }
  });
});
