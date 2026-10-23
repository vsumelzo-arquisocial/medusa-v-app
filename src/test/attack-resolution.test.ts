import { describe, expect, it } from "vitest";
import { consentState, type AttackConsent } from "@/lib/attack-resolution";

const attack: AttackConsent = { attacker_id: "attacker", defender_id: "defender", kind: "attack", resolved_at: null, auto_attacker_confirmed: false, auto_defender_confirmed: false };
describe("resolución consensuada", () => {
  it("atacante y defensor pueden proponer", () => {
    expect(consentState(attack, "attacker", false).eligible).toBe(true);
    expect(consentState(attack, "defender", false).eligible).toBe(true);
    expect(consentState(attack, "outsider", false).eligible).toBe(false);
  });
  it("requiere las dos confirmaciones", () => {
    expect(consentState({ ...attack, auto_attacker_confirmed: true }, "attacker", false).ready).toBe(false);
    expect(consentState({ ...attack, auto_defender_confirmed: true }, "defender", false).ready).toBe(false);
    expect(consentState({ ...attack, auto_attacker_confirmed: true, auto_defender_confirmed: true }, "attacker", false).ready).toBe(true);
  });
  it("excluye la región inicial para ambos jugadores", () => {
    expect(consentState(attack, "attacker", true).eligible).toBe(false);
    expect(consentState(attack, "defender", true).eligible).toBe(false);
  });
  it("no permite resolver tomas neutrales ni ataques resueltos", () => {
    expect(consentState({ ...attack, kind: "claim", defender_id: null }, "attacker", false).eligible).toBe(false);
    expect(consentState({ ...attack, resolved_at: "2026-10-18" }, "attacker", false).eligible).toBe(false);
  });
});