/**
 * Director de escena: convierte una fase registrada en una línea de tiempo de efectos, sonido
 * y frases del registro, sincronizados. Tiempos en segundos (a velocidad ×1):
 *  0,2 llegan los torpedos de la fase anterior · 0,5 saltos · 1,6 maniobra (el radar anima 1,2 s) ·
 *  2,9 embestidas · 3,1 disparos (los proyectiles viajan ~0,9 s) · 4,4 reparaciones · 4,7 el Segundo comenta.
 */
import { play } from "@/lib/sfx/engine";
import type { FleetId } from "@/lib/ship-identity";
import { FLEET_PROFILES, SECOND, SECTION_INFO, TORPEDO_DAMAGE } from "@/lib/naval3/factions";
import {
  RANGE_NAMES,
  type DuelEnd,
  type PhaseEvent,
  type Side,
  type SidePhaseLog,
} from "@/lib/naval3/types";
import type { Line } from "@/lib/naval3/narrate";
import type { FxEngine, P } from "./fx";
import type { Geo } from "./Radar";

type RGB = [number, number, number];
const OWN: RGB = [140, 210, 255];
const FOE: RGB = [255, 120, 110];
const RED: RGB = [255, 110, 90];
const GREEN: RGB = [120, 255, 160];
const BLUE: RGB = [140, 200, 255];
const GREY: RGB = [200, 200, 200];

export const MOVE_AT = 1.6;
export const PHASE_SECONDS = 5.4;

export interface Cue {
  t: number;
  run?: () => void;
  line?: Line & { who?: "segundo" | "fase" };
}

const isLance = (fleet: FleetId) =>
  /lanza|haz|arco|riel|púlsar|partícul|bioplasma|fauces/i.test(FLEET_PROFILES[fleet].prowName);

const ARC_TXT: Record<string, string> = {
  proa: "la proa",
  estribor: "el costado de estribor",
  babor: "el costado de babor",
  popa: "la popa",
};

function maneuverText(l: SidePhaseLog) {
  const speed = ["casi parada", "a avante", "a avante toda"][l.speed];
  const turn =
    l.turn === 0
      ? "mantiene rumbo"
      : `vira ${Math.abs(l.turn) * 45}° a ${l.turn < 0 ? "babor" : "estribor"}`;
  return `${turn} ${speed}`;
}

function sideOf(rel: number) {
  const d = Math.abs(rel);
  return d <= 45 ? "a proa" : d >= 135 ? "a popa" : rel > 0 ? "a estribor" : "a babor";
}

/** Fallos aparentes para que la andanada sea creíble: más contra blancos esquivos y lejanos. */
function missesFor(shots: number, dodge: number, distance: number) {
  return Math.max(1, Math.round(shots * (0.25 + dodge / 120 + distance / 40)));
}

export function phaseCues(opts: {
  e: PhaseEvent;
  me: Side;
  fleets: Record<Side, FleetId>;
  names: Record<Side, string>;
  before: Geo;
  after: Geo;
  fx: () => FxEngine | null;
  end: DuelEnd | null;
  last: boolean;
  maxHull: Record<Side, number>;
  /** Punto en pantalla de cada nave antes/después de maniobrar (mapa táctico). */
  pt: (s: Side, moved: boolean) => P;
}): Cue[] {
  const { e, me, fleets, names, before, after, fx, end, last, maxHull, pt } = opts;
  const foe: Side = me === "attacker" ? "defender" : "attacker";
  const other = (s: Side): Side => (s === me ? foe : me);
  const cues: Cue[] = [];
  const at = (t: number, run?: () => void, line?: Cue["line"]) =>
    cues.push({ t, ...(run ? { run } : {}), ...(line ? { line } : {}) });
  const tone = (actor: Side, good: boolean): Line["tone"] =>
    (actor === me) === good ? "good" : "bad";
  // Posiciones evaluadas en el momento de cada efecto: las naves se mueven de forma continua.
  const pBefore = () => pt(foe, false);
  const pAfter = () => pt(foe, true);
  const posOf = (s: Side, moved: boolean) => pt(s, moved);
  /** El sonido viene del lado del enemigo (estribor = derecha). */
  const pan = (moved: boolean) => Math.sin(((moved ? after : before).rel * Math.PI) / 180) * 0.8;
  const L = e[me];
  const F = e[foe];

  at(0, () => play("radar_ping", { gain: 0.6 }), {
    side: null,
    tone: "neutral",
    text: `Ronda ${e.phase} · ${RANGE_NAMES[e.rangeBefore]}`,
    who: "fase",
  });
  for (const s of [me, foe] as const)
    if (e[s].forced)
      at(0.1, undefined, { side: s, tone: "neutral", text: `${names[s]}: ${e[s].forced}` });

  // 1. Torpedos lanzados la fase anterior: aparecen a medio camino y siguen hasta el blanco
  for (const s of [me, foe] as const) {
    const l = e[s];
    const n = l.instantTorpedoes ? 0 : l.torpedoesHit + l.torpedoesDodged;
    if (!n) continue;
    const target = other(s);
    at(0.2, () => {
      const shooter = posOf(s, false);
      const to = posOf(target, false);
      const from = { x: (shooter.x * 3 + to.x * 2) / 5, y: (shooter.y * 3 + to.y * 2) / 5 };
      fx()?.torpedoes(from, to, l.torpedoesHit, l.torpedoesDodged, 0, 1.2);
      if (l.torpedoesDodged) {
        fx()?.jink(to, 0.9);
        fx()?.text(
          { x: to.x, y: to.y + 24 },
          `${l.torpedoesDodged} ESQUIVADO${l.torpedoesDodged > 1 ? "S" : ""}`,
          GREY,
          1.2,
          9,
        );
      }
      if (l.torpedoesHit)
        fx()?.text(to, `−${l.torpedoesHit * TORPEDO_DAMAGE}`, target === me ? RED : GREEN, 1.3, 13);
    });
    for (let i = 0; i < l.torpedoesHit; i++)
      at(1.4 + i * 0.12, () => play("torpedo_impacto", { pan: pan(false), gain: 0.8 }));
    at(1.4, undefined, {
      side: s,
      tone: tone(s, l.torpedoesHit >= l.torpedoesDodged),
      text: `Llegan los torpedos de ${names[s]}: ${l.torpedoesHit} impactan (−${l.torpedoesHit * TORPEDO_DAMAGE})${l.torpedoesDodged ? `, ${l.torpedoesDodged} esquivados o fallidos` : ""}.`,
    });
  }

  // 2. Saltos en dos tiempos: declara → aguanta → salta por el portal
  for (const s of [me, foe] as const) {
    const w = e[s].warp;
    if (!w) continue;
    const stage = w.stage ?? (w.success ? "salta" : "declara");
    if (stage === "salta")
      at(
        0.5,
        () => {
          fx()?.warp(posOf(s, false), true, 0.9);
          play("salto_disforme", { pan: s === me ? 0 : pan(false) });
        },
        {
          side: s,
          tone: tone(s, true),
          text:
            s === me
              ? "¡Cruzamos el portal! Estamos a salvo en el disforme."
              : `${names[s]} cruza el portal y desaparece.`,
        },
      );
    else
      at(0.4, () => play(stage === "declara" ? "aviso" : "radar_ping", { gain: 0.6 }), {
        side: s,
        tone: stage === "declara" ? "neutral" : tone(s, false),
        text:
          stage === "declara"
            ? `${names[s]} declara el salto: se abre el portal.`
            : `${names[s]} aguanta en modo salto, sin defensas.`,
      });
  }
  if (L.warp?.success || F.warp?.success) return cues.sort((a, b) => a.t - b.t);

  // 3. Maniobra (las naves se desplazan durante toda la ronda)
  at(
    MOVE_AT,
    () => {
      if (L.speed === 2) {
        fx()?.engines(pt(me, false), (L.heading * Math.PI) / 4, true, 0);
        play("avante_toda");
      }
      if (F.speed === 2) {
        fx()?.engines(pBefore(), (F.heading * Math.PI) / 4, true, 0);
        play("avante_toda", { pan: pan(false), gain: 0.6 });
      }
      if (L.action === "escudos") fx()?.shieldBubble(pt(me, true), 0.6);
      if (F.action === "escudos") fx()?.shieldBubble(pAfter(), 1.2);
    },
    {
      side: null,
      tone: "neutral",
      text: `Tu nave ${maneuverText(L)}; ${names[foe]} ${maneuverText(F)}. ${e.rangeBefore === e.rangeAfter ? `Seguimos en ${RANGE_NAMES[e.rangeAfter]}` : `Pasamos a ${RANGE_NAMES[e.rangeAfter]}`} (${e.distance} u), enemigo ${sideOf(after.rel)}.`,
    },
  );

  // 4. Embestidas
  for (const s of [me, foe] as const) {
    const r = e[s].ram;
    if (!r) continue;
    at(
      2.9,
      () => {
        const mid = { x: (pt(me, true).x + pAfter().x) / 2, y: (pt(me, true).y + pAfter().y) / 2 };
        if (r.hit) {
          fx()?.ram(mid, 0);
          fx()?.text(posOf(other(s), true), `−${r.dealt}`, s === me ? GREEN : RED, 0.2, 14);
          play("embestida");
          play("explosion_grande", { delay: 0.05, gain: 0.6 });
        } else fx()?.jink(posOf(other(s), true), 0);
      },
      r.hit
        ? {
            side: s,
            tone: tone(s, true),
            text: `¡${names[s]} embiste! −${r.dealt} de casco (el choque le cuesta −${r.selfDamage}).`,
          }
        : {
            side: s,
            tone: tone(s, false),
            text: `${names[other(s)]} esquiva la embestida en el último instante.`,
          },
    );
  }

  // 5. Disparos: los proyectiles salen de la nave y viajan hasta el blanco
  const shoot = (s: Side) => {
    const l = e[s];
    const target = other(s);
    let from = posOf(s, true);
    let to = posOf(target, true);
    const aim = () => {
      from = posOf(s, true);
      to = posOf(target, true);
    };
    const color = s === me ? OWN : FOE;
    const p = pan(true);
    if (l.action === "torpedos") {
      at(3.1, () => {
        aim();
        play("torpedo_lanzamiento", { pan: p });
        if (l.instantTorpedoes) {
          fx()?.torpedoes(from, to, l.torpedoesHit, l.torpedoesDodged, 0, 0.6);
          if (l.torpedoesHit)
            fx()?.text(
              to,
              `−${l.torpedoesHit * TORPEDO_DAMAGE}`,
              target === me ? RED : GREEN,
              0.7,
              13,
            );
          if (l.torpedoesDodged)
            fx()?.text({ x: to.x, y: to.y + 24 }, `${l.torpedoesDodged} ESQUIVADOS`, GREY, 0.9, 9);
        } else fx()?.launch(from, to, l.torpedoesLaunched, 0);
      });
      if (l.instantTorpedoes)
        for (let i = 0; i < l.torpedoesHit; i++)
          at(3.75 + i * 0.1, () => play("torpedo_impacto", { pan: p }));
      at(
        3.2,
        undefined,
        l.instantTorpedoes
          ? {
              side: s,
              tone: tone(s, l.torpedoesHit > 0),
              text: `${names[s]} lanza ${l.torpedoesLaunched} torpedos a quemarropa: ${l.torpedoesHit} impactan (−${l.torpedoesHit * TORPEDO_DAMAGE}).`,
            }
          : {
              side: s,
              tone: "neutral",
              text: `${names[s]} lanza ${l.torpedoesLaunched} torpedos por la proa: llegarán en la próxima ronda.`,
            },
      );
      return;
    }
    if (l.action !== "fuego" && l.action !== "recargar" && l.action !== "escudos") return;
    const shots = l.fireDealt + l.shieldsAbsorbed;
    const dodge = FLEET_PROFILES[fleets[target]].dodge;
    const prow = l.arcs.includes("proa");
    const side = l.arcs.some((a) => a !== "proa");
    const lance = prow && isLance(fleets[s]);
    at(3.1, () => {
      aim();
      if (lance) {
        fx()?.lance(from, to, color, 0, shots > 0);
        play("lanza", { pan: p });
      }
      if (!lance || side) {
        const hits = shots > 0 ? Math.max(1, Math.round(shots * (lance ? 0.5 : 1))) : 0;
        fx()?.battery(
          from,
          to,
          hits,
          missesFor(Math.max(2, shots), dodge, after.distance),
          color,
          lance ? 0.2 : 0,
        );
        play("macrocanon", { pan: p, delay: lance ? 0.2 : 0 });
      }
    });
    const hitT = 3.1 + 0.4 + Math.min(1, after.distance / 12) * 0.6;
    at(
      hitT,
      () => {
        aim();
        if (l.shieldsAbsorbed > 0) {
          fx()?.shield(to, from, 0, e[target].action === "escudos");
          fx()?.text({ x: to.x, y: to.y + 24 }, `ESCUDOS ${l.shieldsAbsorbed}`, BLUE, 0.1, 9);
          play("impacto_escudo", { pan: p, gain: 0.8 });
        }
        if (l.fireDealt > 0) {
          fx()?.explosion(to, Math.min(1.6, 0.4 + l.fireDealt / 6), 0.05);
          fx()?.text(to, `−${l.fireDealt}`, target === me ? RED : GREEN, 0.05, 13);
          play("impacto_casco", { pan: p, gain: Math.min(1, 0.45 + l.fireDealt / 8), delay: 0.05 });
        }
        if (shots === 0) fx()?.text(to, "FALLO", GREY, 0, 9);
      },
      {
        side: s,
        tone: tone(s, l.fireDealt > 0),
        text: `${names[s]} ${l.action === "escudos" ? "dispara a media potencia tras sus escudos" : l.action === "recargar" ? "recarga y dispara a media potencia" : "abre fuego"}${l.arcs.length ? ` con ${l.arcs.map((x) => ARC_TXT[x]).join(" y ")}` : ""}${l.hitArc === "popa" ? " contra su popa expuesta" : ""}: −${l.fireDealt}${l.shieldsAbsorbed ? ` (los escudos paran ${l.shieldsAbsorbed})` : ""}.`,
      },
    );
  };
  shoot(me);
  shoot(foe);
  // Abordajes: cápsulas que cruzan hasta el casco enemigo
  for (const s of [me, foe] as const) {
    const b = e[s].boardingRoll;
    if (!b) continue;
    const target = other(s);
    at(
      3.0,
      () => {
        const from = posOf(s, true);
        const to = posOf(target, true);
        fx()?.launch(from, to, 4, 0);
        play("torpedo_lanzamiento", { gain: 0.7 });
      },
      { side: s, tone: "neutral", text: `${names[s]} lanza cápsulas de abordaje…` },
    );
    at(
      4.0,
      () => {
        const to = posOf(target, true);
        if (b.success) {
          fx()?.explosion(to, 0.7, 0);
          fx()?.text(to, `−${b.damage}`, target === me ? RED : GREEN, 0, 13);
          if (b.critical)
            fx()?.text(
              { x: to.x, y: to.y + 22 },
              `${SECTION_INFO[b.critical].name.toUpperCase()} FUERA`,
              RED,
              0.2,
              9,
            );
          play("impacto_casco", { gain: 0.8 });
        } else fx()?.text({ x: to.x, y: to.y + 22 }, "ABORDAJE REPELIDO", GREY, 0, 9);
      },
      b.success
        ? {
            side: s,
            tone: tone(s, true),
            text: `¡Abordaje con éxito! −${b.damage}${b.critical ? ` · ${SECTION_INFO[b.critical].name} de ${names[target]} fuera de combate` : ""}.`,
          }
        : {
            side: s,
            tone: tone(s, false),
            text: `El abordaje de ${names[s]} es repelido (${b.chance} %).`,
          },
    );
  }
  // Críticos por disparo
  for (const s of [me, foe] as const) {
    const c = e[s].critical;
    if (!c) continue;
    at(
      3.9,
      () => {
        const to = posOf(other(s), true);
        fx()?.text(
          { x: to.x, y: to.y + 22 },
          `CRÍTICO · ${SECTION_INFO[c].name.toUpperCase()}`,
          RED,
          0,
          9,
        );
        play("alarma", { gain: other(s) === me ? 0.7 : 0.3 });
      },
      {
        side: s,
        tone: tone(s, true),
        text: `¡Impacto crítico! ${SECTION_INFO[c].name} de ${names[other(s)]} fuera de combate (${SECTION_INFO[c].effect}).`,
      },
    );
  }
  for (const s of [me, foe] as const)
    if (e[s].action === "evasion")
      at(3.0, () => fx()?.jink(posOf(s, true), 0), {
        side: s,
        tone: "neutral",
        text: `${names[s]} ejecuta maniobras evasivas.`,
      });

  // 6. Reparación y regeneración
  for (const s of [me, foe] as const) {
    const l = e[s];
    if (l.repairedModule)
      at(
        4.35,
        () => fx()?.text(posOf(s, true), `${SECTION_INFO[l.repairedModule!].name} ✓`, GREEN, 0, 10),
        {
          side: s,
          tone: tone(s, true),
          text: `${names[s]} vuelve a poner en marcha ${SECTION_INFO[l.repairedModule].name.toLowerCase()}.`,
        },
      );
    if (l.repaired)
      at(4.4, () => fx()?.text(posOf(s, true), `+${l.repaired}`, GREEN, 0, 12), {
        side: s,
        tone: tone(s, true),
        text: `${names[s]} repara ${l.repaired} de casco.`,
      });
    if (l.regen)
      at(4.45, undefined, {
        side: s,
        tone: tone(s, true),
        text: `${names[s]} regenera ${l.regen} de casco.`,
      });
  }

  // 7. El Segundo comenta
  const comment = secondComment(e, me, fleets[me], maxHull, names);
  if (comment)
    at(4.75, () => play(comment.tone === "bad" ? "aviso" : "registro", { gain: 0.8 }), {
      ...comment,
      who: "segundo",
    });
  if (L.hullAfter / maxHull[me] <= 0.35 && L.hullAfter > 0)
    at(4.8, () => play("alarma", { gain: 0.7 }));

  // 8. Destrucción
  if (last && end?.reason === "destruida")
    for (const s of end.destroyed)
      at(
        4.9,
        () => {
          fx()?.destruction(posOf(s, true), 0);
          play("explosion_grande", { pan: s === me ? 0 : pan(true) });
          play("explosion_grande", { delay: 1.3, gain: 0.8 });
        },
        {
          side: s,
          tone: s === me ? "bad" : "good",
          text:
            s === me
              ? "¡El reactor se desboca! La nave se parte en dos…"
              : `¡La nave de ${names[s]} estalla en mil pedazos!`,
        },
      );
  return cues.sort((a, b) => a.t - b.t);
}

/** Frase del Segundo al terminar cada fase: qué ha pasado y qué conviene hacer. */
function secondComment(
  e: PhaseEvent,
  me: Side,
  fleet: FleetId,
  maxHull: Record<Side, number>,
  names: Record<Side, string>,
): Line | null {
  const foe: Side = me === "attacker" ? "defender" : "attacker";
  const v = SECOND[fleet];
  const L = e[me];
  const F = e[foe];
  const taken =
    F.fireDealt +
    F.torpedoesHit * TORPEDO_DAMAGE +
    (F.ram?.hit ? F.ram.dealt : 0) +
    (L.ram?.selfDamage ?? 0);
  const dealt = L.fireDealt + L.torpedoesHit * TORPEDO_DAMAGE + (L.ram?.hit ? L.ram.dealt : 0);
  const pct = L.hullAfter / maxHull[me];
  const say = (t: string, tone: Line["tone"]): Line => ({
    side: me,
    tone,
    text: `${v.title}: «${t}»`,
  });
  if (L.warp || F.warp) return null;
  if (pct <= 0.2 && L.hullAfter > 0)
    return say(`¡${v.lord}, el casco no aguanta! ¡Saltemos al disforme, por favor!`, "bad");
  if (pct <= 0.35 && L.hullAfter > 0)
    return say(`${v.lord}, estamos al límite. El salto disforme es nuestra mejor baza.`, "bad");
  if (F.torpedoesLaunched && !F.instantTorpedoes)
    return say("¡Torpedos enemigos en camino! Evasión o avante toda en la próxima ronda.", "bad");
  if (F.hitArc === "popa" && F.fireDealt > 0)
    return say("¡Nos están dando en la popa! Hay que virar ya.", "bad");
  if (taken >= 5 && F.fireDealt >= F.torpedoesHit * TORPEDO_DAMAGE && L.action !== "escudos")
    return say(
      `Sus andanadas nos castigan (−${taken}). Escudos al máximo o cambiar de arco.`,
      "bad",
    );
  if (L.forced?.includes("tubos"))
    return say("No le teníamos a proa. Encaremos antes de lanzar.", "neutral");
  if (L.hitArc === "popa" && L.fireDealt > 0)
    return say("¡Su popa está expuesta! Sigamos castigándola.", "good");
  if (dealt > taken + 2)
    return say(`¡Buen golpe! (−${dealt} contra −${taken}). Mantengamos esta posición.`, "good");
  if (L.action === "recargar")
    return say("Tubos cargados, listos para la siguiente salva.", "neutral");
  if (dealt + taken === 0 && e.distance >= 9)
    return say(
      `Seguimos fuera de alcance de ${names[foe]}. Hay que cerrar distancia o forzar motores.`,
      "neutral",
    );
  return null;
}
