/**
 * Director de escena: convierte una fase registrada en efectos de partículas y sonido sincronizados.
 * Línea de tiempo (s): 0 torpedos que llegan · 0,2 saltos · 0,3 maniobra (el radar anima 1,1 s) ·
 * 1,3 embestidas · 1,5 disparos e impactos · 2,2 destrucción.
 */
import { play } from "@/lib/sfx/engine";
import type { FleetId } from "@/lib/ship-identity";
import { FLEET_PROFILES } from "@/lib/naval3/factions";
import type { DuelEnd, PhaseEvent, Side } from "@/lib/naval3/types";
import type { FxEngine, P } from "./fx";
import { radarPoint, type Geo } from "./Radar";

const OWN: [number, number, number] = [140, 210, 255];
const FOE: [number, number, number] = [255, 120, 110];
const CENTER: P = { x: 160, y: 160 };

/** Las armas de proa con nombre de lanza se dibujan como haz; el resto como andanada. */
const isLance = (fleet: FleetId) =>
  /lanza|haz|arco|riel|púlsar|partícul|bioplasma|fauces/i.test(FLEET_PROFILES[fleet].prowName);

export function stagePhase(
  e: PhaseEvent,
  me: Side,
  fleets: Record<Side, FleetId>,
  before: Geo,
  after: Geo,
  fx: FxEngine | null,
  end: DuelEnd | null,
  last: boolean,
) {
  const foe: Side = me === "attacker" ? "defender" : "attacker";
  const pBefore = radarPoint(before.rel, before.distance);
  const pAfter = radarPoint(after.rel, after.distance);
  const pan = (rel: number) => Math.sin((rel * Math.PI) / 180) * 0.8;
  const lanceFleet = (s: Side) => isLance(fleets[s]);
  const L = e[me];
  const F = e[foe];

  // 0. Torpedos que llegan
  const arriving = (shooter: Side, from: P, to: P, rel: number) => {
    const l = e[shooter];
    const n = l.instantTorpedoes ? 0 : l.torpedoesHit + l.torpedoesDodged;
    if (!n) return;
    fx?.torpedoes(from, to, n, l.torpedoesHit, 0, 0.8);
    for (let i = 0; i < l.torpedoesHit; i++)
      play("torpedo_impacto", { delay: 0.8 + i * 0.12, pan: pan(rel), gain: 0.7 });
  };
  arriving(me, CENTER, pBefore, before.rel);
  arriving(foe, pBefore, CENTER, before.rel);

  // 1. Saltos
  for (const [s, at] of [
    [me, CENTER],
    [foe, pBefore],
  ] as const) {
    const w = e[s].warp;
    if (!w) continue;
    fx?.warp(at, w.success, 0.2);
    play(w.success ? "salto_disforme" : "salto_fallido", {
      delay: 0.2,
      pan: s === me ? 0 : pan(before.rel),
    });
  }
  if (L.warp?.success || F.warp?.success) return;

  // 2. Maniobra
  if (L.speed === 2) {
    fx?.engines(CENTER, 0, true, 0.3);
    play("avante_toda", { delay: 0.3 });
  }
  if (F.speed === 2) {
    fx?.engines(pBefore, (after.foeHeading * Math.PI) / 180, true, 0.3);
    play("avante_toda", { delay: 0.35, pan: pan(before.rel), gain: 0.6 });
  }

  // 3. Embestidas
  for (const s of [me, foe] as const) {
    const r = e[s].ram;
    if (!r) continue;
    const mid = { x: (CENTER.x + pAfter.x) / 2, y: (CENTER.y + pAfter.y) / 2 };
    if (r.hit) {
      fx?.ram(mid, 1.3);
      play("embestida", { delay: 1.3, gain: 1 });
      play("explosion_grande", { delay: 1.35, gain: 0.7 });
    }
  }

  // 4. Disparos
  const shoot = (s: Side, from: P, to: P, color: [number, number, number], rel: number) => {
    const l = e[s];
    if (l.action === "torpedos") {
      if (l.instantTorpedoes) {
        fx?.torpedoes(from, to, l.torpedoesLaunched, l.torpedoesHit, 1.5, 0.5);
        play("torpedo_lanzamiento", { delay: 1.5, pan: pan(rel) });
        for (let i = 0; i < l.torpedoesHit; i++)
          play("torpedo_impacto", { delay: 2 + i * 0.1, pan: pan(rel) });
      } else {
        fx?.launch(from, to, l.torpedoesLaunched, 1.5);
        play("torpedo_lanzamiento", { delay: 1.5, pan: pan(rel) });
      }
      return;
    }
    if (l.action !== "fuego" && l.action !== "recargar") return;
    const shots = l.fireDealt + l.shieldsAbsorbed;
    if (shots <= 0 && !l.arcs.length) return;
    const prow = l.arcs.includes("proa");
    const side = l.arcs.some((a) => a !== "proa");
    if (prow && lanceFleet(s)) {
      fx?.lance(from, to, color, 1.5);
      play("lanza", { delay: 1.5, pan: pan(rel) });
    }
    if (side || (prow && !lanceFleet(s))) {
      fx?.battery(from, to, Math.max(2, shots), color, 1.55);
      play("macrocanon", { delay: 1.55, pan: pan(rel) });
    }
    if (l.shieldsAbsorbed > 0) {
      fx?.shield(to, from, 1.85);
      play("impacto_escudo", { delay: 1.85, pan: pan(rel), gain: 0.8 });
    }
    if (l.fireDealt > 0) {
      fx?.explosion(to, Math.min(1.6, 0.4 + l.fireDealt / 6), 1.95);
      play("impacto_casco", {
        delay: 1.95,
        pan: pan(rel),
        gain: Math.min(1, 0.4 + l.fireDealt / 8),
      });
    }
  };
  shoot(me, CENTER, pAfter, OWN, after.rel);
  shoot(foe, pAfter, CENTER, FOE, after.rel);

  // 5. Final
  if (last && end?.reason === "destruida") {
    for (const s of end.destroyed) {
      fx?.destruction(s === me ? CENTER : pAfter, 2.2);
      play("explosion_grande", { delay: 2.3, pan: s === me ? 0 : pan(after.rel) });
      play("explosion_grande", { delay: 3.4, gain: 0.8 });
    }
  }
}
