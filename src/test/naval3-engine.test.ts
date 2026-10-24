import { describe, expect, it } from "vitest";
import {
  absorbed,
  arcWeights,
  helmTurn,
  newDuel,
  newSide,
  relBearing,
  resolveBlock,
  seeded,
  warpChance,
} from "@/lib/naval3/engine";
import { botPlan, predictPath, suggestPlan } from "@/lib/naval3/advisor";
import type { BlockPlan, DuelState, PhasePlan } from "@/lib/naval3/types";

const hold = (
  action: PhasePlan["action"] = "fuego",
  speed: PhasePlan["speed"] = 1,
  turn: PhasePlan["turn"] = 0,
  emergencyJump = 0,
): BlockPlan => ({
  phases: Array.from({ length: 5 }, () => ({ speed, turn, action })),
  emergencyJump,
});
const duel = () => newDuel(newSide("imperium", {}, 30, 30), newSide("orks", {}, 40, 40));
/** Coloca al defensor a `d` unidades y `deg` grados de la proa del atacante (que mira al norte). */
function place(s: DuelState, d: number, deg: number, defHeading = 4) {
  const a = (deg * Math.PI) / 180;
  s.attacker.pos = { x: 0, y: 0 };
  s.attacker.heading = 0;
  s.defender.pos = { x: Math.sin(a) * d, y: Math.cos(a) * d };
  s.defender.heading = defHeading;
  return s;
}

describe("combate naval v3 con rumbo y arcos", () => {
  it("los pesos de arco suman 1 y distinguen babor de estribor", () => {
    for (const r of [0, 30, 45, 90, 135, 180, -60, -150]) {
      const w = arcWeights(r);
      expect(w.proa + w.babor + w.estribor + w.popa).toBeCloseTo(1);
    }
    expect(arcWeights(90).estribor).toBe(1);
    expect(arcWeights(-90).babor).toBe(1);
  });

  it("el rumbo relativo: proa 0°, estribor +90°", () => {
    const s = place(duel(), 6, 90);
    expect(relBearing(s.attacker, s.defender.pos)).toBeCloseTo(90);
  });

  it("los escudos nunca absorben más de la mitad", () => {
    expect(absorbed(4, 3)).toBe(2);
    expect(absorbed(10, 3)).toBe(3);
  });

  it("las intenciones de timón: encarar y presentar costado", () => {
    const s = place(duel(), 6, 90);
    expect(helmTurn(s.attacker, s.defender.pos, "encarar", 1)).toBe(1);
    expect(helmTurn(s.attacker, s.defender.pos, "encarar", 2)).toBe(2);
    const t = place(duel(), 6, 0);
    expect(Math.abs(helmTurn(t.attacker, t.defender.pos, "costado", 2))).toBe(2);
  });

  it("el imperio pega más de costado que de proa en Cerca", () => {
    const side = resolveBlock(
      place(duel(), 4, 90, 6),
      hold("fuego", 0),
      hold("evasion", 0),
      seeded(1),
    );
    const prow = resolveBlock(
      place(duel(), 4, 0, 6),
      hold("fuego", 0),
      hold("evasion", 0),
      seeded(1),
    );
    expect(side.events[0]!.attacker.arcs).toContain("estribor");
    expect(prow.events[0]!.attacker.arcs).toContain("proa");
  });

  it("los torpedos solo salen por la proa y se recargan", () => {
    const off = resolveBlock(
      place(duel(), 7, 90, 6),
      hold("torpedos", 0),
      hold("evasion", 0),
      seeded(2),
    );
    expect(off.events[0]!.attacker.action).toBe("fuego");
    expect(off.events[0]!.attacker.forced).toBeTruthy();
    const on = resolveBlock(
      place(duel(), 7, 0, 0),
      hold("torpedos", 0),
      hold("evasion", 0),
      seeded(2),
    );
    expect(on.events[0]!.attacker.torpedoesLaunched).toBe(4);
    expect(on.events[1]!.attacker.action).toBe("recargar");
  });

  it("avante toda cierra distancia y no gira", () => {
    const s = place(duel(), 14, 0, 0);
    const { events } = resolveBlock(s, hold("fuego", 2, 1), hold("fuego", 0), seeded(3));
    expect(events[0]!.attacker.turn).toBe(0);
    expect(events[0]!.distance).toBeLessThan(14 - 5);
  });

  it("embestir: solo con el enemigo a proa y al alcance", () => {
    const lateral = resolveBlock(
      place(duel(), 3, 90, 6),
      hold("embestir"),
      hold("fuego", 0),
      seeded(4),
    );
    expect(lateral.events[0]!.attacker.ram).toBeNull();
    const ahead = resolveBlock(
      place(duel(), 4, 0, 6),
      hold("embestir"),
      hold("fuego", 0),
      seeded(4),
    );
    expect(ahead.events[0]!.attacker.ram).not.toBeNull();
    expect(ahead.events[0]!.rangeAfter).toBe(0);
  });

  it("el salto disforme termina el duelo y pierde quien salta", () => {
    const s = newDuel(newSide("daemons", {}, 28, 28), newSide("tau", {}, 22, 22));
    const { state } = resolveBlock(s, hold("saltar"), hold("fuego"), seeded(5));
    expect(state.finished).toMatchObject({
      reason: "salto",
      winner: "defensor",
      jumped: "attacker",
    });
    expect(warpChance(s.attacker)).toBe(100);
  });

  it("salto de emergencia al bajar del umbral", () => {
    const s = place(duel(), 1, 0, 4);
    s.attacker.hull = 9;
    const { events } = resolveBlock(s, hold("fuego", 1, 0, 40), hold("fuego"), seeded(6));
    expect(events[0]!.attacker.action).toBe("saltar");
  });

  it("la nave destruida termina el duelo", () => {
    const s = place(duel(), 1, 0, 4);
    s.attacker.hull = 1;
    const { state } = resolveBlock(s, hold("fuego", 0), hold("fuego", 0), seeded(7));
    expect(state.finished?.reason).toBe("destruida");
  });

  it("el Segundo sugiere planes válidos y la IA termina duelos", () => {
    const s = newDuel(newSide("imperium", {}, 30, 30), newSide("orks", {}, 40, 40), seeded(8));
    for (const st of ["asalto", "optima", "defensiva"] as const) {
      const p = suggestPlan(s, "attacker", st);
      expect(p.phases).toHaveLength(5);
      expect(predictPath(s, "attacker", p.phases)).toHaveLength(5);
    }
    const rng = seeded(9);
    let st = s;
    while (!st.finished)
      st = resolveBlock(st, botPlan(st, "attacker", rng), botPlan(st, "defender", rng), rng).state;
    expect(st.finished).not.toBeNull();
  });

  it("los duelos antiguos sin posiciones se normalizan", () => {
    const s = duel() as DuelState & { attacker: { pos?: unknown } };
    delete (s.attacker as { pos?: unknown }).pos;
    const { events } = resolveBlock(s, hold(), hold(), seeded(10));
    expect(events.length).toBeGreaterThan(0);
  });
});
