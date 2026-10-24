import { describe, expect, it } from "vitest";
import { leadership, newDuel, newSide, resolveBlock, seeded } from "@/lib/naval2/engine";
import { botPlan } from "@/lib/naval2/bot";
import type { BlockPlan, ModuleLevels, RoundPlan } from "@/lib/naval2/types";

const mods: ModuleLevels = { baterias: 1, camara_escudos: 1, cubierta_abordaje: 1, motores_plasma: 1, lanza_proa: 1, blindaje_proa: 1, forja: 1, puente: 2, astropatico: 1 };
const rounds = (r: RoundPlan): BlockPlan => ({ rounds: [r, r, r], doctrine: "ataque" });
const hold: RoundPlan = { maneuver: "mantener", order: null, target: "capital" };

describe("combate naval v2", () => {
  it("es determinista con la misma semilla", () => {
    const run = () => {
      const rng = seeded(42);
      let s = newDuel(newSide("imperium", mods, 35, 35), newSide("orks", mods, 48, 48), rng);
      for (let i = 0; i < 6 && !s.finished; i++) s = resolveBlock(s, botPlan(s, "attacker", rng), botPlan(s, "defender", rng), rng).state;
      return s;
    };
    expect(run()).toEqual(run());
  });

  it("empieza en Lejos y acercarse reduce la distancia", () => {
    const rng = seeded(1);
    const s = newDuel(newSide("imperium", mods, 35, 35), newSide("votann", mods, 36, 36), rng);
    expect(s.range).toBe(3);
    const { events } = resolveBlock(s, rounds({ maneuver: "acercarse", order: null, target: "capital" }), rounds(hold), rng);
    expect(events[0]!.rangeAfter).toBe(2);
    expect(events[2]!.rangeAfter).toBe(0);
  });

  it("el más rápido gana la persecución", () => {
    const rng = seeded(2);
    const s = newDuel(newSide("necrons", mods, 40, 40), newSide("aeldari", mods, 30, 30), rng);
    s.range = 2;
    const { events } = resolveBlock(s, rounds({ maneuver: "acercarse", order: null, target: "capital" }), rounds({ maneuver: "romper", order: null, target: "capital" }), rng);
    expect(events[0]!.rangeAfter).toBe(3);
  });

  it("solo hay abordaje en Contacto (sin órdenes de facción)", () => {
    const rng = seeded(3);
    const s = newDuel(newSide("orks", mods, 48, 48), newSide("imperium", mods, 35, 35), rng);
    s.range = 2;
    const far = resolveBlock(s, rounds(hold), rounds(hold), rng);
    expect(far.events.every((e) => e.attacker.fired.boarding === 0)).toBe(true);
  });

  it("los demonios no pueden ser alcanzados en su primera ronda", () => {
    const rng = seeded(4);
    const s = newDuel(newSide("imperium", mods, 35, 35), newSide("daemons", mods, 32, 32), rng);
    s.range = 2;
    const { events } = resolveBlock(s, { rounds: [hold], doctrine: "ataque" }, { rounds: [hold], doctrine: "ataque" }, rng);
    expect(events[0]!.defender.received.hull).toBe(0);
  });

  it("romper contacto dos rondas en Lejos es una retirada", () => {
    const rng = seeded(5);
    const s = newDuel(newSide("aeldari", mods, 30, 30), newSide("necrons", mods, 40, 40), rng);
    const { state } = resolveBlock(s, rounds({ maneuver: "romper", order: null, target: "capital" }), rounds(hold), rng);
    expect(state.finished).toEqual({ winner: "defensor", reason: "retirada" });
  });

  it("el puente alcanzado baja el Liderazgo", () => {
    const side = newSide("imperium", mods, 35, 35);
    const before = leadership(side);
    side.crits.push("puente");
    expect(leadership(side)).toBe(before - 2);
  });
});
