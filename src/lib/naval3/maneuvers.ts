/**
 * Maniobras del combate naval: lo que el jugador elige en cada ronda.
 * Cada una se traduce a velocidad + giro según la agilidad de la nave.
 */
import { stats } from "./engine";
import type { PhasePlan, SideState, Speed, Turn } from "./types";

export type ManeuverId =
  "recto" | "babor" | "estribor" | "cerrado_babor" | "cerrado_estribor" | "avante_toda" | "parar";

export interface ManeuverInfo {
  id: ManeuverId;
  name: string;
  short: string;
  text: string;
  /** Flecha para los botones. */
  glyph: string;
}

export const MANEUVERS: ManeuverInfo[] = [
  {
    id: "cerrado_babor",
    name: "Giro cerrado a babor",
    short: "⟲ 90°",
    glyph: "⤺",
    text: "Vira 90° a la izquierda perdiendo casi toda la velocidad (las naves ágiles lo hacen sin frenar).",
  },
  {
    id: "babor",
    name: "Virar a babor",
    short: "↖ 45°",
    glyph: "↖",
    text: "Vira 45° a la izquierda a velocidad de crucero.",
  },
  {
    id: "recto",
    name: "Avante",
    short: "↑ Recto",
    glyph: "↑",
    text: "Sigue recto a velocidad de crucero.",
  },
  {
    id: "estribor",
    name: "Virar a estribor",
    short: "↗ 45°",
    glyph: "↗",
    text: "Vira 45° a la derecha a velocidad de crucero.",
  },
  {
    id: "cerrado_estribor",
    name: "Giro cerrado a estribor",
    short: "⟳ 90°",
    glyph: "⤻",
    text: "Vira 90° a la derecha perdiendo casi toda la velocidad (las naves ágiles lo hacen sin frenar).",
  },
  {
    id: "avante_toda",
    name: "Avante toda",
    short: "⇈ Toda",
    glyph: "⇈",
    text: "Fuerza los motores: mucha más distancia en línea recta, pero disparas a la mitad. Para dar caza o escapar.",
  },
  {
    id: "parar",
    name: "Parar máquinas",
    short: "■ Parar",
    glyph: "■",
    text: "Casi inmóvil: mantienes la posición y dejas que el enemigo venga.",
  },
];

export const MANEUVER_BY_ID = Object.fromEntries(MANEUVERS.map((m) => [m.id, m])) as Record<
  ManeuverId,
  ManeuverInfo
>;

/** Velocidad y giro de una maniobra para esta nave. */
export function maneuverMove(id: ManeuverId, s: SideState): { speed: Speed; turn: Turn } {
  const agile = stats(s).agility >= 2;
  switch (id) {
    case "babor":
      return { speed: 1, turn: -1 };
    case "estribor":
      return { speed: 1, turn: 1 };
    case "cerrado_babor":
      return { speed: agile ? 1 : 0, turn: -2 };
    case "cerrado_estribor":
      return { speed: agile ? 1 : 0, turn: 2 };
    case "avante_toda":
      return { speed: 2, turn: 0 };
    case "parar":
      return { speed: 0, turn: 0 };
    default:
      return { speed: 1, turn: 0 };
  }
}

/** Maniobra que corresponde a un plan guardado (para mostrarlo). */
export function maneuverOf(p: Pick<PhasePlan, "speed" | "turn">): ManeuverId {
  if (p.speed === 2) return "avante_toda";
  if (typeof p.turn !== "number") return "recto";
  if (p.turn <= -2) return "cerrado_babor";
  if (p.turn >= 2) return "cerrado_estribor";
  if (p.turn === -1) return "babor";
  if (p.turn === 1) return "estribor";
  return p.speed === 0 ? "parar" : "recto";
}
