import { describe, expect, it } from "vitest";
import { CELLS, duplicateAdvantage, isAdjacent, regionRate, activeRegionBonuses } from "@/lib/planet";

describe("Medusa V map", () => {
  it("has 42 land regions on several continents, every region reachable, adjacency symmetric", () => {
    expect(CELLS).toHaveLength(42);
    expect(new Set(CELLS.map((c) => c.continent)).size).toBeGreaterThan(3);
    for (const c of CELLS) expect(c.neighbors.length).toBeGreaterThan(0);
    const seen = new Set([0]); const st = [0];
    while (st.length) for (const n of CELLS[st.pop()!]!.neighbors) if (!seen.has(n)) { seen.add(n); st.push(n); }
    expect(seen.size).toBe(42);
    for (const c of CELLS) for (const n of c.neighbors) expect(CELLS[n]!.neighbors).toContain(c.id);
  });
  it("only neighbours are attackable", () => {
    const own = [0]; const c0 = CELLS[0]!;
    for (const n of c0.neighbors) expect(isAdjacent(n, own)).toBe(true);
    expect(isAdjacent(CELLS.find((c) => c.id !== 0 && !c0.neighbors.includes(c.id))!.id, own)).toBe(false);
  });
});

describe("region bonuses", () => {
  it("same-type regions step 10/15/20 % and cap at 20 %", () => {
    expect(regionRate([], "mina")).toBe(0);
    expect(regionRate(["mina"], "mina")).toBeCloseTo(0.1);
    expect(regionRate(["mina", "mina"], "mina")).toBeCloseTo(0.15);
    expect(regionRate(["mina", "mina", "mina"], "mina")).toBeCloseTo(0.2);
    expect(regionRate(["mina", "mina", "mina", "mina", "mina"], "mina")).toBeCloseTo(0.2);
  });
  it("other types do not count toward a bonus", () => {
    expect(regionRate(["forja", "arsenal"], "mina")).toBe(0);
  });
  it("port adds 6/9/12 hours of warp protection", () => {
    expect(activeRegionBonuses(["puerto", "puerto"])[0]!.label).toContain("+9 h");
  });
  it("duplicates give +5 % each in random resolution, capped at 20 %", () => {
    expect(duplicateAdvantage(["mina", "mina"])).toBeCloseTo(0.05);
    expect(duplicateAdvantage(["mina", "mina", "mina", "mina", "mina", "mina", "mina"])).toBeCloseTo(0.2);
    expect(duplicateAdvantage(["mina", "forja"])).toBe(0);
  });
});
