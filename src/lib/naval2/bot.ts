/** IA sencilla para simular duelos (equilibrado) y como plan por defecto si un jugador no confirma a tiempo. */
import type { FleetId } from "@/lib/ship-identity";
import { FLEET_PROFILES, ROUNDS_PER_BLOCK } from "./factions";
import { effectiveStats, type Rng } from "./engine";
import type {
  BlockPlan,
  DuelState,
  Maneuver,
  Range,
  RoundPlan,
  Side,
  SideState,
  SpecialOrder,
} from "./types";

function factionOrderUseful(fleet: FleetId, range: Range, want: Range, s: SideState): boolean {
  switch (fleet) {
    case "aeldari":
      return range !== want;
    case "necrons":
      return Math.abs(range - want) >= 2;
    case "daemons":
      return !s.usedOncePerDuel && range > want + 1;
    case "orks":
      return range <= 2;
    case "tyranids":
    case "drukhari":
      return range === 1;
    case "chaos":
      return range >= 2;
    case "votann":
      return range >= 1;
    case "tau":
      return !s.torpedoesLoaded;
    case "genestealer":
      return range === 0 && s.hull < s.maxHull;
    case "imperium":
      return range === 0;
    default:
      return false;
  }
}

export function botPlan(duel: DuelState, side: Side, rng: Rng, epsilon = 0.15): BlockPlan {
  const own = side === "attacker" ? duel.attacker : duel.defender;
  const foe = side === "attacker" ? duel.defender : duel.attacker;
  const profile = FLEET_PROFILES[own.fleet];
  const want = profile.idealRange;
  const rounds: RoundPlan[] = [];
  let range = duel.range;
  const ownSpeed = effectiveStats(own).speed;
  const foeSpeed = effectiveStats(foe).speed;
  let loaded = own.torpedoesLoaded;
  const hasTorps = profile.torpedoes > 0 || own.escorts.some((e) => e.type === "destructores");

  for (let i = 0; i < ROUNDS_PER_BLOCK; i++) {
    let maneuver: Maneuver =
      range > want ? "acercarse" : range < want ? "romper" : rng() < 0.7 ? "flanquear" : "mantener";
    if (rng() < epsilon)
      maneuver = (["acercarse", "mantener", "flanquear", "romper"] as const)[
        Math.floor(rng() * 4)
      ]!;
    let order: SpecialOrder | null = null;
    if (own.crits.some((c) => c === "incendio" || c === "motores" || c === "baterias") && i === 0)
      order = "control_danos";
    else if (hasTorps && !loaded && own.fleet !== "tau") order = "recargar";
    else if (factionOrderUseful(own.fleet, range, want, own)) order = "faccion";
    else if (own.hull < own.maxHull * 0.25 && range <= 1 && rng() < 0.3) order = "prepararse";
    else if (range > want && ownSpeed <= foeSpeed && rng() < 0.4) order = "avante_toda";
    else order = "fijar_blanco";
    if (order === "faccion" && own.fleet === "imperium") maneuver = "acercarse";
    rounds.push({ maneuver, order, target: "capital", preferredRange: want });
    // Estimación de la distancia siguiente suponiendo que el rival mantiene.
    const step = maneuver === "acercarse" ? -1 : maneuver === "romper" ? 1 : 0;
    range = Math.max(0, Math.min(3, range + step)) as Range;
    if ((range === 1 || range === 2) && loaded) loaded = false;
    if (order === "recargar") loaded = true;
  }
  const escorts = own.escorts.some((e) => e.ships > 0);
  return { rounds, doctrine: escorts && own.hull < own.maxHull * 0.5 ? "pantalla" : "ataque" };
}
