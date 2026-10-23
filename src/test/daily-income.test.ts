import { describe, expect, it } from "vitest";
import { incomeRemaining } from "@/lib/daily-income";

describe("daily collection cooldown", () => {
  const start = "2026-10-18T20:55:00Z";
  const next = "2026-10-19T20:55:00Z";
  it("waits exactly 24 hours before collection", () => {
    expect(incomeRemaining(next, start, 0)).toBe(86400000);
    expect(incomeRemaining(next, start, 86399000)).toBe(1000);
    expect(incomeRemaining(next, start, 86400000)).toBe(0);
  });
});