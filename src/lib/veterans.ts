import { honourKind, type HonourKind } from "@/lib/honours";

/** Units that become unique named veterans: Titans, Knights and commanders (mirrors public.veteran_kind). */
export function veteranKind(u: { name: string; unit_type?: { type: string } }, category?: string): Exclude<HonourKind, "superpesado"> | null {
  if (category === "titan") return "titan";
  if (category === "caballero") return "caballero";
  if (/command|archmagos|praetor|consul|tribune|centurion|delegatus/i.test(u.name)) return "personaje";
  const k = honourKind(u, category);
  return k === "titan" || k === "caballero" ? k : null;
}

export interface VeteranEntry { unit_id: number; name: string; destroyed: boolean; wounds_lost: number; max_wounds: number; mvp: boolean }

/** Marks the first entry of the chosen MVP unit name as MVP. */
export function markMvp(entries: VeteranEntry[], mvpUnitName: string | undefined, unitName: (id: number) => string): VeteranEntry[] {
  if (!mvpUnitName) return entries;
  let done = false;
  return entries.map((e) => {
    if (done || unitName(e.unit_id) !== mvpUnitName) return e;
    done = true;
    return { ...e, mvp: true };
  });
}

export const KIND_LABEL: Record<string, string> = { titan: "Titán", caballero: "Caballero", personaje: "Comandante" };
export const STATUS_LABEL: Record<string, string> = { activo: "En servicio", caido: "Caído en combate", recuperando: "En recuperación", retirado: "Retirado" };
