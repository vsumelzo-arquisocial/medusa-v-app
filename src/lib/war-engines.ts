import { detachmentById, formationById, units, factionLabel } from "@/lib/legions/data";
import { engineProfile, unitForDetachment } from "@/lib/battle";
import { formationCost, slotCost, slotSize } from "@/lib/legions/engine";
import type { Gamemode } from "@/types/legions";
import { db } from "@/lib/legions/queries";
import type { ListFormation, ListSlot } from "@/types/legions";

/** Nombres de Titanes y Caballeros inspirados en el lore de la Herejía de Horus. */
export const TITAN_NAMES = [
  "Ira Imperatoris", "Dominus Mortis", "Vulpes Obscura", "Lux Ferrum", "Furor Martis", "Malleus Dei", "Gladius Omnissiah",
  "Ignis Vindicta", "Sanguis Machinae", "Tonitrus Aeternum", "Rex Bellum", "Victrix Medusae", "Mortis Draconis",
  "Umbra Ferox", "Fidelis Ultima", "Nox Aeterna", "Aquila Ferrea", "Lupus Ruber", "Ferrum Invictus", "Spes Ultima",
  "Imperius Rex", "Exitium Stellae", "Vox Tempestatis", "Corvus Vigil", "Clamor Belli", "Pater Machinae",
];
export const KNIGHT_NAMES = [
  "Sir Aldric el Inquebrantable", "Dama Isolde de Voss", "Sir Kael Terryn", "Lord Varian Hawkshaw", "Sir Thorne Draxis",
  "Dama Seraphine Taranis", "Sir Orrin Mancer", "Barón Gerlach Raven", "Sir Lucan Griffith", "Dama Elara Cadmus",
  "Sir Hadrian Vex", "Sir Bastian Corvane", "Dama Morwen Hale", "Sir Edric Stormward", "Sir Malcador Rhyne", "Dama Nyssa Vale",
];
export function randomEngineName(kind: "titan" | "knight", taken: string[] = []) {
  const pool = (kind === "titan" ? TITAN_NAMES : KNIGHT_NAMES).filter((n) => !taken.includes(n));
  const src = pool.length ? pool : kind === "titan" ? TITAN_NAMES : KNIGHT_NAMES;
  return src[Math.floor(Math.random() * src.length)]!;
}

/** Perfil de motor de guerra (Titán/Caballero) del destacamento de un hueco, o null. */
export function slotEngine(s: ListSlot) {
  const d = s.detachment_id !== null ? detachmentById.get(s.detachment_id) : undefined;
  if (!d) return null;
  const u = unitForDetachment(d as { name: string; main_unit?: number[] }, units);
  const prof = u ? engineProfile(u) : null;
  return u && prof ? { unit: u, prof, count: slotSize(db, s) } : null;
}

export const allEngineNames = (fs: ListFormation[]) => fs.flatMap((f) => f.groups.flatMap((g) => g.slots.flatMap((s) => s.engine_names ?? []))).filter(Boolean);

/** Avisos de reglas de la lista respecto a la partida (no bloquean jugar, salvo exceso de puntos). */
export function listCheck(fs: ListFormation[], gm: Gamemode, gamePoints: number) {
  const total = fs.reduce((a, f) => a + formationCost(db, f, gm), 0);
  const mainFaction = fs[0] ? formationById.get(fs[0].formation_id ?? -1)?.faction : undefined;
  const main = fs.reduce((a, f) => a + (formationById.get(f.formation_id ?? -1)?.faction === mainFaction ? formationCost(db, f, gm) : 0), 0);
  const warnings: string[] = [];
  if (!fs.length) warnings.push("La lista está vacía");
  if (gm === "standard" && total > 0 && main < total * 0.7) warnings.push(`La facción principal (${factionLabel(mainFaction ?? "")}) no llega al 70 % de la lista`);
  for (const f of fs) {
    const fm = formationById.get(f.formation_id ?? -1);
    for (const g of f.groups) for (const s of g.slots) {
      const e = slotEngine(s);
      if (!e) continue;
      const c = slotCost(db, s, gm);
      const mainOther = main - (fm?.faction === mainFaction ? c : 0);
      if (c > mainOther) warnings.push(`${e.unit.name} (${c} pts) supera en puntos al resto de la facción principal (${mainOther} pts)`);
      const names = s.engine_names ?? [];
      if (names.filter(Boolean).length < e.count) warnings.push(`${e.unit.name} sin nombre asignado`);
    }
  }
  return { total, overPoints: total > gamePoints, warnings };
}
