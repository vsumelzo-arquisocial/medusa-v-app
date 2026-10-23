import formationsJson from "@/data/legions/formations.json";
import slotsJson from "@/data/legions/formation_slots.json";
import detachmentsJson from "@/data/legions/detachments.json";
import unitsJson from "@/data/legions/units.json";
import weaponsJson from "@/data/legions/weapons.json";
import rulesJson from "@/data/legions/special_rules.json";
import traitsJson from "@/data/legions/weapon_traits.json";
import type { Detachment, Faction, Formation, FormationSlot, RuleInfo, Unit, Weapon } from "@/types/legions";

export const formations = formationsJson as unknown as Formation[];
export const formationSlots = slotsJson as unknown as FormationSlot[];
export const detachments = detachmentsJson as unknown as Detachment[];
export const units = unitsJson as unknown as Unit[];
export const weapons = weaponsJson as unknown as Weapon[];
export const specialRules = rulesJson as unknown as RuleInfo[];
export const weaponTraits = traitsJson as unknown as RuleInfo[];

const index = <T extends { id: number }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
export const formationById = index(formations);
export const slotById = index(formationSlots);
export const detachmentById = index(detachments);
export const unitById = index(units);
export const weaponById = index(weapons);
export const ruleByName = new Map(specialRules.map((r) => [r.name.toLowerCase(), r]));
export const traitByName = new Map(weaponTraits.map((r) => [r.name.toLowerCase(), r]));

export const FACTION_ORDER: Faction[] = [
  "Legiones Astartes", "Solar Auxillia", "Mechanicum", "Dark Mechanicum",
  "Strategic Assets", "Collegia Titanica", "Questoris Familia",
];
export const PLAYABLE_FACTIONS = FACTION_ORDER.filter((f) => f !== "Strategic Assets");

export const factionLabel = (f: Faction | string) => (f === "Solar Auxillia" ? "Solar Auxilia" : f);

/** Accent colour token per faction (defined in styles.css). */
export const factionColor: Record<string, string> = {
  "Legiones Astartes": "var(--f-astartes)",
  "Solar Auxillia": "var(--f-solar)",
  Mechanicum: "var(--f-mech)",
  "Dark Mechanicum": "var(--f-darkmech)",
  "Collegia Titanica": "var(--f-titan)",
  "Questoris Familia": "var(--f-questoris)",
  "Strategic Assets": "var(--f-strategic)",
};
