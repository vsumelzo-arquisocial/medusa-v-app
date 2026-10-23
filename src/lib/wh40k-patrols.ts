/** Official Combat Patrol rosters (10th edition documents; 11th edition patrols are app-only). */
export interface PatrolRule { name: string; text: string }
export interface PatrolUnit { name: string; models: number; equipment: string[] }
export interface Patrol {
  id: string; name: string; faction: string; units: PatrolUnit[]; source: string;
  warlord?: string; abilities?: string; stratagems?: string;
  defaultEnhancement?: PatrolRule | null; optionalEnhancement?: PatrolRule | null;
  defaultObjective?: PatrolRule | null; optionalObjective?: PatrolRule | null;
}
export interface PatrolChoice { patrolId: string; enhancement: "default" | "optional"; objective: "default" | "optional" }

export async function loadPatrols(): Promise<Patrol[]> {
  const mod = await import("@/data/warhammer40k/combat-patrols.json");
  return ((mod.default ?? mod) as unknown as { patrols: Patrol[] }).patrols;
}
export const patrolsFor = (all: Patrol[], faction: string) => all.filter((p) => p.faction === faction);

/** The only choices a patrol allows: the default or optional Enhancement and Secondary Objective. */
export function patrolSelection(p: Patrol, c: PatrolChoice) {
  const enhancement = (c.enhancement === "optional" && p.optionalEnhancement) || p.defaultEnhancement || null;
  const objective = (c.objective === "optional" && p.optionalObjective) || p.defaultObjective || null;
  return { enhancement, objective };
}

export function exportPatrol(listName: string, factionName: string, p: Patrol, c: PatrolChoice): string {
  const { enhancement, objective } = patrolSelection(p, c);
  const lines = [`${listName}`, "", factionName, `Combat Patrol: ${p.name}`, ""];
  for (const u of p.units) {
    lines.push(`${u.name} (${u.models} ${u.models === 1 ? "model" : "models"})`);
    for (const e of u.equipment) lines.push(`  • ${e}`);
    lines.push("");
  }
  if (p.warlord) lines.push(`Warlord: ${p.warlord}`);
  if (enhancement) lines.push(`Enhancement: ${enhancement.name}`);
  if (objective) lines.push(`Secondary Objective: ${objective.name}`);
  lines.push("", "Source: official Combat Patrol document (10th edition)");
  return lines.join("\n") + "\n";
}

const pnorm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

/** Maps a patrol box unit to the Munitorum unit name used for recruitment (exact, then the longest contained name). */
export function patrolUnitName(unit: string, unitNames: string[]): string {
  const n = pnorm(unit);
  const exact = unitNames.find((x) => pnorm(x) === n);
  if (exact) return exact;
  const inside = unitNames.filter((x) => n.includes(pnorm(x)) || pnorm(x).includes(n)).sort((a, b) => b.length - a.length);
  return inside[0] ?? unit.toUpperCase();
}

/** Reads a Combat Patrol exported as text from the official app: finds the patrol by name and the chosen enhancement/objective. */
export function importPatrol(text: string, patrols: Patrol[], unitNames: string[]) {
  const t = pnorm(text);
  const p = patrols.filter((x) => t.includes(pnorm(x.name))).sort((a, b) => b.name.length - a.name.length)[0];
  if (!p) return null;
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const name = firstLine.replace(/\s*\(.*\)\s*$/, "").trim();
  const has = (r?: PatrolRule | null) => !!r && t.includes(pnorm(r.name));
  const choice: PatrolChoice = { patrolId: p.id, enhancement: has(p.optionalEnhancement) ? "optional" : "default", objective: has(p.optionalObjective) ? "optional" : "default" };
  const units = p.units.map((u, i) => ({ id: `p${i}`, name: patrolUnitName(u.name, unitNames), models: u.models }));
  return { patrol: p, name: name && pnorm(name) !== pnorm(p.name) ? name : null, roster: { ...choice, detachments: [] as string[], units } };
}
