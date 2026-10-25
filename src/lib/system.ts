// Medusa system: sun, nine planets and moons. Mirrors public.celestial_bodies and public.travel_seconds.
export type BodyKind = "planet" | "moon";
export interface BodyInfo {
  id: string;
  name: string;
  kind: BodyKind;
  parent: string | null;
  biome: string;
  orbit: number;
  playable: boolean;
  size: number;
}

export const BODIES: BodyInfo[] = [
  {
    id: "medusa-1",
    name: "Ignis (Medusa I)",
    kind: "planet",
    parent: null,
    biome: "Inhóspito · temperaturas extremas",
    orbit: 1,
    playable: false,
    size: 0.7,
  },
  {
    id: "medusa-2",
    name: "Medusa II",
    kind: "planet",
    parent: null,
    biome: "Desértico",
    orbit: 2,
    playable: true,
    size: 0.9,
  },
  {
    id: "medusa-3",
    name: "Medusa III",
    kind: "planet",
    parent: null,
    biome: "Rojo y sin agua",
    orbit: 3,
    playable: true,
    size: 0.75,
  },
  {
    id: "medusa-3a",
    name: "Fobos Rubra",
    kind: "moon",
    parent: "medusa-3",
    biome: "Luna",
    orbit: 3,
    playable: true,
    size: 0.3,
  },
  {
    id: "medusa-4",
    name: "Medusa IV",
    kind: "planet",
    parent: null,
    biome: "Tierra con mares",
    orbit: 4,
    playable: true,
    size: 1.15,
  },
  {
    id: "medusa-4a",
    name: "Selene Prima",
    kind: "moon",
    parent: "medusa-4",
    biome: "Luna",
    orbit: 4,
    playable: true,
    size: 0.32,
  },
  {
    id: "medusa-4b",
    name: "Selene Secunda",
    kind: "moon",
    parent: "medusa-4",
    biome: "Luna",
    orbit: 4,
    playable: true,
    size: 0.36,
  },
  {
    id: "medusa-5",
    name: "Medusa V",
    kind: "planet",
    parent: null,
    biome: "Terrestre",
    orbit: 5,
    playable: true,
    size: 1,
  },
  {
    id: "medusa-6",
    name: "Medusa VI",
    kind: "planet",
    parent: null,
    biome: "Gigante gaseoso",
    orbit: 6,
    playable: false,
    size: 1.8,
  },
  {
    id: "medusa-7",
    name: "Medusa VII",
    kind: "planet",
    parent: null,
    biome: "Gigante gaseoso",
    orbit: 7,
    playable: false,
    size: 1.5,
  },
  {
    id: "medusa-8",
    name: "Medusa VIII",
    kind: "planet",
    parent: null,
    biome: "Helado",
    orbit: 8,
    playable: true,
    size: 0.85,
  },
  {
    id: "medusa-8a",
    name: "Criovigía",
    kind: "moon",
    parent: "medusa-8",
    biome: "Luna helada",
    orbit: 8,
    playable: true,
    size: 0.34,
  },
  {
    id: "medusa-9",
    name: "Medusa IX",
    kind: "planet",
    parent: null,
    biome: "Gigante gaseoso",
    orbit: 9,
    playable: false,
    size: 1.3,
  },
];
export const bodyById = (id: string | null | undefined) => BODIES.find((b) => b.id === id);
export const bodyName = (id: string | null | undefined) => bodyById(id)?.name ?? "—";

const HOUR = 3600,
  WEEK = 7 * 24 * HOUR;
/** Farthest playable orbits (II → VIII) take one week in the warp; same orbit (planet ↔ moon) takes 3 h. */
export function travelSeconds(from: string, to: string) {
  const a = bodyById(from),
    b = bodyById(to);
  if (!a || !b || a.id === b.id) return 0;
  if (a.orbit === b.orbit) return 3 * HOUR;
  return Math.max(3 * HOUR, Math.round((WEEK * Math.abs(a.orbit - b.orbit)) / 6));
}

/** Motores: −10 % de tiempo de viaje por nivel (máx. 3). Mirrors public.travel_seconds_for. */
export function travelSecondsWith(from: string, to: string, motors: number) {
  return Math.round(travelSeconds(from, to) * (1 - 0.1 * Math.min(3, Math.max(0, motors))));
}

export function formatDuration(seconds: number) {
  const d = Math.floor(seconds / 86400),
    h = Math.floor((seconds % 86400) / 3600),
    m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}
