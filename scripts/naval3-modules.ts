/** Valor de cada módulo de combate a nivel 3: % de victorias contra la misma flota sin módulos. */
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
const MODS = [
  "baterias",
  "lanza_proa",
  "blindaje_proa",
  "camara_escudos",
  "motores_plasma",
  "cubierta_abordaje",
  "casco",
  "puente",
] as const;
const fleets = Object.keys(FLEET_PROFILES) as FleetId[];
const N = Number(process.argv[2] ?? 60);
const rng = seeded(777);
for (const m of MODS) {
  let w = 0,
    n = 0;
  for (const f of fleets)
    for (let i = 0; i < N; i++) {
      const extra = m === "casco" ? 24 : m === "puente" ? 20 : 0;
      const mods = m === "casco" || m === "puente" ? {} : { [m]: 3 };
      const up = newSide(f, mods, HULL[f] + extra, HULL[f] + extra);
      const base = newSide(f, {}, HULL[f], HULL[f]);
      const att = i % 2 === 0;
      let s = newDuel(att ? up : base, att ? base : up, rng);
      while (!s.finished)
        s = resolveBlock(s, botPlan(s, "attacker", rng), botPlan(s, "defender", rng), rng).state;
      const win =
        s.finished!.winner === "empate" ? 0.5 : (s.finished!.winner === "atacante") === att ? 1 : 0;
      w += win;
      n++;
    }
  console.log(m.padEnd(18), ((100 * w) / n).toFixed(0) + "%");
}
