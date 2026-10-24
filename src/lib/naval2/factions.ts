import type { FleetId } from "@/lib/ship-identity";
import type { EscortType, Range } from "./types";

/** Atributos base de la nave capital de cada flota (docs/combate-naval-v2.md §5). */
export interface FleetProfile {
  speed: number;
  shields: number;
  armourFront: number;
  armourSide: number;
  batteries: number;
  lances: number;
  torpedoes: number;
  turrets: number;
  boarding: number;
  hull: number;
  /** Distancia preferida (para la IA de simulación y la previsión de la interfaz). */
  idealRange: Range;
  passive: string;
  orderName: string;
  orderText: string;
}

export const FLEET_PROFILES: Record<FleetId, FleetProfile> = {
  imperium: {
    speed: 2,
    shields: 2,
    armourFront: 5,
    armourSide: 4,
    batteries: 6,
    lances: 2,
    torpedoes: 4,
    turrets: 2,
    boarding: 3,
    hull: 27,
    idealRange: 2,
    passive: "Proa blindada: blindaje 5+ de frente (4+ en los costados) y torpedos pesados.",
    orderName: "Carga de proa",
    orderText: "En Contacto: embestida con +3 de daño.",
  },
  chaos: {
    speed: 3,
    shields: 2,
    armourFront: 4,
    armourSide: 4,
    batteries: 6,
    lances: 4,
    torpedoes: 0,
    turrets: 1,
    boarding: 4,
    hull: 34,
    idealRange: 3,
    passive: "Fuego a distancia: +1 dado de lanza en Lejos.",
    orderName: "Marca de los dioses",
    orderText: "Repite el chequeo de Liderazgo y obtén +2 dados de lanza esta ronda.",
  },
  tau: {
    speed: 2,
    shields: 1,
    armourFront: 5,
    armourSide: 4,
    batteries: 6,
    lances: 2,
    torpedoes: 4,
    turrets: 3,
    boarding: 1,
    hull: 22,
    idealRange: 2,
    passive: "Deflector: +2 escudos contra impactos de frente.",
    orderName: "Sistemas de puntería",
    orderText: "Torpedos guiados: recargan al instante e ignoran 1 torreta.",
  },
  aeldari: {
    speed: 4,
    shields: 0,
    armourFront: 4,
    armourSide: 4,
    batteries: 6,
    lances: 4,
    torpedoes: 4,
    turrets: 1,
    boarding: 2,
    hull: 26,
    idealRange: 2,
    passive:
      "Campos holográficos: contra baterías salvación 2+ en Lejos/Media y 4+ en Cerca; contra lanzas y torpedos 4+; ninguna en Contacto.",
    orderName: "Velas solares",
    orderText: "Elige la maniobra tras ver la del rival para quedar a tu distancia ideal.",
  },
  drukhari: {
    speed: 4,
    shields: 0,
    armourFront: 4,
    armourSide: 4,
    batteries: 5,
    lances: 3,
    torpedoes: 3,
    turrets: 1,
    boarding: 5,
    hull: 35,
    idealRange: 1,
    passive: "Campos de sombras: salvación 3+ contra todo disparo salvo en Contacto.",
    orderName: "Incursión esclavista",
    orderText: "Abordaje también en Cerca; cada impacto suma botín doble.",
  },
  orks: {
    speed: 2,
    shields: 1,
    armourFront: 5,
    armourSide: 4,
    batteries: 10,
    lances: 1,
    torpedoes: 3,
    turrets: 1,
    boarding: 5,
    hull: 40,
    idealRange: 0,
    passive: "¡Más dakka!: baterías de 2d6+1 dados (varianza alta).",
    orderName: "¡Embestida!",
    orderText: "Avanza 2 bandas y embiste al llegar a Contacto sin perder fuego.",
  },
  necrons: {
    speed: 1,
    shields: 0,
    armourFront: 5,
    armourSide: 5,
    batteries: 6,
    lances: 4,
    torpedoes: 0,
    turrets: 2,
    boarding: 2,
    hull: 33,
    idealRange: 1,
    passive: "Reanimación: cada ronda, 4+ repara 1 crítico o 1 de casco.",
    orderName: "Salto inercial",
    orderText: "Cambia hasta 2 bandas de distancia a voluntad.",
  },
  tyranids: {
    speed: 2,
    shields: 0,
    armourFront: 4,
    armourSide: 4,
    batteries: 5,
    lances: 2,
    torpedoes: 4,
    turrets: 3,
    boarding: 6,
    hull: 47,
    idealRange: 0,
    passive:
      "Nubes de esporas: absorben 2 impactos por ronda y nunca colapsan. Instinto: si falla el Liderazgo, repite la maniobra anterior.",
    orderName: "Tentáculos de abordaje",
    orderText: "Abordaje también en Cerca.",
  },
  daemons: {
    speed: 3,
    shields: 2,
    armourFront: 4,
    armourSide: 4,
    batteries: 6,
    lances: 3,
    torpedoes: 0,
    turrets: 1,
    boarding: 6,
    hull: 24,
    idealRange: 0,
    passive: "Manifestación: en su primera ronda del duelo no se le puede apuntar.",
    orderName: "Grieta disforme",
    orderText: "Reaparece en la banda que quiera (1 vez por duelo).",
  },
  votann: {
    speed: 1,
    shields: 1,
    armourFront: 5,
    armourSide: 5,
    batteries: 6,
    lances: 2,
    torpedoes: 0,
    turrets: 2,
    boarding: 3,
    hull: 28,
    idealRange: 2,
    passive: "Blindaje de vacío: −1 impacto de batería recibido por ronda.",
    orderName: "Juicio de los ancestros",
    orderText: "Fuego concentrado: +2 dados de lanza que repiten fallos.",
  },
  genestealer: {
    speed: 2,
    shields: 1,
    armourFront: 4,
    armourSide: 4,
    batteries: 7,
    lances: 1,
    torpedoes: 2,
    turrets: 1,
    boarding: 6,
    hull: 42,
    idealRange: 0,
    passive: "Infiltración: el rival empieza el duelo con un crítico aleatorio.",
    orderName: "Alzamiento",
    orderText: "El abordaje tira el doble de dados si el rival está dañado.",
  },
};

export const ESCORT_PROFILES: Record<
  EscortType,
  {
    name: string;
    batteries: number;
    torpedoes: number;
    turrets: number;
    boarding: number;
    cost: number;
  }
> = {
  fragatas: { name: "Fragatas", batteries: 2, torpedoes: 0, turrets: 0, boarding: 0, cost: 150 },
  destructores: {
    name: "Destructores",
    batteries: 1,
    torpedoes: 2,
    turrets: 0,
    boarding: 0,
    cost: 200,
  },
  piquetes: { name: "Piquetes", batteries: 0, torpedoes: 0, turrets: 1, boarding: 1, cost: 120 },
};

export const MAX_SQUADRONS = 3;
export const SHIPS_PER_SQUADRON = 3;
export const ROUNDS_PER_BLOCK = 3;
