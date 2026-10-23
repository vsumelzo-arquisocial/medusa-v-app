import warlord from "@/assets/engines/warlord.jpg";
import reaver from "@/assets/engines/reaver.jpg";
import warhound from "@/assets/engines/warhound.jpg";
import knight from "@/assets/engines/knight.jpg";
import infantry from "@/assets/engines/infantry.jpg";
import walker from "@/assets/engines/walker.jpg";
import vehicle from "@/assets/engines/vehicle.jpg";
import superheavy from "@/assets/engines/superheavy.jpg";
import flyer from "@/assets/engines/flyer.jpg";
import cavalry from "@/assets/engines/cavalry.jpg";

export type SchematicKind = "titan-warlord" | "titan-reaver" | "titan-warhound" | "knight" | "flyer" | "superheavy" | "vehicle" | "walker" | "cavalry" | "infantry";

const has = (n: string, ...k: string[]) => k.some((x) => n.includes(x));

/** Clasifica una unidad por nombre y reglas (el tipo de unidad leído de los manuales no es fiable). */
export function schematicKind(u: { name: string; special_rules?: { name: string }[] }): SchematicKind {
  const n = u.name.toLowerCase();
  const rules = (u.special_rules ?? []).map((r) => r.name.toLowerCase()).join(" ");
  if (n.includes("titan")) {
    if (has(n, "warhound", "dire wolf")) return "titan-warhound";
    if (has(n, "reaver", "warbringer")) return "titan-reaver";
    return "titan-warlord";
  }
  if (has(n, "knight", "armiger", "moirax")) return "knight";
  if (rules.includes("flyer") || has(n, "thunderhawk", "xiphon", "storm eagle", "fire raptor", "primaris-lightning", "lightning", "thunderbolt", "avenger", "marauder", "vultarax", "storm bird", "arvus", "valkyrie")) return "flyer";
  if (has(n, "fellblade", "falchion", "typhon", "cerberus", "shadowsword", "baneblade", "stormhammer", "stormblade", "stormsword", "macharius", "malcador", "kratos", "glaive", "spartan", "mastodon", "krios venator", "thanatar", "ordinatus", "minotaur")) return "superheavy";
  if (has(n, "dreadnought", "contemptor", "deredeo", "leviathan", "castellax", "vorax", "domitar", "thallax", "ursarax", "karacnos", "kytan", "dominator", "scorpius"))
    return has(n, "thallax", "ursarax") ? "infantry" : has(n, "karacnos") ? "vehicle" : "walker";
  if (has(n, "jetbike", "scimitar", "biker", "bike", "sky-hunter", "rough rider", "outrider", "land speeder", "javelin")) return "cavalry";
  if (has(n, "rhino", "predator", "sicaran", "kratos", "land raider", "spartan", "whirlwind", "sabre", "vindicator", "deimos", "leman russ", "malcador", "basilisk", "dracosan", "aethon", "gorgon", "tank", "rapier", "tarantula", "arquitor", "carnodon", "triaros", "krios", "kratos", "termite", "drop pod", "battery", "battle tank")) return "vehicle";
  return "infantry";
}

export const SCHEMATIC_IMG: Record<SchematicKind, string> = {
  "titan-warlord": warlord, "titan-reaver": reaver, "titan-warhound": warhound, knight, flyer, superheavy, vehicle, walker, cavalry, infantry,
};
export const SCHEMATIC_LABEL: Record<SchematicKind, string> = {
  "titan-warlord": "Titán de batalla", "titan-reaver": "Titán de batalla", "titan-warhound": "Titán explorador", knight: "Caballero",
  flyer: "Aeronave", superheavy: "Superpesado", vehicle: "Vehículo", walker: "Bípode", cavalry: "Caballería", infantry: "Infantería",
};
export const schematicFor = (u: { name: string; special_rules?: { name: string }[] }) => SCHEMATIC_IMG[schematicKind(u)];
