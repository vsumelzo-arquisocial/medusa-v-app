import { describe, expect, it } from "vitest";
import {
  newDuel,
  newSide,
  nextRange,
  resolveBlock,
  seeded,
  warpChance,
  absorbed,
} from "@/lib/naval3/engine";
import { botPlan, predictRanges, suggestPlan } from "@/lib/naval3/advisor";
import type { BlockPlan, PhasePlan } from "@/lib/naval3/types";

const hold = (
  action: PhasePlan["action"] = "fuego",
  move: PhasePlan["move"] = 0,
  emergencyJump = 0,
): BlockPlan => ({
  phases: Array.from({ length: 5 }, () => ({ move, action })),
  emergencyJump,
});
const duel = () => newDuel(newSide("imperium", {}, 30, 30), newSide("orks", {}, 40, 40));

describe("combate naval v3", () => {
  it("maniobras: opuestas gana la más rápida, iguales suman", () => {
    expect(nextRange(3, -1, 2, -1, 2)).toBe(1);
    expect(nextRange(2, -1, 2, 1, 2)).toBe(2);
    expect(nextRange(2, -1, 3, 1, 2)).toBe(1);
    expect(nextRange(2, -1, 1, 0, 3)).toBe(1);
    expect(nextRange(0, -1, 1, -1, 1)).toBe(0);
  });

  it("los escudos nunca absorben más de la mitad", () => {
    expect(absorbed(4, 3)).toBe(2);
    expect(absorbed(10, 3)).toBe(3);
  });

  it("los torpedos impactan en la fase siguiente y vacían los tubos", () => {
    const s = duel();
    const plan: BlockPlan = {
      phases: [{ move: 0, action: "torpedos" }, ...hold("evasion").phases.slice(1)],
      emergencyJump: 0,
    };
    const { events, state } = resolveBlock(s, plan, hold("evasion", 1), seeded(1));
    expect(events[0]!.attacker.torpedoesLaunched).toBe(4);
    expect(events[0]!.attacker.torpedoesHit + events[0]!.attacker.torpedoesDodged).toBe(0);
    expect(events[1]!.attacker.torpedoesHit + events[1]!.attacker.torpedoesDodged).toBe(4);
    expect(state.attacker.torpedoesLoaded).toBe(false);
  });

  it("lanzar sin carga se convierte en recarga", () => {
    const s = duel();
    s.attacker.torpedoesLoaded = false;
    const { events } = resolveBlock(s, hold("torpedos"), hold("evasion"), seeded(2));
    expect(events[0]!.attacker.action).toBe("recargar");
    expect(events[0]!.attacker.forced).toBeTruthy();
    expect(events[1]!.attacker.action).toBe("torpedos");
  });

  it("embestir fuera de alcance dispara; en Cerca choca y deja Contacto", () => {
    const s = duel();
    const r1 = resolveBlock(s, hold("embestir"), hold("fuego"), seeded(3));
    expect(r1.events[0]!.attacker.action).toBe("fuego");
    s.range = 1;
    const r2 = resolveBlock(s, hold("embestir"), hold("fuego"), seeded(3));
    expect(r2.events[0]!.attacker.ram).not.toBeNull();
    expect(r2.events[0]!.rangeAfter).toBe(0);
  });

  it("el salto disforme termina el duelo y pierde quien salta", () => {
    const s = newDuel(newSide("daemons", {}, 28, 28), newSide("tau", {}, 22, 22));
    const { state } = resolveBlock(s, hold("saltar"), hold("fuego"), seeded(4));
    expect(state.finished).toMatchObject({
      reason: "salto",
      winner: "defensor",
      jumped: "attacker",
    });
    expect(warpChance(s.attacker)).toBe(100);
  });

  it("el salto empeora con el casco dañado", () => {
    const a = newSide("imperium", {}, 30, 30);
    const b = { ...a, hull: 6 };
    expect(warpChance(b)).toBeLessThan(warpChance(a));
  });

  it("salto de emergencia al bajar del umbral", () => {
    const s = duel();
    s.range = 0;
    s.attacker.hull = 9;
    const { events } = resolveBlock(s, hold("fuego", 0, 40), hold("fuego"), seeded(5));
    expect(events[0]!.attacker.action).toBe("saltar");
  });

  it("la nave destruida termina el duelo", () => {
    const s = duel();
    s.range = 0;
    s.attacker.hull = 1;
    const { state } = resolveBlock(s, hold("fuego"), hold("fuego"), seeded(6));
    expect(state.finished?.reason).toBe("destruida");
    expect(state.finished?.destroyed).toContain("attacker");
  });

  it("el Segundo sugiere planes de 5 fases válidos y prevé distancias", () => {
    const s = duel();
    for (const st of ["asalto", "optima", "defensiva"] as const) {
      const p = suggestPlan(s, "attacker", st);
      expect(p.phases).toHaveLength(5);
      expect(predictRanges(s, "attacker", p.phases)).toHaveLength(5);
    }
    const rng = seeded(7);
    let st = s;
    while (!st.finished)
      st = resolveBlock(st, botPlan(st, "attacker", rng), botPlan(st, "defender", rng), rng).state;
    expect(st.finished).not.toBeNull();
  });
});
