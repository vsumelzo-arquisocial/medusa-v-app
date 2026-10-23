import { describe, expect, it } from "vitest";
import { canPrepareBattle } from "@/lib/battle-start";

describe("inicio de partidas", () => {
  it("permite preparar un ataque planetario abierto con ambos participantes", () => {
    expect(canPrepareBattle({ status: "abierta", opponent_id: "defender", region_id: 42 })).toBe(true);
  });
  it("no permite iniciar desafíos sin aceptar ni encuentros sin rival", () => {
    expect(canPrepareBattle({ status: "abierta", opponent_id: "defender", region_id: null })).toBe(false);
    expect(canPrepareBattle({ status: "abierta", opponent_id: null, region_id: 42 })).toBe(false);
  });
  it("permite los aceptados pero no los terminados o cancelados", () => {
    expect(canPrepareBattle({ status: "aceptada", opponent_id: "defender", region_id: null })).toBe(true);
    for (const status of ["finalizada", "cancelada", "en_curso"]) {
      expect(canPrepareBattle({ status, opponent_id: "defender", region_id: 42 })).toBe(false);
    }
  });
});