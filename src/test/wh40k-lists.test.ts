import { describe, expect, it } from "vitest";
import points from "@/data/warhammer40k/points.json";
import { importRoster, exportRoster, missingRecruits, priceRoster, validateRoster, type FactionPoints, type Roster } from "@/lib/wh40k-lists";

const tau = (points as unknown as { factions: Record<string, FactionPoints> }).factions["tau-empire"]!;
const u = (name: string, models: number, extra = {}) => ({ id: Math.random().toString(36), name, models, ...extra });

describe("listas de 40k", () => {
  it("la tercera unidad de Broadsides cuesta más (75 → 95)", () => {
    const r: Roster = { detachments: [], units: [u("BROADSIDE BATTLESUITS", 1), u("BROADSIDE BATTLESUITS", 1), u("BROADSIDE BATTLESUITS", 1)] };
    expect(priceRoster(r, tau).map((p) => p.total)).toEqual([75, 75, 95]);
  });
  it("Incursión: máximo 2 DP, salvo un único destacamento de 3 DP", () => {
    const base = { units: [u("CADRE FIREBLADE", 1, { warlord: true })] };
    expect(validateRoster({ ...base, detachments: ["KAUYON", "AUXILIARY CADRE"] }, tau, 1000).some((e) => e.includes("DP"))).toBe(true);
    expect(validateRoster({ ...base, detachments: ["MONT’KA"] }, tau, 1000)).toEqual([]);
  });
  it("Incursión: máximo 2 copias de la misma unidad; Línea de batalla el doble", () => {
    const three = (role?: string) => ({ detachments: ["KAUYON"], units: [u("CADRE FIREBLADE", 1, { warlord: true }), ...[1, 2, 3].map(() => u("BREACHER TEAM", 10, role ? { role } : {}))] });
    expect(validateRoster(three() as Roster, tau, 1000).some((e) => e.includes("BREACHER"))).toBe(true);
    expect(validateRoster(three("battleline") as Roster, tau, 1000)).toEqual([]);
  });
  it("no se puede pasar de puntos", () => {
    const r: Roster = { detachments: ["KAUYON"], units: [u("TIGER SHARK", 1, { warlord: true }), u("TIGER SHARK", 1), u("TIGER SHARK", 1)] };
    expect(validateRoster(r, tau, 1000).some((e) => e.includes("puntos"))).toBe(true);
  });
  it("las listas de reclutamiento detectan unidades no reclutadas", () => {
    const r: Roster = { detachments: [], units: [u("BREACHER TEAM", 10), u("BREACHER TEAM", 10)] };
    expect(missingRecruits(r, [{ unit_name: "BREACHER TEAM", models: 10, quantity: 1 }])).toEqual([{ name: "BREACHER TEAM", models: 10, need: 2, have: 1 }]);
  });
  it("importa el texto de la app oficial y lo vuelve a exportar", () => {
    const text = `Cazadores (230 Points)\n\nT'au Empire\nKauyon\nStrike Force (2000 Points)\n\nCHARACTERS\n\nCadre Fireblade (50 Points)\n  • Warlord\n  • 1x Pulse rifle\n\nBATTLELINE\n\nBreacher Team (80 Points)\n  • 9x Breacher Team Shas'la\n  • 1x Breacher Team Shas'ui\n\nBroadside Battlesuits (150 Points)\n  • 2x Broadside Shas'ui\n`;
    const r = importRoster(text, tau);
    expect(r.name).toBe("Cazadores");
    expect(r.points).toBe(2000);
    expect(r.roster.detachments).toEqual(["KAUYON"]);
    expect(r.roster.units.map((x) => [x.name, x.models])).toEqual([["CADRE FIREBLADE", 1], ["BREACHER TEAM", 10], ["BROADSIDE BATTLESUITS", 2]]);
    expect(r.roster.units[0]?.warlord).toBe(true);
    const again = importRoster(exportRoster("Cazadores", "T'au Empire", 2000, r.roster, tau), tau);
    expect(again.roster.units.map((x) => [x.name, x.models])).toEqual(r.roster.units.map((x) => [x.name, x.models]));
  });
});
