import type { Db } from "@/lib/legions/engine";
import type { ListFormation } from "@/types/legions";

export type Side = "creator" | "opponent";
export interface Objective { id: string; x: number; y: number; holder: Side | null }
export interface BattleState {
  round: number;
  deployment: "largo" | "corto" | "diagonal";
  objectives: Objective[];
  vp: Record<Side, number[]>; // VP per round (index = round-1)
  losses: Record<string, number>; // `${side}:${slotUid}` -> models destroyed
  log: string[];
  engines: Record<string, EngineState>; // `${side}:${slotUid}:${i}`
  secondary: Record<Side, string | null>;
  secondaryOptions?: Record<Side, string[]>;
  result: BattleResult | null;
  phase?: "previa" | "batalla";
  casualties?: unknown;
}

export const emptyBattle = (): BattleState => ({
  round: 1, deployment: "largo", objectives: [], vp: { creator: [0], opponent: [0] }, losses: {}, log: [], engines: {},
  secondary: { creator: null, opponent: null }, result: null,
});

export function normalize(b: Partial<BattleState> | null | undefined): BattleState {
  const e = emptyBattle();
  return { ...e, ...(b ?? {}), vp: { ...e.vp, ...(b?.vp ?? {}) }, losses: { ...(b?.losses ?? {}) }, engines: { ...(b?.engines ?? {}) }, secondary: { ...e.secondary, ...(b?.secondary ?? {}) } };
}

export const totalVp = (b: BattleState, s: Side) => b.vp[s].reduce((a, n) => a + (n || 0), 0);

export interface DetRow { uid: string; name: string; size: number; perModel: number; lost: number }
export interface FormRow { uid: string; name: string; strength: number; breakPoint: number; lostStrength: number; broken: boolean; dets: DetRow[] }

/** Strength per model = detachment break strength (default 1; 0 = does not count). */
export function sideIntegrity(db: Db, side: Side, formations: ListFormation[], losses: Record<string, number>, formName: (f: ListFormation) => string) {
  const rows: FormRow[] = formations.map((f) => {
    const dets: DetRow[] = [];
    for (const g of f.groups)
      for (const s of g.slots) {
        const d = s.detachment_id !== null ? db.detachmentById.get(s.detachment_id) : undefined;
        if (!d || db.slotById.get(s.slot_id)?.type === "Dedicated") continue;
        let size = d.base_size;
        for (const u of s.upgrades) {
          const o = d.upgrade_options.find((x) => x.name === u.name)?.options.find((x) => x.number === u.number);
          if (o) size += o.size;
        }
        const perModel = d.break_strength === 0 ? 0 : d.break_strength ?? 1;
        dets.push({ uid: s.uid, name: d.name, size, perModel, lost: Math.min(size, losses[`${side}:${s.uid}`] ?? 0) });
      }
    const strength = dets.reduce((a, d) => a + d.size * d.perModel, 0);
    const lostStrength = dets.reduce((a, d) => a + d.lost * d.perModel, 0);
    const breakPoint = Math.ceil(strength / 2);
    return { uid: f.uid, name: formName(f), strength, breakPoint, lostStrength, broken: strength > 0 && lostStrength >= breakPoint, dets };
  });
  const counted = rows.filter((r) => r.strength > 0);
  return {
    rows,
    modelsLost: rows.reduce((a, r) => a + r.dets.reduce((b, d) => b + d.lost, 0), 0),
    detsDestroyed: rows.reduce((a, r) => a + r.dets.filter((d) => d.size > 0 && d.lost >= d.size).length, 0),
    defeated: counted.length > 0 && counted.every((r) => r.broken),
  };
}

/* ---------- Resultado ---------- */
export type Winner = Side | "empate";
export const RESULT_REASONS = [
  "Puntos de victoria", "Ruptura de formaciones", "Rendición", "Aniquilación", "Fin de tiempo / acuerdo",
] as const;
export interface BattleResult { winner: Winner; reason: string; note?: string; mvp?: Partial<Record<Side, string>> }

/* ---------- Titanes y Caballeros ---------- */
export interface EngineState { shields: number; wounds: number } // wounds = heridas restantes
const cleanRule = (n: string) => n.replace(/^[:\s]+/, "").toLowerCase().replace("sheilds", "shields");

export function engineProfile(u: { name: string; wounds: number; special_rules: { name: string; value?: number | string }[] }) {
  const isTitan = /titan/i.test(u.name);
  const isKnight = !isTitan && /knight|armiger|moirax/i.test(u.name);
  if (!isTitan && !isKnight) return null;
  const vs = u.special_rules.find((r) => cleanRule(r.name) === "void shields");
  const ion = u.special_rules.find((r) => cleanRule(r.name) === "ion shields");
  const shields = vs ? Number(vs.value) || 0 : 0;
  const order = ["warhound", "dire wolf", "reaver", "warbringer", "warlord", "warmaster"];
  const rank = isTitan ? Math.max(0, order.findIndex((k) => u.name.toLowerCase().includes(k))) : 0;
  return { kind: isTitan ? ("titan" as const) : ("knight" as const), maxShields: shields, maxWounds: u.wounds, ion: ion?.value ? String(ion.value) : null, rank };
}

export function engineState(saved: EngineState | undefined, maxShields: number, maxWounds: number): EngineState {
  return saved ?? { shields: maxShields, wounds: maxWounds };
}
export const clampEngine = (s: EngineState, maxShields: number, maxWounds: number): EngineState => ({
  shields: Math.max(0, Math.min(maxShields, s.shields)), wounds: Math.max(0, Math.min(maxWounds, s.wounds)),
});

/** Busca la ficha de unidad de un destacamento: main_unit o el nombre de unidad más largo contenido en el nombre. */
export function unitForDetachment<U extends { id: number; name: string }>(d: { name: string; main_unit?: number[] }, units: U[]): U | undefined {
  const byId = d.main_unit?.length ? units.find((u) => u.id === d.main_unit![0]) : undefined;
  if (byId) return byId;
  const n = d.name.toLowerCase();
  const exact = units.filter((u) => n.includes(u.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  if (exact) return exact;
  const words = new Set(n.split(/\W+/));
  const scored = units.map((u) => ({ u, k: u.name.toLowerCase().split(/\W+/).filter((w) => words.has(w)).length, all: u.name.split(/\W+/).length }))
    .filter((x) => x.k >= 2 && x.k === x.all).sort((a, b) => b.k - a.k);
  return scored[0]?.u;
}

/* ---------- Asistente de impacto ---------- */
const p = (target: number) => (target <= 1 ? 1 : target > 6 ? 0 : (7 - target) / 6);
/** Salvación modificada por FP (AP negativo empeora la salvación). */
export const modifiedSave = (save: number, ap: number) => save - ap;
export function expectedHits(dice: number, toHit: number, hitMod: number, save: number | null, ap: number) {
  const hits = dice * p(toHit - hitMod);
  const unsaved = save === null ? hits : hits * (1 - p(modifiedSave(save, ap)));
  return { hits, unsaved };
}
export const rollD6 = (n: number, rnd: () => number = Math.random) => Array.from({ length: Math.max(0, n) }, () => 1 + Math.floor(rnd() * 6));

/** Reglamento: tira 2D6 distintos y ofrece esos dos objetivos secundarios; el jugador elige uno. */
export function rollSecondaryOptions<T>(table: T[], rnd: () => number = Math.random): T[] {
  if (table.length < 2) return table.slice();
  const a = Math.floor(rnd() * table.length);
  let b = a;
  while (b === a) b = Math.floor(rnd() * table.length);
  return [table[a]!, table[b]!];
}
