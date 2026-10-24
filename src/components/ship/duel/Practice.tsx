import { useMemo, useState } from "react";
import { GraduationCap, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FLEETS, type FleetId } from "@/lib/ship-identity";
import { FLEET_PROFILES } from "@/lib/naval3/factions";
import { newDuel, newSide, resolveBlock, type Rng } from "@/lib/naval3/engine";
import { botPlan } from "@/lib/naval3/advisor";
import { endLine } from "@/lib/naval3/narrate";
import type { BlockPlan, DuelMode, DuelState, ModuleLevels } from "@/lib/naval3/types";
import { DuelBoard, type DuelEventRow } from "./Duel";

const rng: Rng = () => Math.random();
const BASE_HULL: Record<FleetId, number> = {
  imperium: 30,
  chaos: 30,
  tau: 22,
  aeldari: 24,
  drukhari: 22,
  orks: 40,
  daemons: 28,
  necrons: 34,
  tyranids: 36,
  votann: 36,
  genestealer: 28,
};

/**
 * Simulacro contra la IA: un duelo completo en el navegador, al instante y sin riesgo.
 * Usa el mismo motor, el mismo tablero y la misma IA que los duelos reales.
 */
export function PracticeDuel({
  fleet,
  modules,
  maxHull,
}: {
  fleet: FleetId;
  modules: Partial<ModuleLevels>;
  maxHull: number;
}) {
  const fleets = Object.keys(FLEET_PROFILES) as FleetId[];
  const [foeFleet, setFoeFleet] = useState<FleetId>(
    () => fleets[Math.floor(Math.random() * fleets.length)]!,
  );
  const [duel, setDuel] = useState<{
    id: string;
    state: DuelState;
    start: DuelState;
    events: DuelEventRow[];
    block: number;
  } | null>(null);
  const [mode, setMode] = useState<DuelMode>(1);
  const begin = (f: FleetId) => {
    const s: DuelState = {
      ...newDuel(
        newSide(fleet, modules, maxHull, maxHull),
        newSide(f, {}, BASE_HULL[f], BASE_HULL[f]),
        rng,
      ),
      mode,
    };
    setDuel({ id: Math.random().toString(36).slice(2), state: s, start: s, events: [], block: 1 });
  };
  const lastEvents = useMemo(
    () => (duel ? duel.events.filter((e) => e.block === duel.block - 1) : []),
    [duel],
  );
  if (!duel)
    return (
      <section
        aria-label="Simulacro de combate"
        className="space-y-3 rounded border border-amber-500/50 p-3"
      >
        <h3 className="flex items-center gap-2 text-lg text-primary">
          <GraduationCap /> Simulacro contra la IA
        </h3>
        <p className="text-sm text-muted-foreground">
          Practica sin riesgo: tu nave contra una nave controlada por la IA. Cada bloque se resuelve
          al instante. No afecta a tu casco, tus créditos ni tu perfil.
        </p>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Rival
          <select
            className="rounded border border-border bg-background px-2 py-1"
            value={foeFleet}
            onChange={(e) => setFoeFleet(e.target.value as FleetId)}
          >
            {fleets.map((f) => (
              <option key={f} value={f}>
                {FLEETS[f].name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Modo">
          {(
            [
              [1, "De una en una", "Más fluido: decides cada ronda viendo lo que pasa."],
              [3, "De tres en tres", "Más rápido y con más azar: tres rondas a ciegas."],
            ] as const
          ).map(([m, t, d]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`rounded border p-2 text-left text-sm ${mode === m ? "border-primary bg-accent" : "border-border"}`}
            >
              <span className="block font-semibold text-primary">{t}</span>
              <span className="text-xs text-muted-foreground">{d}</span>
            </button>
          ))}
        </div>
        <Button onClick={() => begin(foeFleet)}>Empezar simulacro</Button>
      </section>
    );
  const foeName = `IA · ${FLEETS[foeFleet].name}`;
  const end = duel.state.finished;
  return (
    <DuelBoard
      title={`Simulacro contra ${FLEETS[foeFleet].name}`}
      state={duel.state}
      side="attacker"
      foeName={foeName}
      replayEvents={lastEvents}
      replayStart={duel.start}
      replayLabel={duel.state.mode === 1 ? "Ver ronda" : `Ver bloque ${duel.block - 1}`}
      status="practica"
      block={duel.block}
      canPlan={!end}
      submitLabel="Ejecutar bloque"
      waitingText={
        end ? endLine(end, "attacker", { attacker: "Tu nave", defender: foeName }).text : undefined
      }
      onSubmit={async (plan: BlockPlan) => {
        const foePlan = botPlan(duel.state, "defender", rng);
        const r = resolveBlock(duel.state, plan, foePlan, rng);
        const rows = r.events.map((e) => ({ ...e, block: duel.block }));
        setDuel({
          ...duel,
          state: r.state,
          start: duel.state,
          events: [...duel.events, ...rows],
          block: duel.block + 1,
        });
      }}
      storageKey={`simulacro-${duel.id}`}
      autoplay
      end={end}
      epilogueTitle={
        duel.state.mode === 1 ? "Informe de la ronda" : `Informe del bloque ${duel.block - 1}`
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => begin(foeFleet)}>
            <RotateCcw /> Reiniciar simulacro
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDuel(null)}>
            Cerrar
          </Button>
        </div>
      }
    />
  );
}
