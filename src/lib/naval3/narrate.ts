/** Narración en castellano de cada ronda, para la repetición y el registro. */
import { TORPEDO_DAMAGE } from "./factions";
import { RANGE_NAMES, type DuelEnd, type PhaseEvent, type Side, type SidePhaseLog } from "./types";

export interface Line {
  side: Side | null;
  tone: "neutral" | "good" | "bad";
  text: string;
}

const SPEED = ["casi parada", "a avante", "a avante toda"] as const;

function maneuver(l: SidePhaseLog): string {
  const turn =
    l.turn === 0
      ? "mantiene rumbo"
      : `vira ${Math.abs(l.turn) * 45}° a ${l.turn < 0 ? "babor" : "estribor"}`;
  const intent =
    l.helm === "encarar"
      ? " para encararle"
      : l.helm === "costado"
        ? " para presentar el costado"
        : l.helm === "huir"
          ? " para alejarse"
          : "";
  return `${turn}${l.turn !== 0 ? intent : ""} ${SPEED[l.speed]}`;
}

const ARC_TXT: Record<string, string> = {
  proa: "la proa",
  estribor: "el costado de estribor",
  babor: "el costado de babor",
  popa: "la popa",
};

/** `me` es el bando del lector: lo bueno para él se marca en verde. */
export function narratePhase(e: PhaseEvent, me: Side, names: Record<Side, string>): Line[] {
  const lines: Line[] = [];
  const foe = (s: Side): Side => (s === "attacker" ? "defender" : "attacker");
  const tone = (actor: Side, goodForActor: boolean): Line["tone"] =>
    (actor === me) === goodForActor ? "good" : "bad";
  const sides: Side[] = [me, foe(me)];

  for (const s of sides) {
    const l = e[s];
    if (l.forced) lines.push({ side: s, tone: "neutral", text: `${names[s]}: ${l.forced}` });
  }
  // Torpedos que llegan de la fase anterior
  for (const s of sides) {
    const l = e[s];
    if (!l.instantTorpedoes && l.torpedoesHit + l.torpedoesDodged > 0)
      lines.push({
        side: s,
        tone: tone(s, l.torpedoesHit >= l.torpedoesDodged),
        text: `Llegan los torpedos de ${names[s]}: ${l.torpedoesHit} impactan (−${l.torpedoesHit * TORPEDO_DAMAGE}), ${l.torpedoesDodged} fallan o son esquivados.`,
      });
  }
  for (const s of sides) {
    const w = e[s].warp;
    if (!w) continue;
    const stage = w.stage ?? (w.success ? "salta" : "declara");
    lines.push(
      stage === "salta"
        ? {
            side: s,
            tone: tone(s, true),
            text: `¡${names[s]} cruza el portal y desaparece en el disforme!`,
          }
        : stage === "carga"
          ? {
              side: s,
              tone: tone(s, false),
              text: `${names[s]} aguanta quieto en modo salto, sin defensas.`,
            }
          : {
              side: s,
              tone: "neutral",
              text: `${names[s]} declara el salto: el portal empieza a abrirse.`,
            },
    );
  }
  if (sides.some((s) => e[s].warp?.success)) return lines;

  const moves = sides.map((s) => `${names[s]} ${maneuver(e[s])}`).join("; ");
  lines.push({
    side: null,
    tone: "neutral",
    text:
      e.rangeBefore === e.rangeAfter
        ? `${moves}. Distancia ${e.distance} u (${RANGE_NAMES[e.rangeAfter]}).`
        : `${moves}. La distancia pasa de ${RANGE_NAMES[e.rangeBefore]} a ${RANGE_NAMES[e.rangeAfter]} (${e.distance} u).`,
  });
  for (const s of sides) {
    const l = e[s];
    const t = names[foe(s)];
    if (l.ram)
      lines.push(
        l.ram.hit
          ? {
              side: s,
              tone: tone(s, true),
              text: `¡${names[s]} embiste a ${t}! −${l.ram.dealt} de casco (el choque le cuesta −${l.ram.selfDamage}).`,
            }
          : {
              side: s,
              tone: tone(s, false),
              text: `${t} esquiva la embestida de ${names[s]} en el último instante.`,
            },
      );
  }
  for (const s of sides) lines.push(...actionLine(e[s], s, names, tone));
  for (const s of sides) {
    const l = e[s];
    if (l.repaired)
      lines.push({
        side: s,
        tone: tone(s, true),
        text: `${names[s]} repara ${l.repaired} de casco.`,
      });
    if (l.regen)
      lines.push({
        side: s,
        tone: tone(s, true),
        text: `${names[s]} regenera ${l.regen} de casco.`,
      });
  }
  return lines;
}

function actionLine(
  l: SidePhaseLog,
  s: Side,
  names: Record<Side, string>,
  tone: (a: Side, g: boolean) => Line["tone"],
): Line[] {
  switch (l.action) {
    case "fuego":
      return [
        {
          side: s,
          tone: tone(s, l.fireDealt > 0),
          text: `${names[s]} abre fuego${l.arcs.length ? ` con ${l.arcs.map((x) => ARC_TXT[x]).join(" y ")}` : ""}${l.hitArc === "popa" ? " contra su popa expuesta" : l.hitArc === "proa" ? " contra su proa" : ""}: −${l.fireDealt}${l.shieldsAbsorbed ? ` (los escudos paran ${l.shieldsAbsorbed})` : ""}.`,
        },
      ];
    case "recargar":
      return [
        {
          side: s,
          tone: "neutral",
          text: `${names[s]} recarga los tubos y dispara a media potencia: −${l.fireDealt}.`,
        },
      ];
    case "torpedos":
      return l.instantTorpedoes
        ? [
            {
              side: s,
              tone: tone(s, l.torpedoesHit > 0),
              text: `${names[s]} lanza ${l.torpedoesLaunched} torpedos a quemarropa: ${l.torpedoesHit} impactan (−${l.torpedoesHit * TORPEDO_DAMAGE}).`,
            },
          ]
        : [
            {
              side: s,
              tone: "neutral",
              text: `${names[s]} lanza ${l.torpedoesLaunched} torpedos: llegarán en la próxima ronda.`,
            },
          ];
    case "escudos":
      return [
        {
          side: s,
          tone: "neutral",
          text: `${names[s]} desvía energía a los escudos y dispara a media potencia: −${l.fireDealt}.`,
        },
      ];
    case "evasion":
      return [{ side: s, tone: "neutral", text: `${names[s]} ejecuta maniobras evasivas.` }];
    case "reparar":
      return l.repaired
        ? []
        : [
            {
              side: s,
              tone: "neutral",
              text: `${names[s]} intenta reparar, pero no hay nada que arreglar.`,
            },
          ];
    default:
      return [];
  }
}

export function endLine(end: DuelEnd, me: Side, names: Record<Side, string>): Line {
  const other = (s: Side): Side => (s === "attacker" ? "defender" : "attacker");
  if (end.reason === "destruida") {
    if (end.destroyed.length === 2)
      return {
        side: null,
        tone: "bad",
        text: "Las dos naves estallan a la vez. Nadie sobrevive para contarlo.",
      };
    const d = end.destroyed[0]!;
    return {
      side: d,
      tone: d === me ? "bad" : "good",
      text:
        d === me
          ? "Nuestra nave se parte en dos y desaparece en una bola de fuego. Todo está perdido: el perfil se reinicia."
          : `La nave de ${names[d]} estalla. Su comandante tendrá que empezar de cero.`,
    };
  }
  if (end.reason === "salto") {
    const j = end.jumped!;
    return {
      side: j,
      tone: j === me ? "neutral" : "good",
      text:
        j === me
          ? "Hemos escapado al disforme. Perdemos el duelo, pero la nave sobrevive."
          : `${names[j]} huye al disforme con el rabo entre las piernas. ¡Victoria!`,
    };
  }
  return {
    side: null,
    tone: "neutral",
    text: "Se agota el tiempo de combate: gana quien conserva más casco.",
  };
}
