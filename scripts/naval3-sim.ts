/** Simulación de equilibrio del combate naval v3: bot contra bot, todas las parejas. */
import { FLEET_PROFILES } from "../src/lib/naval3/factions";
import { newDuel, newSide, resolveBlock, seeded } from "../src/lib/naval3/engine";
import { botPlan } from "../src/lib/naval3/advisor";
import type { FleetId } from "../src/lib/ship-identity";

const HULL: Record<FleetId, number> = {
  imperium: 30,
  chaos: 30,
  tau: 22,
  aeldari: 24,
  drukhari: 22,
  orks: 40,
  daemons: 28,
  necrons: 34,
  tyranids: 36,
  votann: 36,
  genestealer: 28,
};
const fleets = Object.keys(FLEET_PROFILES) as FleetId[];
const N = Number(process.argv[2] ?? 400);
const rng = seeded(12345);
const total: Record<string, { w: number; n: number }> = {};
const reasons: Record<string, number> = {};
let phases = 0,
  games = 0,
  blocks = 0;
const matrix: Record<string, number> = {};
for (const a of fleets)
  for (const d of fleets) {
    let w = 0;
    for (let i = 0; i < N; i++) {
      let s = newDuel(newSide(a, {}, HULL[a], HULL[a]), newSide(d, {}, HULL[d], HULL[d]));
      while (!s.finished) {
        s = resolveBlock(s, botPlan(s, "attacker", rng), botPlan(s, "defender", rng), rng).state;
        blocks++;
      }
      const f = s.finished!;
      reasons[f.reason] = (reasons[f.reason] ?? 0) + 1;
      phases += s.phase;
      games++;
      const sc = f.winner === "atacante" ? 1 : f.winner === "empate" ? 0.5 : 0;
      w += sc;
      for (const [fl, v] of [
        [a, sc],
        [d, 1 - sc],
      ] as const) {
        total[fl] ??= { w: 0, n: 0 };
        total[fl].w += v;
        total[fl].n++;
      }
    }
    matrix[`${a}>${d}`] = w / N;
  }
console.log("Media por flota:");
for (const f of fleets)
  console.log(f.padEnd(12), ((100 * total[f]!.w) / total[f]!.n).toFixed(1) + "%");
console.log(
  "Desenlaces:",
  Object.fromEntries(
    Object.entries(reasons).map(([k, v]) => [k, ((100 * v) / games).toFixed(1) + "%"]),
  ),
  "fases medias",
  (phases / games).toFixed(1),
  "bloques medios",
  (blocks / games).toFixed(2),
);
const sym = fleets.flatMap((a) =>
  fleets
    .filter((d) => a < d)
    .map((d) => ({ k: `${a} vs ${d}`, v: (matrix[`${a}>${d}`]! + 1 - matrix[`${d}>${a}`]!) / 2 })),
);
sym.sort((x, y) => Math.abs(y.v - 0.5) - Math.abs(x.v - 0.5));
console.log("Parejas más desequilibradas:");
for (const x of sym.slice(0, 10)) console.log(x.k.padEnd(26), (100 * x.v).toFixed(0) + "%");
