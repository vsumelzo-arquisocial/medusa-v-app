/**
 * El Segundo al mando: lee la geometría (distancia, arcos, rumbos), propone planes y avisa de errores.
 * La interfaz (consejos) y la IA (bot) usan las mismas reglas.
 */
import { FLEET_PROFILES, SECOND, TORPEDO_DAMAGE } from "./factions";
import { MANEUVERS, maneuverMove } from "./maneuvers";
import {
  bandOf,
  dist,
  expectedHit,
  legalize,
  mainArc,
  moveBoth,
  normalizeState,
  other,
  rawFire,
  relBearing,
  stats,
  unitsFor,
  blockRounds,
  inWarp,
  warpPlan,
  type Rng,
} from "./engine";
import {
  ARC_NAMES,
  RANGE_NAMES,
  type Action,
  type Arc,
  type BlockPlan,
  type DuelState,
  type PhaseEvent,
  type PhasePlan,
  type Range,
  type Side,
  type SideState,
  type Speed,
  type Turn,
  type Helm,
  type Vec,
} from "./types";

export type Stance = "asalto" | "optima" | "defensiva";

export const STANCES: Record<Stance, { label: string; text: string }> = {
  asalto: { label: "Al abordaje", text: "Forzar motores, cerrar distancia y embestir." },
  optima: { label: "Nuestra distancia", text: "Buscar la banda y el arco donde les superamos." },
  defensiva: { label: "Resistir", text: "Alejarnos, no darles la popa, esquivar y reparar." },
};

const ARCS_BY_GROUP: { arc: Arc; label: string }[] = [
  { arc: "proa", label: "proa" },
  { arc: "estribor", label: "costados" },
  { arc: "popa", label: "popa" },
];

/** Mejor daño posible en cada banda (eligiendo el mejor arco), contra un blanco sin modificadores. */
function bestFire(s: SideState, band: Range): { value: number; arc: Arc } {
  let best = { value: 0, arc: "proa" as Arc };
  for (const g of ARCS_BY_GROUP) {
    const rel = g.arc === "proa" ? 0 : g.arc === "popa" ? 180 : 90;
    const v = rawFire(s, rel, band).value;
    if (v > best.value) best = { value: v, arc: g.arc };
  }
  return best;
}

export interface RangeRead {
  range: Range;
  ours: number;
  theirs: number;
  edge: number;
  ourArc: Arc;
  theirArc: Arc;
}

export function rangeTable(own: SideState, foe: SideState): RangeRead[] {
  return ([0, 1, 2, 3] as Range[]).map((r) => {
    const o = bestFire(own, r);
    const t = bestFire(foe, r);
    const ours = Math.round(o.value * 10) / 10;
    const theirs = Math.round(t.value * 10) / 10;
    return { range: r, ours, theirs, edge: ours - theirs, ourArc: o.arc, theirArc: t.arc };
  });
}

export function bestRange(own: SideState, foe: SideState): Range {
  const t = rangeTable(own, foe);
  return t.reduce((b, x) => (x.edge > b.edge || (x.edge === b.edge && x.ours > b.ours) ? x : b))
    .range;
}

export const arcLabel = (a: Arc) => (a === "babor" || a === "estribor" ? "costado" : a);

export interface PathStep {
  band: Range;
  distance: number;
  /** Ángulo del enemigo respecto a nuestra proa (positivo: estribor). */
  rel: number;
  /** Ángulo nuestro respecto a su proa. */
  relFoe: number;
  ourHit: number;
  theirHit: number;
  own: SideState;
  foe: SideState;
  minD: number;
  /** El rival no ha decidido aún: se supone que mantiene rumbo a avante. */
}

const FOE_DEFAULT = { speed: 1 as Speed, turn: 0 as Turn };

/** Recorrido previsto del plan si el rival mantiene rumbo a avante. */
export function predictPath(input: DuelState, side: Side, plan: PhasePlan[]): PathStep[] {
  const state = normalizeState(input);
  let own = structuredClone(state[side]);
  let foe = structuredClone(state[other(side)]);
  return plan.map((p) => {
    const step = simulateStep(own, foe, p, FOE_DEFAULT);
    own = step.own;
    foe = step.foe;
    return step;
  });
}

function simulateStep(
  own0: SideState,
  foe0: SideState,
  p: PhasePlan,
  foeMove: { speed: Speed; turn: Turn },
): PathStep {
  const own = structuredClone(own0);
  const foe = structuredClone(foe0);
  const legal = legalize(own, p, foe.pos);
  const minD = moveBoth(own, foe, legal, foeMove);
  const d = dist(own.pos, foe.pos);
  const band = bandOf(d);
  let ourHit = expectedHit(own, foe, band);
  let theirHit = expectedHit(foe, own, band);
  if (legal.speed === 2) ourHit *= 0.5;
  if (p.action === "escudos" || p.action === "recargar") ourHit *= 0.5;
  if (p.action === "evasion" || p.action === "reparar" || p.action === "torpedos") ourHit = 0;
  if (p.action === "escudos") theirHit = Math.max(0, theirHit - 3) * 0.7;
  if (p.action === "evasion") theirHit *= 0.5;
  return {
    band,
    distance: d,
    rel: relBearing(own, foe.pos),
    relFoe: relBearing(foe, own.pos),
    ourHit,
    theirHit,
    own,
    foe,
    minD,
  };
}

/** Órdenes de timón que el Segundo considera (intenciones: robustas aunque el rival maniobre). */
/** Las mismas maniobras que puede elegir el jugador. */
function candidates(s: SideState): { speed: Speed; turn: Helm }[] {
  return MANEUVERS.map((m) => maneuverMove(m.id, s));
}

function score(step: PathStep, stance: Stance, own: SideState, want: Range): number {
  const hullPct = own.hull / own.maxHull;
  const danger = stance === "defensiva" ? 1.6 : hullPct < 0.4 ? 1.3 : 1;
  let v = step.ourHit - danger * step.theirHit;
  if (stance === "asalto") v -= 0.6 * step.distance;
  else if (stance === "defensiva") v += 0.25 * step.distance;
  else v -= 0.3 * Math.abs(step.band - want);
  return v;
}

/** Plan sugerido por el Segundo para una postura. */
export function suggestPlan(input: DuelState, side: Side, stance: Stance, rng?: Rng): BlockPlan {
  const state = normalizeState(input);
  let own = structuredClone(state[side]);
  let foe = structuredClone(state[other(side)]);
  const want = bestRange(own, foe);
  const ramStrong = stats(own).ram >= 6;
  let loaded = own.torpedoesLoaded;
  let foeInFlight = foe.torpedoesInFlight > 0;
  const phases: PhasePlan[] = [];
  for (let i = 0; i < blockRounds(state); i++) {
    // ¿Embestida posible ahora?
    const prowNow = Math.abs(relBearing(own, foe.pos));
    const ramStep = simulateStep(own, foe, { speed: 2, turn: 0, action: "embestir" }, FOE_DEFAULT);
    const canRam = prowNow <= 45 && ramStep.minD <= 2;
    let chosen: PhasePlan;
    let step: PathStep;
    if (
      canRam &&
      (stance === "asalto" || (ramStrong && stance === "optima" && own.hull > foe.hull))
    ) {
      chosen = { speed: 2, turn: 0, action: "embestir" };
      step = ramStep;
    } else {
      let best: { move: { speed: Speed; turn: Helm }; step: PathStep; v: number } | null = null;
      for (const move of candidates(own)) {
        const st = simulateStep(own, foe, { ...move, action: "fuego" }, FOE_DEFAULT);
        let v = score(st, stance, own, want);
        if (rng) v += (rng() - 0.5) * 1.2;
        if (!best || v > best.v) best = { move, step: st, v };
      }
      step = best!.step;
      let action: Action;
      const prowAfter = Math.abs(step.rel);
      if (foeInFlight && (stance === "defensiva" || own.hull < own.maxHull * 0.4))
        action = "evasion";
      else if (stance === "defensiva" && own.hull < own.maxHull * 0.7 && step.theirHit < 1.5)
        action = "reparar";
      else if (step.theirHit >= 4 && step.theirHit > step.ourHit + 1.5) action = "escudos";
      else if (loaded && prowAfter <= 40 && step.band >= 1) action = "torpedos";
      else if (!loaded && stats(own).torpedoes > 0 && step.ourHit <= 2) action = "recargar";
      else action = "fuego";
      chosen = { ...best!.move, action };
    }
    if (chosen.action === "torpedos") loaded = false;
    if (chosen.action === "recargar") loaded = true;
    if (chosen.action === "reparar") own.hull = Math.min(own.maxHull, own.hull + stats(own).repair);
    foeInFlight = false;
    phases.push(chosen);
    own = { ...step.own, hull: own.hull, torpedoesLoaded: loaded };
    foe = step.foe;
  }
  return { phases, emergencyJump: 30 };
}

export interface Advice {
  tone: "info" | "good" | "warn" | "danger";
  text: string;
}

const sideName = (rel: number) => {
  const a = mainArc(rel);
  return a === "proa" ? "a proa" : a === "popa" ? "a popa" : `a ${ARC_NAMES[a]}`;
};

/** Valoración general antes de planificar. */
export function briefing(input: DuelState, side: Side): Advice[] {
  const state = normalizeState(input);
  const own = state[side];
  const foe = state[other(side)];
  const voice = SECOND[own.fleet];
  const t = rangeTable(own, foe);
  const ours = bestRange(own, foe);
  const theirs = bestRange(foe, own);
  const out: Advice[] = [];
  const pct = own.hull / own.maxHull;
  if (pct <= 0.2)
    out.push({
      tone: "danger",
      text: `¡${voice.lord}, el casco se parte! ¡Declarad el salto ya: tarda dos rondas!`,
    });
  else if (pct <= 0.35)
    out.push({
      tone: "danger",
      text: `${voice.lord}, no aguantaremos mucho más. Considerad el salto: dos rondas quietos y salvamos la nave.`,
    });
  const d = dist(own.pos, foe.pos);
  const rel = relBearing(own, foe.pos);
  const relFoe = relBearing(foe, own.pos);
  out.push({
    tone: "info",
    text: `Contacto ${sideName(rel)}, a ${d.toFixed(1)} u (${RANGE_NAMES[bandOf(d)]}). Nosotros estamos ${sideName(relFoe)} de ellos.`,
  });
  out.push({
    tone: "info",
    text: `Donde más les superamos: ${arcLabel(t[ours]!.ourArc)} en ${RANGE_NAMES[ours]} (${t[ours]!.ours} contra ${t[ours]!.theirs}). Ellos querrán usar su ${arcLabel(t[theirs]!.theirArc)} en ${RANGE_NAMES[theirs]}.`,
  });
  const theirArc = mainArc(relFoe);
  if (theirArc !== "popa" && t[bandOf(d)]!.theirArc === arcLabelToArc(theirArc))
    out.push({
      tone: "warn",
      text: `Estamos en su ${arcLabel(theirArc)}, justo donde más pegan. Cambiemos de rumbo.`,
    });
  if (theirArc === "popa")
    out.push({
      tone: "good",
      text: "¡Estamos a su popa! Sus motores están expuestos: cada impacto cuenta más.",
    });
  if (mainArc(rel) === "popa")
    out.push({
      tone: "danger",
      text: "Les damos la popa: nuestros motores reciben más daño. ¡Hay que virar!",
    });
  const os = unitsFor(own, 1);
  const ob = unitsFor(own, 2);
  const fs = unitsFor(foe, 1);
  const fb = unitsFor(foe, 2);
  out.push({
    tone: ob > fb ? "good" : ob < fb ? "warn" : "info",
    text: `Velocidad: ${os} u/ronda (avante toda ${ob}); ellos ${fs} (${fb}). ${
      ob > fb
        ? "Podemos darles caza o escapar si forzamos motores."
        : ob < fb
          ? "Si deciden huir o perseguirnos, no podremos impedirlo."
          : "Igualados: la distancia la decide quien fuerce motores."
    } Giramos ${stats(own).agility * 45}° por ronda (${Math.min(2, stats(own).agility + 1) * 45}° parados).`,
  });
  if (foe.torpedoesInFlight)
    out.push({
      tone: "warn",
      text: `¡${foe.torpedoesInFlight} torpedos enemigos en vuelo! Impactarán en la primera ronda. Evasión o avante toda ayudan a esquivarlos.`,
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

function arcLabelToArc(a: Arc): Arc {
  return a === "babor" ? "estribor" : a;
}

/** Comentario del Segundo para una fase concreta del plan. */
export function phaseAdvice(
  input: DuelState,
  side: Side,
  plan: PhasePlan[],
  i: number,
  path: PathStep[],
): Advice | null {
  const state = normalizeState(input);
  const own = state[side];
  const p = plan[i]!;
  const step = path[i]!;
  const before = i === 0 ? null : path[i - 1]!;
  const ownBefore = before?.own ?? own;
  const foeBefore = before?.foe ?? state[other(side)];
  let loaded = own.torpedoesLoaded;
  for (let k = 0; k < i; k++) {
    if (plan[k]!.action === "torpedos" && loaded) loaded = false;
    else if (plan[k]!.action === "torpedos" || plan[k]!.action === "recargar") loaded = true;
  }
  if (p.action === "saltar")
    return {
      tone: "warn",
      text: "Salto: esta ronda y la siguiente quietos y sin defensas; luego saltamos. Perdemos el duelo, salvamos la nave.",
    };
  if (p.action === "torpedos" && !loaded)
    return { tone: "danger", text: "Tubos vacíos: esta orden se convertirá en recarga." };
  if (p.action === "torpedos" && Math.abs(step.rel) > 45)
    return {
      tone: "danger",
      text: `El enemigo quedará ${sideName(step.rel)}: los tubos solo apuntan a proa. Gira hacia él antes de lanzar.`,
    };
  if (p.action === "embestir") {
    const prow = Math.abs(relBearing({ ...ownBefore, heading: ownBefore.heading }, foeBefore.pos));
    if (prow > 45)
      return {
        tone: "danger",
        text: "No le tenemos a proa: la embestida es imposible. Gira primero.",
      };
    if (step.minD > 2)
      return {
        tone: "danger",
        text: `Ni a avante toda le alcanzamos (quedaremos a ${step.distance.toFixed(1)} u).`,
      };
    return {
      tone: "good",
      text: `¡Embestida! ~${stats(own).ram} de daño si no esquivan (${FLEET_PROFILES[foeBefore.fleet].dodge} % de esquiva).`,
    };
  }
  if (p.action === "torpedos")
    return step.band <= 1
      ? {
          tone: "good",
          text: `Salva a quemarropa por la proa: impacto inmediato. Hasta ${stats(own).torpedoes * TORPEDO_DAMAGE} de daño.`,
        }
      : {
          tone: "info",
          text: `Salva de ${stats(own).torpedoes} por la proa: impactará en la ronda siguiente.`,
        };
  if (p.action === "reparar" && own.hull >= own.maxHull)
    return { tone: "warn", text: "El casco está intacto: reparar no sirve de nada ahora." };
  if (mainArc(step.rel) === "popa" && step.theirHit > 1)
    return { tone: "danger", text: "Les daremos la popa: nuestros motores quedarán expuestos." };
  if (p.action === "escudos")
    return {
      tone: step.theirHit > 1 ? "info" : "good",
      text: `Escudos al máximo: paramos buena parte de su andanada (recibiríamos ~${step.theirHit.toFixed(1)}) a costa de disparar a la mitad.`,
    };
  if (p.action === "evasion")
    return {
      tone: "info",
      text: "Maniobras evasivas: más difícil acertarnos con torpedos o embestirnos, y su fuego nos llega a la mitad. No disparamos.",
    };
  if (p.speed === 2 && (p.action === "fuego" || p.action === "recargar"))
    return {
      tone: "info",
      text: `Avante toda: ${unitsFor(own, 2)} u de golpe, sin girar y con el fuego a la mitad (${step.ourHit.toFixed(1)}).`,
    };
  if (p.action === "fuego" || p.action === "recargar") {
    const arcs = arcLabel(mainArc(step.rel));
    if (step.ourHit < 1)
      return {
        tone: "danger",
        text: `Con el enemigo ${sideName(step.rel)} en ${RANGE_NAMES[step.band]}, nuestras armas de ${arcs} apenas le hacen nada.`,
      };
    if (step.theirHit - step.ourHit > 2)
      return {
        tone: "warn",
        text: `Ellos nos harán más daño (${step.theirHit.toFixed(1)}) que nosotros con la ${arcs} (${step.ourHit.toFixed(1)}).`,
      };
    if (step.ourHit - step.theirHit > 1)
      return {
        tone: "good",
        text: `Buena posición: disparamos con la ${arcs} (${step.ourHit.toFixed(1)}) y ellos solo ${step.theirHit.toFixed(1)}.`,
      };
  }
  return null;
}

/** IA: elige postura según la situación y la ejecuta con algo de ruido. */
export function botPlan(state: DuelState, side: Side, rng: Rng, noise = true): BlockPlan {
  const s = normalizeState(state);
  const own = s[side];
  const foe = s[other(side)];
  const pct = own.hull / own.maxHull;
  const ours = bestRange(own, foe);
  const stance: Stance = pct < 0.3 && rng() < 0.5 ? "defensiva" : ours === 0 ? "asalto" : "optima";
  const plan = suggestPlan(s, side, stance, noise ? rng : undefined);
  return { ...plan, emergencyJump: pct < 0.5 ? 25 : 20 };
}

export interface Debrief {
  dealt: number;
  taken: number;
  notes: Advice[];
}

/** Informe del Segundo tras un bloque: balance y recomendaciones para el siguiente. */
export function blockDebrief(events: PhaseEvent[], side: Side, input: DuelState): Debrief | null {
  if (!events.length) return null;
  const state = normalizeState(input);
  const foe = other(side);
  const own = state[side];
  const voice = SECOND[own.fleet];
  let dealt = 0;
  let taken = 0;
  let foeTorpedoes = 0;
  let foeFire = 0;
  let sternHits = 0;
  let wastedTorps = 0;
  let shieldsUsed = 0;
  let evaded = 0;
  for (const e of events) {
    const L = e[side];
    const F = e[foe];
    dealt += L.fireDealt + L.torpedoesHit * TORPEDO_DAMAGE + (L.ram?.hit ? L.ram.dealt : 0);
    taken +=
      F.fireDealt +
      F.torpedoesHit * TORPEDO_DAMAGE +
      (F.ram?.hit ? F.ram.dealt : 0) +
      (L.ram?.selfDamage ?? 0) +
      (L.warp?.damage ?? 0);
    foeTorpedoes += F.torpedoesHit * TORPEDO_DAMAGE;
    foeFire += F.fireDealt;
    if (F.hitArc === "popa" && F.fireDealt > 0) sternHits++;
    if (L.forced?.includes("tubos") || L.forced?.includes("Tubos")) wastedTorps++;
    if (L.action === "escudos") shieldsUsed++;
    if (L.action === "evasion") evaded++;
  }
  const notes: Advice[] = [];
  notes.push({
    tone: dealt > taken ? "good" : dealt < taken ? "warn" : "info",
    text: `Balance: les hemos hecho −${dealt} y hemos recibido −${taken}.`,
  });
  const pct = own.hull / own.maxHull;
  if (pct <= 0.35)
    notes.push({
      tone: "danger",
      text: `${voice.lord}, el casco está al ${Math.round(pct * 100)} %. Si el próximo bloque va mal, declarad el salto (tarda dos rondas) o fijad un salto automático.`,
    });
  if (sternHits)
    notes.push({
      tone: "warn",
      text: `Nos han alcanzado ${sternHits} ${sternHits > 1 ? "veces" : "vez"} por la popa. Evitad «Alejarse» si nos tienen a tiro.`,
    });
  if (foeTorpedoes >= 4 && evaded === 0)
    notes.push({
      tone: "warn",
      text: `Sus torpedos nos han hecho −${foeTorpedoes}. Cuando veáis torpedos en vuelo, ordenad evasión o avante toda.`,
    });
  if (foeFire >= 8 && shieldsUsed === 0)
    notes.push({
      tone: "warn",
      text: `Sus andanadas nos han hecho −${foeFire}. «Escudos al máximo» para las rondas en que estemos en su mejor arco.`,
    });
  if (wastedTorps)
    notes.push({
      tone: "info",
      text: "Algunas salvas no salieron: el enemigo no estaba a proa. Girad hacia él la ronda anterior.",
    });
  const t = rangeTable(own, state[foe]);
  const now = bandOf(dist(own.pos, state[foe].pos));
  const best = bestRange(own, state[foe]);
  if (now !== best)
    notes.push({
      tone: "info",
      text: `Ahora estamos en ${RANGE_NAMES[now]}; donde más les superamos es ${RANGE_NAMES[best]} con ${arcLabel(t[best]!.ourArc)}.`,
    });
  return { dealt, taken, notes };
}

/** Plan más probable del rival (lo que haría la IA en su lugar, sin azar). */
export function likelyPlan(state: DuelState, side: Side): BlockPlan {
  const s = normalizeState(state);
  const own = s[side];
  if (inWarp(own)) return warpPlan(blockRounds(s));
  const foe = s[other(side)];
  const pct = own.hull / own.maxHull;
  const stance: Stance = pct < 0.3 ? "defensiva" : bestRange(own, foe) === 0 ? "asalto" : "optima";
  return suggestPlan(s, side, stance);
}

export interface ForecastStep {
  own: SideState;
  foe: SideState;
  band: Range;
  distance: number;
  /** Ángulo del enemigo respecto a nuestra proa. */
  rel: number;
  /** Ángulo nuestro respecto a su proa. */
  relFoe: number;
  ourHit: number;
  theirHit: number;
  /** Casco previsto tras la ronda. */
  ownHull: number;
  foeHull: number;
  ourArc: Arc;
  theirArc: Arc;
  /** Distancia mínima durante el movimiento (para las embestidas). */
  minD: number;
}

export interface Forecast {
  steps: ForecastStep[];
  foePlan: PhasePlan[];
  /** Posiciones alcanzables por el enemigo en cada ronda (todas sus maniobras posibles). */
  envelope: Vec[][];
}

/** Daño esperado de `a` sobre `b` con sus acciones de la ronda. */
function hitWithActions(
  a: SideState,
  b: SideState,
  band: Range,
  pa: PhasePlan,
  pb: PhasePlan,
): number {
  if (
    pa.action === "evasion" ||
    pa.action === "reparar" ||
    pa.action === "saltar" ||
    pa.action === "embestir"
  )
    return 0;
  if (pa.action === "torpedos")
    return Math.abs(relBearing(a, b.pos)) <= 45 && a.torpedoesLoaded
      ? stats(a).torpedoes * TORPEDO_DAMAGE * 0.55
      : expectedHit(a, b, band);
  let v = expectedHit(a, b, band);
  if (pa.action === "recargar" || pa.action === "escudos" || pa.speed === 2) v *= 0.5;
  if (pb.action === "evasion") v *= 0.5;
  if (pb.action === "escudos") v = Math.max(0, v - 3) * 0.7;
  return v;
}

/**
 * Pronóstico de las rondas del bloque: nuestro plan contra el plan más probable del enemigo,
 * con el daño esperado de cada lado y la zona que el enemigo puede alcanzar.
 */
export function forecast(input: DuelState, side: Side, plan: PhasePlan[]): Forecast {
  const state = normalizeState(input);
  const foeSide = other(side);
  const foePlan = likelyPlan(state, foeSide).phases;
  let own = structuredClone(state[side]);
  let foe = structuredClone(state[foeSide]);
  const steps: ForecastStep[] = [];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i]!;
    const fp = foePlan[i] ?? { speed: 1, turn: 0, action: "fuego" };
    const o = structuredClone(own);
    const f = structuredClone(foe);
    const minD = moveBoth(o, f, legalize(o, p, f.pos), legalize(f, fp, o.pos));
    const d = dist(o.pos, f.pos);
    const band = bandOf(d);
    const ourHit = hitWithActions(o, f, band, p, fp);
    const theirHit = hitWithActions(f, o, band, fp, p);
    if (p.action === "torpedos") o.torpedoesLoaded = false;
    if (p.action === "recargar") o.torpedoesLoaded = true;
    if (fp.action === "torpedos") f.torpedoesLoaded = false;
    if (fp.action === "recargar") f.torpedoesLoaded = true;
    o.hull = Math.max(
      0,
      Math.min(
        o.maxHull,
        o.hull - theirHit + (p.action === "reparar" ? stats(o).repair : 0) + stats(o).regen,
      ),
    );
    f.hull = Math.max(
      0,
      Math.min(
        f.maxHull,
        f.hull - ourHit + (fp.action === "reparar" ? stats(f).repair : 0) + stats(f).regen,
      ),
    );
    const rel = relBearing(o, f.pos);
    const relFoe = relBearing(f, o.pos);
    steps.push({
      own: o,
      foe: f,
      band,
      distance: d,
      rel,
      relFoe,
      ourHit,
      theirHit,
      ownHull: o.hull,
      foeHull: f.hull,
      ourArc: mainArc(rel),
      theirArc: mainArc(relFoe),
      minD,
    });
    own = o;
    foe = f;
  }
  const envelope = reachable(state[foeSide], plan.length);
  return { steps, foePlan, envelope };
}

/** Posiciones alcanzables por una nave en cada una de las próximas rondas (todas sus maniobras). */
export function reachable(start: SideState, rounds: number): Vec[][] {
  const out: Vec[][] = [];
  let frontier: SideState[] = [structuredClone(start)];
  for (let i = 0; i < rounds; i++) {
    const next: SideState[] = [];
    const seen = new Set<string>();
    for (const f of frontier)
      for (const m of MANEUVERS) {
        const mv = maneuverMove(m.id, f);
        const g = structuredClone(f);
        g.heading = (((g.heading + mv.turn) % 8) + 8) % 8;
        const a = (g.heading * Math.PI) / 4;
        const u = unitsFor(g, mv.speed);
        g.pos = { x: g.pos.x + Math.sin(a) * u, y: g.pos.y + Math.cos(a) * u };
        const key = `${Math.round(g.pos.x * 2)},${Math.round(g.pos.y * 2)},${g.heading}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(g);
      }
    out.push(next.map((g) => g.pos));
    frontier =
      next.length > 120 ? next.filter((_, k) => k % Math.ceil(next.length / 120) === 0) : next;
  }
  return out;
}
