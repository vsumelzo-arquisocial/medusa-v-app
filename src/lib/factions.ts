export type Allegiance = "loyalist" | "traitor";

export interface Faction {
  id: string;
  name: string;
  desc: string;
  allegiances: Allegiance[];
}

// Factions playable in Legions Imperialis (core rulebook + supplements).
export const FACTIONS: Faction[] = [
  { id: "astartes", name: "Legiones Astartes", desc: "Los ángeles de la muerte del Emperador, divididos por la Herejía.", allegiances: ["loyalist", "traitor"] },
  { id: "solar_auxilia", name: "Solar Auxilia", desc: "Regimientos de élite del Ejército Imperial, blindados y disciplinados.", allegiances: ["loyalist", "traitor"] },
  { id: "mechanicum", name: "Mechanicum Taghmata", desc: "Las legiones de guerra de Marte al servicio del Omnissiah.", allegiances: ["loyalist", "traitor"] },
  { id: "titanicum", name: "Collegia Titanica", desc: "Legiones de dioses-máquina que caminan sobre el mundo.", allegiances: ["loyalist", "traitor"] },
  { id: "questoris", name: "Questoris Familia", desc: "Casas nobles de Caballeros ligadas por juramentos antiguos.", allegiances: ["loyalist", "traitor"] },
  { id: "dark_mechanicum", name: "Dark Mechanicum", desc: "Tecnosacerdotes renegados que adoran el saber prohibido.", allegiances: ["traitor"] },
];

export interface Legion { id: string; numeral: string; name: string; allegiance: Allegiance }

export const LEGIONS: Legion[] = [
  { id: "dark_angels", numeral: "I", name: "Dark Angels", allegiance: "loyalist" },
  { id: "white_scars", numeral: "V", name: "White Scars", allegiance: "loyalist" },
  { id: "space_wolves", numeral: "VI", name: "Space Wolves", allegiance: "loyalist" },
  { id: "imperial_fists", numeral: "VII", name: "Imperial Fists", allegiance: "loyalist" },
  { id: "blood_angels", numeral: "IX", name: "Blood Angels", allegiance: "loyalist" },
  { id: "iron_hands", numeral: "X", name: "Iron Hands", allegiance: "loyalist" },
  { id: "ultramarines", numeral: "XIII", name: "Ultramarines", allegiance: "loyalist" },
  { id: "salamanders", numeral: "XVIII", name: "Salamanders", allegiance: "loyalist" },
  { id: "raven_guard", numeral: "XIX", name: "Raven Guard", allegiance: "loyalist" },
  { id: "emperors_children", numeral: "III", name: "Emperor's Children", allegiance: "traitor" },
  { id: "iron_warriors", numeral: "IV", name: "Iron Warriors", allegiance: "traitor" },
  { id: "night_lords", numeral: "VIII", name: "Night Lords", allegiance: "traitor" },
  { id: "world_eaters", numeral: "XII", name: "World Eaters", allegiance: "traitor" },
  { id: "death_guard", numeral: "XIV", name: "Death Guard", allegiance: "traitor" },
  { id: "thousand_sons", numeral: "XV", name: "Thousand Sons", allegiance: "traitor" },
  { id: "sons_of_horus", numeral: "XVI", name: "Sons of Horus", allegiance: "traitor" },
  { id: "word_bearers", numeral: "XVII", name: "Word Bearers", allegiance: "traitor" },
  { id: "alpha_legion", numeral: "XX", name: "Alpha Legion", allegiance: "traitor" },
];

export const factionsFor = (a: Allegiance) => FACTIONS.filter((f) => f.allegiances.includes(a));
export const legionsFor = (a: Allegiance) => LEGIONS.filter((l) => l.allegiance === a);
export const factionName = (id?: string | null) => FACTIONS.find((f) => f.id === id)?.name ?? "—";
export const legionLabel = (id?: string | null) => {
  const l = LEGIONS.find((x) => x.id === id);
  return l ? `Legión ${l.numeral} · ${l.name}` : null;
};
