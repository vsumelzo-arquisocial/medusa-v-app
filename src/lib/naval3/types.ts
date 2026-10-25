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
  | "fuego"
  | "torpedos"
  | "recargar"
  | "escudos"
  | "evasion"
  | "embestir"
  | "reparar"
  | "saltar"
  | "abordar";

/** Secciones de la nave que un crítico o un abordaje pueden dejar fuera de combate. */
export type Section = "puente" | "baterias" | "torpedos" | "motores" | "escudos";
export const SECTIONS: Section[] = ["puente", "baterias", "torpedos", "motores", "escudos"];

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
  /** Salto disforme en curso: 0 nada · 1 declarado (ronda de aguante) · 2 listo para saltar. */
  warpCharge?: number;
  /** Cargas de abordaje que quedan en este duelo. */
  boardingLeft?: number;
  /** Secciones fuera de combate (críticos, abordajes o averías previas). */
  disabled?: Section[];
}

export type Side = "attacker" | "defender";

export interface DuelEnd {
  winner: "atacante" | "defensor" | "empate";
  reason: "destruida" | "salto" | "tiempo";
  destroyed: Side[];
  jumped: Side | null;
}

/** Rondas por bloque: 1 (de una en una, ambos conectados) o 3 (de tres en tres). */
export type DuelMode = 1 | 3;

export interface DuelState {
  /** Rondas por bloque; sin definir = aún por decidir (se juega a 3). */
  mode?: DuelMode;
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
  /** Salto: «declara» (ronda 1), «carga» (ronda de aguante) y «salta» (al empezar la siguiente). */
  warp: null | {
    chance: number;
    success: boolean;
    damage: number;
    stage?: "declara" | "carga" | "salta";
  };
  repaired: number;
  /** Sección reactivada con Reparar (en vez de casco). */
  repairedModule?: Section | null;
  /** Abordaje lanzado esta ronda. */
  boardingRoll?: null | {
    chance: number;
    success: boolean;
    damage: number;
    critical: Section | null;
  };
  /** Crítico causado por el disparo de esta nave. */
  critical?: Section | null;
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
