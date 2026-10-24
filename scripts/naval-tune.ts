/** Ajuste automático del casco base por flota hasta acercar cada media al 50 %. Uso: bun scripts/naval-tune.ts [iter=8] [N=300] */
import { FLEETS, type FleetId } from "../src/lib/ship-identity";
import { FLEET_PROFILES } from "../src/lib/naval2/factions";
import { newDuel, newSide, resolveBlock, seeded } from "../src/lib/naval2/engine";
import { botPlan } from "../src/lib/naval2/bot";
import type { ModuleLevels, Squadron } from "../src/lib/naval2/types";

const ITER = Number(process.argv[2] ?? 8), N = Number(process.argv[3] ?? 300);
const fleets = Object.keys(FLEETS) as FleetId[];
const levels = [0, 1, 2, 3];
const esc: Squadron[][] = [[], [{ type: "fragatas", ships: 3 }, { type: "destructores", ships: 3 }]];
const mods = (l: number): ModuleLevels => ({ baterias: l, camara_escudos: l, cubierta_abordaje: l, motores_plasma: l, lanza_proa: l, blindaje_proa: l, forja: l, puente: l + 1, astropatico: l });

function avgs() {
  const w: Record<string, number> = Object.fromEntries(fleets.map((f) => [f, 0]));
  let g = 0;
  for (const a of fleets) for (const b of fleets) {
    if (a >= b) continue;
    for (let i = 0; i < N; i++) {
      const l = levels[i % 4]!, e = esc[(i >> 1) % 2]!, swap = i % 2 === 1;
      const atk = swap ? b : a, def = swap ? a : b, rng = seeded(i * 7919 + fleets.indexOf(a) * 131 + fleets.indexOf(b) * 17);
      const h = (f: FleetId) => FLEET_PROFILES[f].hull + 8 * l;
      let s = newDuel(newSide(atk, mods(l), h(atk), h(atk), e), newSide(def, mods(l), h(def), h(def), e), rng);
      for (let k = 0; k < 12 && !s.finished; k++) s = resolveBlock(s, botPlan(s, "attacker", rng), botPlan(s, "defender", rng), rng).state;
      const win = s.finished?.winner ?? (s.attacker.hull / s.attacker.maxHull > s.defender.hull / s.defender.maxHull ? "atacante" : "defensor");
      const atkPts = win === "atacante" ? 1 : win === "empate" ? 0.5 : 0;
      w[atk] += atkPts; w[def] += 1 - atkPts;
    }
    g++;
  }
  return Object.fromEntries(fleets.map((f) => [f, w[f]! / (N * (fleets.length - 1))]));
}
for (let it = 0; it < ITER; it++) {
  const a = avgs();
  console.log(`iter ${it}: ` + fleets.map((f) => `${f.slice(0, 5)} ${(a[f]! * 100).toFixed(0)}%/${FLEET_PROFILES[f].hull}`).join("  "));
  for (const f of fleets) FLEET_PROFILES[f].hull = Math.max(16, Math.min(70, Math.round(FLEET_PROFILES[f].hull + (0.5 - a[f]!) * 24)));
}
console.log("\nCascos finales: " + JSON.stringify(Object.fromEntries(fleets.map((f) => [f, FLEET_PROFILES[f].hull]))));
