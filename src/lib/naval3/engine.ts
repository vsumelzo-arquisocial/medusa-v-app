/**
 * Motor del combate naval v3 (docs/combate-naval-v3.md). Determinista con el RNG inyectado.
 * Naves capitales con posición, rumbo y arcos de fuego (proa, babor, estribor, popa).
 * Orden de cada fase: torpedos en vuelo → salto disforme → giros y movimiento (embestidas) → disparo → reparación.
 */
import type { FleetId } from "@/lib/ship-identity";
import {
  BAND_EDGES,
  EVASION_BONUS,
  FLEET_PROFILES,
  MAX_BLOCKS,
  MAX_DISTANCE,
  PHASES_PER_BLOCK,
  START_DISTANCE,
  TORPEDO_DAMAGE,
  type RangeTable,
} from "./factions";
import type {
  Action,
  Arc,
  BlockPlan,
  DuelState,
  Helm,
  ModuleLevels,
  PhaseEvent,
  PhasePlan,
  Range,
  Side,
  SidePhaseLog,
  SideState,
  Speed,
  Turn,
  Vec,
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
export const other = (s: Side): Side => (s === "attacker" ? "defender" : "attacker");
const SIDES = ["attacker", "defender"] as const;

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

// ───────────── Geometría ─────────────

export const norm8 = (h: number) => ((h % 8) + 8) % 8;
export const dirOf = (h: number): Vec => {
  const a = (norm8(h) * Math.PI) / 4;
  return { x: Math.sin(a), y: Math.cos(a) };
};
export const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);

/** Ángulo (grados, −180…180, positivo a estribor) al que `to` queda respecto a la proa de `from`. */
export function relBearing(from: SideState, to: Vec): number {
  const world = (Math.atan2(to.x - from.pos.x, to.y - from.pos.y) * 180) / Math.PI;
  let rel = world - norm8(from.heading) * 45;
  while (rel > 180) rel -= 360;
  while (rel <= -180) rel += 360;
  return rel;
}

export function bandOf(d: number): Range {
  return (d < BAND_EDGES[0] ? 0 : d < BAND_EDGES[1] ? 1 : d < BAND_EDGES[2] ? 2 : 3) as Range;
}

/** Peso de cada arco para un ángulo relativo (suman 1; transiciones suaves de 30°). */
export function arcWeights(rel: number): Record<Arc, number> {
  const d = Math.abs(rel);
  const proa = d <= 30 ? 1 : d >= 60 ? 0 : (60 - d) / 30;
  const popa = d >= 150 ? 1 : d <= 120 ? 0 : (d - 120) / 30;
  const side = 1 - proa - popa;
  return { proa, popa, estribor: rel > 0 ? side : 0, babor: rel < 0 ? side : 0 };
}

/** Arco principal (el de mayor peso). */
export function mainArc(rel: number): Arc {
  const w = arcWeights(rel);
  return (Object.keys(w) as Arc[]).reduce((a, b) => (w[b] > w[a] ? b : a));
}

// ───────────── Estadísticas ─────────────

function weaponTable(s: SideState, arc: Arc): RangeTable {
  const p = FLEET_PROFILES[s.fleet];
  const m = s.modules;
  const base = arc === "proa" ? p.prow : arc === "popa" ? p.stern : p.broadside;
  return base.map((v, r) => {
    if (v <= 0 && !(r === 0 && m.cubierta_abordaje)) return 0;
    let x = v;
    if (r === 0) x += m.cubierta_abordaje;
    if (arc !== "proa" && arc !== "popa" && (r === 1 || r === 2)) x += m.baterias;
    if (arc === "proa" && (r === 2 || r === 3)) x += m.lanza_proa;
    return x;
  }) as RangeTable;
}

export function stats(s: SideState) {
  const p = FLEET_PROFILES[s.fleet];
  const m = s.modules;
  return {
    speed: p.speed + Math.floor(m.motores_plasma / 2),
    burn: p.burn,
    agility: p.agility,
    shields: p.shields + m.camara_escudos,
    dodge: p.dodge,
    torpedoes: p.torpedoes,
    ram: p.ram + 2 * m.blindaje_proa,
    ramArmour: m.blindaje_proa,
    repair: 3 + m.forja,
    regen: p.regen,
    prowArmour: Math.max(0.5, p.prowArmour - 0.05 * m.blindaje_proa),
  };
}

/** Daño bruto (antes de defensas) de `s` contra un blanco en `rel` grados y banda `band`. */
export function rawFire(s: SideState, rel: number, band: Range): { value: number; arcs: Arc[] } {
  const p = FLEET_PROFILES[s.fleet];
  if (p.allArcs) return { value: weaponTable(s, "proa")[band], arcs: [mainArc(rel)] };
  const w = arcWeights(rel);
  let value = 0;
  const arcs: Arc[] = [];
  for (const arc of Object.keys(w) as Arc[]) {
    if (w[arc] <= 0) continue;
    const v = weaponTable(s, arc)[band] * w[arc];
    if (v > 0) {
      value += v;
      if (w[arc] >= 0.5) arcs.push(arc);
    }
  }
  return { value, arcs };
}

/** Multiplicador defensivo según el arco del blanco por el que llega el disparo. */
export function defenceFactor(target: SideState, relFromTarget: number): number {
  const p = FLEET_PROFILES[target.fleet];
  const w = arcWeights(relFromTarget);
  return (
    (w.proa * stats(target).prowArmour + (w.babor + w.estribor) + w.popa * p.sternWeakness) *
    (p.fireReduction ?? 1)
  );
}

export function fireDodgeFactor(fleet: FleetId) {
  return 1 - FLEET_PROFILES[fleet].dodge / 200;
}

/** Los escudos absorben hasta su valor, pero nunca más de la mitad del disparo. */
export function absorbed(shots: number, shields: number) {
  return Math.min(shields, Math.floor(shots / 2));
}

/** Daño esperado (tras defensas y escudos) de `a` contra `b` con las posiciones dadas. */
export function expectedHit(a: SideState, b: SideState, band?: Range): number {
  const d = dist(a.pos, b.pos);
  const r = band ?? bandOf(d);
  let raw = rawFire(a, relBearing(a, b.pos), r).value;
  raw *= defenceFactor(b, relBearing(b, a.pos));
  if (b.fleet === "aeldari" && r >= 2) raw *= 0.7;
  raw *= fireDodgeFactor(b.fleet);
  return Math.max(0, raw - absorbed(raw, stats(b).shields));
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

export function torpedoDodge(
  target: SideState,
  targetAction: Action,
  targetSpeed: Speed,
  shooter: FleetId,
  close: boolean,
): number {
  let d = FLEET_PROFILES[target.fleet].dodge;
  if (targetAction === "evasion") d += EVASION_BONUS;
  if (targetSpeed === 2) d += 10;
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

// ───────────── Movimiento ─────────────

/** Resuelve el timón: los giros fijos se recortan a la agilidad; las intenciones buscan el mejor giro. */
export function helmTurn(s: SideState, foePos: Vec, helm: Helm, cap: number): Turn {
  if (typeof helm === "number") return clamp(helm, -cap, cap) as Turn;
  let best: Turn = 0;
  let bestV = Infinity;
  for (let t = -cap; t <= cap; t++) {
    const rel = Math.abs(relBearing({ ...s, heading: s.heading + t }, foePos));
    const v = helm === "encarar" ? rel : helm === "huir" ? 180 - rel : Math.abs(rel - 90);
    if (v < bestV - 1e-6 || (Math.abs(v - bestV) < 1e-6 && Math.abs(t) < Math.abs(best))) {
      best = t as Turn;
      bestV = v;
    }
  }
  return best;
}

/** Normaliza velocidad y giro según la acción, la agilidad y la posición del enemigo. */
export function legalize(s: SideState, p: PhasePlan, foePos: Vec): { speed: Speed; turn: Turn } {
  if (p.action === "embestir") return { speed: 2, turn: 0 };
  if (p.action === "saltar") return { speed: 0, turn: 0 };
  const speed = p.speed;
  if (speed === 2) return { speed, turn: 0 };
  return { speed, turn: helmTurn(s, foePos, p.turn, maxTurn(s, speed)) };
}

export function maxTurn(s: SideState, speed: Speed): number {
  if (speed === 2) return 0;
  return Math.min(2, stats(s).agility + (speed === 0 ? 1 : 0));
}

export function unitsFor(s: SideState, speed: Speed): number {
  const st = stats(s);
  return speed === 0 ? 0.5 : speed === 1 ? st.speed : st.speed + st.burn;
}

/** Aplica giro y movimiento a las dos naves. Devuelve la distancia mínima durante el movimiento. */
export function moveBoth(
  a: SideState,
  d: SideState,
  pa: { speed: Speed; turn: Turn },
  pd: { speed: Speed; turn: Turn },
): number {
  a.heading = norm8(a.heading + pa.turn);
  d.heading = norm8(d.heading + pd.turn);
  const va = dirOf(a.heading);
  const vd = dirOf(d.heading);
  const ua = unitsFor(a, pa.speed);
  const ud = unitsFor(d, pd.speed);
  const a0 = { ...a.pos };
  const d0 = { ...d.pos };
  // Distancia mínima entre dos trayectorias lineales simultáneas.
  const rx = d0.x - a0.x;
  const ry = d0.y - a0.y;
  const wx = vd.x * ud - va.x * ua;
  const wy = vd.y * ud - va.y * ua;
  const ww = wx * wx + wy * wy;
  const t = ww > 1e-9 ? clamp(-(rx * wx + ry * wy) / ww, 0, 1) : 0;
  const minD = Math.hypot(rx + wx * t, ry + wy * t);
  a.pos = { x: a0.x + va.x * ua, y: a0.y + va.y * ua };
  d.pos = { x: d0.x + vd.x * ud, y: d0.y + vd.y * ud };
  separate(a, d);
  return minD;
}

/** Mantiene la distancia entre 0,8 y el máximo (más allá, los auspex siguen fijados). */
function separate(a: SideState, d: SideState) {
  const dd = dist(a.pos, d.pos);
  const target = clamp(dd, 0.8, MAX_DISTANCE);
  if (Math.abs(target - dd) < 1e-9) return;
  const mx = (a.pos.x + d.pos.x) / 2;
  const my = (a.pos.y + d.pos.y) / 2;
  const ux = dd > 1e-9 ? (d.pos.x - a.pos.x) / dd : 0;
  const uy = dd > 1e-9 ? (d.pos.y - a.pos.y) / dd : 1;
  a.pos = { x: mx - (ux * target) / 2, y: my - (uy * target) / 2 };
  d.pos = { x: mx + (ux * target) / 2, y: my + (uy * target) / 2 };
}

// ───────────── Estado ─────────────

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
    pos: { x: 0, y: 0 },
    heading: 0,
    torpedoesLoaded: true,
    torpedoesInFlight: 0,
    boarding: 0,
  };
}

/** Inicia el duelo: cara a cara a distancia larga, con algo de desvío aleatorio si se da un RNG. */
export function newDuel(attacker: SideState, defender: SideState, rng?: Rng): DuelState {
  const a = structuredClone(attacker);
  const d = structuredClone(defender);
  const off = rng ? Math.round((rng() * 2 - 1) * 4) : 0;
  a.pos = { x: 0, y: -START_DISTANCE / 2 };
  d.pos = { x: off, y: START_DISTANCE / 2 };
  a.heading = rng ? norm8(Math.floor(rng() * 3) - 1) : 0;
  d.heading = rng ? norm8(4 + Math.floor(rng() * 3) - 1) : 4;
  if (a.fleet === "genestealer") d.hull = Math.max(1, d.hull - 3);
  if (d.fleet === "genestealer") a.hull = Math.max(1, a.hull - 3);
  return { range: bandOf(dist(a.pos, d.pos)), phase: 0, attacker: a, defender: d, finished: null };
}

/** Duelos guardados antes de existir el rumbo: les da posiciones equivalentes a su banda. */
export function normalizeState(input: DuelState): DuelState {
  const s = structuredClone(input);
  if (!s.attacker.pos || !s.defender.pos) {
    const d = [1, 3.5, 7, 12][s.range] ?? 12;
    s.attacker.pos = { x: 0, y: -d / 2 };
    s.defender.pos = { x: 0, y: d / 2 };
    s.attacker.heading = 0;
    s.defender.heading = 4;
  }
  return s;
}

function emptyLog(p: PhasePlan, legal: { speed: Speed; turn: Turn }, s: SideState): SidePhaseLog {
  return {
    speed: legal.speed,
    turn: legal.turn,
    helm: p.turn,
    action: p.action,
    forced: null,
    arcs: [],
    hitArc: null,
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
    pos: s.pos,
    heading: s.heading,
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

const DEFAULT_PHASE: PhasePlan = { speed: 1, turn: 0, action: "fuego" };

/** Resuelve un bloque de fases. Devuelve el nuevo estado y el registro para la repetición. */
export function resolveBlock(
  input: DuelState,
  attackerPlan: BlockPlan,
  defenderPlan: BlockPlan,
  rng: Rng,
): { state: DuelState; events: PhaseEvent[] } {
  const s = normalizeState(input);
  const events: PhaseEvent[] = [];
  const plans: Record<Side, BlockPlan> = { attacker: attackerPlan, defender: defenderPlan };
  const emergency: Record<Side, boolean> = {
    attacker: belowThreshold(s.attacker, attackerPlan.emergencyJump),
    defender: belowThreshold(s.defender, defenderPlan.emergencyJump),
  };

  for (let i = 0; i < PHASES_PER_BLOCK && !s.finished; i++) {
    const rangeBefore = s.range;
    const before = {
      attacker: { pos: { ...s.attacker.pos }, heading: s.attacker.heading },
      defender: { pos: { ...s.defender.pos }, heading: s.defender.heading },
    };
    const logs = {} as Record<Side, SidePhaseLog>;
    const dmg: Record<Side, number> = { attacker: 0, defender: 0 };

    // 0. Órdenes efectivas
    for (const side of SIDES) {
      const plan = { ...(plans[side].phases[i] ?? DEFAULT_PHASE) };
      let forced: string | null = null;
      if (emergency[side] && plan.action !== "saltar") {
        plan.action = "saltar";
        forced = "Salto de emergencia: el casco bajó del umbral fijado.";
      } else if (plan.action === "torpedos" && !s[side].torpedoesLoaded) {
        plan.action = "recargar";
        forced = "Tubos vacíos: en lugar de lanzar, recarga.";
      }
      const legal = legalize(s[side], plan, s[other(side)].pos);
      logs[side] = emptyLog(plan, legal, s[side]);
      logs[side].forced = forced;
    }

    // 1. Torpedos en vuelo
    for (const side of SIDES) {
      const n = s[side].torpedoesInFlight;
      if (!n) continue;
      const target = other(side);
      const dodge = torpedoDodge(
        s[target],
        logs[target].action,
        logs[target].speed,
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
      closePhase(s, logs, events, rangeBefore, before);
      break;
    }

    // 2. Salto disforme
    const jumped: Side[] = [];
    for (const side of SIDES) {
      if (logs[side].action !== "saltar") continue;
      const chance = warpChance(s[side]);
      const success = rng() * 100 < chance;
      const damage = success ? 0 : 2 + Math.floor(rng() * 5);
      logs[side].warp = { chance, success, damage };
      if (success) jumped.push(side);
      else dmg[side] += damage;
    }
    applyDamage(s, dmg);
    if (jumped.length) {
      s.finished = {
        winner: jumped.length === 2 ? "empate" : jumped[0] === "attacker" ? "defensor" : "atacante",
        reason: "salto",
        destroyed: [],
        jumped: jumped[0]!,
      };
      closePhase(s, logs, events, rangeBefore, before);
      break;
    }
    if (checkDestroyed(s)) {
      closePhase(s, logs, events, rangeBefore, before);
      break;
    }

    // 3. Giros, movimiento y embestidas
    const prowBefore: Record<Side, number> = {
      attacker: Math.abs(
        relBearing(
          { ...s.attacker, heading: s.attacker.heading + logs.attacker.turn },
          s.defender.pos,
        ),
      ),
      defender: Math.abs(
        relBearing(
          { ...s.defender, heading: s.defender.heading + logs.defender.turn },
          s.attacker.pos,
        ),
      ),
    };
    const minD = moveBoth(s.attacker, s.defender, logs.attacker, logs.defender);
    let rammed = false;
    for (const side of SIDES) {
      if (logs[side].action !== "embestir") continue;
      const target = other(side);
      if (prowBefore[side] > 45 || minD > 2) {
        logs[side].action = "fuego";
        logs[side].forced =
          prowBefore[side] > 45
            ? "Embestida imposible: el enemigo no estaba a proa. Dispara en su lugar."
            : "Embestida fallida: no llegamos a alcanzarle. Dispara en su lugar.";
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
    if (rammed) {
      // Las naves quedan trabadas en Contacto.
      const dd = dist(s.attacker.pos, s.defender.pos);
      if (dd > 1) {
        const mx = (s.attacker.pos.x + s.defender.pos.x) / 2;
        const my = (s.attacker.pos.y + s.defender.pos.y) / 2;
        const ux = (s.defender.pos.x - s.attacker.pos.x) / dd;
        const uy = (s.defender.pos.y - s.attacker.pos.y) / dd;
        s.attacker.pos = { x: mx - ux / 2, y: my - uy / 2 };
        s.defender.pos = { x: mx + ux / 2, y: my + uy / 2 };
      }
    }
    s.range = bandOf(dist(s.attacker.pos, s.defender.pos));

    // 4. Disparo, lanzamiento y recarga (simultáneos)
    for (const side of SIDES) {
      const log = logs[side];
      const target = other(side);
      const own = s[side];
      const foe = s[target];
      const rel = relBearing(own, foe.pos);
      const relFoe = relBearing(foe, own.pos);
      if (log.action === "torpedos" && Math.abs(rel) > 45) {
        log.action = "fuego";
        log.forced =
          "El enemigo no está a proa: los tubos no pueden apuntar. Disparamos en su lugar.";
      }
      if (log.action === "fuego" || log.action === "recargar") {
        const p = FLEET_PROFILES[own.fleet];
        const f = rawFire(own, rel, s.range);
        let raw = f.value * (1 - p.variance + rng() * 2 * p.variance);
        if (log.action === "recargar") raw *= 0.5;
        if (log.speed === 2) raw *= 0.5;
        if (logs[target].action === "evasion") raw *= 0.5;
        raw *= defenceFactor(foe, relFoe);
        if (foe.fleet === "aeldari" && s.range >= 2) raw *= 0.7;
        raw *= fireDodgeFactor(foe.fleet);
        const shots = Math.round(raw);
        const dealt = shots - absorbed(shots, stats(foe).shields);
        log.arcs = f.arcs;
        log.hitArc = mainArc(relFoe);
        log.fireDealt = dealt;
        log.shieldsAbsorbed = shots - dealt;
        dmg[target] += dealt;
        if (s.range === 0 && dealt > 0) own.boarding += own.fleet === "drukhari" ? 2 : 1;
        if (log.action === "recargar") own.torpedoesLoaded = true;
      } else if (log.action === "torpedos") {
        const n = stats(own).torpedoes;
        log.torpedoesLaunched = n;
        log.arcs = ["proa"];
        own.torpedoesLoaded = false;
        if (s.range <= 1) {
          log.instantTorpedoes = true;
          const dodge = torpedoDodge(foe, logs[target].action, logs[target].speed, own.fleet, true);
          const r = rollTorpedoes(n, dodge, own.fleet, rng);
          log.torpedoesHit += r.hit;
          log.torpedoesDodged += r.dodged;
          dmg[target] += r.hit * TORPEDO_DAMAGE;
        } else own.torpedoesInFlight = n;
      }
    }
    applyDamage(s, dmg);
    if (checkDestroyed(s)) {
      closePhase(s, logs, events, rangeBefore, before);
      break;
    }

    // 5. Reparación y regeneración
    for (const side of SIDES) {
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

    closePhase(s, logs, events, rangeBefore, before);
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

function belowThreshold(s: SideState, pct: number) {
  return pct > 0 && s.hull > 0 && (s.hull * 100) / s.maxHull < pct;
}

function applyDamage(s: DuelState, dmg: Record<Side, number>) {
  for (const side of SIDES) {
    s[side].hull = Math.max(0, s[side].hull - dmg[side]);
    dmg[side] = 0;
  }
}

function checkDestroyed(s: DuelState): boolean {
  const destroyed = SIDES.filter((x) => s[x].hull <= 0);
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
  before: NonNullable<PhaseEvent["before"]>,
) {
  s.phase++;
  for (const side of SIDES) {
    logs[side].hullAfter = s[side].hull;
    logs[side].pos = { ...s[side].pos };
    logs[side].heading = s[side].heading;
  }
  const d = dist(s.attacker.pos, s.defender.pos);
  s.range = bandOf(d);
  events.push({
    phase: s.phase,
    rangeBefore,
    rangeAfter: s.range,
    distance: Math.round(d * 10) / 10,
    before,
    attacker: logs.attacker,
    defender: logs.defender,
  });
}
