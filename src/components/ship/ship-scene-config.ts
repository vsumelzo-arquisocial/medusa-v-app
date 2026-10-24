import type { FleetId } from "@/lib/ship-identity";

/**
 * Puntos de anclaje de cada ilustración de nave (fracciones de ancho/alto de la imagen).
 * Todas miran a la derecha: los motores quedan a la izquierda.
 * engines: toberas · hot: zonas del casco donde aparecen daños · glow: color del motor/núcleo.
 */
export interface ShipRig {
  engines: [number, number][];
  hot: [number, number][];
  glow: string;
  /** El arte ya incluye llamas de motor (Tau): solo se refuerzan. */
  builtInFlames?: boolean;
  /** Propulsión no convencional (velas, bio-plasma, núcleo): halo en vez de chorro. */
  halo?: boolean;
}

const HULL_IMPERIAL: [number, number][] = [
  [0.32, 0.42],
  [0.45, 0.5],
  [0.58, 0.44],
  [0.7, 0.52],
  [0.38, 0.58],
];

export const SHIP_RIGS: Record<FleetId, ShipRig> = {
  imperium: {
    engines: [
      [0.03, 0.27],
      [0.03, 0.45],
    ],
    hot: HULL_IMPERIAL,
    glow: "#9fd4ff",
  },
  chaos: {
    engines: [[0.02, 0.45]],
    hot: [
      [0.3, 0.45],
      [0.42, 0.52],
      [0.55, 0.47],
      [0.66, 0.5],
      [0.36, 0.6],
    ],
    glow: "#ff6a4a",
  },
  tau: {
    engines: [
      [0.06, 0.37],
      [0.06, 0.47],
      [0.06, 0.58],
    ],
    hot: [
      [0.35, 0.45],
      [0.48, 0.5],
      [0.6, 0.47],
      [0.42, 0.6],
      [0.55, 0.38],
    ],
    glow: "#7fc8ff",
    builtInFlames: true,
  },
  aeldari: {
    engines: [[0.12, 0.62]],
    hot: [
      [0.3, 0.6],
      [0.45, 0.63],
      [0.6, 0.62],
      [0.38, 0.5],
      [0.52, 0.55],
    ],
    glow: "#7fffd4",
    halo: true,
  },
  drukhari: {
    engines: [[0.05, 0.58]],
    hot: [
      [0.3, 0.6],
      [0.45, 0.62],
      [0.6, 0.6],
      [0.38, 0.5],
      [0.52, 0.55],
    ],
    glow: "#c48cff",
    halo: true,
  },
  orks: {
    engines: [
      [0.03, 0.43],
      [0.03, 0.6],
    ],
    hot: [
      [0.3, 0.45],
      [0.42, 0.55],
      [0.55, 0.48],
      [0.68, 0.55],
      [0.36, 0.62],
    ],
    glow: "#ffb04a",
  },
  necrons: {
    engines: [[0.1, 0.5]],
    hot: [
      [0.3, 0.3],
      [0.32, 0.72],
      [0.5, 0.5],
      [0.65, 0.5],
      [0.45, 0.42],
    ],
    glow: "#5dff8a",
    halo: true,
  },
  tyranids: {
    engines: [[0.05, 0.55]],
    hot: [
      [0.3, 0.5],
      [0.42, 0.55],
      [0.55, 0.5],
      [0.68, 0.55],
      [0.36, 0.62],
    ],
    glow: "#ff6ad5",
    halo: true,
  },
  daemons: {
    engines: [[0.03, 0.48]],
    hot: [
      [0.3, 0.45],
      [0.42, 0.52],
      [0.55, 0.47],
      [0.66, 0.5],
      [0.36, 0.6],
    ],
    glow: "#ff4a2a",
    halo: true,
  },
  votann: {
    engines: [
      [0.02, 0.23],
      [0.02, 0.45],
      [0.02, 0.6],
    ],
    hot: HULL_IMPERIAL,
    glow: "#ffb070",
  },
  genestealer: {
    engines: [
      [0.02, 0.37],
      [0.02, 0.52],
    ],
    hot: HULL_IMPERIAL,
    glow: "#d09cff",
  },
};

/** Color de escudo por facción. */
export const SHIELD_COLORS: Record<FleetId, string> = {
  imperium: "#ffd76a",
  chaos: "#ff4a4a",
  tau: "#6fc3ff",
  aeldari: "#6fffd2",
  drukhari: "#c07bff",
  orks: "#9cff4a",
  necrons: "#4aff7a",
  tyranids: "#ff6ad5",
  daemons: "#ff5a3a",
  votann: "#ffa64a",
  genestealer: "#c99bff",
};

/** Color de atmósfera de cada cuerpo celeste (borde luminoso del horizonte). */
export const ATMOSPHERE: Record<string, string> = {
  "medusa-1": "#ff7a3a",
  "medusa-2": "#e8b56b",
  "medusa-3": "#e07a5a",
  "medusa-3a": "#9aa0a6",
  "medusa-4": "#6fb8ff",
  "medusa-4a": "#a8b0b8",
  "medusa-4b": "#8f969e",
  "medusa-5": "#7fd0ff",
  "medusa-6": "#f2b25c",
  "medusa-7": "#6fe0d0",
  "medusa-8": "#bfe9ff",
  "medusa-8a": "#cfe8ff",
  "medusa-9": "#b58cff",
};
