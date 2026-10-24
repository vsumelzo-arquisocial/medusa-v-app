/**
 * Motor del combate naval v2 (docs/combate-naval-v2.md).
 * Funciones puras y deterministas a partir de un generador aleatorio inyectado:
 * el servidor usa uno seguro y el simulador uno con semilla.
 */
import type { FleetId } from "@/lib/ship-identity";
import { ESCORT_PROFILES, FLEET_PROFILES, SHIPS_PER_SQUADRON } from "./factions";
import type {
  BlockPlan,
  Crit,
  DuelState,
  Maneuver,
  ModuleLevels,
  Range,
  RoundEvent,
  RoundPlan,
  Side,
  SideRoundLog,
  SideState,
  Squadron,
} from "./types";

export type Rng = () => number;

/** Generador con semilla (mulberry32) para simulaciones y tests reproducibles. */
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

const d6 = (rng: Rng) => 1 + Math.floor(rng() * 6);
const CRITS: Crit[] = ["motores", "baterias", "lanza", "incendio", "puente", "escudos"];

/** Tira n dados contra un objetivo; devuelve impactos y seises naturales entre ellos. */
function roll(rng: Rng, n: number, target: number, reroll = false) {
  let hits = 0;
  let sixes = 0;
  for (let i = 0; i < Math.max(0, Math.floor(n)); i++) {
    let r = d6(rng);
    if (r < target && reroll) r = d6(rng);
    if (r >= target) hits++;
    if (r === 6) sixes++;
  }
  return { hits, sixes };
}

export function leadership(s: SideState) {
  const base = 6 + Math.floor(s.modules.puente / 2) + (s.modules.astropatico >= 2 ? 1 : 0);
  return Math.min(10, base) - (s.crits.includes("puente") ? 2 : 0);
}

/** Atributos efectivos de la capital con módulos y críticos. */
export function effectiveStats(s: SideState) {
  const p = FLEET_PROFILES[s.fleet];
  const m = s.modules;
  return {
    speed: p.speed + (m.motores_plasma >= 2 ? 1 : 0),
    // Generador de escudos: +1 a niveles 1 y 3 (+1 solo a nivel 2-3 en flotas sin escudos de vacío).
    shields: s.crits.includes("escudos") ? 0 : Math.max(0, p.shields + (p.shields > 0 ? Math.ceil(m.camara_escudos / 2) : Math.floor(m.camara_escudos / 2)) - (s.shieldsOverloaded ? 1 : 0)),
    armourFront: p.armourFront,
    armourSide: p.armourSide,
    batteries: p.batteries + 2 * m.baterias,
    lances: s.crits.includes("lanza") ? 0 : p.lances + m.lanza_proa,
    torpedoes: p.torpedoes,
    turrets: p.turrets + s.escorts.filter((e) => e.type === "piquetes").reduce((n, e) => n + e.ships, 0),
    boarding: p.boarding + m.cubierta_abordaje,
    frontReduction: m.blindaje_proa,
  };
}

export function newSide(fleet: FleetId, modules: ModuleLevels, hull: number, maxHull: number, escorts: Squadron[] = []): SideState {
  return {
    fleet,
    modules,
    hull,
    maxHull,
    crits: [],
    torpedoesLoaded: FLEET_PROFILES[fleet].torpedoes > 0 || escorts.some((e) => e.type === "destructores"),
    torpedoesInFlight: 0,
    shieldsOverloaded: false,
    escorts: escorts.map((e) => ({ ...e })),
    disengage: 0,
    lastManeuver: "mantener",
    usedOncePerDuel: false,
    boardingHits: 0,
  };
}

/** Estado inicial: empieza en Lejos; la infiltración genestealer aplica su crítico. */
export function newDuel(attacker: SideState, defender: SideState, rng: Rng): DuelState {
  const duel: DuelState = { range: 3, round: 0, attacker: clone(attacker), defender: clone(defender), finished: null };
  for (const [own, foe] of [
    [duel.attacker, duel.defender],
    [duel.defender, duel.attacker],
  ] as const) {
    if (own.fleet === "genestealer") addCrit(foe, CRITS[Math.floor(rng() * CRITS.length)]!);
  }
  return duel;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function addCrit(s: SideState, c: Crit) {
  if (!s.crits.includes(c)) s.crits.push(c);
}

const clampRange = (r: number): Range => Math.max(0, Math.min(3, r)) as Range;
const moveOf = (m: Maneuver) => (m === "acercarse" ? -1 : m === "romper" ? 1 : 0);

/** Maniobra que acerca a la distancia deseada dada la del rival (velas solares). */
function reactiveManeuver(range: Range, want: Range): Maneuver {
  if (want < range) return "acercarse";
  if (want > range) return "romper";
  return "flanquear";
}

interface Intent {
  plan: RoundPlan;
  passed: boolean | null;
  maneuver: Maneuver;
  halfBatteries: boolean;
  halfAll: boolean;
  reroll: boolean;
  brace: boolean;
  faction: boolean;
}

function decide(s: SideState, plan: RoundPlan, rng: Rng): Intent {
  const it: Intent = { plan, passed: null, maneuver: plan.maneuver, halfBatteries: false, halfAll: false, reroll: false, brace: false, faction: false };
  if (plan.order) {
    const ld = leadership(s);
    let ok = d6(rng) + d6(rng) <= ld;
    if (!ok && plan.order === "faccion" && s.fleet === "chaos") ok = d6(rng) + d6(rng) <= ld;
    // Una sola vez por duelo: la Grieta disforme.
    if (ok && plan.order === "faccion" && s.fleet === "daemons" && s.usedOncePerDuel) ok = false;
    it.passed = ok;
    if (ok) {
      switch (plan.order) {
        case "fijar_blanco":
          it.reroll = true;
          break;
        case "avante_toda":
        case "nuevo_rumbo":
        case "control_danos":
          it.halfBatteries = true;
          break;
        case "prepararse":
          it.brace = true;
          it.halfAll = true;
          break;
        case "faccion":
          it.faction = true;
          break;
        default:
          break;
      }
    } else if (s.fleet === "tyranids") {
      // Instinto: sin control sináptico repite la maniobra anterior.
      it.maneuver = s.lastManeuver;
    }
  }
  if (s.crits.includes("motores")) {
    if (it.maneuver === "acercarse") it.maneuver = "mantener";
    if (plan.order === "avante_toda") it.halfBatteries = false;
  }
  return it;
}

function emptyLog(it: Intent): SideRoundLog {
  return {
    maneuver: it.maneuver,
    order: it.plan.order,
    orderPassed: it.passed,
    flank: false,
    fired: { batteries: 0, lances: 0, torpedoesLaunched: 0, boarding: 0, ram: 0 },
    received: { absorbed: 0, saved: 0, hull: 0, escortsLost: 0, torpedoesIntercepted: 0 },
    newCrits: [],
    repaired: [],
    hullAfter: 0,
  };
}

/** Ataque saliente de un bando en una ronda, antes de defensas. */
interface Volley {
  batteryHits: number;
  batterySixes: number;
  lanceHits: number;
  lanceSixes: number;
  boardingHits: number;
  boardingSixes: number;
  ram: number;
  escortBatteryHits: number;
}

function step(duel: DuelState, planA: RoundPlan, planD: RoundPlan, doctrineA: BlockPlan["doctrine"], doctrineD: BlockPlan["doctrine"], rng: Rng): RoundEvent {
  const A = duel.attacker;
  const D = duel.defender;
  duel.round += 1;
  const firstRound = duel.round === 1;
  const rangeBefore = duel.range;

  // El colapso de escudos dura una ronda completa.
  const shieldCritAtStart = { A: A.crits.includes("escudos"), D: D.crits.includes("escudos") };
  const iA = decide(A, planA, rng);
  const iD = decide(D, planD, rng);
  const logA = emptyLog(iA);
  const logD = emptyLog(iD);

  // ── Movimiento ──
  // Velas solares: el Aeldari reacciona a la maniobra rival.
  for (const [own, it] of [
    [A, iA],
    [D, iD],
  ] as const) {
    if (it.faction && own.fleet === "aeldari") it.maneuver = reactiveManeuver(duel.range, it.plan.preferredRange ?? FLEET_PROFILES.aeldari.idealRange);
  }
  const sA = effectiveStats(A);
  const sD = effectiveStats(D);
  const mult = (s: SideState, it: Intent) =>
    (it.passed && it.plan.order === "avante_toda" && !s.crits.includes("motores")) || (it.faction && s.fleet === "orks") ? 2 : 1;
  let mA = moveOf(iA.maneuver) * mult(A, iA);
  let mD = moveOf(iD.maneuver) * mult(D, iD);
  if (mA !== 0 && mD !== 0 && Math.sign(mA) !== Math.sign(mD)) {
    // Uno persigue y el otro huye: gana el más rápido.
    if (sA.speed > sD.speed) mD = 0;
    else if (sD.speed > sA.speed) mA = 0;
    else {
      mA = 0;
      mD = 0;
    }
  }
  let range = clampRange(duel.range + mA + mD);
  // Salto inercial y grieta disforme fijan la banda.
  for (const [own, it] of [
    [A, iA],
    [D, iD],
  ] as const) {
    if (!it.faction) continue;
    const want = it.plan.preferredRange ?? FLEET_PROFILES[own.fleet].idealRange;
    if (own.fleet === "necrons") range = clampRange(range + Math.max(-2, Math.min(2, want - range)));
    if (own.fleet === "daemons") {
      range = want;
      own.usedOncePerDuel = true;
    }
  }
  duel.range = range;

  // ── Flanco ──
  const flank = (own: Intent, foe: Intent, ownDoctrine: BlockPlan["doctrine"], ownSide: SideState) => {
    const foeEvades = foe.maneuver === "flanquear" || foe.maneuver === "romper";
    if (own.passed && own.plan.order === "nuevo_rumbo") return true;
    if (own.maneuver === "flanquear" && !foeEvades) return true;
    return ownDoctrine === "flanqueo" && ownSide.escorts.some((e) => e.ships > 0) && foe.maneuver !== "flanquear";
  };
  logA.flank = flank(iA, iD, doctrineA, A);
  logD.flank = flank(iD, iA, doctrineD, D);

  // ── Torpedos en vuelo (lanzados la ronda anterior) ──
  const torpedoHits = (incoming: number, target: SideState, tgtStats: ReturnType<typeof effectiveStats>, guided: boolean, log: SideRoundLog) => {
    const turrets = Math.max(0, tgtStats.turrets - (guided ? 1 : 0));
    const shot = roll(rng, turrets, 4).hits;
    const left = Math.max(0, incoming - shot);
    log.received.torpedoesIntercepted += Math.min(incoming, shot);
    return roll(rng, left, 4);
  };
  const tA = torpedoHits(D.torpedoesInFlight, A, sA, D.fleet === "tau", logA);
  const tD = torpedoHits(A.torpedoesInFlight, D, sD, A.fleet === "tau", logD);
  A.torpedoesInFlight = 0;
  D.torpedoesInFlight = 0;

  // ── Fuego (simultáneo) ──
  const volley = (own: SideState, it: Intent, st: ReturnType<typeof effectiveStats>, foe: SideState, foeStats: ReturnType<typeof effectiveStats>, ownFlank: boolean, doctrine: BlockPlan["doctrine"], log: SideRoundLog): Volley => {
    const v: Volley = { batteryHits: 0, batterySixes: 0, lanceHits: 0, lanceSixes: 0, boardingHits: 0, boardingSixes: 0, ram: 0, escortBatteryHits: 0 };
    // Manifestación demoníaca: no se puede apuntar en su primera ronda.
    if (firstRound && foe.fleet === "daemons") return v;
    const allMult = it.halfAll ? 0.5 : 1;
    // Baterías
    let bat = own.fleet === "orks" ? d6(rng) + d6(rng) + 1 + 2 * own.modules.baterias : st.batteries;
    if (range === 3) bat /= 2;
    if (ownFlank) bat *= 1.5;
    if (it.halfBatteries) bat /= 2;
    if (own.crits.includes("baterias")) bat /= 2;
    bat *= allMult;
    const armour = ownFlank ? foeStats.armourSide : foeStats.armourFront;
    const b = roll(rng, bat, armour, it.reroll);
    v.batteryHits = b.hits;
    v.batterySixes = b.sixes;
    log.fired.batteries = Math.floor(bat);
    // Lanzas (Cerca–Lejos)
    if (range >= 1) {
      let lan = st.lances;
      if (own.fleet === "chaos" && range === 3) lan += 1;
      if (it.faction && own.fleet === "chaos") lan += 2;
      if (it.faction && own.fleet === "votann") lan += 2;
      lan *= allMult;
      const l = roll(rng, lan, 4, it.reroll || (it.faction && own.fleet === "votann"));
      v.lanceHits = l.hits;
      v.lanceSixes = l.sixes;
      log.fired.lances = Math.floor(lan);
    }
    // Torpedos: se lanzan en Cerca–Media si están cargados
    if ((range === 1 || range === 2) && own.torpedoesLoaded && !it.halfAll) {
      const salvo = st.torpedoes + own.escorts.filter((e) => e.type === "destructores").reduce((n, e) => n + e.ships * ESCORT_PROFILES.destructores.torpedoes, 0);
      if (salvo > 0) {
        own.torpedoesInFlight = salvo;
        own.torpedoesLoaded = false;
        log.fired.torpedoesLaunched = salvo;
      }
    }
    // Abordaje: Contacto (o Cerca con la orden de tiránidos / drukhari)
    const reach = range === 0 || (range === 1 && it.faction && (own.fleet === "tyranids" || own.fleet === "drukhari"));
    if (reach) {
      let dice = st.boarding;
      if (it.faction && own.fleet === "genestealer" && foe.hull < foe.maxHull) dice *= 2;
      dice *= allMult;
      const atk = roll(rng, dice, 4);
      const defDice = foeStats.boarding + foe.escorts.filter((e) => e.type === "piquetes").reduce((n, e) => n + e.ships * ESCORT_PROFILES.piquetes.boarding, 0);
      const def = roll(rng, defDice, 5);
      // Cada impacto neto de abordaje causa 2 de daño: las tropas arrasan cubiertas enteras.
      v.boardingHits = Math.max(0, atk.hits - def.hits) * 2;
      v.boardingSixes = v.boardingHits > 0 ? atk.sixes : 0;
      log.fired.boarding = v.boardingHits;
    }
    // Embestida
    const ramming = range === 0 && it.maneuver === "acercarse" && ((it.passed && it.plan.order === "avante_toda") || (it.faction && (own.fleet === "orks" || own.fleet === "imperium")));
    if (ramming) {
      v.ram = d6(rng) + Math.floor(own.hull / 10) + (it.faction && own.fleet === "imperium" ? 3 : 0);
      log.fired.ram = v.ram;
    }
    // Escoltas en ataque
    if (doctrine === "ataque") {
      const dice = own.escorts.reduce((n, e) => n + e.ships * ESCORT_PROFILES[e.type].batteries, 0) * (range === 3 ? 0.5 : 1);
      v.escortBatteryHits = roll(rng, dice, armour).hits;
    }
    return v;
  };
  const vA = volley(A, iA, sA, D, sD, logA.flank, doctrineA, logA);
  const vD = volley(D, iD, sD, A, sA, logD.flank, doctrineD, logD);

  // ── Daño recibido ──
  const receive = (tgt: SideState, it: Intent, st: ReturnType<typeof effectiveStats>, v: Volley, torp: { hits: number; sixes: number }, flanked: boolean, attackerTarget: RoundPlan["target"], doctrine: BlockPlan["doctrine"], log: SideRoundLog) => {
    // Ranged: baterías (+escoltas), lanzas y torpedos
    let batteryHits = v.batteryHits + v.escortBatteryHits;
    if (tgt.fleet === "votann") batteryHits = Math.max(0, batteryHits - 1);
    let ranged = batteryHits + v.lanceHits + torp.hits;
    let sixes = v.batterySixes + v.lanceSixes + torp.sixes;
    // Proa blindada / blindaje de proa
    if (!flanked) ranged = Math.max(0, ranged - st.frontReduction);
    // Escoltas: el atacante puede apuntarlas o la doctrina Pantalla las interpone
    const escortShips = tgt.escorts.reduce((n, e) => n + e.ships, 0);
    let toEscorts = 0;
    if (escortShips > 0 && (attackerTarget === "escoltas" || doctrine === "pantalla")) {
      const cap = attackerTarget === "escoltas" ? escortShips * 2 : escortShips;
      toEscorts = Math.min(ranged, cap);
      ranged -= toEscorts;
      // Cada escuadrón absorbe 1 con su escudo; luego cada impacto destruye una nave.
      let left = toEscorts;
      for (const sq of tgt.escorts) {
        if (left <= 0) break;
        if (sq.ships <= 0) continue;
        left -= 1;
        const lost = Math.min(sq.ships, Math.max(0, left));
        sq.ships -= lost;
        left -= lost;
        log.received.escortsLost += lost;
      }
      sixes = Math.max(0, sixes - toEscorts);
    }
    // Salvaciones: holocampos, campos de sombras, prepararse para el impacto
    let saved = 0;
    const save = (n: number, target: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) if (d6(rng) >= target) s++;
      return s;
    };
    if (tgt.fleet === "aeldari") {
      // Holocampos: muy eficaces contra baterías a distancia; las lanzas y torpedos fijan mejor (4+).
      const heavy = Math.min(ranged, v.lanceHits + torp.hits);
      const light = ranged - heavy;
      const t = range >= 2 ? 2 : range === 1 ? 4 : 7;
      if (t <= 6) saved += save(light, t);
      if (range >= 1) saved += save(heavy, 4);
    } else if (tgt.fleet === "drukhari" && range > 0) {
      saved += save(ranged, 3);
    }
    ranged -= saved;
    if (it.brace) {
      const b = save(ranged, 4);
      saved += b;
      ranged -= b;
    }
    // Escudos (y deflector tau de frente) / esporas
    let shields = st.shields + (tgt.fleet === "tau" && !flanked ? 2 : 0);
    if (tgt.fleet === "tyranids") shields += 2;
    const absorbed = Math.min(shields, ranged);
    ranged -= absorbed;
    tgt.shieldsOverloaded = tgt.fleet !== "tyranids" && shields > 0 && absorbed >= shields;
    // Abordaje y embestida ignoran escudos
    let boarding = v.boardingHits;
    if (it.brace) boarding = Math.max(0, boarding - save(boarding, 4));
    const hullDamage = Math.max(0, ranged) + boarding + v.ram;
    tgt.hull = Math.max(0, tgt.hull - hullDamage);
    log.received.absorbed = absorbed;
    log.received.saved = saved;
    log.received.hull = hullDamage;
    // Críticos: un 6 natural que llega al casco (máx. 2 por ronda)
    const critRolls = Math.min(2, Math.min(sixes, Math.max(0, ranged)) + (boarding > 0 ? Math.min(1, v.boardingSixes) : 0) + (v.ram > 0 ? 1 : 0));
    for (let i = 0; i < critRolls; i++) {
      const c = CRITS[d6(rng) - 1]!;
      if (!tgt.crits.includes(c)) {
        tgt.crits.push(c);
        log.newCrits.push(c);
      }
    }
  };
  // Las embestidas también dañan a quien embiste.
  if (vA.ram > 0) A.hull = Math.max(0, A.hull - Math.ceil(d6(rng) / 2));
  if (vD.ram > 0) D.hull = Math.max(0, D.hull - Math.ceil(d6(rng) / 2));
  receive(D, iD, sD, vA, tD, logA.flank, planA.target, doctrineD, logD);
  receive(A, iA, sA, vD, tA, logD.flank, planD.target, doctrineA, logA);
  A.boardingHits += vA.boardingHits * (iA.faction && A.fleet === "drukhari" ? 2 : 1);
  D.boardingHits += vD.boardingHits * (iD.faction && D.fleet === "drukhari" ? 2 : 1);

  // ── Fin de ronda ──
  for (const [s, it, log] of [
    [A, iA, logA],
    [D, iD, logD],
  ] as const) {
    if (it.passed && it.plan.order === "recargar") s.torpedoesLoaded = true;
    if (it.faction && s.fleet === "tau") s.torpedoesLoaded = true;
    if (it.passed && it.plan.order === "control_danos") {
      const n = s.modules.forja >= 2 ? 2 : 1;
      const fixable = s.crits.filter((c) => c !== "escudos");
      const fixed = [...(fixable.includes("incendio") ? ["incendio" as Crit] : []), ...fixable.filter((c) => c !== "incendio")].slice(0, n);
      s.crits = s.crits.filter((c) => !fixed.includes(c));
      log.repaired.push(...fixed);
    }
    if ((s === A ? shieldCritAtStart.A : shieldCritAtStart.D)) s.crits = s.crits.filter((c) => c !== "escudos");
    if (s.crits.includes("incendio")) s.hull = Math.max(0, s.hull - 1);
    if (s.fleet === "necrons" && s.hull > 0 && d6(rng) >= 4) {
      const c = s.crits.find((x) => x !== "escudos");
      if (c) {
        s.crits = s.crits.filter((x) => x !== c);
        log.repaired.push(c);
      } else s.hull = Math.min(s.maxHull, s.hull + 1);
    }
    s.lastManeuver = it.maneuver;
    s.disengage = it.maneuver === "romper" && duel.range === 3 ? s.disengage + 1 : 0;
    log.hullAfter = s.hull;
  }

  // ── Fin del duelo ──
  if (A.hull <= 0 || D.hull <= 0) {
    duel.finished = { winner: A.hull <= 0 && D.hull <= 0 ? "empate" : D.hull <= 0 ? "atacante" : "defensor", reason: "casco" };
  } else if (A.disengage >= 2) {
    duel.finished = { winner: "defensor", reason: "retirada" };
  } else if (D.disengage >= 2) {
    duel.finished = { winner: "atacante", reason: "retirada" };
  }

  return { round: duel.round, rangeBefore, rangeAfter: duel.range, attacker: logA, defender: logD };
}

/** Resuelve un bloque completo de rondas. Devuelve el nuevo estado y el registro para la repetición. */
export function resolveBlock(state: DuelState, planA: BlockPlan, planD: BlockPlan, rng: Rng) {
  const duel = clone(state);
  const events: RoundEvent[] = [];
  const n = Math.max(planA.rounds.length, planD.rounds.length);
  for (let i = 0; i < n && !duel.finished; i++) {
    const ra = planA.rounds[i] ?? planA.rounds[planA.rounds.length - 1]!;
    const rd = planD.rounds[i] ?? planD.rounds[planD.rounds.length - 1]!;
    events.push(step(duel, ra, rd, planA.doctrine, planD.doctrine, rng));
  }
  return { state: duel, events };
}

export const sideOf = (duel: DuelState, side: Side) => (side === "attacker" ? duel.attacker : duel.defender);
export { SHIPS_PER_SQUADRON };
