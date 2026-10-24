/**
 * Resolución de duelos navales v2 en el servidor (clave de servicio).
 * - Al vencer la aproximación (pendiente) se inicia el duelo.
 * - Un bloque se resuelve cuando los dos confirman o vence el plazo; quien no confirmó juega con la IA.
 * La actualización usa concurrencia optimista (block_number) para que nunca se resuelva dos veces.
 */
import type { FleetId } from "@/lib/ship-identity";
import { newDuel, newSide, resolveBlock, type Rng } from "./engine";
import { botPlan } from "./bot";
import { blockPlanSchema } from "./schema";
import type { BlockPlan, Crit, DuelState, ModuleLevels, RoundEvent, Squadron } from "./types";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const secureRng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
const BLOCK_HOURS = 24;

/** Crítico activo al terminar → módulo averiado. */
const CRIT_MODULE: Record<Crit, string | null> = {
  motores: "motores_plasma",
  baterias: "baterias",
  lanza: "lanza_proa",
  incendio: "casco",
  puente: "puente",
  escudos: null,
};

interface SideData {
  fleet: FleetId;
  hull: number;
  max_hull: number;
  modules: ModuleLevels;
  escorts: (Squadron & { id: string })[];
}

interface RaidRow {
  id: string;
  attacker_id: string;
  defender_id: string;
  status: string;
  deadline: string;
  block_number: number;
  attacker_ready: boolean;
  defender_ready: boolean;
  duel_state: (DuelState & { escortIds?: { attacker: string[]; defender: string[] } }) | null;
  report: Record<string, unknown> | null;
}

async function admin(): Promise<Admin> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

const later = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

async function sideData(db: Admin, uid: string): Promise<SideData> {
  const { data, error } = await db.rpc("naval2_side" as never, { _uid: uid } as never);
  if (error || !data) throw new Error("No se pudo leer la nave");
  return data as unknown as SideData;
}

async function startDuel(db: Admin, raid: RaidRow) {
  const [a, d] = await Promise.all([
    sideData(db, raid.attacker_id),
    sideData(db, raid.defender_id),
  ]);
  const state = newDuel(
    newSide(
      a.fleet,
      a.modules,
      a.hull,
      a.max_hull,
      a.escorts.map(({ type, ships }) => ({ type, ships })),
    ),
    newSide(
      d.fleet,
      d.modules,
      d.hull,
      d.max_hull,
      d.escorts.map(({ type, ships }) => ({ type, ships })),
    ),
    secureRng,
  );
  const duel_state = {
    ...state,
    escortIds: { attacker: a.escorts.map((e) => e.id), defender: d.escorts.map((e) => e.id) },
  };
  await db
    .from("naval_raids")
    .update({
      status: "enfrentado",
      duel_state,
      block_number: 1,
      attacker_ready: false,
      defender_ready: false,
      deadline: later(BLOCK_HOURS),
    } as never)
    .eq("id", raid.id)
    .eq("status", "pendiente");
}

function planOr(
  raw: unknown,
  state: DuelState,
  side: "attacker" | "defender",
): { plan: BlockPlan; auto: boolean } {
  const parsed = blockPlanSchema.safeParse(raw);
  return parsed.success
    ? { plan: parsed.data as BlockPlan, auto: false }
    : { plan: botPlan(state, side, secureRng, 0), auto: true };
}

async function resolveDue(db: Admin, raid: RaidRow) {
  if (!raid.duel_state) return;
  const { data: plans } = await db
    .from("naval_private_plans")
    .select("attacker_plan,defender_plan")
    .eq("raid_id", raid.id)
    .maybeSingle();
  const a = planOr(raid.attacker_ready ? plans?.attacker_plan : null, raid.duel_state, "attacker");
  const d = planOr(raid.defender_ready ? plans?.defender_plan : null, raid.duel_state, "defender");
  const { state, events } = resolveBlock(raid.duel_state, a.plan, d.plan, secureRng);
  const tagged: (RoundEvent & { block: number; auto: { attacker: boolean; defender: boolean } })[] =
    events.map((e) => ({
      ...e,
      block: raid.block_number,
      auto: { attacker: a.auto, defender: d.auto },
    }));
  const report = {
    ...(raid.report ?? {}),
    v2_events: [...(((raid.report ?? {}) as { v2_events?: unknown[] }).v2_events ?? []), ...tagged],
    boarding: state.attacker.boardingHits,
    defender_boarding: state.defender.boardingHits,
  };
  const nextState = { ...state, escortIds: raid.duel_state.escortIds };
  const { data: claimed } = await db
    .from("naval_raids")
    .update({
      duel_state: nextState,
      report,
      block_number: raid.block_number + 1,
      attacker_ready: false,
      defender_ready: false,
      deadline: later(BLOCK_HOURS),
    } as never)
    .eq("id", raid.id)
    .eq("status", "enfrentado")
    .eq("block_number", raid.block_number)
    .select("id");
  if (!claimed?.length) return; // Otro proceso ya resolvió este bloque.

  await db
    .from("naval_private_plans")
    .update({ attacker_plan: null, defender_plan: null } as never)
    .eq("raid_id", raid.id);
  await db.from("ships").update({ hull_hp: state.attacker.hull }).eq("user_id", raid.attacker_id);
  await db.from("ships").update({ hull_hp: state.defender.hull }).eq("user_id", raid.defender_id);
  const ids = raid.duel_state.escortIds ?? { attacker: [], defender: [] };
  for (const [side, list] of [
    ["attacker", ids.attacker],
    ["defender", ids.defender],
  ] as const) {
    const squads = state[side].escorts;
    for (let i = 0; i < list.length; i++) {
      if (squads[i])
        await db
          .from("ship_escorts" as never)
          .update({ ships: squads[i]!.ships } as never)
          .eq("id", list[i]!);
    }
  }

  if (state.finished) {
    const reason = state.finished.reason === "casco" ? "casco" : "retirada_contacto";
    await db.rpc(
      "naval_finish" as never,
      { _id: raid.id, _winner: state.finished.winner, _reason: reason } as never,
    );
    for (const [uid, side] of [
      [raid.attacker_id, state.attacker],
      [raid.defender_id, state.defender],
    ] as const) {
      const modules = side.crits.map((c) => CRIT_MODULE[c]).filter((m): m is string => !!m);
      if (modules.length)
        await db.rpc("naval2_damage_modules" as never, { _uid: uid, _modules: modules } as never);
    }
  }
}

/** Procesa los duelos v2 que tocan: inicio tras la aproximación o resolución de bloque. */
export async function processDueDuels() {
  const db = await admin();
  const now = new Date().toISOString();
  const { data } = await db
    .from("naval_raids")
    .select(
      "id,attacker_id,defender_id,status,deadline,block_number,attacker_ready,defender_ready,duel_state,report",
    )
    .eq("engine_version" as never, 2 as never)
    .in("status", ["pendiente", "enfrentado"])
    .or(`deadline.lte.${now},and(attacker_ready.eq.true,defender_ready.eq.true)`)
    .limit(20);
  for (const raid of (data ?? []) as unknown as RaidRow[]) {
    if (raid.status === "pendiente") {
      if (new Date(raid.deadline).getTime() <= Date.now()) await startDuel(db, raid);
    } else await resolveDue(db, raid);
  }
}

/** Guarda el plan de un bloque y, si los dos están listos, resuelve. */
export async function submitPlan(userId: string, raidId: string, block: number, plan: BlockPlan) {
  const db = await admin();
  const { data } = await db
    .from("naval_raids")
    .select("id,attacker_id,defender_id,status,block_number,attacker_ready,defender_ready")
    .eq("id", raidId)
    .eq("engine_version" as never, 2 as never)
    .maybeSingle();
  const raid = data as unknown as RaidRow | null;
  if (!raid || (raid.attacker_id !== userId && raid.defender_id !== userId))
    throw new Error("No participas en este duelo.");
  if (raid.status !== "enfrentado" || raid.block_number !== block)
    throw new Error("Este bloque ya no admite órdenes.");
  const isAttacker = raid.attacker_id === userId;
  if (isAttacker ? raid.attacker_ready : raid.defender_ready)
    throw new Error("Tus órdenes ya están fijadas.");
  await db
    .from("naval_private_plans")
    .update((isAttacker ? { attacker_plan: plan } : { defender_plan: plan }) as never)
    .eq("raid_id", raidId);
  const { data: updated } = await db
    .from("naval_raids")
    .update((isAttacker ? { attacker_ready: true } : { defender_ready: true }) as never)
    .eq("id", raidId)
    .eq("block_number", block)
    .select("attacker_ready,defender_ready");
  const row = updated?.[0] as { attacker_ready: boolean; defender_ready: boolean } | undefined;
  if (row?.attacker_ready && row.defender_ready) await processDueDuels();
}
