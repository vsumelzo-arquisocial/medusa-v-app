export type Faction = "Legiones Astartes" | "Solar Auxillia" | "Mechanicum" | "Dark Mechanicum"
  | "Strategic Assets" | "Collegia Titanica" | "Questoris Familia" | "none";
// OJO: "Solar Auxillia" va escrito así en los datos. No lo corrijas en los datos; en la UI muestra "Solar Auxilia".

export type Allegiance = "Loyalist" | "Traitor";

export type DetachmentType = "HQ" | "Core" | "Support" | "Transport" | "Vanguard" | "Light Armour"
  | "Battle Tank" | "Heavy Armour" | "Artillery" | "Bastion" | "Air Support" | "Knight" | "Titan" | "Dedicated";

export type Subfaction = "Dark Angels" | "Emperor's Children" | "Iron Warriors" | "White Scars" | "Space Wolves"
  | "Imperial Fists" | "Night Lords" | "Blood Angels" | "Iron Hands" | "World Eaters" | "Ultramarines"
  | "Death Guard" | "Thousand Sons" | "Sons of Horus" | "Word Bearers" | "Salamanders" | "Raven Guard" | "Alpha Legion";

export type SlotType = "compulsory" | "optional" | "choice";

export interface Formation {
  id: number; name: string; faction: Faction;
  subfaction: Subfaction | null; allegiance: Allegiance | null;
  formation_slots: { slot_type: SlotType; slot_id: number[]; text?: string }[];
  rules: { name?: string; text: string }[];
  legend?: boolean;                                   // true = Iconic Formation
  points?: { compulsory: number; optional: number };  // solo Iconic: coste de referencia
}

export interface FormationSlot {
  id: number; type: DetachmentType; faction: Faction;
  restricted: boolean;   // true = solo los destacamentos de `options`
  options: number[];     // ids de detachments
  description?: string;
}

export interface Detachment {
  id: number; name: string; faction: Faction;
  subfaction: Subfaction | null; allegiance: Allegiance | null;
  unique: boolean;                 // true = solo accesible si un slot lo lista en options
  detachment_type: DetachmentType[];
  base_cost: number; td_ek?: number;   // td_ek = sobrecoste en modo Titandeath
  base_size: number; max_size: number;
  break_strength?: number;          // multiplicador de fuerza de ruptura por modelo (0 = no cuenta)
  main_unit: number[]; related_unit: number[];   // ids de units
  dataslate_loadout: { text?: string; text_option?: string[]; weapon_option?: number[]; itallic_text?: string }[];
  upgrade_options: {
    name: string; unit_ref: number;
    options: { number: number; cost: number; td_ek?: number; size: number; text?: string; break_strength?: number; required?: boolean }[];
  }[];
  loadout_options: { location: string; required?: number; options: { name: string; cost: number; td_ek?: number }[] }[];
  datasheet_info: { text?: string; options?: { text: string; cost: number }[]; info?: string }[];
}

export interface Unit {
  id: number; faction: Faction; subfaction: Subfaction | null; allegiance: Allegiance | null; unique: boolean;
  unit_type: { type: "Infantry" | "Cavalry" | "Walker" | "Vehicle" | "Super-Heavy Vehicle" | "Knight" | "Titan" | "Structure"; value: number };
  name: string; movement: string; save: number; caf: number; morale: number | null; wounds: number;
  weapons: number[];   // ids de weapons
  loadout?: { text?: string; options?: string[] }[];
  special_rules: { name: string; value?: number | string }[];
}

export interface Weapon {
  id: number; name: string;
  profiles: { range: string; dice: number | string | null; to_hit: number | null; ap: number | string;
              traits: { name: string; value?: number | string }[] }[];
}

export interface RuleInfo { name: string; tooltip?: string; description: string[] }  // special_rules y weapon_traits
export type Gamemode = "standard" | "titandeath";

export interface ListSlot {
  uid: string;
  slot_id: number;
  detachment_id: number | null;
  upgrades: { name: string; number: number }[];
  loadouts: { key: string; count: number; weapons: { location: string; weapon: string }[] }[];
  /** Nombres propios de Titanes/Caballeros (uno por modelo). */
  engine_names?: string[];
}

export interface ListGroup { slot_type: SlotType; text: string; slots: ListSlot[] }

export interface ListFormation {
  uid: string;
  formation_id: number | null;
  nickname: string;
  subfaction: Subfaction | null;
  groups: ListGroup[];
}

export interface ArmyList {
  id: string; user_id: string; name: string;
  points: number;
  gamemode: Gamemode;
  faction: Faction;
  allegiance: Allegiance;
  formations: ListFormation[];
  created_at: string; updated_at: string;
}
