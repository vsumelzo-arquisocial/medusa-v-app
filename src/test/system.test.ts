import { describe, expect, it } from "vitest";
import { BODIES, travelSeconds } from "@/lib/system";
import { BODY_MAPS } from "@/lib/planet";

const H = 3600, D = 24 * H;
describe("Medusa system", () => {
  it.each(['medusa-4', 'medusa-5'])('every physical island on %s has a sea exit to another region', (body) => {
    const map = BODY_MAPS[body];
    if (!map) throw new Error(`Missing map ${body}`);
    const { w, h, data } = map.grid;
    const visited = new Set<number>();
    for (let start = 0; start < data.length; start++) {
      if (data[start] === 255 || visited.has(start)) continue;
      const pending = [start];
      const ids = new Set<number>();
      visited.add(start);
      while (pending.length) {
        const pos = pending.pop();
        if (pos === undefined) continue;
        const local = data[pos];
        const cell = local === undefined ? undefined : map.cells[local];
        if (!cell) throw new Error(`Invalid island pixel ${pos}`);
        ids.add(cell.id);
        const x = pos % w, y = Math.floor(pos / w);
        const next = [y * w + (x + 1) % w, y * w + (x + w - 1) % w];
        if (y > 0) next.push(pos - w);
        if (y + 1 < h) next.push(pos + w);
        for (const p of next) if (data[p] !== 255 && !visited.has(p)) { visited.add(p); pending.push(p); }
      }
      expect(map.cells.some((c) => ids.has(c.id) && c.sea.some((id) => !ids.has(id))), `island regions ${[...ids]}`).toBe(true);
    }
  });
  it.each([['medusa-4',54],['medusa-5',42]])('every region of water planet %s can reach every island and continent', (body, count) => {
    const map = BODY_MAPS[body];
    expect(map).toBeDefined();
    if (!map) throw new Error(`Missing map ${body}`);
    expect(map.cells).toHaveLength(count);
    for (const start of map.cells) {
      const seen = new Set([start.id]);
      const pending = [start.id];
      while (pending.length) {
        const id = pending.pop();
        if (id === undefined) continue;
        const index = map.index.get(id);
        const cell = index === undefined ? undefined : map.cells[index];
        if (!cell) throw new Error(`Missing region ${id}`);
        for (const n of cell.neighbors) if (!seen.has(n)) { seen.add(n); pending.push(n); }
      }
      expect(seen.size).toBe(count);
    }
  });
  it("has a sun-centred system of nine planets: one inhospitable, three gas giants and five playable", () => {
    const planets = BODIES.filter((b) => b.kind === "planet");
    expect(planets).toHaveLength(9);
    expect(planets.filter((p) => p.playable)).toHaveLength(5);
    expect(planets.filter((p) => p.biome.includes("gaseoso"))).toHaveLength(3);
  });
  it("the farthest trip (Medusa II to Medusa VIII) takes one week in the warp", () => {
    expect(travelSeconds("medusa-2", "medusa-8")).toBe(7 * D);
  });
  it("jumping between a planet and its moon takes 3 hours", () => {
    expect(travelSeconds("medusa-4", "medusa-4a")).toBe(3 * H);
    expect(travelSeconds("medusa-4a", "medusa-4b")).toBe(3 * H);
  });
  it("adjacent orbits take a sixth of a week and staying put takes nothing", () => {
    expect(travelSeconds("medusa-4", "medusa-5")).toBe(Math.round((7 * D) / 6));
    expect(travelSeconds("medusa-5", "medusa-5")).toBe(0);
  });
  it("Medusa V keeps 42 regions and every playable body has a symmetric, connected map", () => {
    expect(BODY_MAPS["medusa-5"]!.cells).toHaveLength(42);
    for (const b of BODIES.filter((x) => x.playable)) {
      const m = BODY_MAPS[b.id]!;
      expect(m, b.id).toBeDefined();
      const ids = new Set(m.cells.map((c) => c.id));
      for (const c of m.cells) for (const n of c.neighbors) { expect(ids.has(n)).toBe(true); expect(m.cells[m.index.get(n)!]!.neighbors).toContain(c.id); }
      const seen = new Set([m.cells[0]!.id]); const st = [m.cells[0]!.id];
      while (st.length) for (const n of m.cells[m.index.get(st.pop()!)!]!.neighbors) if (!seen.has(n)) { seen.add(n); st.push(n); }
      expect(seen.size, b.id).toBe(m.cells.length);
    }
  });
  it("moons are small (3 to 6 regions)", () => {
    for (const b of BODIES.filter((x) => x.kind === "moon")) expect(BODY_MAPS[b.id]!.cells.length).toBeGreaterThanOrEqual(3), expect(BODY_MAPS[b.id]!.cells.length).toBeLessThanOrEqual(6);
  });
});
