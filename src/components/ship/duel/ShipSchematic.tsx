import { useState } from "react";
import { FLEETS } from "@/lib/ship-identity";
import { FLEET_PROFILES, TORPEDO_DAMAGE } from "@/lib/naval3/factions";
import { rawFire, stats } from "@/lib/naval3/engine";
import { RANGE_NAMES, type Range, type SideState } from "@/lib/naval3/types";
import { radiusOf } from "./Radar";
import { TopDownShip } from "./TopDownShip";

type Weapon = "baterias" | "torpedos" | "embestida";
const WEAPONS: { id: Weapon; label: string }[] = [
  { id: "baterias", label: "Baterías" },
  { id: "torpedos", label: "Torpedos" },
  { id: "embestida", label: "Embestida" },
];
const ARCS = [
  { arc: "proa", from: -45, to: 45, mid: 0 },
  { arc: "estribor", from: 45, to: 135, mid: 90 },
  { arc: "popa", from: 135, to: 225, mid: 180 },
  { arc: "babor", from: -135, to: -45, mid: -90 },
] as const;
const BAND_D = [0, 2, 5, 9, 15];
const C = 160;

function sector(r0: number, r1: number, from: number, to: number) {
  const p = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${C + r * Math.sin(a)} ${C - r * Math.cos(a)}`;
  };
  return `M${p(r0, from)} L${p(r1, from)} A${r1} ${r1} 0 0 1 ${p(r1, to)} L${p(r0, to)} A${r0} ${r0} 0 0 0 ${p(r0, from)} Z`;
}

/** Daño de un arma en un arco y una banda (null = no alcanza). */
function cell(
  s: SideState,
  w: Weapon,
  mid: number,
  band: Range,
): { v: number; note?: string } | null {
  if (w === "baterias") {
    const v = rawFire(s, mid, band).value;
    return v > 0 ? { v } : null;
  }
  const st = stats(s);
  if (w === "torpedos") {
    if (mid !== 0 || st.torpedoes <= 0) return null;
    return {
      v: st.torpedoes * TORPEDO_DAMAGE,
      note: band <= 1 ? "al instante" : "llegan en 1 ronda",
    };
  }
  if (mid !== 0 || band > 0) return null;
  return {
    v: st.ram,
    note: `te cuesta −${Math.max(0, Math.round(st.ram * FLEET_PROFILES[s.fleet].ramRecoil) - st.ramArmour)}`,
  };
}

/**
 * Esquema de la nave vista desde arriba: sus arcos y bandas de distancia con el daño máximo
 * de cada arma en cada zona (antes de escudos y blindaje del rival).
 */
export function ShipSchematic({
  own,
  foe,
  foeName,
}: {
  own: SideState;
  foe: SideState;
  foeName: string;
}) {
  const [weapon, setWeapon] = useState<Weapon>("baterias");
  const [who, setWho] = useState<"own" | "foe">("own");
  const s = who === "own" ? own : foe;
  const max = Math.max(
    1,
    ...ARCS.flatMap((a) => [0, 1, 2, 3].map((b) => cell(s, weapon, a.mid, b as Range)?.v ?? 0)),
  );
  const hue = who === "own" ? "56,189,248" : "248,113,113";
  return (
    <section aria-label="Esquema de armas" className="rounded border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Arma">
          {WEAPONS.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={weapon === w.id}
              onClick={() => setWeapon(w.id)}
              className={`rounded border px-2 py-1 text-xs ${weapon === w.id ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground"}`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["own", "foe"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={who === k}
              onClick={() => setWho(k)}
              className={`rounded border px-2 py-1 text-xs ${who === k ? (k === "own" ? "border-sky-400 text-sky-200" : "border-red-400 text-red-200") : "border-border text-muted-foreground"}`}
            >
              {k === "own" ? "Tu nave" : foeName}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox="0 0 320 320"
        className="mx-auto mt-2 block h-auto w-full max-w-[340px]"
        role="img"
        aria-label={`Daño de ${WEAPONS.find((w) => w.id === weapon)!.label} de ${who === "own" ? "tu nave" : foeName} por arco y distancia`}
      >
        <circle cx={C} cy={C} r={152} fill="#03080c" />
        {ARCS.map((a) =>
          [0, 1, 2, 3].map((b) => {
            const c = cell(s, weapon, a.mid, b as Range);
            const r0 = radiusOf(BAND_D[b]!);
            const r1 = radiusOf(BAND_D[b + 1]!);
            const mr = (r0 + r1) / 2;
            const ang = (a.mid * Math.PI) / 180;
            return (
              <g key={`${a.arc}${b}`}>
                <path
                  d={sector(r0, r1, a.from + 1, a.to - 1)}
                  fill={c ? `rgba(${hue},${0.12 + 0.55 * (c.v / max)})` : "rgba(255,255,255,0.03)"}
                  stroke="rgba(255,255,255,0.08)"
                />
                {c && b > 0 && (
                  <text
                    x={C + mr * Math.sin(ang)}
                    y={C - mr * Math.cos(ang) + 4}
                    textAnchor="middle"
                    className="text-[12px] font-bold"
                    fill="#fff"
                    stroke="#000"
                    strokeWidth={2.5}
                    paintOrder="stroke"
                  >
                    −{c.v.toFixed(0)}
                  </text>
                )}
              </g>
            );
          }),
        )}
        {[1, 2, 3].map((b) => (
          <text
            key={b}
            x={C + 3}
            y={C - radiusOf(BAND_D[b + 1]!) + 11}
            className="text-[8px] uppercase"
            fill="#94a3b8"
          >
            {RANGE_NAMES[b as Range]}
          </text>
        ))}
        <TopDownShipAt s={s} />
        {(() => {
          const c = cell(s, weapon, 0, 0);
          return c ? (
            <text
              x={C}
              y={C + 27}
              textAnchor="middle"
              className="text-[9px] font-bold"
              fill="#fff"
              stroke="#000"
              strokeWidth={2.5}
              paintOrder="stroke"
            >
              Contacto −{c.v.toFixed(0)}
            </text>
          ) : null;
        })()}
      </svg>
      <p className="text-center text-[11px] text-muted-foreground">
        {FLEETS[s.fleet].name} · proa arriba ·{" "}
        {weapon === "torpedos"
          ? `solo por la proa; ${cell(s, "torpedos", 0, 2)?.note ?? "sin tubos"} a distancia`
          : weapon === "embestida"
            ? `solo a proa en Contacto; ${cell(s, "embestida", 0, 0)?.note ?? ""}`
            : "daño antes de escudos"}
      </p>
    </section>
  );
}

function TopDownShipAt({ s }: { s: SideState }) {
  return (
    <g transform={`translate(${C} ${C})`}>
      <TopDownShip fleet={s.fleet} size={34} power={0.3} uid={`schem-${s.fleet}`} />
    </g>
  );
}
