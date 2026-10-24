/** Una flota contra todas (rápido, para ajustar). */
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
const me = process.argv[2] as FleetId;
const N = Number(process.argv[3] ?? 40);
const rng = seeded(99);
let tot = 0,
  n = 0;
const per: string[] = [];
for (const o of Object.keys(FLEET_PROFILES) as FleetId[]) {
  if (o === me) continue;
  let w = 0;
  for (let i = 0; i < N; i++)
    for (const meAtt of [true, false]) {
      const [a, d] = meAtt ? [me, o] : [o, me];
      let s = newDuel(newSide(a, {}, HULL[a], HULL[a]), newSide(d, {}, HULL[d], HULL[d]), rng);
      while (!s.finished)
        s = resolveBlock(s, botPlan(s, "attacker", rng), botPlan(s, "defender", rng), rng).state;
      const win =
        s.finished!.winner === "empate"
          ? 0.5
          : (s.finished!.winner === "atacante") === meAtt
            ? 1
            : 0;
      w += win;
    }
  per.push(`${o}:${Math.round((50 * w) / N)}`);
  tot += w;
  n += 2 * N;
}
console.log(me, ((100 * tot) / n).toFixed(1) + "%", per.join(" "));
