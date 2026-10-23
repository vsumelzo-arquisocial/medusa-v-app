// Heraldic standards for the campaign map. Each side only sees its own heraldry.
import type { Allegiance } from "@/lib/factions";
import aquila from "@/assets/emblems/aquila.png";
import mechanicum from "@/assets/emblems/mechanicum.png";
import titanicum from "@/assets/emblems/titanicum.png";
import solar from "@/assets/emblems/solar_auxilia.png";
import darkMech from "@/assets/emblems/dark_mechanicum.png";
import chaos from "@/assets/emblems/chaos_star.png";
import dark_angels from "@/assets/emblems/dark_angels.png";
import white_scars from "@/assets/emblems/white_scars.png";
import space_wolves from "@/assets/emblems/space_wolves.png";
import imperial_fists from "@/assets/emblems/imperial_fists.png";
import blood_angels from "@/assets/emblems/blood_angels.png";
import iron_hands from "@/assets/emblems/iron_hands.png";
import ultramarines from "@/assets/emblems/ultramarines.png";
import salamanders from "@/assets/emblems/salamanders.png";
import raven_guard from "@/assets/emblems/raven_guard.png";
import emperors_children from "@/assets/emblems/emperors_children.png";
import iron_warriors from "@/assets/emblems/iron_warriors.png";
import night_lords from "@/assets/emblems/night_lords.png";
import world_eaters from "@/assets/emblems/world_eaters.png";
import death_guard from "@/assets/emblems/death_guard.png";
import thousand_sons from "@/assets/emblems/thousand_sons.png";
import sons_of_horus from "@/assets/emblems/sons_of_horus.png";
import word_bearers from "@/assets/emblems/word_bearers.png";
import alpha_legion from "@/assets/emblems/alpha_legion.png";
import black_templars from "@/assets/emblems/black_templars.png";
import deathwatch from "@/assets/emblems/deathwatch.png";
import grey_knights from "@/assets/emblems/grey_knights.png";
import sororitas from "@/assets/emblems/sororitas.png";
import custodes from "@/assets/emblems/custodes.png";
import astra_militarum from "@/assets/emblems/astra_militarum.png";
import inquisition from "@/assets/emblems/inquisition.png";
import imperial_knights from "@/assets/emblems/imperial_knights.png";
import chaos_knights from "@/assets/emblems/chaos_knights.png";
import chaos_daemons from "@/assets/emblems/chaos_daemons.png";
import aeldari from "@/assets/emblems/aeldari.png";
import harlequins from "@/assets/emblems/harlequins.png";
import ynnari from "@/assets/emblems/ynnari.png";
import drukhari from "@/assets/emblems/drukhari.png";
import genestealer_cults from "@/assets/emblems/genestealer_cults.png";
import votann from "@/assets/emblems/votann.png";
import necrons from "@/assets/emblems/necrons.png";
import orks from "@/assets/emblems/orks.png";
import tau from "@/assets/emblems/tau.png";
import tyranids from "@/assets/emblems/tyranids.png";

export interface Emblem { id: string; name: string; src: string; side: Allegiance | "both" }

export const EMBLEM_LIST: Emblem[] = [
  { id: "imperial_fists", name: "Imperial Fists", src: imperial_fists, side: "loyalist" },
  { id: "dark_angels", name: "Dark Angels", src: dark_angels, side: "loyalist" },
  { id: "white_scars", name: "White Scars", src: white_scars, side: "loyalist" },
  { id: "space_wolves", name: "Space Wolves", src: space_wolves, side: "loyalist" },
  { id: "blood_angels", name: "Blood Angels", src: blood_angels, side: "loyalist" },
  { id: "iron_hands", name: "Iron Hands", src: iron_hands, side: "loyalist" },
  { id: "ultramarines", name: "Ultramarines", src: ultramarines, side: "loyalist" },
  { id: "salamanders", name: "Salamanders", src: salamanders, side: "loyalist" },
  { id: "raven_guard", name: "Raven Guard", src: raven_guard, side: "loyalist" },
  { id: "aquila", name: "Aquila Imperial", src: aquila, side: "loyalist" },
  { id: "solar_auxilia", name: "Solar Auxilia", src: solar, side: "loyalist" },
  { id: "mechanicum", name: "Mechanicum", src: mechanicum, side: "loyalist" },
  { id: "titanicum", name: "Collegia Titanica", src: titanicum, side: "loyalist" },
  { id: "sons_of_horus", name: "Sons of Horus", src: sons_of_horus, side: "traitor" },
  { id: "emperors_children", name: "Emperor's Children", src: emperors_children, side: "traitor" },
  { id: "iron_warriors", name: "Iron Warriors", src: iron_warriors, side: "traitor" },
  { id: "night_lords", name: "Night Lords", src: night_lords, side: "traitor" },
  { id: "world_eaters", name: "World Eaters", src: world_eaters, side: "traitor" },
  { id: "death_guard", name: "Death Guard", src: death_guard, side: "traitor" },
  { id: "thousand_sons", name: "Thousand Sons", src: thousand_sons, side: "traitor" },
  { id: "word_bearers", name: "Word Bearers", src: word_bearers, side: "traitor" },
  { id: "alpha_legion", name: "Alpha Legion", src: alpha_legion, side: "traitor" },
  { id: "chaos_star", name: "Ojo del Señor de la Guerra", src: chaos, side: "traitor" },
  { id: "dark_mechanicum", name: "Dark Mechanicum", src: darkMech, side: "traitor" },
];

const FACTION_EMBLEM: Record<string, string> = { solar_auxilia: "solar_auxilia", mechanicum: "mechanicum", titanicum: "titanicum", dark_mechanicum: "dark_mechanicum" };

/** Emblems for one side, with the player's own legion/faction first. */
export function emblemsFor(side: Allegiance, legion?: string | null, faction?: string | null): Emblem[] {
  const list = EMBLEM_LIST.filter((e) => e.side === side || e.side === "both");
  const first = legion ?? (faction ? FACTION_EMBLEM[faction] : undefined);
  return first ? [...list.filter((e) => e.id === first), ...list.filter((e) => e.id !== first)] : list;
}

// ---- Warhammer 40.000 heraldry, chosen by army faction and variant ----
const W40K: Emblem[] = [
  { id: "black_templars", name: "Black Templars", src: black_templars, side: "both" },
  { id: "deathwatch", name: "Deathwatch", src: deathwatch, side: "both" },
  { id: "grey_knights", name: "Grey Knights", src: grey_knights, side: "both" },
  { id: "sororitas", name: "Adepta Sororitas", src: sororitas, side: "both" },
  { id: "custodes", name: "Adeptus Custodes", src: custodes, side: "both" },
  { id: "astra_militarum", name: "Astra Militarum", src: astra_militarum, side: "both" },
  { id: "inquisition", name: "Inquisición", src: inquisition, side: "both" },
  { id: "imperial_knights", name: "Imperial Knights", src: imperial_knights, side: "both" },
  { id: "chaos_knights", name: "Chaos Knights", src: chaos_knights, side: "both" },
  { id: "chaos_daemons", name: "Demonios del Caos", src: chaos_daemons, side: "both" },
  { id: "aeldari", name: "Aeldari", src: aeldari, side: "both" },
  { id: "harlequins", name: "Harlequins", src: harlequins, side: "both" },
  { id: "ynnari", name: "Ynnari", src: ynnari, side: "both" },
  { id: "drukhari", name: "Drukhari", src: drukhari, side: "both" },
  { id: "genestealer_cults", name: "Cultos Genestealer", src: genestealer_cults, side: "both" },
  { id: "votann", name: "Ligas de Votann", src: votann, side: "both" },
  { id: "necrons", name: "Necrones", src: necrons, side: "both" },
  { id: "orks", name: "Orkos", src: orks, side: "both" },
  { id: "tau", name: "Imperio T'au", src: tau, side: "both" },
  { id: "tyranids", name: "Tiránidos", src: tyranids, side: "both" },
];
const ALL = [...EMBLEM_LIST, ...W40K];

const MARINE_CHAPTERS = ["ultramarines", "imperial_fists", "iron_hands", "salamanders", "raven_guard", "white_scars", "black_templars", "blood_angels", "dark_angels", "space_wolves", "deathwatch"];

/** Emblem ids available to each 40k faction (first = default). */
export const FACTION_EMBLEMS_40K: Record<string, string[]> = {
  "space-marines": [...MARINE_CHAPTERS, "aquila"],
  "black-templars": ["black_templars", "aquila"],
  "blood-angels": ["blood_angels", "aquila"],
  "dark-angels": ["dark_angels", "aquila"],
  "deathwatch": ["deathwatch", "inquisition", "aquila"],
  "space-wolves": ["space_wolves", "aquila"],
  "grey-knights": ["grey_knights", "inquisition", "aquila"],
  "adepta-sororitas": ["sororitas", "aquila"],
  "adeptus-custodes": ["custodes", "aquila"],
  "adeptus-mechanicus": ["mechanicum", "aquila"],
  "astra-militarum": ["astra_militarum", "aquila"],
  "imperial-agents": ["inquisition", "aquila"],
  "imperial-knights": ["imperial_knights", "aquila"],
  "titan-legions": ["titanicum", "aquila"],
  "chaos-space-marines": ["chaos_star", "iron_warriors", "night_lords", "word_bearers", "alpha_legion", "sons_of_horus"],
  "chaos-daemons": ["chaos_daemons", "chaos_star"],
  "chaos-knights": ["chaos_knights", "chaos_star"],
  "chaos-titan-legions": ["dark_mechanicum", "chaos_star"],
  "death-guard": ["death_guard", "chaos_star"],
  "emperors-children": ["emperors_children", "chaos_star"],
  "thousand-sons": ["thousand_sons", "chaos_star"],
  "world-eaters": ["world_eaters", "chaos_star"],
  "aeldari": ["aeldari", "harlequins", "ynnari"],
  "drukhari": ["drukhari"],
  "genestealer-cults": ["genestealer_cults"],
  "leagues-of-votann": ["votann"],
  "necrons": ["necrons"],
  "orks": ["orks"],
  "tau-empire": ["tau"],
  "tyranids": ["tyranids"],
};

/** Emblems for a 40k army; the chosen variant (e.g. a chapter) comes first. */
export function emblemsFor40k(faction?: string | null, variant?: string | null): Emblem[] {
  const ids = (faction && FACTION_EMBLEMS_40K[faction]) || [];
  const v = variant?.replace(/-/g, "_");
  const ordered = v && ids.includes(v) ? [v, ...ids.filter((i) => i !== v)] : ids;
  return ordered.flatMap((i) => {const e=ALL.find(e=>e.id===i);return e?[e]:[];});
}

export const emblemSrc = (id?: string | null) => id?.startsWith("data:image") ? id : ALL.find((e) => e.id === id)?.src ?? null;
