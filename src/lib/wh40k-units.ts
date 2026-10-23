import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UnitKind = "infantry" | "character" | "vehicle" | "monster" | "flyer";
export interface DatasheetModel { name: string; M: string; T: string; Sv: string; inv: string; W: number; Ld: string; OC: string }
export interface DatasheetWeapon { name: string; range: string; type: string; A: string; skill: string; S: string; AP: string; D: string; traits: string }
export interface Datasheet { name: string; kind: UnitKind; keywords: string[]; models: DatasheetModel[]; weapons: DatasheetWeapon[]; loadout: string }

const IMAGES = import.meta.glob("@/assets/units/*.jpg", { eager: true, import: "default" }) as Record<string, string>;
const SHEETS = import.meta.glob("@/data/warhammer40k/datasheets/*.json") as Record<string, () => Promise<{ default: { units: Record<string, Datasheet> } }>>;

/** Faction ids whose image files use a shorter prefix. */
const IMAGE_PREFIX: Record<string, string> = { "tau-empire": "tau", "leagues-of-votann": "votann" };
const FALLBACK: Record<UnitKind, UnitKind[]> = {
  infantry: ["infantry", "character"], character: ["character", "infantry"], vehicle: ["vehicle", "monster"],
  monster: ["monster", "vehicle"], flyer: ["flyer", "vehicle"],
};

export function unitImage(faction: string, kind: UnitKind | undefined): string | undefined {
  const prefix = IMAGE_PREFIX[faction] ?? faction;
  for (const k of FALLBACK[kind ?? "infantry"]) {
    const hit = Object.entries(IMAGES).find(([p]) => p.endsWith(`/${prefix}-${k}.jpg`));
    if (hit) return hit[1];
  }
  return undefined;
}

export const datasheetsQuery = (faction: string) => queryOptions({
  queryKey: ["wh40k-datasheets", faction], staleTime: Infinity,
  queryFn: async () => {
    const load = Object.entries(SHEETS).find(([p]) => p.endsWith(`/${faction}.json`))?.[1];
    return load ? (await load()).default.units : {};
  },
});
export const findSheet = (sheets: Record<string, Datasheet>, name: string) => sheets[name.toUpperCase()] ?? Object.values(sheets).find((s) => s.name.toLowerCase() === name.toLowerCase());

export const squadsQuery = queryOptions({
  queryKey: ["wh40k-squads"],
  queryFn: async () => {
    await supabase.rpc("wh40k_tick");
    const { data, error } = await supabase.from("wh40k_squads").select("*").order("created_at");
    if (error) throw error;
    return data ?? [];
  },
});
export const squadHistoryQuery = queryOptions({
  queryKey: ["wh40k-squad-history"],
  queryFn: async () => {
    const { data, error } = await supabase.from("wh40k_squad_history").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export const STATUS_ES: Record<string, string> = {
  ready: "Lista para combatir", training: "En entrenamiento", damaged: "Con bajas o daños", restoring: "Reponiendo bajas / reparando",
  retraining: "Reentrenando", fallen: "Caída", dismissed: "Licenciada",
};
export const HISTORY_ES: Record<string, string> = {
  recruited: "Reclutada", battle: "Batalla", fallen: "Cayó en combate", restore_started: "Reparación iniciada", restored: "Bajas repuestas / reparada",
  retrain_started: "Reentrenamiento iniciado", retrained: "Legado recuperado", loadout: "Armamento actualizado",
};
