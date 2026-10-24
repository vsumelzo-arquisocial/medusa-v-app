/**
 * El Segundo al mando: analiza distancias, propone planes y avisa de errores.
 * Lo usan la interfaz (consejos) y la IA (bot) con las mismas reglas.
 */
import { FLEET_PROFILES, PHASES_PER_BLOCK, SECOND, TORPEDO_DAMAGE } from "./factions";
import { absorbed, fireDodgeFactor, nextRange, other, stats, warpChance, type Rng } from "./engine";
import {
  RANGE_NAMES,
  type Action,
  type BlockPlan,
  type DuelState,
  type Move,
  type PhasePlan,
  type Range,
  type Side,
  type SideState,
} from "./types";

export type Stance = "asalto" | "optima" | "defensiva";

export const STANCES: Record<Stance, { label: string; text: string }> = {
  asalto: { label: "Al abordaje", text: "Cerrar distancia, embestir y luchar cuerpo a cuerpo." },
  optima: {
    label: "Nuestra distancia",
    text: "Buscar la banda donde les hacemos más daño del que recibimos.",
  },
  defensiva: { label: "Resistir", text: "Alejarnos, esquivar sus salvas y reparar. Ganar tiempo." },
};

/** Daño neto esperado que hace `a` a `b` en una distancia (disparo tras escudos). */
export function expectedFire(a: SideState, b: SideState, r: Range): number {
  let raw = stats(a).fire[r];
  if (b.fleet === "aeldari" && r >= 2) raw *= 0.7;
  raw *= fireDodgeFactor(b.fleet);
  return Math.round((raw - absorbed(raw, stats(b).shields)) * 10) / 10;
}

export interface RangeRead {
  range: Range;
  ours: number;
  theirs: number;
  edge: number;
}

export function rangeTable(own: SideState, foe: SideState): RangeRead[] {
  return ([0, 1, 2, 3] as Range[]).map((r) => {
    const ours = expectedFire(own, foe, r);
    const theirs = expectedFire(foe, own, r);
    return { range: r, ours, theirs, edge: ours - theirs };
  });
}

export function bestRange(own: SideState, foe: SideState): Range {
  const t = rangeTable(own, foe);
  return t.reduce((b, x) => (x.edge > b.edge || (x.edge === b.edge && x.ours > b.ours) ? x : b))
    .range;
}

const toward = (from: Range, to: Range): Move => (to < from ? -1 : to > from ? 1 : 0);

/** Distancias previstas del plan si el rival busca su distancia ideal. */
export function predictRanges(state: DuelState, side: Side, plan: PhasePlan[]): Range[] {
  const own = state[side];
  const foe = state[other(side)];
  const foeWant = bestRange(foe, own);
  const os = stats(own).speed;
  const fs = stats(foe).speed;
  let r = state.range;
  return plan.map((p) => {
    const m: Move = p.action === "embestir" ? -1 : p.move;
    const fm = toward(r, foeWant);
    r = side === "attacker" ? nextRange(r, m, os, fm, fs) : nextRange(r, fm, fs, m, os);
    if (p.action === "embestir" && r <= 1) r = 0;
    return r;
  });
}

/** Plan sugerido por el Segundo para una postura. */
export function suggestPlan(state: DuelState, side: Side, stance: Stance, rng?: Rng): BlockPlan {
  const own = state[side];
  const foe = state[other(side)];
  const os = stats(own).speed;
  const fs = stats(foe).speed;
  const foeWant = bestRange(foe, own);
  const want: Range = stance === "asalto" ? 0 : stance === "defensiva" ? 3 : bestRange(own, foe);
  const ramStrong = stats(own).ram >= stats(own).fire[0];
  let r = state.range;
  let loaded = own.torpedoesLoaded;
  let foeInFlight = foe.torpedoesInFlight > 0;
  let hull = own.hull;
  const phases: PhasePlan[] = [];
  for (let i = 0; i < PHASES_PER_BLOCK; i++) {
    // Elige la maniobra que, previendo al rival, nos deja más cerca de la distancia deseada.
    const fm = toward(r, foeWant);
    const land = (m: Move) =>
      side === "attacker" ? nextRange(r, m, os, fm, fs) : nextRange(r, fm, fs, m, os);
    let move: Move = ([0, -1, 1] as Move[]).reduce((best, m) =>
      Math.abs(land(m) - want) < Math.abs(land(best) - want) ? m : best,
    );
    if (rng && rng() < 0.12) move = (Math.floor(rng() * 3) - 1) as Move;
    const after = land(move);
    let action: Action;
    if (foeInFlight && (stance === "defensiva" || hull < own.maxHull * 0.4)) action = "evasion";
    else if (stance === "defensiva" && hull < own.maxHull * 0.7 && after >= 2) action = "reparar";
    else if (after <= 1 && stance === "asalto" && ramStrong && i % 2 === 0) action = "embestir";
    else if (loaded && (after >= 2 || stance === "asalto")) action = "torpedos";
    else if (!loaded && expectedFire(own, foe, after) <= 3) action = "recargar";
    else action = "fuego";
    if (action === "torpedos") loaded = false;
    if (action === "recargar") loaded = true;
    if (action === "reparar") hull += stats(own).repair;
    foeInFlight = false;
    phases.push({ move: action === "embestir" ? -1 : move, action });
    r = action === "embestir" && after <= 1 ? 0 : after;
  }
  return { phases, emergencyJump: 30 };
}

export interface Advice {
  tone: "info" | "good" | "warn" | "danger";
  text: string;
}

/** Valoración general antes de planificar. */
export function briefing(state: DuelState, side: Side): Advice[] {
  const own = state[side];
  const foe = state[other(side)];
  const voice = SECOND[own.fleet];
  const t = rangeTable(own, foe);
  const ours = bestRange(own, foe);
  const theirs = bestRange(foe, own);
  const out: Advice[] = [];
  const pct = own.hull / own.maxHull;
  const chance = warpChance(own);
  if (pct <= 0.2)
    out.push({
      tone: "danger",
      text: `¡${voice.lord}, el casco se parte! ¡Salte al disforme, por favor, es nuestra última oportunidad! (${chance} % de éxito)`,
    });
  else if (pct <= 0.35)
    out.push({
      tone: "danger",
      text: `${voice.lord}, no aguantaremos mucho más. Os ruego que consideréis el salto disforme: ${chance} % de éxito ahora, y cada impacto lo empeora.`,
    });
  out.push({
    tone: "info",
    text: `Somos más eficaces en ${RANGE_NAMES[ours]} (${t[ours]!.ours} de daño contra ${t[ours]!.theirs}). Ellos prefieren ${RANGE_NAMES[theirs]}.`,
  });
  const os = stats(own).speed;
  const fs = stats(foe).speed;
  out.push({
    tone: os > fs ? "good" : os < fs ? "warn" : "info",
    text:
      os > fs
        ? "Somos más rápidos: si tiramos en sentidos opuestos, decidimos nosotros la distancia."
        : os < fs
          ? "Son más rápidos: si ellos quieren alejarse o acercarse, no podremos impedirlo."
          : "Misma velocidad: si tiramos en sentidos opuestos, la distancia no cambia.",
  });
  if (foe.torpedoesInFlight)
    out.push({
      tone: "warn",
      text: `¡${foe.torpedoesInFlight} torpedos enemigos en vuelo! Impactarán en la primera fase. Evasión o alejarse ayuda a esquivarlos.`,
    });
  if (!own.torpedoesLoaded)
    out.push({
      tone: "warn",
      text: "Nuestros tubos están vacíos: hay que recargar antes de lanzar.",
    });
  const pf = FLEET_PROFILES[foe.fleet];
  out.push({ tone: "info", text: `Enemigo: ${pf.trait}. ${pf.traitText}` });
  return out;
}

/** Comentario del Segundo para una fase concreta del plan. */
export function phaseAdvice(
  state: DuelState,
  side: Side,
  plan: PhasePlan[],
  i: number,
  ranges: Range[],
): Advice | null {
  const own = state[side];
  const foe = state[other(side)];
  const p = plan[i]!;
  const r = ranges[i]!;
  let loaded = own.torpedoesLoaded;
  for (let k = 0; k < i; k++) {
    if (plan[k]!.action === "torpedos" && loaded) loaded = false;
    else if (plan[k]!.action === "torpedos" || plan[k]!.action === "recargar") loaded = true;
  }
  const t = rangeTable(own, foe)[r]!;
  if (p.action === "saltar")
    return {
      tone: "warn",
      text: `Saltamos al disforme: ${warpChance(own)} % de éxito con el casco actual. Perdemos el duelo, salvamos la nave.`,
    };
  if (p.action === "torpedos" && !loaded)
    return { tone: "danger", text: "Tubos vacíos: esta orden se convertirá en recarga." };
  if (p.action === "embestir" && r > 1)
    return {
      tone: "danger",
      text: `Probablemente estaremos en ${RANGE_NAMES[r]}: no llegaremos a embestir.`,
    };
  if (p.action === "embestir")
    return {
      tone: "good",
      text: `Embestida: ~${stats(own).ram} de daño si no esquivan (${FLEET_PROFILES[foe.fleet].dodge} % de esquiva).`,
    };
  if (p.action === "torpedos")
    return r <= 1
      ? {
          tone: "good",
          text: `Salva a quemarropa: impacto inmediato y les cuesta esquivar. Hasta ${stats(own).torpedoes * TORPEDO_DAMAGE} de daño.`,
        }
      : {
          tone: "info",
          text: `Salva de ${stats(own).torpedoes}: impactará en la fase siguiente. Si esquivan o se alejan, fallarán más.`,
        };
  if (p.action === "reparar" && own.hull >= own.maxHull)
    return { tone: "warn", text: "El casco está intacto: reparar no sirve de nada ahora." };
  if (p.action === "fuego" || p.action === "recargar") {
    if (t.ours <= 1)
      return {
        tone: "danger",
        text: `En ${RANGE_NAMES[r]} nuestras baterías apenas les hacen nada (${t.ours}).`,
      };
    if (t.edge < -2)
      return {
        tone: "warn",
        text: `En ${RANGE_NAMES[r]} ellos nos hacen más daño (${t.theirs}) que nosotros a ellos (${t.ours}).`,
      };
    if (t.edge > 1)
      return {
        tone: "good",
        text: `En ${RANGE_NAMES[r]} les superamos: ${t.ours} contra ${t.theirs}.`,
      };
  }
  return null;
}

/** IA: elige postura según la situación y la ejecuta con algo de ruido. */
export function botPlan(state: DuelState, side: Side, rng: Rng, noise = true): BlockPlan {
  const own = state[side];
  const foe = state[other(side)];
  const pct = own.hull / own.maxHull;
  const ours = bestRange(own, foe);
  const stance: Stance = pct < 0.3 && rng() < 0.5 ? "defensiva" : ours === 0 ? "asalto" : "optima";
  const plan = suggestPlan(state, side, stance, noise ? rng : undefined);
  return { ...plan, emergencyJump: pct < 0.5 ? 25 : 20 };
}
