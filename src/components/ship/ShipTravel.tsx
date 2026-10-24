import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { campaignQuery } from "@/lib/campaign-queries";
import { BODIES, bodyById, bodyName, formatDuration, travelSeconds } from "@/lib/system";
import { BODY_TEXTURES } from "@/lib/system-art";
import { playReactorIgnition, playWarpJump, stopJumpAudio } from "@/lib/jump-audio";
import { WarpJumpOverlay } from "@/components/ship/WarpJumpOverlay";

const ERR: Record<string, string> = {
  "in warp": "Tu nave ya está viajando por el warp.",
  "already there": "Tu nave ya está en ese destino.",
  "ship busy": "Tu nave está en un duelo naval: no puede saltar al warp.",
  "no ship": "Primero necesitas una nave.",
  "bad body": "Ese destino no es habitable.",
};
const IGNITION_MS = 2800;

type Phase = "idle" | "igniting" | "wizard" | "jumping";

/** Motor de salto del puente de mando. El viaje se resuelve en el servidor con ship_set_course. */
export function ShipTravel({ uid, shipImage }: { uid: string; shipImage: string }) {
  const { data } = useQuery(campaignQuery);
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [dest, setDest] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const jumpResult = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => stopJumpAudio(), []);

  const me = data?.fleet.find((f) => f.user_id === uid);
  if (!data) return null;
  if (!me)
    return (
      <section className="mb-6 border border-border p-4 text-sm">
        Necesitas una nave para viajar por el sistema.
      </section>
    );
  const status = (id: string) => data.bodies.find((b) => b.id === id)?.status;

  function ignite() {
    setPhase("igniting");
    playReactorIgnition();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => setPhase("wizard"), reduced ? 300 : IGNITION_MS);
  }

  function shutdown() {
    stopJumpAudio();
    setDest("");
    setPhase("idle");
  }

  function jump() {
    if (!dest) return;
    setPhase("jumping");
    playWarpJump();
    // La orden al servidor sale al empezar la animación; el resultado se muestra al terminarla.
    jumpResult.current = (async () => {
      const { error } = await supabase.rpc("ship_set_course", { _body: dest });
      if (error) {
        toast.error(
          ERR[Object.keys(ERR).find((k) => error.message.includes(k)) ?? ""] ?? error.message,
        );
        return false;
      }
      return true;
    })();
  }

  async function jumpFinished() {
    const ok = await (jumpResult.current ?? Promise.resolve(false));
    if (ok) toast.success(`Salto completado: rumbo a ${bodyName(dest)}`);
    setDest("");
    setPhase("idle");
    stopJumpAudio();
    qc.invalidateQueries({ queryKey: ["campaign"] });
  }

  async function abort() {
    const { error } = await supabase.rpc("ship_abort_course");
    if (error) {
      toast.error(
        error.message.includes("already returning")
          ? "Ya estás regresando."
          : error.message.includes("not traveling")
            ? "Tu nave no está viajando."
            : error.message,
      );
      return;
    }
    toast.success(`Salto anulado: regresando a ${bodyName(me!.travel_from)}`);
    qc.invalidateQueries({ queryKey: ["campaign"] });
  }

  // ── En el warp ───────────────────────────────────────────────
  if (!me.body_id) {
    const returning = me.destination === me.travel_from;
    const total = travelSeconds(me.travel_from ?? "", me.destination ?? "") || 1;
    const remaining = me.arrives_at
      ? Math.max(0, (new Date(me.arrives_at).getTime() - now) / 1000)
      : 0;
    const progress = returning
      ? 0
      : Math.min(100, Math.max(0, ((total - remaining) / total) * 100));
    return (
      <section
        aria-label="Motor de salto activo"
        className="jump-panel mb-6 border border-primary/60 bg-card/70 p-4"
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="jump-reactor jump-reactor--on" aria-hidden="true">
            <span />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-primary glow">
              Motor de salto activo
            </p>
            <p className="text-sm">
              {returning ? "Salto anulado · regresando" : "Tránsito por el warp"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{bodyName(me.travel_from)}</span>
          <span className="text-primary" aria-hidden="true">
            ⟶
          </span>
          <span className="text-primary">{bodyName(me.destination)}</span>
        </div>
        {!returning && (
          <progress
            className="ship-progress mt-3 h-2 w-full"
            value={progress}
            max={100}
            aria-label="Progreso del viaje"
          />
        )}
        <p className="mt-2 text-xs text-muted-foreground" role="timer">
          Llegada en {formatDuration(remaining)} · no puedes atacar ni ser atacado durante el viaje.
        </p>
        {!returning && (
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => {
              if (
                confirm(
                  `¿Anular el salto y volver a ${bodyName(me.travel_from)}? El regreso tarda lo mismo que llevas viajando.`,
                )
              )
                void abort();
            }}
          >
            Anular salto y volver
          </Button>
        )}
      </section>
    );
  }

  // ── Estacionada ──────────────────────────────────────────────
  const here = me.body_id;
  const targets = BODIES.filter((b) => b.playable && b.id !== here);
  const selected = bodyById(dest);
  const secs = dest ? travelSeconds(here, dest) : 0;

  return (
    <section
      aria-label="Motor de salto"
      className={`jump-panel mb-6 border bg-card/70 p-4 ${phase === "igniting" ? "jump-panel--alarm border-destructive" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`jump-reactor ${phase === "igniting" ? "jump-reactor--igniting" : phase === "wizard" ? "jump-reactor--on" : ""}`}
            aria-hidden="true"
          >
            <span />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Estacionada en
            </p>
            <p className="text-primary">{bodyName(here)}</p>
            <p className="text-xs text-muted-foreground">
              Solo puedes desembarcar y atacar regiones aquí.
            </p>
          </div>
        </div>
        <button type="button" onClick={ignite} disabled={phase !== "idle"} className="jump-button">
          {phase === "igniting" ? "Encendiendo reactor…" : "Encender motor de salto"}
        </button>
      </div>

      {phase === "igniting" && (
        <div
          role="alert"
          className="mt-4 border border-destructive/70 bg-destructive/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-destructive"
        >
          <span className="jump-alarm-light" aria-hidden="true" /> Alerta · secuencia de encendido
          del reactor de salto
          <div className="jump-ignition-bar mt-2" aria-hidden="true">
            <span />
          </div>
        </div>
      )}

      <Dialog
        open={phase === "wizard"}
        onOpenChange={(open) => {
          if (!open) shutdown();
        }}
      >
        <DialogContent className="max-w-3xl border-primary/60">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-[0.2em] text-primary">
              Cálculo de salto
            </DialogTitle>
            <DialogDescription>
              Reactor estable. Elige destino desde {bodyName(here)}. Los demás capitanes solo verán
              que estás en el warp, no tu destino.
            </DialogDescription>
          </DialogHeader>
          <div
            className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3"
            role="radiogroup"
            aria-label="Destinos"
          >
            {targets.map((b) => {
              const blocked = status(b.id) !== "open";
              const active = dest === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDest(b.id)}
                  className={`group flex flex-col items-center gap-2 border p-3 text-center transition ${active ? "border-primary bg-accent" : "border-border hover:border-primary/60"}`}
                >
                  <span
                    className="planet-surface block aspect-square w-20 rounded-full shadow-[inset_-12px_-8px_24px_rgba(0,0,0,.85)]"
                    style={{
                      backgroundImage: `url(${BODY_TEXTURES[b.id]})`,
                      width: `${b.kind === "moon" ? 3.5 : 5}rem`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-primary">{b.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.kind === "moon" ? "Luna · " : ""}
                    {b.biome}
                  </span>
                  <span className="text-xs">⧗ {formatDuration(travelSeconds(here, b.id))}</span>
                  {blocked && (
                    <span className="border border-destructive/70 px-1 text-[10px] uppercase text-destructive">
                      Bloqueado
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {selected && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Destino: <span className="text-primary">{selected.name}</span> · duración{" "}
              {formatDuration(secs)}.
              {status(selected.id) !== "open"
                ? " Destino bloqueado: podrás llegar, pero no desembarcar ni atacar."
                : ""}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={shutdown}>
              Apagar motor de salto
            </Button>
            <Button disabled={!dest} onClick={jump}>
              Iniciar salto
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {phase === "jumping" && (
        <WarpJumpOverlay
          shipImage={shipImage}
          destination={bodyName(dest)}
          onDone={() => void jumpFinished()}
        />
      )}
    </section>
  );
}
