import { describe, expect, it } from "vitest";
import { rateFromReach, regionFactor } from "@/lib/income";
import { armourFactor, boardingCharges, newSide, stats, torpedoDodge } from "@/lib/naval3/engine";
import { travelSeconds, travelSecondsWith } from "@/lib/system";

describe("ingresos remotos", () => {
  it("pierde 15 % por órbita, máx. 75 %, y la antena lo reduce", () => {
    expect(regionFactor("medusa-5", "medusa-5", 0)).toBe(1);
    expect(regionFactor("medusa-4", "medusa-4a", 0)).toBe(1);
    expect(regionFactor("medusa-5", "medusa-3", 0)).toBeCloseTo(0.7);
    expect(regionFactor("medusa-1", "medusa-9", 0)).toBeCloseTo(0.25);
    expect(regionFactor("medusa-5", "medusa-3", 3)).toBe(1);
    expect(regionFactor("medusa-5", "medusa-3", 1)).toBeCloseTo(0.8);
  });
  it("bonificación por regiones equivalentes", () => {
    expect(rateFromReach(0)).toBe(0);
    expect(rateFromReach(0.5)).toBeCloseTo(0.05);
    expect(rateFromReach(1)).toBeCloseTo(0.1);
    expect(rateFromReach(2)).toBeCloseTo(0.15);
    expect(rateFromReach(5)).toBeCloseTo(0.2);
  });
  it("motores acortan el viaje un 10 % por nivel", () => {
    expect(travelSecondsWith("medusa-5", "medusa-9", 3)).toBe(
      Math.round(travelSeconds("medusa-5", "medusa-9") * 0.7),
    );
  });
});

describe("módulos de combate", () => {
  it("tubos de torpedos: +1 torpedo y −5 % de esquiva por nivel", () => {
    const base = newSide("imperium", {}, 30, 30);
    const up = newSide("imperium", { lanza_proa: 2 }, 30, 30);
    expect(stats(up).torpedoes).toBe(stats(base).torpedoes + 2);
    expect(torpedoDodge(base, "evasion", 1, "imperium", false, 2)).toBe(
      torpedoDodge(base, "evasion", 1, "imperium", false) - 10,
    );
  });
  it("blindaje y cubierta de abordaje", () => {
    expect(armourFactor(newSide("imperium", { blindaje_proa: 3 }, 30, 30))).toBeCloseTo(0.82);
    expect(boardingCharges("imperium", { cubierta_abordaje: 3 })).toBe(3);
    expect(boardingCharges("imperium", { cubierta_abordaje: 2 })).toBe(2);
  });
});
