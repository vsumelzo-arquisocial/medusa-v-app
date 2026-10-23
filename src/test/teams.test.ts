import { describe, expect, it } from "vitest";
import { playerPoints } from "@/lib/teams";

describe("team points", () => {
  it("1v2 at 3000: solo player 3000, each rival 1500", () => {
    expect(playerPoints("1v2", 3000, "creator")).toBe(3000);
    expect(playerPoints("1v2", 3000, "opponent")).toBe(1500);
  });
  it("2v2 at 3000: every commander 1500", () => {
    expect(playerPoints("2v2", 3000, "creator")).toBe(1500);
    expect(playerPoints("2v2", 3000, "opponent")).toBe(1500);
  });
  it("2v1 mirrors 1v2", () => {
    expect(playerPoints("2v1", 5000, "creator")).toBe(2500);
    expect(playerPoints("2v1", 5000, "opponent")).toBe(5000);
  });
});
