import type { FleetId } from "@/lib/ship-identity";

/** Atributos de combate de la nave capital de cada flota (docs/combate-naval-v3.md). */
export interface FleetProfile {
  speed: number;
  /** Daño base del disparo en cada distancia: [Contacto, Cerca, Media, Lejos]. */
  fire: [number, number, number, number];
  /** Daño de disparo que absorben los escudos cada fase. */
  shields: number;
  /** Probabilidad base (%) de esquivar cada torpedo y una embestida. */
  dodge: number;
  /** Torpedos por salva (cada uno hace TORPEDO_DAMAGE). */
  torpedoes: number;
  torpedoName: string;
  /** Daño base de una embestida. */
  ram: number;
  /** Fracción del daño de embestida que sufre quien embiste. */
  ramRecoil: number;
  /** Modificador (puntos %) a la probabilidad de salto disforme. */
  warp: number;
  /** Casco que regenera al final de cada fase. */
  regen: number;
  /** Varianza del disparo: el daño se multiplica por 1 ± varianza. */
  variance: number;
  trait: string;
  traitText: string;
}

export const TORPEDO_DAMAGE = 2;
export const PHASES_PER_BLOCK = 5;
export const MAX_BLOCKS = 4;
export const EVASION_BONUS = 30;
export const START_RANGE = 3;

export const FLEET_PROFILES: Record<FleetId, FleetProfile> = {
  imperium: {
    speed: 2,
    fire: [5, 5, 4, 2],
    shields: 1,
    dodge: 15,
    torpedoes: 4,
    torpedoName: "torpedos de plasma",
    ram: 7,
    ramRecoil: 0.4,
    warp: 0,
    regen: 0,
    variance: 0.3,
    trait: "Proa de asalto",
    traitText: "Sus embestidas son devastadoras y lleva la salva de torpedos más pesada.",
  },
  chaos: {
    speed: 3,
    fire: [3, 4, 4, 4],
    shields: 1,
    dodge: 20,
    torpedoes: 3,
    torpedoName: "torpedos infernales",
    ram: 4,
    ramRecoil: 0.5,
    warp: 5,
    regen: 0,
    variance: 0.3,
    trait: "Lanzas de largo alcance",
    traitText: "Golpea igual de fuerte en Media y Lejos; prefiere mantener la distancia.",
  },
  tau: {
    speed: 2,
    fire: [2, 3, 5, 7],
    shields: 2,
    dodge: 20,
    torpedoes: 3,
    torpedoName: "misiles buscadores",
    ram: 2,
    ramRecoil: 0.5,
    warp: -10,
    regen: 0,
    variance: 0.25,
    trait: "Misiles buscadores",
    traitText:
      "Sus misiles reducen a la mitad la esquiva del rival. Letal de lejos, frágil de cerca.",
  },
  aeldari: {
    speed: 4,
    fire: [2, 4, 4, 3],
    shields: 0,
    dodge: 35,
    torpedoes: 3,
    torpedoName: "torpedos espectrales",
    ram: 2,
    ramRecoil: 0.5,
    warp: 10,
    regen: 0,
    variance: 0.3,
    trait: "Campos holográficos",
    traitText:
      "Reciben un 30 % menos de disparo en Media y Lejos y esquivan casi la mitad de los torpedos.",
  },
  drukhari: {
    speed: 4,
    fire: [8, 6, 3, 1],
    shields: 0,
    dodge: 50,
    torpedoes: 2,
    torpedoName: "torpedos de oscuridad",
    ram: 3,
    ramRecoil: 0.5,
    warp: 10,
    regen: 0,
    variance: 0.3,
    trait: "Incursión esclavista",
    traitText: "Muy rápidos y esquivos; su daño en Contacto cuenta doble para el botín.",
  },
  orks: {
    speed: 2,
    fire: [7, 5, 2, 1],
    shields: 1,
    dodge: 10,
    torpedoes: 4,
    torpedoName: "rokas-torpedo",
    ram: 10,
    ramRecoil: 0.25,
    warp: -10,
    regen: 0,
    variance: 0.7,
    trait: "¡Más dakka!",
    traitText:
      "Daño muy irregular, la mitad de sus torpedos puede fallar sola. Sus embestidas parten naves.",
  },
  necrons: {
    speed: 1,
    fire: [6, 6, 5, 4],
    shields: 0,
    dodge: 10,
    torpedoes: 2,
    torpedoName: "esferas de partículas",
    ram: 5,
    ramRecoil: 0.4,
    warp: 10,
    regen: 1,
    variance: 0.2,
    trait: "Reanimación",
    traitText: "Regenera 1 de casco cada fase. Lenta: no puede elegir la distancia.",
  },
  tyranids: {
    speed: 2,
    fire: [5, 4, 2, 1],
    shields: 0,
    dodge: 10,
    torpedoes: 3,
    torpedoName: "esporas de bioplasma",
    ram: 6,
    ramRecoil: 0.25,
    warp: -10,
    regen: 1,
    variance: 0.35,
    trait: "Bioregeneración",
    traitText: "Regenera 1 de casco por fase y embiste con fuerza brutal.",
  },
  daemons: {
    speed: 3,
    fire: [6, 5, 4, 2],
    shields: 1,
    dodge: 30,
    torpedoes: 2,
    torpedoName: "descargas disformes",
    ram: 5,
    ramRecoil: 0.5,
    warp: 100,
    regen: 0,
    variance: 0.4,
    trait: "Hijos de la disformidad",
    traitText: "Su salto disforme nunca falla.",
  },
  votann: {
    speed: 1,
    fire: [4, 4, 4, 4],
    shields: 3,
    dodge: 10,
    torpedoes: 3,
    torpedoName: "misiles de vacío",
    ram: 6,
    ramRecoil: 0.3,
    warp: 0,
    regen: 0,
    variance: 0.2,
    trait: "Blindaje de vacío",
    traitText: "Los escudos más gruesos del sector. Lenta y fiable.",
  },
  genestealer: {
    speed: 2,
    fire: [6, 5, 3, 2],
    shields: 1,
    dodge: 20,
    torpedoes: 3,
    torpedoName: "torpedos de minería",
    ram: 6,
    ramRecoil: 0.35,
    warp: 0,
    regen: 0,
    variance: 0.3,
    trait: "Infiltración",
    traitText: "Sus agentes sabotean: el rival empieza el duelo con 3 de casco menos.",
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
  necrons: { title: "Criptecnólogo", lord: "Mi señor fáraon" },
  tyranids: { title: "Nódulo sináptico", lord: "Mente Enjambre" },
  daemons: { title: "Heraldo", lord: "Señor" },
  votann: { title: "Kâhl de guerra", lord: "Señor" },
  genestealer: { title: "Magus del culto", lord: "Patriarca" },
};

export const ACTION_INFO: Record<string, { name: string; short: string; text: string }> = {
  fuego: {
    name: "Fuego",
    short: "Disparar",
    text: "Dispara todas las baterías. El daño depende de la distancia.",
  },
  torpedos: {
    name: "Torpedos",
    short: "Lanzar",
    text: "Lanza la salva. Impacta en la fase siguiente (de cerca, al instante). El rival puede esquivarlos.",
  },
  recargar: {
    name: "Recargar",
    short: "Recargar",
    text: "Recarga los tubos de torpedos y dispara a media potencia.",
  },
  evasion: {
    name: "Evasión",
    short: "Esquivar",
    text: "+30 % de esquiva contra torpedos y embestidas y recibe la mitad de disparo. No dispara.",
  },
  embestir: {
    name: "Embestir",
    short: "Embestir",
    text: "Solo si acabas en Cerca o Contacto. Choca contra el rival: gran daño, algo para ti. Puede esquivarse.",
  },
  reparar: {
    name: "Reparar",
    short: "Reparar",
    text: "Control de daños: recupera casco. No dispara.",
  },
  saltar: {
    name: "Salto disforme",
    short: "Saltar",
    text: "Huye al instante. Pierdes el duelo pero salvas la nave. Puede fallar y dañarte.",
  },
};
