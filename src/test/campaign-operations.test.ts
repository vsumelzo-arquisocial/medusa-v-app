import { describe, expect, it } from "vitest";
import { operationBlocked, type CampaignOperation } from "@/lib/campaign-operations";

const attack: CampaignOperation = { attacker_id: "me", kind: "attack", resolved_at: null };
const claim: CampaignOperation = { attacker_id: "me", kind: "claim", resolved_at: null };

describe("límites independientes de campaña", () => {
  it("un ataque pendiente a jugador no bloquea una toma neutral", () => {
    expect(operationBlocked([attack], "me", "claim")).toBe(false);
    expect(operationBlocked([attack], "me", "attack")).toBe(true);
  });
  it("una toma neutral no bloquea un ataque a jugador", () => {
    expect(operationBlocked([claim], "me", "attack")).toBe(false);
    expect(operationBlocked([claim], "me", "claim")).toBe(true);
  });
  it("permite una operación de cada tipo, no dos del mismo", () => {
    expect(operationBlocked([attack, claim], "me", "attack")).toBe(true);
    expect(operationBlocked([attack, claim], "me", "claim")).toBe(true);
  });
  it("una operación resuelta libera solo su límite", () => {
    expect(operationBlocked([attack, { ...claim, resolved_at: "2026-10-18T20:00:00Z" }], "me", "claim")).toBe(false);
    expect(operationBlocked([attack, { ...claim, resolved_at: "2026-10-18T20:00:00Z" }], "me", "attack")).toBe(true);
  });
  it("las operaciones de otros jugadores no consumen tus límites", () => {
    expect(operationBlocked([{ ...attack, attacker_id: "other" }, { ...claim, attacker_id: "other" }], "me", "claim")).toBe(false);
    expect(operationBlocked([{ ...attack, attacker_id: "other" }], "me", "attack")).toBe(false);
  });
});