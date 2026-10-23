import { describe, expect, it } from "vitest";
import { pickRandom, pointsFor } from "@/lib/games";

describe("game sizes", () => {
  it("escaramuza 1500, batalla 3000, armageddon 5000", () => {
    expect(pointsFor("escaramuza")).toBe(1500);
    expect(pointsFor("batalla")).toBe(3000);
    expect(pointsFor("armageddon")).toBe(5000);
  });
  it("random scenario picks from the list", () => {
    expect(pickRandom(["a", "b", "c"], () => 0.99)).toBe("c");
    expect(pickRandom([], () => 0.5)).toBeUndefined();
  });
});
