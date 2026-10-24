/**
 * Motor del combate naval v3 (docs/combate-naval-v3.md). Determinista con el RNG inyectado.
 * Una nave capital por bando; bloques de 5 fases planificadas a ciegas.
 * Orden de cada fase: torpedos en vuelo → salto disforme → maniobra → embestidas y disparo → reparación.
 */
import type { FleetId } from "@/lib/ship-identity";
import {
  EVASION_BONUS,
  FLEET_PROFILES,
  MAX_BLOCKS,
  PHASES_PER_BLOCK,
  START_RANGE,
  TORPEDO_DAMAGE,
} from "./factions";
import type {
  Action,
  BlockPlan,
  DuelState,
  ModuleLevels,
  Move,
  PhaseEvent,
  Range,
  Side,
  SidePhaseLog,
  SideState,
} from "./types";

export type Rng = () => number;

export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clampRange = (v: number) => clamp(v, 0, 3) as Range;
export const other = (s: Side): Side => (s === "attacker" ? "defender" : "attacker");

export const EMPTY_MODULES: ModuleLevels = {
  baterias: 0,
  camara_escudos: 0,
  cubierta_abordaje: 0,
  motores_plasma: 0,
  lanza_proa: 0,
  blindaje_proa: 0,
  forja: 0,
  puente: 0,
  astropatico: 0,
};

/** Estadísticas efectivas de una nave con sus módulos. */
export function stats(s: SideState) {
  const p = FLEET_PROFILES[s.fleet];
  const m = s.modules;
  const fire = p.fire.map((base, r) => {
    let v = base;
    if (r === 0) v += m.cubierta_abordaje;
    if (r === 1 || r === 2) v += m.baterias;
    if (r === 2 || r === 3) v += m.lanza_proa;
    return v;
  }) as [number, number, number, number];
  return {
    speed: p.speed + Math.floor(m.motores_plasma / 2),
    fire,
    shields: p.shields + m.camara_escudos,
    dodge: p.dodge,
    torpedoes: p.torpedoes,
    ram: p.ram + 2 * m.blindaje_proa,
    ramArmour: m.blindaje_proa,
    repair: 3 + m.forja,
    regen: p.regen,
  };
}

/** Probabilidad (%) de que el salto disforme salga bien con el casco actual. */
export function warpChance(s: SideState): number {
  const p = FLEET_PROFILES[s.fleet];
  if (p.warp >= 100) return 100;
  const damage = 1 - s.hull / Math.max(1, s.maxHull);
  return Math.round(
    clamp(70 + 5 * s.modules.puente + 5 * s.modules.astropatico + p.warp - 40 * damage, 15, 95),
  );
}

/** Probabilidad (%) de esquivar un torpedo. */
export function torpedoDodge(
  target: SideState,
  targetAction: Action,
  targetMove: Move,
  shooter: FleetId,
  close: boolean,
): number {
  let d = FLEET_PROFILES[target.fleet].dodge;
  if (targetAction === "evasion") d += EVASION_BONUS;
  if (targetMove === 1) d += 10;
  if (shooter === "tau") d /= 2;
  if (close) d /= 2;
  return clamp(Math.round(d), 0, 85);
}

export function ramDodge(target: SideState, targetAction: Action): number {
  if (targetAction === "embestir") return 0;
  let d = FLEET_PROFILES[target.fleet].dodge;
  if (targetAction === "evasion") d += EVASION_BONUS;
  return clamp(d, 0, 85);
}

/** Distancia resultante de las dos maniobras: si tiran en sentidos opuestos gana la nave más rápida. */
export function nextRange(range: Range, a: Move, aSpeed: number, d: Move, dSpeed: number): Range {
  if (a === d) return clampRange(range + a + d);
  if (a + d !== 0) return clampRange(range + a + d);
  if (aSpeed === dSpeed) return range;
  return clampRange(range + (aSpeed > dSpeed ? a : d));
}

export function newSide(
  fleet: FleetId,
  modules: Partial<ModuleLevels>,
  hull: number,
  maxHull: number,
): SideState {
  return {
    fleet,
    modules: { ...EMPTY_MODULES, ...modules },
    hull: Math.max(1, Math.min(hull, maxHull)),
    maxHull,
    torpedoesLoaded: true,
    torpedoesInFlight: 0,
    boarding: 0,
  };
}

export function newDuel(attacker: SideState, defender: SideState): DuelState {
  const a = { ...attacker };
  const d = { ...defender };
  if (a.fleet === "genestealer") d.hull = Math.max(1, d.hull - 3);
  if (d.fleet === "genestealer") a.hull = Math.max(1, a.hull - 3);
  return { range: START_RANGE as Range, phase: 0, attacker: a, defender: d, finished: null };
}

function emptyLog(move: Move, action: Action): SidePhaseLog {
  return {
    move,
    action,
    forced: null,
    fireDealt: 0,
    shieldsAbsorbed: 0,
    torpedoesLaunched: 0,
    torpedoesHit: 0,
    torpedoesDodged: 0,
    instantTorpedoes: false,
    ram: null,
    warp: null,
    repaired: 0,
    regen: 0,
    hullAfter: 0,
  };
}

function rollTorpedoes(n: number, dodge: number, shooter: FleetId, rng: Rng) {
  let hit = 0;
  for (let i = 0; i < n; i++) {
    if (shooter === "orks" && rng() < 0.5) continue; // ¡Rokas que no explotan!
    if (rng() * 100 >= dodge) hit++;
  }
  return { hit, dodged: n - hit };
}

export const isPlayable = (s: DuelState) => !s.finished;

/** Resuelve un bloque de fases. Devuelve el nuevo estado y el registro para la repetición. */
export function resolveBlock(
  input: DuelState,
  attackerPlan: BlockPlan,
  defenderPlan: BlockPlan,
  rng: Rng,
): { state: DuelState; events: PhaseEvent[] } {
  const s: DuelState = structuredClone(input);
  const events: PhaseEvent[] = [];
  const plans: Record<Side, BlockPlan> = { attacker: attackerPlan, defender: defenderPlan };
  const emergency: Record<Side, boolean> = {
    attacker: belowThreshold(s.attacker, attackerPlan.emergencyJump),
    defender: belowThreshold(s.defender, defenderPlan.emergencyJump),
  };

  for (let i = 0; i < PHASES_PER_BLOCK && !s.finished; i++) {
    const rangeBefore = s.range;
    const logs = {} as Record<Side, SidePhaseLog>;
    const dmg: Record<Side, number> = { attacker: 0, defender: 0 };

    // 0. Acciones efectivas
    for (const side of ["attacker", "defender"] as const) {
      const plan = plans[side].phases[i] ?? { move: 0, action: "fuego" };
      let { move, action } = plan;
      let forced: string | null = null;
      if (emergency[side] && action !== "saltar") {
        action = "saltar";
        forced = "Salto de emergencia: el casco bajó del umbral fijado.";
      } else if (action === "torpedos" && !s[side].torpedoesLoaded) {
        action = "recargar";
        forced = "Tubos vacíos: en lugar de lanzar, recarga.";
      }
      if (action === "embestir") move = -1;
      logs[side] = emptyLog(move, action);
      logs[side].forced = forced;
    }

    // 1. Torpedos en vuelo de la fase anterior
    for (const side of ["attacker", "defender"] as const) {
      const n = s[side].torpedoesInFlight;
      if (!n) continue;
      const target = other(side);
      const dodge = torpedoDodge(
        s[target],
        logs[target].action,
        logs[target].move,
        s[side].fleet,
        false,
      );
      const r = rollTorpedoes(n, dodge, s[side].fleet, rng);
      logs[side].torpedoesHit += r.hit;
      logs[side].torpedoesDodged += r.dodged;
      dmg[target] += r.hit * TORPEDO_DAMAGE;
      s[side].torpedoesInFlight = 0;
    }
    applyDamage(s, dmg);
    if (checkDestroyed(s)) {
      closePhase(s, logs, events, rangeBefore);
      break;
    }

    // 2. Salto disforme (instantáneo, con riesgo)
    const jumped: Side[] = [];
    for (const side of ["attacker", "defender"] as const) {
      if (logs[side].action !== "saltar") continue;
      const chance = warpChance(s[side]);
      const success = rng() * 100 < chance;
      const damage = success ? 0 : 2 + Math.floor(rng() * 5);
      logs[side].warp = { chance, success, damage };
      if (success) jumped.push(side);
      else {
        dmg[side] += damage;
        logs[side].move = 0;
      }
    }
    applyDamage(s, dmg);
    if (jumped.length) {
      s.finished = {
        winner: jumped.length === 2 ? "empate" : jumped[0] === "attacker" ? "defensor" : "atacante",
        reason: "salto",
        destroyed: [],
        jumped: jumped[0]!,
      };
      closePhase(s, logs, events, rangeBefore);
      break;
    }
    if (checkDestroyed(s)) {
      closePhase(s, logs, events, rangeBefore);
      break;
    }

    // 3. Maniobra
    const sa = stats(s.attacker);
    const sd = stats(s.defender);
    s.range = nextRange(s.range, logs.attacker.move, sa.speed, logs.defender.move, sd.speed);

    // 4. Embestidas
    let rammed = false;
    for (const side of ["attacker", "defender"] as const) {
      if (logs[side].action !== "embestir") continue;
      const target = other(side);
      if (s.range > 1) {
        logs[side].action = "fuego";
        logs[side].forced =
          "Embestida imposible: el rival quedó fuera de alcance. Dispara en su lugar.";
        continue;
      }
      rammed = true;
      const own = stats(s[side]);
      const tgt = stats(s[target]);
      const hit = rng() * 100 >= ramDodge(s[target], logs[target].action);
      if (!hit) {
        logs[side].ram = { hit: false, dealt: 0, selfDamage: 0 };
        continue;
      }
      const dealt = Math.max(1, Math.round(own.ram * (0.8 + rng() * 0.4)) - tgt.ramArmour);
      const recoil = Math.max(
        0,
        Math.round(dealt * FLEET_PROFILES[s[side].fleet].ramRecoil) - own.ramArmour,
      );
      dmg[target] += dealt;
      dmg[side] += recoil;
      logs[side].ram = { hit: true, dealt, selfDamage: recoil };
    }
    if (rammed) s.range = 0;

    // 5. Disparo, lanzamiento y recarga (simultáneos)
    for (const side of ["attacker", "defender"] as const) {
      const log = logs[side];
      const target = other(side);
      const own = stats(s[side]);
      if (log.action === "fuego" || log.action === "recargar") {
        const p = FLEET_PROFILES[s[side].fleet];
        let raw = own.fire[s.range] * (1 - p.variance + rng() * 2 * p.variance);
        if (log.action === "recargar") raw *= 0.5;
        if (logs[target].action === "evasion") raw *= 0.5;
        if (s[target].fleet === "aeldari" && s.range >= 2) raw *= 0.7;
        raw *= fireDodgeFactor(s[target].fleet);
        const shots = Math.round(raw);
        const dealt = shots - absorbed(shots, stats(s[target]).shields);
        log.fireDealt = dealt;
        log.shieldsAbsorbed = shots - dealt;
        dmg[target] += dealt;
        if (s.range === 0 && dealt > 0) s[side].boarding += s[side].fleet === "drukhari" ? 2 : 1;
        if (log.action === "recargar") s[side].torpedoesLoaded = true;
      } else if (log.action === "torpedos") {
        log.torpedoesLaunched = own.torpedoes;
        s[side].torpedoesLoaded = false;
        if (s.range <= 1) {
          log.instantTorpedoes = true;
          const dodge = torpedoDodge(
            s[target],
            logs[target].action,
            logs[target].move,
            s[side].fleet,
            true,
          );
          const r = rollTorpedoes(own.torpedoes, dodge, s[side].fleet, rng);
          log.torpedoesHit += r.hit;
          log.torpedoesDodged += r.dodged;
          dmg[target] += r.hit * TORPEDO_DAMAGE;
        } else s[side].torpedoesInFlight = own.torpedoes;
      }
    }
    applyDamage(s, dmg);
    if (checkDestroyed(s)) {
      closePhase(s, logs, events, rangeBefore);
      break;
    }

    // 6. Reparación y regeneración
    for (const side of ["attacker", "defender"] as const) {
      const own = stats(s[side]);
      const before = s[side].hull;
      if (logs[side].action === "reparar")
        s[side].hull = Math.min(s[side].maxHull, s[side].hull + own.repair);
      logs[side].repaired = s[side].hull - before;
      const mid = s[side].hull;
      s[side].hull = Math.min(s[side].maxHull, s[side].hull + own.regen);
      logs[side].regen = s[side].hull - mid;
      emergency[side] = belowThreshold(s[side], plans[side].emergencyJump);
    }

    closePhase(s, logs, events, rangeBefore);
    if (!s.finished && s.phase >= MAX_BLOCKS * PHASES_PER_BLOCK) {
      const a = s.attacker.hull / s.attacker.maxHull;
      const d = s.defender.hull / s.defender.maxHull;
      s.finished = {
        winner: Math.abs(a - d) < 0.001 ? "empate" : a > d ? "atacante" : "defensor",
        reason: "tiempo",
        destroyed: [],
        jumped: null,
      };
    }
  }
  return { state: s, events };
}

/** Las naves esquivas reciben menos disparo: −1 % por cada 2 % de esquiva. */
export function fireDodgeFactor(fleet: FleetId) {
  return 1 - FLEET_PROFILES[fleet].dodge / 200;
}

/** Los escudos absorben hasta su valor, pero nunca más de la mitad del disparo. */
export function absorbed(shots: number, shields: number) {
  return Math.min(shields, Math.floor(shots / 2));
}

function belowThreshold(s: SideState, pct: number) {
  return pct > 0 && s.hull > 0 && (s.hull * 100) / s.maxHull < pct;
}

function applyDamage(s: DuelState, dmg: Record<Side, number>) {
  for (const side of ["attacker", "defender"] as const) {
    s[side].hull = Math.max(0, s[side].hull - dmg[side]);
    dmg[side] = 0;
  }
}

function checkDestroyed(s: DuelState): boolean {
  const destroyed = (["attacker", "defender"] as const).filter((x) => s[x].hull <= 0);
  if (!destroyed.length) return false;
  s.finished = {
    winner:
      destroyed.length === 2 ? "empate" : destroyed[0] === "attacker" ? "defensor" : "atacante",
    reason: "destruida",
    destroyed,
    jumped: null,
  };
  return true;
}

function closePhase(
  s: DuelState,
  logs: Record<Side, SidePhaseLog>,
  events: PhaseEvent[],
  rangeBefore: Range,
) {
  s.phase++;
  logs.attacker.hullAfter = s.attacker.hull;
  logs.defender.hullAfter = s.defender.hull;
  events.push({
    phase: s.phase,
    rangeBefore,
    rangeAfter: s.range,
    attacker: logs.attacker,
    defender: logs.defender,
  });
}
