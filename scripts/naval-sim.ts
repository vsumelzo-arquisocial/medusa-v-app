/**
 * Simulador de equilibrio del combate naval v2.
 * Uso: bun scripts/naval-sim.ts [duelos-por-par=2000] [nivel-módulos=1] [escoltas=0|1]
 * Imprime la matriz de victorias (fila contra columna) y el resumen por flota.
 */
import { FLEETS, type FleetId } from "../src/lib/ship-identity";
import { FLEET_PROFILES } from "../src/lib/naval2/factions";
import { newDuel, newSide, resolveBlock, seeded } from "../src/lib/naval2/engine";
import { botPlan } from "../src/lib/naval2/bot";
import type { ModuleLevels, Squadron } from "../src/lib/naval2/types";

const N = Number(process.argv[2] ?? 2000);
const LVL = Number(process.argv[3] ?? 1);
const ESCORTS = process.argv[4] === "1";
const MAX_BLOCKS = 12;

const fleets = Object.keys(FLEETS) as FleetId[];
const modules: ModuleLevels = {
  baterias: LVL, camara_escudos: LVL, cubierta_abordaje: LVL, motores_plasma: LVL, lanza_proa: LVL, blindaje_proa: LVL,
  forja: LVL, puente: LVL + 1, astropatico: LVL,
};
const escorts: Squadron[] = ESCORTS ? [{ type: "fragatas", ships: 3 }, { type: "destructores", ships: 3 }] : [];
const hullOf = (f: FleetId) => FLEET_PROFILES[f].hull + 8 * LVL;

function duel(a: FleetId, d: FleetId, seed: number) {
  const rng = seeded(seed);
  let state = newDuel(newSide(a, modules, hullOf(a), hullOf(a), escorts), newSide(d, modules, hullOf(d), hullOf(d), escorts), rng);
  let blocks = 0;
  while (!state.finished && blocks < MAX_BLOCKS) {
    state = resolveBlock(state, botPlan(state, "attacker", rng), botPlan(state, "defender", rng), rng).state;
    blocks++;
  }
  if (!state.finished) {
    // Sin resolución: gana quien conserve más casco proporcional.
    const pa = state.attacker.hull / state.attacker.maxHull;
    const pd = state.defender.hull / state.defender.maxHull;
    return { winner: pa > pd ? "atacante" : pd > pa ? "defensor" : "empate", rounds: state.round, timeout: true };
  }
  return { winner: state.finished.winner, rounds: state.round, timeout: false };
}

const wins: Record<string, Record<string, number>> = {};
let totalRounds = 0;
let timeouts = 0;
let games = 0;
for (const a of fleets) {
  wins[a] = {};
  for (const b of fleets) {
    let w = 0;
    for (let i = 0; i < N; i++) {
      // Alterna quién ataca para no sesgar.
      const swap = i % 2 === 1;
      const r = duel(swap ? b : a, swap ? a : b, i * 7919 + fleets.indexOf(a) * 131 + fleets.indexOf(b));
      const aWon = swap ? r.winner === "defensor" : r.winner === "atacante";
      if (aWon) w += 1;
      else if (r.winner === "empate") w += 0.5;
      totalRounds += r.rounds;
      if (r.timeout) timeouts++;
      games++;
    }
    wins[a]![b] = w / N;
  }
}

const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
console.log(`\nMatriz de victorias (fila vs columna) · ${N} duelos por par · módulos nivel ${LVL} · escoltas ${ESCORTS ? "sí" : "no"}\n`);
console.log(pad("", 12) + fleets.map((f) => pad(f.slice(0, 6), 7)).join(""));
for (const a of fleets) console.log(pad(a, 12) + fleets.map((b) => pad(a === b ? "  —" : (wins[a]![b]! * 100).toFixed(0).padStart(4), 7)).join(""));
console.log("\nMedia por flota (contra todas las demás):");
const avg = fleets.map((a) => ({ a, v: fleets.filter((b) => b !== a).reduce((s, b) => s + wins[a]![b]!, 0) / (fleets.length - 1) })).sort((x, y) => y.v - x.v);
for (const { a, v } of avg) console.log(`  ${pad(a, 12)} ${(v * 100).toFixed(1)} %`);
const worst = fleets.flatMap((a) => fleets.filter((b) => b !== a).map((b) => ({ a, b, v: wins[a]![b]! }))).sort((x, y) => y.v - x.v)[0]!;
console.log(`\nEnfrentamiento más desigual: ${worst.a} vence a ${worst.b} el ${(worst.v * 100).toFixed(0)} %`);
console.log(`Rondas medias por duelo: ${(totalRounds / games).toFixed(1)} · sin resolver en ${MAX_BLOCKS} bloques: ${((timeouts / games) * 100).toFixed(1)} %\n`);
