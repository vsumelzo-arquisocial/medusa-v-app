import type { FleetId } from "@/lib/ship-identity";

/** Bandas de distancia: 0 Contacto · 1 Cerca · 2 Media · 3 Lejos. */
export type Range = 0 | 1 | 2 | 3;
export const RANGE_NAMES = ["Contacto", "Cerca", "Media", "Lejos"] as const;

/** 0 parar · 1 avante · 2 avante toda. */
export type Speed = 0 | 1 | 2;
/** Giro en pasos de 45°: negativo a babor (izquierda), positivo a estribor (derecha). */
export type Turn = -2 | -1 | 0 | 1 | 2;
/** Timón: un giro fijo o una intención que se resuelve al ejecutar la fase según dónde esté el enemigo. */
export type Helm = Turn | "encarar" | "costado" | "huir";

export type Action =
  "fuego" | "torpedos" | "recargar" | "escudos" | "evasion" | "embestir" | "reparar" | "saltar";

export type Arc = "proa" | "estribor" | "popa" | "babor";
export const ARC_NAMES: Record<Arc, string> = {
  proa: "proa",
  estribor: "estribor",
  popa: "popa",
  babor: "babor",
};

export interface PhasePlan {
  speed: Speed;
  turn: Helm;
  action: Action;
}

export interface BlockPlan {
  phases: PhasePlan[];
  /** Salto de emergencia: si el casco baja de este % al terminar una fase, la siguiente salta. 0 = nunca. */
  emergencyJump: number;
}

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

export interface Vec {
  x: number;
  y: number;
}

export interface SideState {
  fleet: FleetId;
  modules: ModuleLevels;
  hull: number;
  maxHull: number;
  /** Posición en el plano (unidades). */
  pos: Vec;
  /** Rumbo en pasos de 45° (0 = norte, 2 = este…). */
  heading: number;
  torpedoesLoaded: boolean;
  torpedoesInFlight: number;
  boarding: number;
}

export type Side = "attacker" | "defender";

export interface DuelEnd {
  winner: "atacante" | "defensor" | "empate";
  reason: "destruida" | "salto" | "tiempo";
  destroyed: Side[];
  jumped: Side | null;
}

export interface DuelState {
  /** Banda de distancia actual (derivada de las posiciones). */
  range: Range;
  phase: number;
  attacker: SideState;
  defender: SideState;
  finished: DuelEnd | null;
}

export interface SidePhaseLog {
  speed: Speed;
  /** Giro realmente aplicado. */
  turn: Turn;
  helm: Helm;
  action: Action;
  forced: string | null;
  /** Arcos desde los que disparó. */
  arcs: Arc[];
  /** Arco del rival por el que recibió los impactos de esta nave. */
  hitArc: Arc | null;
  fireDealt: number;
  shieldsAbsorbed: number;
  torpedoesLaunched: number;
  torpedoesHit: number;
  torpedoesDodged: number;
  instantTorpedoes: boolean;
  ram: null | { hit: boolean; dealt: number; selfDamage: number };
  warp: null | { chance: number; success: boolean; damage: number };
  repaired: number;
  regen: number;
  hullAfter: number;
  /** Posición y rumbo al terminar la fase (para la repetición). */
  pos: Vec;
  heading: number;
}

export interface PhaseEvent {
  phase: number;
  rangeBefore: Range;
  rangeAfter: Range;
  distance: number;
  /** Posición y rumbo de las naves al empezar la fase. */
  before?: Record<Side, { pos: Vec; heading: number }>;
  attacker: SidePhaseLog;
  defender: SidePhaseLog;
}
