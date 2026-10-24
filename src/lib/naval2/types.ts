import type { FleetId } from "@/lib/ship-identity";

/** Bandas de distancia: 0 Contacto · 1 Cerca · 2 Media · 3 Lejos. */
export type Range = 0 | 1 | 2 | 3;
export const RANGE_NAMES = ["Contacto", "Cerca", "Media", "Lejos"] as const;

export type Maneuver = "acercarse" | "mantener" | "flanquear" | "romper";

export type SpecialOrder =
  | "fijar_blanco"
  | "avante_toda"
  | "nuevo_rumbo"
  | "recargar"
  | "prepararse"
  | "control_danos"
  | "faccion";

export type Target = "capital" | "escoltas";
export type Doctrine = "pantalla" | "ataque" | "flanqueo";
export type EscortType = "fragatas" | "destructores" | "piquetes";

export type Crit = "motores" | "baterias" | "lanza" | "incendio" | "puente" | "escudos";

export interface RoundPlan {
  maneuver: Maneuver;
  order: SpecialOrder | null;
  target: Target;
  /** Distancia deseada: la usan las órdenes que eligen banda (velas solares, salto inercial, grieta disforme). */
  preferredRange?: Range;
}

export interface BlockPlan {
  rounds: RoundPlan[];
  doctrine: Doctrine;
}

/** Niveles de módulo relevantes para el combate (0-3; el Puente hasta 5). */
export interface ModuleLevels {
  baterias: number;
  camara_escudos: number;
  cubierta_abordaje: number;
  motores_plasma: number;
  lanza_proa: number;
  blindaje_proa: number;
  forja: number;
  puente: number;
  astropatico: number;
}

export interface Squadron {
  type: EscortType;
  ships: number;
}

/** Estado persistente de un bando entre bloques. */
export interface SideState {
  fleet: FleetId;
  modules: ModuleLevels;
  hull: number;
  maxHull: number;
  crits: Crit[];
  torpedoesLoaded: boolean;
  torpedoesInFlight: number;
  shieldsOverloaded: boolean;
  escorts: Squadron[];
  /** Rondas seguidas rompiendo contacto en Lejos. */
  disengage: number;
  lastManeuver: Maneuver;
  usedOncePerDuel: boolean;
  boardingHits: number;
}

export interface DuelState {
  range: Range;
  round: number;
  attacker: SideState;
  defender: SideState;
  finished: null | { winner: "atacante" | "defensor" | "empate"; reason: "casco" | "retirada" };
}

export type Side = "attacker" | "defender";

/** Registro de lo ocurrido en una ronda, para la repetición. */
export interface RoundEvent {
  round: number;
  rangeBefore: Range;
  rangeAfter: Range;
  attacker: SideRoundLog;
  defender: SideRoundLog;
}

export interface SideRoundLog {
  maneuver: Maneuver;
  order: SpecialOrder | null;
  orderPassed: boolean | null;
  flank: boolean;
  fired: {
    batteries: number;
    lances: number;
    torpedoesLaunched: number;
    boarding: number;
    ram: number;
  };
  received: {
    absorbed: number;
    saved: number;
    hull: number;
    escortsLost: number;
    torpedoesIntercepted: number;
  };
  newCrits: Crit[];
  repaired: Crit[];
  hullAfter: number;
}
