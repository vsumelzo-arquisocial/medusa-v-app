import type { FleetId } from "@/lib/ship-identity";

/** Bandas de distancia: 0 Contacto · 1 Cerca · 2 Media · 3 Lejos. */
export type Range = 0 | 1 | 2 | 3;
export const RANGE_NAMES = ["Contacto", "Cerca", "Media", "Lejos"] as const;

/** −1 acercarse · 0 mantener · +1 alejarse. */
export type Move = -1 | 0 | 1;

export type Action =
  "fuego" | "torpedos" | "recargar" | "evasion" | "embestir" | "reparar" | "saltar";

export interface PhasePlan {
  move: Move;
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

export interface SideState {
  fleet: FleetId;
  modules: ModuleLevels;
  hull: number;
  maxHull: number;
  torpedoesLoaded: boolean;
  /** Torpedos lanzados la fase anterior que impactarán al inicio de la siguiente. */
  torpedoesInFlight: number;
  /** Fases con daño hecho en Contacto (cuenta como abordaje para el botín). */
  boarding: number;
}

export type Side = "attacker" | "defender";

export interface DuelEnd {
  winner: "atacante" | "defensor" | "empate";
  /** destruida: casco a 0 · salto: huyó al disforme · tiempo: límite de fases */
  reason: "destruida" | "salto" | "tiempo";
  destroyed: Side[];
  jumped: Side | null;
}

export interface DuelState {
  range: Range;
  /** Fases jugadas en total. */
  phase: number;
  attacker: SideState;
  defender: SideState;
  finished: DuelEnd | null;
}

export interface SidePhaseLog {
  move: Move;
  action: Action;
  /** La acción se cambió (sin torpedos cargados, embestida fuera de alcance, salto de emergencia…). */
  forced: string | null;
  fireDealt: number;
  shieldsAbsorbed: number;
  torpedoesLaunched: number;
  torpedoesHit: number;
  torpedoesDodged: number;
  /** Torpedos lanzados de cerca que impactan en la misma fase. */
  instantTorpedoes: boolean;
  ram: null | { hit: boolean; dealt: number; selfDamage: number };
  warp: null | { chance: number; success: boolean; damage: number };
  repaired: number;
  regen: number;
  hullAfter: number;
}

export interface PhaseEvent {
  phase: number;
  rangeBefore: Range;
  rangeAfter: Range;
  attacker: SidePhaseLog;
  defender: SidePhaseLog;
}
