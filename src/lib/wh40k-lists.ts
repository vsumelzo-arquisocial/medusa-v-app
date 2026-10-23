/** Warhammer 40.000 (11th ed.) army list rules: points, Detachment Points, unit and enhancement limits. */

export interface CostOption { models: number; pts: number }
export interface CostTier { from: number; to: number | null; options: CostOption[]; extras?: { name: string; pts: number }[] }
export interface UnitData { name: string; tiers: CostTier[]; wargear?: { name: string; pts: number }[]; leader?: string[]; support?: string[]; epicHero?: boolean }
export interface Enhancement { name: string; pts: number; upgrade?: boolean }
export interface DetachmentData { name: string; dp: number; dispositions: string[]; unique?: string; enhancements: Enhancement[] }
export interface FactionPoints { version: string | null; units: UnitData[]; detachments: DetachmentData[] }

export type UnitRole = "normal" | "battleline" | "epic";
export interface RosterUnit {
  id: string; name: string; models: number;
  role?: UnitRole; warlord?: boolean; enhancement?: string | null;
  wargear?: Record<string, number>;
}
export interface Roster { detachments: string[]; units: RosterUnit[] }
export type ListMode = "libre" | "coleccion";

export interface BattleSize { points: number; label: string; dp: number; enhancements: number; unitLimit: number; official: boolean }
/** Incursion and Strike Force come from the Core Rules (25.03). 1500 is a club size the rules do not define;
 *  it reuses the Strike Force limits and is flagged as unofficial. */
export const BATTLE_SIZES: BattleSize[] = [
  { points: 1000, label: "Incursión", dp: 2, enhancements: 2, unitLimit: 2, official: true },
  { points: 1500, label: "Partida de 1500 (no oficial)", dp: 3, enhancements: 4, unitLimit: 3, official: false },
  { points: 2000, label: "Fuerza de choque", dp: 3, enhancements: 4, unitLimit: 3, official: true },
];
export const battleSize = (pts: number) => BATTLE_SIZES.find((b) => b.points === pts) ?? BATTLE_SIZES[2]!;

export const emptyRoster = (): Roster => ({ detachments: [], units: [] });
export const newId = () => Math.random().toString(36).slice(2, 10);

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").toLowerCase().replace(/\s+/g, " ").trim();
export const findUnit = (data: FactionPoints, name: string) => data.units.find((u) => norm(u.name) === norm(name));
export const findDetachment = (data: FactionPoints, name: string) => data.detachments.find((d) => norm(d.name) === norm(name));

/** Price of the n-th copy (1-based) of a unit at a given size. */
export function unitPrice(u: UnitData, copy: number, models: number): number | null {
  const tier = u.tiers.find((t) => copy >= t.from && (t.to === null || copy <= t.to)) ?? u.tiers[u.tiers.length - 1]!;
  return tier.options.find((o) => o.models === models)?.pts ?? null;
}
export const sizesOf = (u: UnitData) => u.tiers[0]!.options.map((o) => o.models);

export interface PricedUnit { unit: RosterUnit; copy: number; base: number; wargear: number; enhancement: number; total: number }
export function priceRoster(roster: Roster, data: FactionPoints): PricedUnit[] {
  const copies = new Map<string, number>();
  const enh = new Map(roster.detachments.flatMap((n) => findDetachment(data, n)?.enhancements ?? []).map((e) => [e.name, e.pts]));
  return roster.units.map((r) => {
    const u = findUnit(data, r.name);
    const copy = (copies.get(r.name) ?? 0) + 1; copies.set(r.name, copy);
    const base = u ? unitPrice(u, copy, r.models) ?? 0 : 0;
    const wargear = Object.entries(r.wargear ?? {}).reduce((a, [n, c]) => a + (u?.wargear?.find((w) => w.name === n)?.pts ?? 0) * c, 0);
    const enhancement = r.enhancement ? enh.get(r.enhancement) ?? 0 : 0;
    return { unit: r, copy, base, wargear, enhancement, total: base + wargear + enhancement };
  });
}
export const rosterPoints = (roster: Roster, data: FactionPoints) => priceRoster(roster, data).reduce((a, p) => a + p.total, 0);

/** Rule problems that make the list illegal for its battle size. */
export function validateRoster(roster: Roster, data: FactionPoints, sizePts: number): string[] {
  const size = battleSize(sizePts);
  const errs: string[] = [];
  const total = rosterPoints(roster, data);
  if (total > size.points) errs.push(`Te pasas de puntos: ${total}/${size.points}.`);
  const dets = roster.detachments.map((n) => findDetachment(data, n)).filter(Boolean) as DetachmentData[];
  if (!dets.length) errs.push("Elige al menos un destacamento.");
  const dp = dets.reduce((a, d) => a + d.dp, 0);
  const lone3 = size.points === 1000 && dets.length === 1 && dets[0]!.dp === 3;
  if (dp > size.dp && !lone3) errs.push(`Destacamentos: ${dp} DP de ${size.dp} disponibles.`);
  if (new Set(roster.detachments).size !== roster.detachments.length) errs.push("No puedes repetir destacamento.");
  const counts = new Map<string, { n: number; role: UnitRole }>();
  for (const u of roster.units) {
    const c = counts.get(u.name) ?? { n: 0, role: u.role ?? "normal" };
    c.n++; if (u.role && u.role !== "normal") c.role = u.role; counts.set(u.name, c);
  }
  for (const [name, c] of counts) {
    const limit = c.role === "epic" ? 1 : c.role === "battleline" ? size.unitLimit * 2 : size.unitLimit;
    if (c.n > limit) errs.push(`${name}: máximo ${limit} unidad(es), llevas ${c.n}.`);
  }
  const available = new Map(dets.flatMap((d) => d.enhancements).map((e) => [e.name, e]));
  const used = new Map<string, number>();
  for (const u of roster.units) {
    if (!u.enhancement) continue;
    const e = available.get(u.enhancement);
    if (!e) { errs.push(`${u.enhancement} no pertenece a tus destacamentos.`); continue; }
    if (u.role === "epic") errs.push(`${u.name} es un héroe épico y no puede llevar mejoras.`);
    used.set(e.name, (used.get(e.name) ?? 0) + 1);
  }
  let enhCount = 0;
  for (const [n, c] of used) {
    const e = available.get(n)!;
    if (e.upgrade) { if (c > 3) errs.push(`${n}: máximo 3 copias.`); enhCount++; }
    else { if (c > 1) errs.push(`${n}: no se puede repetir.`); enhCount += c; }
  }
  if (enhCount > size.enhancements) errs.push(`Mejoras: ${enhCount} de ${size.enhancements} permitidas.`);
  const warlords = roster.units.filter((u) => u.warlord).length;
  if (warlords !== 1) errs.push("Elige exactamente un señor de la guerra.");
  for (const u of roster.units) if (!findUnit(data, u.name)) errs.push(`Unidad desconocida: ${u.name}.`);
  return errs;
}

/** Recruited copies still missing for a recruitment-based list. */
export function missingRecruits(roster: Roster, recruits: { unit_name: string; models: number; quantity: number }[]) {
  const need = new Map<string, number>();
  for (const u of roster.units) need.set(`${u.name}|${u.models}`, (need.get(`${u.name}|${u.models}`) ?? 0) + 1);
  const out: { name: string; models: number; need: number; have: number }[] = [];
  for (const [k, n] of need) {
    const [name, m] = k.split("|") as [string, string];
    const have = recruits.find((r) => r.unit_name === name && r.models === Number(m))?.quantity ?? 0;
    if (have < n) out.push({ name, models: Number(m), need: n, have });
  }
  return out;
}

const title = (s: string) => s.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

/** Plain-text roster in the same layout as the official app export, so it can be pasted back. */
export function exportRoster(name: string, factionName: string, sizePts: number, roster: Roster, data: FactionPoints): string {
  const priced = priceRoster(roster, data);
  const total = priced.reduce((a, p) => a + p.total, 0);
  const size = battleSize(sizePts);
  const lines = [`${name} (${total} Points)`, "", factionName, roster.detachments.map(title).join(", "), `${size.label} (${size.points} Points)`, ""];
  for (const p of priced) {
    lines.push(`${title(p.unit.name)} (${p.total} Points)`);
    lines.push(`  • ${p.unit.models}x ${title(p.unit.name)}`);
    if (p.unit.warlord) lines.push("  • Warlord");
    if (p.unit.enhancement) lines.push(`  • Enhancement: ${p.unit.enhancement}`);
    for (const [w, c] of Object.entries(p.unit.wargear ?? {})) if (c) lines.push(`  • ${c}x ${w.replace(/^per /, "")}`);
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

export interface ImportResult { name: string | null; points: number | null; roster: Roster; unknown: string[] }

/** Reads an army list exported as text from the official Warhammer 40,000 app (or from this app). */
export function importRoster(text: string, data: FactionPoints): ImportResult {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\u00a0/g, " ").trimEnd());
  const roster = emptyRoster();
  const unknown: string[] = [];
  let name: string | null = null; let points: number | null = null;
  const head = /^(.+?)\s*\((\d[\d,.]*)\s*(?:points|pts|puntos)\)\s*$/i;
  let current: RosterUnit | null = null; let modelSum = 0; let headerPts = 0;
  const close = () => {
    if (!current) return;
    const u = findUnit(data, current.name)!;
    const sizes = sizesOf(u);
    const copy = roster.units.filter((x) => x.name === current!.name).length + 1;
    const byPts = sizes.filter((s) => headerPts - (unitPrice(u, copy, s) ?? -1) >= 0 && headerPts - (unitPrice(u, copy, s) ?? 0) <= 80);
    const exact = sizes.find((s) => unitPrice(u, copy, s) === headerPts);
    if (exact !== undefined) current.models = exact;
    else if (modelSum && sizes.includes(modelSum)) current.models = modelSum;
    else if (byPts.length) current.models = byPts[byPts.length - 1]!;
    else if (modelSum) current.models = sizes.find((s) => s >= modelSum) ?? sizes[sizes.length - 1]!;
    roster.units.push(current); current = null; modelSum = 0;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^[•◦\-*]\s*(.*)$/);
    if (bullet && current) {
      const b = bullet[1]!;
      if (/^warlord$/i.test(b)) current.warlord = true;
      const enh = b.match(/^enhancements?:\s*(.+?)(?:\s*\(\+?\d+.*\))?$/i);
      if (enh) current.enhancement = enh[1]!.trim();
      const mc = b.match(/^(\d+)x\s+(.+)$/i);
      if (mc) {
        const inner = findUnit(data, mc[2]!);
        const wg = findUnit(data, current.name)?.wargear?.find((w) => norm(w.name.replace(/^per /i, "")) === norm(mc[2]!));
        if (wg) current.wargear = { ...(current.wargear ?? {}), [wg.name]: Number(mc[1]!) };
        else if (inner || !raw.startsWith("    ")) modelSum += Number(mc[1]!);
      }
      continue;
    }
    const m = line.match(head);
    if (m) {
      const label = m[1]!.replace(/^\d+x\s+/i, "").trim();
      const pts = Number(m[2]!.replace(/[,.]/g, ""));
      const u = findUnit(data, label);
      if (u) { close(); current = { id: newId(), name: u.name, models: sizesOf(u)[0]! }; headerPts = pts; continue; }
      close();
      if (name === null) { name = label; continue; }
      if ([1000, 1500, 2000].includes(pts)) { points = pts; continue; }
      unknown.push(label); continue;
    }
    for (const part of line.split(/,\s*/)) {
      const d = findDetachment(data, part);
      if (d && !roster.detachments.includes(d.name)) roster.detachments.push(d.name);
    }
  }
  close();
  if (!roster.units.some((u) => u.warlord) && roster.units.length) {
    const lead = roster.units.find((u) => findUnit(data, u.name)?.leader);
    if (lead) lead.warlord = true;
  }
  return { name, points, roster, unknown };
}

export interface Requirement { name: string; models: number; need: number; have: number }
/** Copies of each unit a list needs against the recruited stock. */
export function requirements(roster: Pick<Roster, "units">, recruits: { unit_name: string; models: number; quantity: number }[]): Requirement[] {
  const need = new Map<string, Requirement>();
  for (const u of roster.units ?? []) {
    const k = `${norm(u.name)}|${u.models}`;
    const r = need.get(k) ?? { name: u.name, models: u.models, need: 0, have: 0 };
    r.need++; need.set(k, r);
  }
  for (const r of need.values()) r.have = recruits.find((x) => norm(x.unit_name) === norm(r.name) && x.models === r.models)?.quantity ?? 0;
  return [...need.values()];
}
export const isPlayable = (reqs: Requirement[]) => reqs.length > 0 && reqs.every((r) => r.have >= r.need);

/** Units still to recruit so every list is playable: per unit, the largest shortfall of any single list. */
export function pendingRecruits(lists: Requirement[][], preparing: { unit_name: string; models: number; status: string }[] = []): Requirement[] {
  const reserved = new Map<string, number>();
  for (const squad of preparing) {
    if (!['training', 'retraining', 'restoring'].includes(squad.status)) continue;
    const key = `${norm(squad.unit_name)}|${squad.models}`;
    reserved.set(key, (reserved.get(key) ?? 0) + 1);
  }
  const out = new Map<string, Requirement>();
  for (const reqs of lists) for (const requirement of reqs) {
    const k = `${norm(requirement.name)}|${requirement.models}`;
    const r = { ...requirement, have: requirement.have + (reserved.get(k) ?? 0) };
    if (r.have >= r.need) continue;
    const cur = out.get(k);
    if (!cur || cur.need < r.need) out.set(k, { ...r });
  }
  return [...out.values()];
}
