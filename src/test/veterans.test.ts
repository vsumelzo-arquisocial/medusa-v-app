import { describe, expect, it } from "vitest";
import { markMvp, veteranKind } from "@/lib/veterans";

describe("veterans", () => {
  it("Titans, Knights and commanders are unique veterans", () => {
    expect(veteranKind({ name: "Warlord Battle Titan" }, "titan")).toBe("titan");
    expect(veteranKind({ name: "Questoris Knight" }, "caballero")).toBe("caballero");
    expect(veteranKind({ name: "Auxilia Commander" }, "infanteria")).toBe("personaje");
  });
  it("ordinary units and plain super-heavies are not unique", () => {
    expect(veteranKind({ name: "Tactical Detachment" }, "infanteria")).toBeNull();
    expect(veteranKind({ name: "Sicaran", unit_type: { type: "Super-Heavy Vehicle" } }, "blindado")).toBeNull();
  });
  it("only one veteran gets the MVP mark", () => {
    const e = { unit_id: 65, name: "", destroyed: false, wounds_lost: 0, max_wounds: 10, mvp: false };
    const r = markMvp([e, { ...e }], "Reaver Battle Titan", () => "Reaver Battle Titan");
    expect(r.filter((x) => x.mvp)).toHaveLength(1);
  });
});
