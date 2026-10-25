/**
 * Resolución de duelos navales v3 en el servidor (clave de servicio).
 * - En cuanto existe el duelo se prepara su estado: se pueden fijar las órdenes del bloque 1 durante la aproximación.
 * - Al llegar el atacante empieza el combate; cada bloque se resuelve cuando los dos confirman (máx. 24 h).
 * - Plazo vencido: si nadie confirmó pierde el atacante; si solo uno, pierde el otro.
 * - Nave destruida: módulos a 0 y 24 h de astillero (el perfil y las conquistas siguen).
 * - Las secciones fuera de combate al terminar quedan como módulos averiados.
 * Concurrencia optimista sobre block_number para no resolver nunca dos veces.
 */
import type { FleetId } from "@/lib/ship-identity";
import { blockRounds, inWarp, newDuel, newSide, resolveBlock, warpPlan, type Rng } from "./engine";
import { blockPlanSchema } from "./schema";
import { botPlan } from "./advisor";
import type {
  BlockPlan,
  DuelMode,
  DuelState,
  ModuleLevels,
  PhaseEvent,
  Section,
  Side,
} from "./types";
import { SECTION_INFO } from "./factions";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const secureRng: Rng = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
const BLOCK_HOURS = 24;
/** Plazo de cada ronda en el modo de una en una (horas). */
const ROUND_HOURS = 0.25;

interface SideData {
  fleet: FleetId;
  hull: number;
  max_hull: number;
  modules: ModuleLevels;
  damaged?: string[];
}

interface RaidRow {
  id: string;
  attacker_id: string;
  defender_id: string;
  status: "pendiente" | "enfrentado";
  deadline: string;
  block_number: number;
  attacker_ready: boolean;
  defender_ready: boolean;
  attacker_mode: number | null;
  defender_mode: number | null;
  duel_state: DuelState | null;
  report: Record<string, unknown> | null;
}

const COLS =
  "id,attacker_id,defender_id,status,deadline,block_number,attacker_ready,defender_ready,attacker_mode,defender_mode,duel_state,report";

/** De una en una solo si los dos lo eligen; si alguno elige tres, tres. Sin decidir: undefined. */
function agreedMode(raid: RaidRow): DuelMode | undefined {
  if (raid.duel_state?.mode) return raid.duel_state.mode;
  if (raid.attacker_mode === 3 || raid.defender_mode === 3) return 3;
  if (raid.attacker_mode === 1 && raid.defender_mode === 1) return 1;
  return undefined;
}

const blockHours = (state: DuelState) => (state.mode === 1 ? ROUND_HOURS : BLOCK_HOURS);

/** Las naves en modo salto no dan órdenes: quedan listas solas. */
const autoReady = (state: DuelState, side: Side) => !state.finished && inWarp(state[side]);

async function admin(): Promise<Admin> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

const later = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const due = (iso: string) => new Date(iso).getTime() <= Date.now();

async function sideData(db: Admin, uid: string): Promise<SideData> {
  const { data, error } = await db.rpc("naval3_side" as never, { _uid: uid } as never);
  if (error || !data) throw new Error("No se pudo leer la nave");
  return data as unknown as SideData;
}

const SECTION_OF_MODULE = Object.fromEntries(
  (Object.entries(SECTION_INFO) as [Section, { module: string }][]).map(([sec, i]) => [
    i.module,
    sec,
  ]),
) as Record<string, Section>;
const sectionsOf = (mods?: string[]) =>
  (mods ?? []).map((m) => SECTION_OF_MODULE[m]).filter((x): x is Section => !!x);

async function initDuel(db: Admin, raid: RaidRow): Promise<RaidRow> {
  const [a, d] = await Promise.all([
    sideData(db, raid.attacker_id),
    sideData(db, raid.defender_id),
  ]);
  const state = newDuel(
    newSide(a.fleet, a.modules, a.hull, a.max_hull, sectionsOf(a.damaged)),
    newSide(d.fleet, d.modules, d.hull, d.max_hull, sectionsOf(d.damaged)),
    secureRng,
  );
  const { data } = await db
    .from("naval_raids")
    .update({
      duel_state: state,
      block_number: 1,
      attacker_ready: false,
      defender_ready: false,
    } as never)
    .eq("id", raid.id)
    .is("duel_state" as never, null)
    .select(COLS);
  return (data?.[0] as unknown as RaidRow) ?? raid;
}

function readPlan(raw: unknown): BlockPlan | null {
  const parsed = blockPlanSchema.safeParse(raw);
  return parsed.success ? (parsed.data as BlockPlan) : null;
}

async function finish(db: Admin, raid: RaidRow, winner: string, reason: string) {
  await db.rpc(
    "naval_finish" as never,
    { _id: raid.id, _winner: winner, _reason: reason } as never,
  );
}

async function timeout(db: Admin, raid: RaidRow) {
  const { data } = await db
    .from("naval_raids")
    .update({ deadline: later(1) } as never) // reserva el turno; naval_finish cierra el duelo
    .eq("id", raid.id)
    .eq("block_number", raid.block_number)
    .lte("deadline", new Date().toISOString())
    .select("id");
  if (!data?.length) return;
  if (raid.duel_state?.mode === 1) {
    // De una en una y alguien no responde: se pasa a tres en tres con plazo normal, sin derrota.
    await switchMode(db, raid, 3);
    return;
  }
  if (!raid.attacker_ready && !raid.defender_ready) await finish(db, raid, "defensor", "silencio");
  else await finish(db, raid, raid.attacker_ready ? "atacante" : "defensor", "abandono");
}

/** Cambia el número de rondas por bloque; se descartan las órdenes aún no resueltas. */
async function switchMode(db: Admin, raid: RaidRow, mode: DuelMode) {
  if (!raid.duel_state) return;
  const state: DuelState = { ...raid.duel_state, mode };
  await db
    .from("naval_raids")
    .update({
      duel_state: state,
      attacker_ready: autoReady(state, "attacker"),
      defender_ready: autoReady(state, "defender"),
      ...(raid.status === "enfrentado" ? { deadline: later(blockHours(state)) } : {}),
    } as never)
    .eq("id", raid.id)
    .eq("block_number", raid.block_number);
  await db
    .from("naval_private_plans")
    .update({ attacker_plan: null, defender_plan: null } as never)
    .eq("raid_id", raid.id);
}

async function resolve(db: Admin, raid: RaidRow) {
  if (!raid.duel_state) return;
  const { data: plans } = await db
    .from("naval_private_plans")
    .select("attacker_plan,defender_plan")
    .eq("raid_id", raid.id)
    .maybeSingle();
  // Órdenes guardadas con el formato anterior (antes del rumbo): las completa el Segundo.
  const rounds = blockRounds(raid.duel_state);
  const pick = (side: Side, raw: unknown) =>
    inWarp(raid.duel_state![side])
      ? warpPlan(rounds)
      : (readPlan(raw) ?? botPlan(raid.duel_state!, side, secureRng, false));
  const a = pick("attacker", plans?.attacker_plan);
  const d = pick("defender", plans?.defender_plan);
  const { state, events } = resolveBlock(raid.duel_state, a, d, secureRng);
  const tagged: (PhaseEvent & { block: number })[] = events.map((e) => ({
    ...e,
    block: raid.block_number,
  }));
  const prev = (raid.report ?? {}) as { v3_events?: unknown[] };
  const report = {
    ...prev,
    v3_events: [...(prev.v3_events ?? []), ...tagged],
    boarding: state.attacker.boarding,
    defender_boarding: state.defender.boarding,
    ...(state.finished ? { v3_end: state.finished } : {}),
  };
  const { data: claimed } = await db
    .from("naval_raids")
    .update({
      duel_state: state,
      report,
      block_number: raid.block_number + 1,
      attacker_ready: autoReady(state, "attacker"),
      defender_ready: autoReady(state, "defender"),
      deadline: later(blockHours(state)),
    } as never)
    .eq("id", raid.id)
    .eq("status", "enfrentado")
    .eq("block_number", raid.block_number)
    .select(COLS);
  if (!claimed?.length) return; // Otro proceso ya resolvió este bloque.

  await db
    .from("naval_private_plans")
    .update({ attacker_plan: null, defender_plan: null } as never)
    .eq("raid_id", raid.id);
  await db.from("ships").update({ hull_hp: state.attacker.hull }).eq("user_id", raid.attacker_id);
  await db.from("ships").update({ hull_hp: state.defender.hull }).eq("user_id", raid.defender_id);

  const end = state.finished;
  if (end) {
    // Secciones que acaban fuera de combate → módulos averiados (las de la nave destruida se pierden con ella)
    for (const side of ["attacker", "defender"] as const) {
      if (end.destroyed.includes(side)) continue;
      const mods = (state[side].disabled ?? []).map((x) => SECTION_INFO[x].module);
      if (mods.length)
        await db.rpc(
          "naval_mark_damaged" as never,
          {
            _uid: side === "attacker" ? raid.attacker_id : raid.defender_id,
            _modules: mods,
          } as never,
        );
    }
  }
  if (!end) {
    // Las dos naves en modo salto: se resuelve sin esperar a nadie.
    const row = claimed[0] as unknown as RaidRow;
    if (row.attacker_ready && row.defender_ready) await resolve(db, row);
    return;
  }
  const reason = end.reason === "salto" ? "salto_warp" : end.reason;
  await finish(db, raid, end.winner, reason);
  for (const side of end.destroyed) {
    const uid = side === "attacker" ? raid.attacker_id : raid.defender_id;
    await db.rpc("ship_destroyed" as never, { _uid: uid } as never);
  }
}

async function step(db: Admin, input: RaidRow) {
  let raid = input;
  if (!raid.duel_state) raid = await initDuel(db, raid);
  if (raid.status === "pendiente") {
    if (!due(raid.deadline)) return;
    const mode = agreedMode(raid) ?? 3;
    const state: DuelState = { ...raid.duel_state!, mode };
    const changed = raid.duel_state?.mode !== mode;
    const { data } = await db
      .from("naval_raids")
      .update({
        status: "enfrentado",
        duel_state: state,
        deadline: later(blockHours(state)),
        ...(changed ? { attacker_ready: false, defender_ready: false } : {}),
      } as never)
      .eq("id", raid.id)
      .eq("status", "pendiente")
      .select(COLS);
    if (!data?.length) return;
    raid = data[0] as unknown as RaidRow;
  }
  if (raid.attacker_ready && raid.defender_ready) await resolve(db, raid);
  else if (due(raid.deadline)) await timeout(db, raid);
}

/** Procesa los duelos v3 que tocan. */
export async function processDueDuels() {
  const db = await admin();
  const now = new Date().toISOString();
  const { data } = await db
    .from("naval_raids")
    .select(COLS)
    .eq("engine_version" as never, 3 as never)
    .in("status", ["pendiente", "enfrentado"])
    .or(`duel_state.is.null,deadline.lte.${now},and(attacker_ready.eq.true,defender_ready.eq.true)`)
    .limit(20);
  for (const raid of (data ?? []) as unknown as RaidRow[]) {
    try {
      await step(db, raid);
    } catch (e) {
      console.error("naval3", raid.id, e);
    }
  }
}

/** Guarda las órdenes de un bloque y, si los dos están listos y el combate empezó, resuelve. */
export async function submitPlan(userId: string, raidId: string, block: number, plan: BlockPlan) {
  const db = await admin();
  const { data } = await db
    .from("naval_raids")
    .select(COLS)
    .eq("id", raidId)
    .eq("engine_version" as never, 3 as never)
    .maybeSingle();
  const raid = data as unknown as RaidRow | null;
  if (!raid || (raid.attacker_id !== userId && raid.defender_id !== userId))
    throw new Error("No participas en este duelo.");
  if (
    !["pendiente", "enfrentado"].includes(raid.status) ||
    !raid.duel_state ||
    raid.block_number !== block
  )
    throw new Error("Este bloque ya no admite órdenes.");
  if (raid.status === "enfrentado" && due(raid.deadline))
    throw new Error("El plazo de este bloque ha vencido.");
  const isAttacker = raid.attacker_id === userId;
  if (isAttacker ? raid.attacker_ready : raid.defender_ready)
    throw new Error("Tus órdenes ya están fijadas.");
  const mode = raid.duel_state.mode;
  if (!mode) throw new Error("Primero hay que decidir el modo de combate.");
  if (plan.phases.length !== blockRounds(raid.duel_state))
    throw new Error("Las órdenes no coinciden con el modo de combate.");
  await db
    .from("naval_private_plans")
    .update((isAttacker ? { attacker_plan: plan } : { defender_plan: plan }) as never)
    .eq("raid_id", raidId);
  const { data: updated } = await db
    .from("naval_raids")
    .update((isAttacker ? { attacker_ready: true } : { defender_ready: true }) as never)
    .eq("id", raidId)
    .eq("block_number", block)
    .select(COLS);
  const row = updated?.[0] as unknown as RaidRow | undefined;
  if (row?.status === "enfrentado" && row.attacker_ready && row.defender_ready)
    await resolve(db, row);
}

/** Cada jugador elige de una en una o de tres en tres antes del contacto. */
export async function chooseMode(userId: string, raidId: string, mode: DuelMode) {
  const db = await admin();
  const { data } = await db
    .from("naval_raids")
    .select(COLS)
    .eq("id", raidId)
    .eq("engine_version" as never, 3 as never)
    .maybeSingle();
  let raid = data as unknown as RaidRow | null;
  if (!raid || (raid.attacker_id !== userId && raid.defender_id !== userId))
    throw new Error("No participas en este duelo.");
  if (!["pendiente", "enfrentado"].includes(raid.status)) throw new Error("El duelo ya terminó.");
  if (raid.duel_state?.mode) throw new Error("El modo de combate ya está decidido.");
  if (!raid.duel_state) raid = await initDuel(db, raid);
  const col = raid.attacker_id === userId ? "attacker_mode" : "defender_mode";
  const { data: upd } = await db
    .from("naval_raids")
    .update({ [col]: mode } as never)
    .eq("id", raidId)
    .select(COLS);
  const row = upd?.[0] as unknown as RaidRow | undefined;
  const agreed = row && agreedMode(row);
  if (row?.duel_state && agreed && !row.duel_state.mode)
    await db
      .from("naval_raids")
      .update({ duel_state: { ...row.duel_state, mode: agreed } } as never)
      .eq("id", raidId)
      .eq("block_number", row.block_number);
}

/** De una en una → tres en tres (cualquiera de los dos, p. ej. si el rival se desconecta). */
export async function switchToThree(userId: string, raidId: string) {
  const db = await admin();
  const { data } = await db
    .from("naval_raids")
    .select(COLS)
    .eq("id", raidId)
    .eq("engine_version" as never, 3 as never)
    .maybeSingle();
  const raid = data as unknown as RaidRow | null;
  if (!raid || (raid.attacker_id !== userId && raid.defender_id !== userId))
    throw new Error("No participas en este duelo.");
  if (!["pendiente", "enfrentado"].includes(raid.status) || raid.duel_state?.mode !== 1)
    throw new Error("El duelo no está en modo de una en una.");
  await switchMode(db, raid, 3);
}

/** Borra los mensajes de voz con más de 24 h (nadie los escuchó). */
export async function purgeVoice() {
  const db = await admin();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await db
    .from("naval_voice" as never)
    .select("id,path")
    .lt("created_at", since)
    .limit(100);
  const rows = (data ?? []) as unknown as { id: string; path: string }[];
  if (!rows.length) return;
  await db.storage.from("voz").remove(rows.map((r) => r.path));
  await db
    .from("naval_voice" as never)
    .delete()
    .in(
      "id",
      rows.map((r) => r.id),
    );
}
