import type { FleetId } from "@/lib/ship-identity";

/** Daño por distancia: [Contacto, Cerca, Media, Lejos]. */
export type RangeTable = [number, number, number, number];

/**
 * Nave capital de cada flota (docs/combate-naval-v3.md).
 * Armas por arco al estilo Battlefleet Gothic: proa, costados (babor y estribor) y popa.
 */
export interface FleetProfile {
  /** Velocidad en unidades por ronda a "avante". */
  speed: number;
  /** Giros de 45° permitidos por ronda (1 = 45°, 2 = 90°). */
  agility: number;
  /** Unidades extra con "avante toda". */
  burn: number;
  prow: RangeTable;
  prowName: string;
  broadside: RangeTable;
  broadsideName: string;
  /** Multiplicador de todo el disparo recibido (campos de sombras). */
  fireReduction?: number;
  /** Armas de popa (casi nadie las tiene). */
  stern: RangeTable;
  /** Las armas disparan en todos los arcos (necrones). */
  allArcs?: boolean;
  shields: number;
  /** Multiplicador del daño recibido por la proa (proas blindadas, deflectores). */
  prowArmour: number;
  /** Multiplicador del daño recibido por la popa (motores expuestos). */
  sternWeakness: number;
  /** Probabilidad base (%) de esquivar cada torpedo y una embestida. */
  dodge: number;
  /** Torpedos por salva (por la proa). */
  torpedoes: number;
  torpedoName: string;
  ram: number;
  ramRecoil: number;
  warp: number;
  regen: number;
  variance: number;
  trait: string;
  traitText: string;
}

export const TORPEDO_DAMAGE = 2;

/** Cargas de abordaje por duelo. */
export const BOARDING_CHARGES: Record<FleetId, number> = {
  orks: 3,
  tyranids: 3,
  genestealer: 3,
  chaos: 2,
  daemons: 2,
  drukhari: 2,
  imperium: 2,
  votann: 1,
  necrons: 1,
  aeldari: 1,
  tau: 0,
};

/** Nombre y efecto de cada sección cuando queda fuera de combate. */
export const SECTION_INFO: Record<
  "puente" | "baterias" | "torpedos" | "motores" | "escudos",
  { name: string; effect: string; module: string }
> = {
  puente: { name: "Puente", effect: "solo giros de 45°", module: "puente" },
  baterias: { name: "Baterías", effect: "disparo a la mitad", module: "baterias" },
  torpedos: { name: "Torpedos", effect: "sin torpedos", module: "lanza_proa" },
  motores: { name: "Motores", effect: "sin avante toda ni embestida", module: "motores_plasma" },
  escudos: { name: "Escudos", effect: "sin escudos", module: "camara_escudos" },
};
export const PHASES_PER_BLOCK = 3;
export const MAX_BLOCKS = 6;
export const EVASION_BONUS = 30;
/** Distancia inicial y máxima (unidades). Bandas: Contacto < 2 ≤ Cerca < 5 ≤ Media < 9 ≤ Lejos. */
export const START_DISTANCE = 12;
export const MAX_DISTANCE = 15;
export const BAND_EDGES = [2, 5, 9] as const;

const Z: RangeTable = [0, 0, 0, 0];

export const FLEET_PROFILES: Record<FleetId, FleetProfile> = {
  imperium: {
    speed: 3,
    agility: 1,
    burn: 3,
    prow: [3, 4, 3, 3],
    prowName: "lanza de proa y torpedos",
    broadside: [4, 4, 2, 1],
    broadsideName: "baterías de macrocañones",
    stern: Z,
    shields: 1,
    prowArmour: 0.7,
    sternWeakness: 1.4,
    dodge: 15,
    torpedoes: 4,
    torpedoName: "torpedos de plasma",
    ram: 8,
    ramRecoil: 0.3,
    warp: 0,
    regen: 0,
    variance: 0.3,
    trait: "Proa blindada",
    traitText:
      "Proa acorazada (−30 % de daño por delante), lanza y torpedos de proa y macrocañones en los costados: ataca de frente y remata de costado.",
  },
  chaos: {
    speed: 4,
    agility: 1,
    burn: 3,
    prow: [2, 2, 2, 2],
    prowName: "cañones de proa",
    broadside: [4, 5, 5, 4],
    broadsideName: "lanzas y baterías de largo alcance",
    stern: Z,
    shields: 1,
    prowArmour: 1,
    sternWeakness: 1.4,
    dodge: 20,
    torpedoes: 3,
    torpedoName: "torpedos infernales",
    ram: 4,
    ramRecoil: 0.5,
    warp: 5,
    regen: 0,
    variance: 0.3,
    trait: "Andanadas de largo alcance",
    traitText: "Rápidos y letales de costado a gran distancia; su proa apenas muerde.",
  },
  tau: {
    speed: 3,
    agility: 1,
    burn: 2,
    prow: [2, 4, 6, 7],
    prowName: "cañones de riel y misiles",
    broadside: [1, 2, 2, 2],
    broadsideName: "torretas de defensa",
    stern: Z,
    shields: 2,
    prowArmour: 0.65,
    sternWeakness: 1.5,
    dodge: 20,
    torpedoes: 4,
    torpedoName: "misiles buscadores",
    ram: 2,
    ramRecoil: 0.5,
    warp: -10,
    regen: 0,
    variance: 0.25,
    trait: "Deflector frontal",
    traitText:
      "Todo su poder está en la proa: misiles que reducen a la mitad la esquiva del rival, cañones de riel letales de lejos y un deflector frontal. Sus costados y su popa son débiles.",
  },
  aeldari: {
    speed: 5,
    agility: 2,
    burn: 2,
    prow: [4, 6, 6, 4],
    prowName: "lanzas púlsar",
    broadside: [2, 2, 2, 1],
    broadsideName: "baterías de pulsos",
    stern: Z,
    fireReduction: 0.8,
    shields: 0,
    prowArmour: 1,
    sternWeakness: 1.3,
    dodge: 35,
    torpedoes: 3,
    torpedoName: "torpedos espectrales",
    ram: 2,
    ramRecoil: 0.5,
    warp: 10,
    regen: 0,
    variance: 0.3,
    trait: "Velas solares",
    traitText:
      "Las más rápidas y ágiles: giran 90° por ronda. Campos holográficos (−20 % de todo disparo y otro −30 % en Media y Lejos). Atacan por la proa.",
  },
  drukhari: {
    speed: 5,
    agility: 2,
    burn: 2,
    prow: [12, 9, 5, 2],
    prowName: "lanzas oscuras",
    broadside: [4, 3, 1, 0],
    broadsideName: "cañones de astillas",
    stern: Z,
    fireReduction: 0.55,
    shields: 1,
    prowArmour: 1,
    sternWeakness: 1.3,
    dodge: 50,
    torpedoes: 4,
    torpedoName: "torpedos de oscuridad",
    ram: 3,
    ramRecoil: 0.5,
    warp: 10,
    regen: 0,
    variance: 0.3,
    trait: "Incursión esclavista",
    traitText:
      "Rapidísimas, muy esquivas y con campos de sombras (−45 % de disparo recibido), letales en Contacto por la proa. Su daño en Contacto cuenta doble para el botín.",
  },
  orks: {
    speed: 3,
    agility: 1,
    burn: 4,
    prow: [8, 5, 2, 1],
    prowName: "kañonez de proa",
    broadside: [6, 4, 2, 0],
    broadsideName: "baterías de dakka",
    stern: Z,
    shields: 1,
    prowArmour: 0.8,
    sternWeakness: 1.4,
    dodge: 10,
    torpedoes: 4,
    torpedoName: "rokas-torpedo",
    ram: 12,
    ramRecoil: 0.25,
    warp: -10,
    regen: 0,
    variance: 0.7,
    trait: "¡Más dakka!",
    traitText:
      "Motores brutales (avante toda +4): persiguen a cualquiera. Daño irregular, la mitad de sus torpedos falla sola y sus embestidas parten naves.",
  },
  necrons: {
    speed: 2,
    agility: 1,
    burn: 2,
    prow: [4, 3, 2, 2],
    prowName: "arcos de partículas",
    broadside: [4, 3, 2, 2],
    broadsideName: "arcos de partículas",
    stern: [4, 3, 2, 2],
    allArcs: true,
    shields: 0,
    prowArmour: 1,
    sternWeakness: 1,
    dodge: 10,
    torpedoes: 3,
    torpedoName: "esferas de partículas",
    ram: 6,
    ramRecoil: 0.4,
    warp: 10,
    regen: 1,
    variance: 0.2,
    trait: "Reanimación",
    traitText:
      "Disparan en todas direcciones y regeneran 1 de casco por ronda. Lentas: no eligen la distancia.",
  },
  tyranids: {
    speed: 3,
    agility: 1,
    burn: 3,
    prow: [5, 3, 2, 0],
    prowName: "lanzas de bioplasma",
    broadside: [4, 3, 1, 0],
    broadsideName: "espinas ácidas",
    stern: Z,
    shields: 0,
    prowArmour: 0.8,
    sternWeakness: 1.3,
    dodge: 10,
    torpedoes: 4,
    torpedoName: "esporas de bioplasma",
    ram: 6,
    ramRecoil: 0.25,
    warp: -10,
    regen: 1,
    variance: 0.35,
    trait: "Bioregeneración",
    traitText: "Regeneran 1 de casco por ronda y embisten con fuerza brutal. Inútiles a distancia.",
  },
  daemons: {
    speed: 4,
    agility: 2,
    burn: 2,
    prow: [7, 5, 3, 1],
    prowName: "fauces disformes",
    broadside: [5, 5, 3, 2],
    broadsideName: "baterías infernales",
    stern: Z,
    shields: 1,
    prowArmour: 1,
    sternWeakness: 1.3,
    dodge: 35,
    torpedoes: 3,
    torpedoName: "descargas disformes",
    ram: 5,
    ramRecoil: 0.5,
    warp: 100,
    regen: 0,
    variance: 0.4,
    trait: "Hijos de la disformidad",
    traitText: "Ágiles, peligrosas por todos los flancos, y su salto disforme nunca falla.",
  },
  votann: {
    speed: 2,
    agility: 1,
    burn: 2,
    prow: [3, 3, 3, 3],
    prowName: "lanzas de haces",
    broadside: [2, 3, 2, 2],
    broadsideName: "baterías magnéticas",
    stern: [0, 1, 1, 0],
    shields: 1,
    prowArmour: 0.8,
    sternWeakness: 1.2,
    dodge: 10,
    torpedoes: 4,
    torpedoName: "misiles de vacío",
    ram: 6,
    ramRecoil: 0.3,
    warp: 0,
    regen: 0,
    variance: 0.2,
    trait: "Blindaje de vacío",
    traitText:
      "Escudos gruesos, armas en todos los arcos (incluso popa) y popa reforzada. Lenta y fiable.",
  },
  genestealer: {
    speed: 3,
    agility: 1,
    burn: 3,
    prow: [3, 3, 2, 1],
    prowName: "taladro y torpedos de minería",
    broadside: [6, 5, 4, 1],
    broadsideName: "baterías recuperadas",
    stern: Z,
    shields: 1,
    prowArmour: 1,
    sternWeakness: 1.4,
    dodge: 20,
    torpedoes: 4,
    torpedoName: "torpedos de minería",
    ram: 7,
    ramRecoil: 0.35,
    warp: 0,
    regen: 0,
    variance: 0.3,
    trait: "Infiltración",
    traitText:
      "Cascos mineros con baterías en los costados. Sus agentes sabotean: el rival empieza el duelo con 3 de casco menos.",
  },
};

/** Voz del Segundo al mando de cada flota. */
export const SECOND: Record<FleetId, { title: string; lord: string }> = {
  imperium: { title: "Primer Oficial", lord: "Mi señor" },
  chaos: { title: "Contramaestre de la Disformidad", lord: "Mi señor" },
  tau: { title: "Kor'el de navegación", lord: "Shas'o" },
  aeldari: { title: "Timonel vidente", lord: "Autarca" },
  drukhari: { title: "Sibarita de cubierta", lord: "Arconte" },
  orks: { title: "Kontramaestre Gretchin", lord: "Jefe" },
  necrons: { title: "Criptecnólogo", lord: "Mi señor faraón" },
  tyranids: { title: "Nódulo sináptico", lord: "Mente Enjambre" },
  daemons: { title: "Heraldo", lord: "Señor" },
  votann: { title: "Kâhl de guerra", lord: "Señor" },
  genestealer: { title: "Magus del culto", lord: "Patriarca" },
};

export const ACTION_INFO: Record<string, { name: string; short: string; text: string }> = {
  fuego: {
    name: "Fuego",
    short: "Disparar",
    text: "Disparan las armas cuyo arco cubre al enemigo (proa, costado o popa). El daño depende de la distancia.",
  },
  torpedos: {
    name: "Torpedos",
    short: "Torpedos",
    text: "Salva por la proa: el enemigo debe estar delante. Impacta en la ronda siguiente (de cerca, al instante) y puede esquivarse. Si los tubos están vacíos, recarga y dispara a media potencia.",
  },
  abordar: {
    name: "Abordaje",
    short: "Abordar",
    text: "Solo en Contacto. Lanza cápsulas de abordaje: si sale bien, daña el casco y puede dejar fuera de combate una sección enemiga. Cargas limitadas por duelo según la raza.",
  },
  recargar: {
    name: "Recargar",
    short: "Recargar",
    text: "Recarga los tubos y dispara a media potencia.",
  },
  escudos: {
    name: "Escudos al máximo",
    short: "Escudos",
    text: "Desvía energía a los escudos: +3 de escudo y paran hasta ¾ de cada andanada. Disparas a media potencia. No sirve contra torpedos ni embestidas.",
  },
  evasion: {
    name: "Evasión",
    short: "Esquivar",
    text: "Maniobras evasivas: +30 % de esquiva contra torpedos y embestidas y recibe la mitad de disparo. No dispara.",
  },
  embestir: {
    name: "Embestir",
    short: "Embestir",
    text: "Avante toda en línea recta. Si el enemigo está delante y llegas a Contacto, choca: gran daño, algo para ti.",
  },
  reparar: {
    name: "Reparar",
    short: "Reparar",
    text: "Control de daños: reactiva una sección fuera de combate o, si no hay, recupera casco. No dispara.",
  },
  saltar: {
    name: "Salto disforme",
    short: "Saltar",
    text: "Huye al instante. Pierdes el duelo pero salvas la nave. Puede fallar y dañarte.",
  },
};

export const SPEED_INFO = [
  {
    name: "Parar máquinas",
    short: "Parar",
    text: "Casi inmóvil, pero puede girar 45° más de lo normal.",
  },
  { name: "Avante", short: "Avante", text: "Velocidad de crucero." },
  {
    name: "Avante toda",
    short: "Avante toda",
    text: "Fuerza los motores: mucha más velocidad, pero no puede girar y dispara a media potencia.",
  },
] as const;
