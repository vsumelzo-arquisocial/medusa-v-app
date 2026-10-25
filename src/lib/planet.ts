// Medusa V map: 42 land regions on 7 continents, generated from the planet texture
// (src/data/planet-regions.json). Region id = row id in the database.
// Land borders give adjacency; sea routes link each continent to its two nearest ones.
import regionData from "@/data/planet-regions.json";
export type Vec3 = [number, number, number];

export interface Cell {
  id: number;
  center: Vec3;
  land: number[];
  sea: number[];
  neighbors: number[];
  continent: number;
}
export const CELLS: Cell[] = regionData.regions.map((r) => ({
  id: r.id,
  center: r.center as Vec3,
  land: r.land,
  sea: r.sea,
  continent: r.continent,
  neighbors: [...r.land, ...r.sea].sort((x, y) => x - y),
}));
export const CONTINENTS = [
  "Ferrum Septentrio",
  "Gorgon Maior",
  "Tharsis Rubra",
  "Ínsula Cineris",
  "Australis Medusae",
  "Arco Glacial",
  "Escollo de Vulcan",
];

/** Equirectangular region grid (255 = ocean). */
export const GRID = {
  w: regionData.w,
  h: regionData.h,
  data: Uint8Array.from(atob(regionData.grid), (c) => c.charCodeAt(0)),
};
export function regionAt(p: Vec3): number | null {
  const lon = Math.atan2(p[0], p[2]),
    lat = Math.asin(Math.max(-1, Math.min(1, p[1])));
  const x = Math.min(GRID.w - 1, Math.floor((lon / (2 * Math.PI) + 0.5) * GRID.w));
  const y = Math.min(GRID.h - 1, Math.floor((0.5 - lat / Math.PI) * GRID.h));
  const v = GRID.data[y * GRID.w + x]!;
  return v === 255 ? null : v;
}

/** Region map of one planet or moon: grid stores local indices, cells carry global region ids. */
export interface BodyMap {
  cells: Cell[];
  grid: { w: number; h: number; data: Uint8Array };
  index: Map<number, number>;
}
interface RawMap {
  w: number;
  h: number;
  grid: string;
  regions: { id: number; center: number[]; land: number[]; sea: number[]; continent: number }[];
}
function buildMap(raw: RawMap): BodyMap {
  const cells = raw.regions.map((r) => ({
    id: r.id,
    center: r.center as Vec3,
    land: r.land,
    sea: r.sea,
    continent: r.continent,
    neighbors: [...r.land, ...r.sea].sort((x, y) => x - y),
  }));
  return {
    cells,
    grid: { w: raw.w, h: raw.h, data: Uint8Array.from(atob(raw.grid), (c) => c.charCodeAt(0)) },
    index: new Map(cells.map((c, i) => [c.id, i])),
  };
}
const RAW = import.meta.glob<RawMap>("../data/bodies/*.json", { eager: true, import: "default" });
export const BODY_MAPS: Record<string, BodyMap> = { "medusa-5": buildMap(regionData as RawMap) };
for (const [path, raw] of Object.entries(RAW))
  BODY_MAPS[path.split("/").pop()!.replace(".json", "")] = buildMap(raw);
export function regionAtMap(map: BodyMap, p: Vec3): number | null {
  const lon = Math.atan2(p[0], p[2]),
    lat = Math.asin(Math.max(-1, Math.min(1, p[1])));
  const x = Math.min(map.grid.w - 1, Math.floor((lon / (2 * Math.PI) + 0.5) * map.grid.w));
  const y = Math.min(map.grid.h - 1, Math.floor((0.5 - lat / Math.PI) * map.grid.h));
  const v = map.grid.data[y * map.grid.w + x]!;
  return v === 255 ? null : (map.cells[v]?.id ?? null);
}

export type RegionType =
  "yermo" | "colmena" | "dique" | "forja" | "mina" | "puerto" | "arsenal" | "bastion";
export const REGION_TYPES: Record<
  RegionType,
  { name: string; bonus: string; glyph: string; effect: string }
> = {
  yermo: { name: "Yermo", bonus: "Sin bonificación", glyph: "·", effect: "" },
  mina: {
    name: "Mina",
    bonus: "+40 créditos diarios por mina",
    glyph: "⛏",
    effect: "créditos diarios",
  },
  forja: {
    name: "Forja",
    bonus: "−10/15/20 % coste de mejoras de la nave",
    glyph: "⚒",
    effect: "coste de mejoras de nave",
  },
  dique: {
    name: "Dique orbital",
    bonus: "−10/15/20 % coste y tiempo de reparaciones de casco y módulos",
    glyph: "⚙",
    effect: "coste y tiempo de reparación",
  },
  arsenal: {
    name: "Arsenal",
    bonus: "−10/15/20 % coste de reclutar unidades",
    glyph: "✚",
    effect: "coste de reclutamiento",
  },
  colmena: {
    name: "Ciudad colmena",
    bonus: "−10/15/20 % tiempo de reclutamiento y reentrenamiento",
    glyph: "▲",
    effect: "tiempo de reclutamiento",
  },
  puerto: {
    name: "Puerto estelar",
    bonus: "+6/9/12 h de protección warp tras un combate naval",
    glyph: "✈",
    effect: "protección warp",
  },
  bastion: {
    name: "Bastión",
    bonus: "+10/15/20 % capacidad de bodega (OC)",
    glyph: "♜",
    effect: "capacidad de bodega",
  },
};

/** Stepped region bonus: 1 region 10 %, 2 regions 15 %, 3+ regions 20 % (cap). Mirrors SQL region_rate. */
export function regionRate(owned: string[], type: RegionType) {
  const n = owned.filter((t) => t === type).length;
  return n >= 3 ? 0.2 : n === 2 ? 0.15 : n === 1 ? 0.1 : 0;
}

/** Human-readable active bonuses, e.g. "Forja ×2: −15 % coste de mejoras de nave". */
export function activeRegionBonuses(owned: string[]) {
  return (Object.keys(REGION_TYPES) as RegionType[])
    .filter((t) => t !== "yermo" && regionRate(owned, t) > 0)
    .map((t) => {
      const r = regionRate(owned, t);
      const n = owned.filter((x) => x === t).length;
      const pct = Math.round(r * 100);
      const value =
        t === "puerto"
          ? `+${Math.round(r * 60)} h`
          : t === "mina" || t === "bastion"
            ? `+${pct} %`
            : `−${pct} %`;
      return {
        type: t,
        count: n,
        label: `${REGION_TYPES[t].name} ×${n}: ${value} ${REGION_TYPES[t].effect}`,
      };
    });
}

export const EMBLEMS = ["✠", "☩", "⚙", "☠", "✪", "⚔", "♜", "☢", "✦", "♆", "⚜", "☬", "✹", "❖"];

/** Legacy recruitment view helper built on the 40k region curve. */
export function recruitBonus(owned: string[], _category: string) {
  return {
    time: 1 - regionRate(owned, "colmena"),
    cost: 1 - regionRate(owned, "arsenal"),
    extraTroops: 0,
    income: 0,
  };
}

/** Advantage in random resolution: +5 % per duplicate region of an already-owned type, capped at +20 %. */
export function duplicateAdvantage(owned: string[]) {
  return Math.min(0.2, 0.05 * (owned.length - new Set(owned).size));
}

export function isAdjacent(target: number, ownedIds: number[]) {
  return ownedIds.some((o) => CELLS[o]?.neighbors.includes(target));
}
