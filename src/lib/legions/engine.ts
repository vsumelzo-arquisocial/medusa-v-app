import type {
  Allegiance, ArmyList, Detachment, Formation, FormationSlot, Gamemode, ListFormation, ListSlot, Subfaction,
} from "@/types/legions";

export interface Db {
  formationById: Map<number, Formation>;
  slotById: Map<number, FormationSlot>;
  detachmentById: Map<number, Detachment>;
  detachments: Detachment[];
  formations: Formation[];
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

const FACTION_SORT = ["Legiones Astartes", "Solar Auxillia", "Mechanicum", "Dark Mechanicum", "Strategic Assets", "Collegia Titanica", "Questoris Familia"];

/* ---------- Formation selector ---------- */
export function availableFormations(db: Db, list: Pick<ArmyList, "gamemode" | "allegiance">) {
  return db.formations
    .filter((f) => (list.gamemode === "titandeath" ? f.id >= 4000 && f.id <= 4999 : true))
    .filter((f) => f.allegiance === null || f.allegiance === list.allegiance)
    .sort((a, b) => FACTION_SORT.indexOf(a.faction) - FACTION_SORT.indexOf(b.faction));
}

export function formationLabel(f: Formation) {
  let s = f.name;
  if (f.subfaction) s = `${f.subfaction} ${s}`;
  if (f.legend) s = `IF: ${s}`;
  return s;
}

/* ---------- Detachment options ---------- */
export function detachmentOptions(
  db: Db, slot: FormationSlot, formationSub: Subfaction | null, allegiance: Allegiance, selected: number | null,
): Detachment[] {
  const byOptions = slot.options.map((id) => db.detachmentById.get(id)).filter((d): d is Detachment => !!d);
  let pool: Detachment[];
  if (slot.restricted) pool = byOptions;
  else {
    const generic = db.detachments.filter(
      (d) => d.detachment_type.includes(slot.type) && d.faction === slot.faction && !d.unique,
    );
    pool = [...generic, ...byOptions.filter((d) => !generic.includes(d))];
  }
  const filtered = pool.filter(
    (d) => (d.subfaction === null || d.subfaction === formationSub) && (d.allegiance === null || d.allegiance === allegiance),
  );
  if (selected !== null && !filtered.some((d) => d.id === selected)) {
    const sel = db.detachmentById.get(selected);
    if (sel) filtered.unshift(sel);
  }
  return filtered;
}

/* ---------- Building ---------- */
export function emptySlot(slot_id: number): ListSlot {
  return { uid: uid(), slot_id, detachment_id: null, upgrades: [], loadouts: [] };
}

export function applyDetachment(slot: ListSlot, d: Detachment | null): ListSlot {
  if (!d) return { ...slot, detachment_id: null, upgrades: [], loadouts: [] };
  const upgrades = d.upgrade_options
    .filter((u) => u.options[0]?.required)
    .map((u) => ({ name: u.name, number: u.options[0]!.number }));
  const req = d.loadout_options.filter((l) => l.required);
  const loadouts: ListSlot["loadouts"] = [];
  if (req.length) {
    const weapons = req.map((l) => ({ location: l.location, weapon: l.options[0]?.name ?? "" }));
    loadouts.push({ key: loadoutKey(weapons), count: req[0]!.required ?? 0, weapons });
  }
  return { ...slot, detachment_id: d.id, upgrades, loadouts };
}

export function buildFormation(db: Db, formation: Formation, list: Pick<ArmyList, "allegiance">, prev?: ListFormation): ListFormation {
  const sub = formation.subfaction ?? prev?.subfaction ?? null;
  const groups = formation.formation_slots.map((g) => ({
    slot_type: g.slot_type,
    text: g.text ?? "",
    slots: g.slot_id.map((sid) => {
      let s = emptySlot(sid);
      const fs = db.slotById.get(sid);
      if (g.slot_type === "compulsory" && fs) {
        const opts = detachmentOptions(db, fs, sub, list.allegiance, null);
        if (opts.length === 1) s = applyDetachment(s, opts[0] ?? null);
      }
      return s;
    }),
  }));
  return { uid: prev?.uid ?? uid(), formation_id: formation.id, nickname: prev?.nickname ?? "", subfaction: sub, groups };
}

export function loadoutKey(weapons: { location: string; weapon: string }[]) {
  return weapons.map((w) => `${w.weapon}${w.location}`.replace(/\s+/g, "")).sort().join("");
}

/** Adds/replaces a loadout. Returns null if it would exceed detachment size. */
export function addLoadout(slot: ListSlot, size: number, weapons: { location: string; weapon: string }[]): ListSlot | null {
  const key = loadoutKey(weapons);
  const others = slot.loadouts.filter((l) => l.key !== key);
  const existing = slot.loadouts.find((l) => l.key === key);
  const count = existing ? existing.count : slot.loadouts.length === 0 ? size : 1;
  const total = others.reduce((a, l) => a + l.count, 0) + count;
  if (total > size) return null;
  return { ...slot, loadouts: [...others, { key, count, weapons }] };
}

export function changeLoadoutCount(slot: ListSlot, size: number, key: string, delta: number): ListSlot | null {
  const total = slot.loadouts.reduce((a, l) => a + l.count, 0);
  if (delta > 0 && total + delta > size) return null;
  const loadouts = slot.loadouts
    .map((l) => (l.key === key ? { ...l, count: l.count + delta } : l))
    .filter((l) => l.count > 0);
  return { ...slot, loadouts };
}

/* ---------- Costs & size ---------- */
const ek = (td: boolean, x?: number) => (td && x ? x : 0);

export function slotCost(db: Db, slot: ListSlot, mode: Gamemode): number {
  const d = slot.detachment_id !== null ? db.detachmentById.get(slot.detachment_id) : undefined;
  if (!d) return 0;
  const td = mode === "titandeath";
  let cost = d.base_cost + ek(td, d.td_ek);
  for (const u of slot.upgrades) {
    const opt = d.upgrade_options.find((o) => o.name === u.name)?.options.find((o) => o.number === u.number);
    if (opt) cost += opt.cost + ek(td, opt.td_ek);
  }
  for (const l of slot.loadouts) {
    for (const w of l.weapons) {
      const opt = d.loadout_options.find((o) => o.location === w.location)?.options.find((o) => o.name === w.weapon);
      if (opt) cost += (opt.cost + ek(td, opt.td_ek)) * l.count;
    }
  }
  return cost;
}

export function slotSize(db: Db, slot: ListSlot): number {
  const d = slot.detachment_id !== null ? db.detachmentById.get(slot.detachment_id) : undefined;
  if (!d) return 0;
  let size = d.base_size;
  for (const u of slot.upgrades) {
    const opt = d.upgrade_options.find((o) => o.name === u.name)?.options.find((o) => o.number === u.number);
    if (opt) size += opt.size;
  }
  return size;
}

const bs = (size: number, b?: number) => (b === 0 ? 0 : size * (b ?? 1));

export function formationStrength(db: Db, f: ListFormation): { strength: number; breakPoint: number } {
  let strength = 0;
  for (const g of f.groups)
    for (const s of g.slots) {
      const fs = db.slotById.get(s.slot_id);
      const d = s.detachment_id !== null ? db.detachmentById.get(s.detachment_id) : undefined;
      if (!d || fs?.type === "Dedicated") continue;
      strength += bs(d.base_size, d.break_strength);
      for (const u of s.upgrades) {
        const opt = d.upgrade_options.find((o) => o.name === u.name)?.options.find((o) => o.number === u.number);
        if (opt) strength += bs(opt.size, opt.break_strength);
      }
    }
  return { strength, breakPoint: Math.ceil(strength / 2) };
}

export function formationCost(db: Db, f: ListFormation, mode: Gamemode) {
  return f.groups.reduce((a, g) => a + g.slots.reduce((b, s) => b + slotCost(db, s, mode), 0), 0);
}

export function listTotals(db: Db, list: ArmyList) {
  let total = 0, main = 0;
  for (const f of list.formations) {
    const c = formationCost(db, f, list.gamemode);
    total += c;
    const fm = f.formation_id !== null ? db.formationById.get(f.formation_id) : undefined;
    if (fm?.faction === list.faction) main += c;
  }
  return { total, main, allies: total - main };
}

/* ---------- Warnings ---------- */
export function listWarnings(db: Db, list: ArmyList): string[] {
  const w: string[] = [];
  const { total, main } = listTotals(db, list);
  if (total > list.points) w.push("Se ha superado el tamaño de la partida");
  if (list.gamemode === "standard" && main < list.points * 0.7) w.push("La facción principal debe ser al menos el 70 % de la lista");
  const wrongAllegiance = list.formations.some((f) =>
    f.groups.some((g) => g.slots.some((s) => {
      const d = s.detachment_id !== null ? db.detachmentById.get(s.detachment_id) : undefined;
      return d?.allegiance && d.allegiance !== list.allegiance;
    })));
  if (wrongAllegiance) w.push("Destacamentos con lealtad incorrecta");
  return w;
}

export function slotWarnings(db: Db, slot: ListSlot, list: ArmyList, f: ListFormation): string[] {
  const d = slot.detachment_id !== null ? db.detachmentById.get(slot.detachment_id) : undefined;
  if (!d) return [];
  const w: string[] = [];
  const size = slotSize(db, slot);
  if (size > d.max_size) w.push("Destacamento demasiado grande");
  if (slot.loadouts.reduce((a, l) => a + l.count, 0) > size) w.push("Los equipamientos superan el tamaño del destacamento");
  if (d.allegiance && d.allegiance !== list.allegiance) w.push(`Solo ${d.allegiance}`);
  if (d.subfaction && d.subfaction !== f.subfaction) w.push(`Solo ${d.subfaction}`);
  return w;
}

export function groupWarning(g: ListFormation["groups"][number]): string | null {
  if (g.slot_type === "compulsory" && g.slots.some((s) => s.detachment_id === null)) return "Incompleto";
  if (g.slot_type === "choice" && g.slots.filter((s) => s.detachment_id !== null).length > 1) return "Solo se puede elegir una opción";
  return null;
}

/** Validation of one formation's groups: compulsory slots filled, choice groups limited to one option line. */
export function formationWarnings(f: ListFormation): string[] {
  const w: string[] = [];
  for (const g of f.groups) {
    const filled = g.slots.filter((s) => s.detachment_id !== null);
    if (g.slot_type === "compulsory" && filled.length < g.slots.length) w.push("Faltan destacamentos obligatorios");
    if (g.slot_type === "choice") {
      const lines = new Set(filled.map((s) => s.slot_id));
      if (lines.size > 1) w.push(`Elección: ${g.text} — solo una de las opciones`);
      if (/^one of the following$/i.test(g.text.trim()) && filled.length === 0) w.push("Debes elegir una de las opciones");
    }
  }
  return [...new Set(w)];
}

export const allSlots = (list: Pick<ArmyList, "formations">) => list.formations.flatMap((f) => f.groups.flatMap((g) => g.slots));
