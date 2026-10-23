import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, score, type PlayerStats } from "@/lib/achievements";
import { HONOURS } from "@/lib/honours";

const zero: PlayerStats = { battles: 0, wins: 0, losses: 0, draws: 0, renown: 0, regions: 0, spaceport: false, conquestWins: 0, bigBattles: 0, enginesDestroyed: 0, bestMargin: 0, honoursUsed: 0 };

describe("ranking score", () => {
  it("is zero for a new player", () => expect(score(zero)).toBe(0));
  it("one win in one battle = 10 + 3 + bautismo 10 + primera victoria 10", () => expect(score({ ...zero, battles: 1, wins: 1 })).toBe(33));
  it("regions add 5 each plus renown", () => expect(score({ ...zero, regions: 2, renown: 4 })).toBe(14));
});

describe("honours", () => {
  it("shield recharge costs 20 renown and is titan-only", () => {
    const h = HONOURS.find((x) => x.id === "recarga_escudos")!;
    expect(h.cost).toBe(20);
    expect(h.kinds).toEqual(["titan"]);
  });
});

describe("logros navales", () => {
  const z = { battles: 0, wins: 0, losses: 0, draws: 0, renown: 0, regions: 0, spaceport: false, conquestWins: 0, bigBattles: 0, enginesDestroyed: 0, bestMargin: 0, honoursUsed: 0 };
  const has = (id: string, s: object) => ACHIEVEMENTS.find((a) => a.id === id)!.done({ ...z, ...s });
  it("Corsario del vacío al ganar un asalto", () => { expect(has("corsario", { raidsWon: 1 })).toBe(true); expect(has("corsario", {})).toBe(false); });
  it("Muro de acero al rechazar un asalto", () => { expect(has("muro", { defensesWon: 1 })).toBe(true); expect(has("muro", { raidsWon: 3 })).toBe(false); });
});
