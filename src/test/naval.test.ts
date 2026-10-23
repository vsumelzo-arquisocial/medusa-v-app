import { describe, expect, it } from "vitest";
import { BEATS, hullPercentage, isValidPlan, levelAfterCrit, lootFor } from "@/lib/naval";

describe("combate naval", () => {
  it("porcentaje de casco respecto al máximo real", () => {
    expect(hullPercentage(11, 22)).toBe(50);
    expect(hullPercentage(11, 30)).toBe(37);
    expect(hullPercentage(0, 22)).toBe(0);
    expect(hullPercentage(40, 30)).toBe(100);
    expect(hullPercentage(0, 0)).toBe(0);
  });
  it("matriz de 5: cada orden vence a 2 y pierde contra 2", () => {
    expect(BEATS).toEqual({ fuego: ["abordaje", "evasion"], escudos: ["fuego", "evasion"], abordaje: ["escudos", "lanza"], evasion: ["lanza", "abordaje"], lanza: ["escudos", "fuego"] });
    for (const o of Object.keys(BEATS) as (keyof typeof BEATS)[]) expect(Object.values(BEATS).filter((l) => l.includes(o)).length).toBe(2);
  });
  it("evasión 1 vez, 2 con Motores de plasma", () => {
    expect(isValidPlan(["evasion", "evasion", "fuego","fuego","escudos"])).toBe(false);
    expect(isValidPlan(["evasion", "evasion", "fuego","fuego","escudos"], 1)).toBe(true);
    expect(isValidPlan(["evasion", "evasion", "evasion","fuego","escudos"], 3)).toBe(false);
    expect(isValidPlan(["evasion", "evasion", "evasion","fuego","escudos"], 1,'aeldari')).toBe(true);
  });
  it("lanza solo una vez y cinco órdenes", () => {
    expect(isValidPlan(["lanza", "lanza", "fuego","fuego","escudos"])).toBe(false);
    expect(isValidPlan(["fuego", "escudos"])).toBe(false);
    expect(isValidPlan(["lanza", "fuego", "abordaje","fuego","escudos"])).toBe(true);
  });
  it("botín 10-20 % con tope 600", () => {
    expect(lootFor(1000, 0)).toBe(100);
    expect(lootFor(1000, 5)).toBe(200);
    expect(lootFor(10000, 2)).toBe(600);
  });
  it("el Puente nunca baja de nivel 1", () => {
    expect(levelAfterCrit("puente", 1, true)).toBe(1);
    expect(levelAfterCrit("puente", 3, true)).toBe(2);
  });
});

import { upgradedHits } from "@/lib/naval";
describe("mejoras navales", () => {
  const none = { orderLvl: 0, shieldLvl: 0, engineLvl: 0, armourLvl: 0 };
  it("la orden ganadora suma 2 + nivel de su módulo", () => {
    expect(upgradedHits(4, "fuego", "abordaje", 2, none)).toBe(8);
  });
  it("la orden perdedora queda a la mitad y el rival amortigua (nivel+1)/2", () => {
    expect(upgradedHits(4, "abordaje", "fuego", 0, { ...none, orderLvl: 3 })).toBe(0);
    expect(upgradedHits(6, "abordaje", "fuego", 0, none)).toBe(3);
  });
  it("la evasión esquiva por completo la Lanza", () => {
    expect(upgradedHits(5, "lanza", "evasion", 3, none)).toBe(0);
  });
  it("la Lanza ignora la Cámara de escudos", () => {
    expect(upgradedHits(3, "lanza", "escudos", 0, { ...none, shieldLvl: 3 })).toBe(5);
  });
  it("Blindaje de proa resta impactos sin bajar de 0", () => {
    expect(upgradedHits(2, "lanza", "lanza", 0, { ...none, armourLvl: 3 })).toBe(0);
  });
  it("Cubierta de abordaje sube el tope de botín 5 % por nivel", () => {
    expect(lootFor(1000, 6, 2)).toBe(300);
    expect(lootFor(1000, 6, 0)).toBe(200);
  });
});
