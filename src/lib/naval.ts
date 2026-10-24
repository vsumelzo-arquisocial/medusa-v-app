/** Órdenes especiales del combate naval (espejo de la lógica SQL `resolve_raid`). */
export type NavalOrder = "fuego" | "escudos" | "abordaje" | "evasion" | "lanza";

export const ORDERS: Record<
  NavalOrder,
  { label: string; short: string; icon: string; effect: string }
> = {
  fuego: {
    label: "¡Fuego a discreción!",
    short: "Andanada",
    icon: "✹",
    effect:
      "Dobla los dados de baterías. Vence a Abordaje y Evasión; pierde contra Escudos y Lanza.",
  },
  escudos: {
    label: "¡Refuercen escudos!",
    short: "Escudos",
    icon: "◈",
    effect:
      "No dispara; si gana repara casco. Vence a Andanada y Evasión; pierde contra Abordaje y Lanza.",
  },
  abordaje: {
    label: "¡Preparad el abordaje!",
    short: "Abordaje",
    icon: "⚔",
    effect:
      "Tropas que dañan, causan críticos y roban más. Vence a Escudos y Lanza; pierde contra Andanada y Evasión.",
  },
  evasion: {
    label: "¡A toda máquina!",
    short: "Evasión",
    icon: "➶",
    effect:
      "No dispara; si gana esquiva todo. Vence a Lanza y Abordaje; pierde contra Andanada y Escudos. 1 vez por duelo (2 con Motores de plasma).",
  },
  lanza: {
    label: "Lanza de proa",
    short: "Lanza",
    icon: "↯",
    effect:
      "Perforante, ignora escudos. Vence a Escudos y Andanada; pierde contra Evasión y Abordaje. 1 vez por duelo.",
  },
};

/** Qué orden vence a cuál (ventaja de la tabla). */
export const BEATS: Record<NavalOrder, NavalOrder[]> = {
  fuego: ["abordaje", "evasion"],
  escudos: ["fuego", "evasion"],
  abordaje: ["escudos", "lanza"],
  evasion: ["lanza", "abordaje"],
  lanza: ["escudos", "fuego"],
};
export const beats = (a: NavalOrder, b: NavalOrder) => BEATS[a].includes(b);
export const maxEvasion = (engineLvl: number, fleet = "") =>
  (engineLvl >= 1 ? 2 : 1) + (fleet === "aeldari" ? 1 : 0);
export const hullPercentage = (hull: number, maxHull: number) =>
  maxHull > 0 ? Math.round(Math.min(1, Math.max(0, hull / maxHull)) * 100) : 0;

/** Módulo que refuerza cada orden. */
export const ORDER_MODULE: Record<NavalOrder, string> = {
  fuego: "baterias",
  escudos: "camara_escudos",
  abordaje: "cubierta_abordaje",
  evasion: "motores_plasma",
  lanza: "lanza_proa",
};
export const NAVAL_MODULES = [
  "baterias",
  "camara_escudos",
  "cubierta_abordaje",
  "motores_plasma",
  "lanza_proa",
  "blindaje_proa",
];

export const RAID_COST = 100;
export const LOOT_CAP = 600;

export function isValidPlan(p: string[], engineLvl = 0, fleet = ""): p is NavalOrder[] {
  return (
    p.length === 5 &&
    p.every((o) => Object.hasOwn(ORDERS, o)) &&
    p.filter((o) => o === "lanza").length <= 1 &&
    p.filter((o) => o === "evasion").length <= maxEvasion(engineLvl, fleet)
  );
}

/** Botín: 10 % + 5 % por abordaje exitoso, máx. 20 % (+5 % por nivel de Cubierta de abordaje) y 600 créditos. */
export function lootFor(defenderCredits: number, boardingHits: number, deckLevel = 0) {
  const pct = Math.min(0.1 + 0.05 * boardingHits, 0.2 + 0.05 * deckLevel);
  return Math.min(LOOT_CAP, Math.floor(Math.max(defenderCredits, 0) * pct));
}

/**
 * Ajuste de impactos por mejoras (espejo SQL): la orden ganadora suma 2 + nivel de módulo,
 * la perdedora queda a la mitad y el rival amortigua (nivel+1)/2; la evasión ganadora esquiva todo.
 */
export function upgradedHits(
  base: number,
  own: NavalOrder,
  target: NavalOrder,
  ownLvl: number,
  tgt: { orderLvl: number; shieldLvl: number; engineLvl: number; armourLvl: number },
) {
  let h = base;
  if (h > 0 && beats(own, target)) h += 2 + ownLvl;
  if (h > 0 && beats(target, own)) {
    h = Math.trunc(h / 2);
    if (tgt.orderLvl > 0) h -= Math.floor((tgt.orderLvl + 1) / 2);
  }
  if (target === "evasion" && beats("evasion", own)) h = 0;
  if (target === "evasion" && beats(own, "evasion")) h -= tgt.engineLvl;
  if (target === "escudos" && own !== "lanza") h = Math.trunc((h * (10 - tgt.shieldLvl)) / 10);
  return Math.max(h - tgt.armourLvl, 0);
}

/** Un crítico nunca deja el Puente por debajo de nivel 1. */
export function levelAfterCrit(module: string, level: number, lost: boolean) {
  if (!lost) return level;
  if (module === "puente" && level <= 1) return level;
  return Math.max(0, level - 1);
}

export const OBJECTIVE_LABEL: Record<string, string> = {
  casco: "Nave incapacitada: casco a cero",
  retirada_warp: "Retirada warp: créditos entregados al vencedor",
  silencio: "Derrota por no confirmar antes del plazo",
  abordaje: "Abordaje y saqueo: tropas en la cubierta enemiga",
  saqueo: "Saqueo de las bodegas enemigas",
  defensa: "Defensa resistida: el asaltante se retira",
  retirada_contacto: "Retirada: rompió el contacto y abandonó el combate",
  anulado_v2: "Anulado por la llegada del nuevo sistema de combate (créditos devueltos)",
  anulado_v3: "Anulado por la actualización del combate naval (créditos devueltos)",
  destruida: "Nave destruida: su comandante empieza de cero",
  salto_warp: "Huida al disforme: perdió el duelo pero salvó la nave",
  tiempo: "Tiempo agotado: gana quien conserva más casco",
  abandono: "Abandono: no dio órdenes antes del plazo",
};

export type RaidRound = {
  round: number;
  block?: number;
  a_order: NavalOrder;
  d_order: NavalOrder;
  a_hits: number;
  d_hits: number;
  a_sixes?: number;
  d_sixes?: number;
  a_heal?: number;
  d_heal?: number;
  a_hull: number;
  d_hull: number;
};
export type RaidCrit = { module: string; lost_level?: boolean; saved?: boolean };
export type RaidReport = {
  rounds?: RaidRound[];
  attacker_crits?: RaidCrit[];
  defender_crits?: RaidCrit[];
  a_hull0?: number;
  d_hull0?: number;
  objective?: string;
  boarding?: number;
};

export const RAID_ERR: Record<string, string> = {
  "in warp": "Una de las naves está en el warp: no se puede localizar ni atacar",
  "queue full": "Cola completa: máximo cinco trabajos, incluido el que está en curso",
  "job active": "El trabajo ya está en curso y no se puede cancelar",
  "busy module": "Este sistema ya tiene un trabajo pendiente",
  "cancel later first": "Cancela primero los trabajos posteriores que dependen de este",
  self: "No puedes asaltar tu propia nave",
  plan: "Plan inválido: elige cinco órdenes respetando los usos de Lanza y Evasión",
  "ship busy":
    "La nave sigue enfrentada: termina el combate antes de hacer obras o iniciar otro duelo",
  "repair or works":
    "Ambas naves deben terminar sus obras y reparaciones y tener casco mayor que cero",
  "cargo full": "Bodega llena: amplía su capacidad OC",
  "OC unavailable": "Faltan datos OC verificables para reservar espacio",
  "no slots": "No quedan ranuras: mejora el Puente",
  "bridge level": "Mejora primero el Puente a ese nivel",
  "max level": "Nivel máximo alcanzado",
  "not repaired": "Repara primero el módulo averiado",
  "no ship": "Ambos jugadores necesitan nave",
  daily: "Ya lanzaste un asalto en las últimas 24 h",
  returning: "Tu nave aún regresa de la ofensiva abortada",
  "not pending": "Esa ofensiva ya no se puede abortar",
  protected: "Esa nave está en el warp: protegida durante 48 h desde el final del combate",
  credits: "Créditos insuficientes",
  locked: "El plan ya está fijado",
  "escort slots": "Ya tienes tres escuadrones de escoltas",
  full: "El escuadrón ya está completo",
  "not damaged": "El módulo no necesita reparación",
};
export const raidError = (m: string) =>
  RAID_ERR[Object.keys(RAID_ERR).find((k) => m.includes(k)) ?? ""] ?? "Operación rechazada";
