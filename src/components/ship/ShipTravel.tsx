import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { campaignQuery } from "@/lib/campaign-queries";
import { BODIES, bodyName, formatDuration, travelSeconds } from "@/lib/system";

const ERR: Record<string, string> = {
  "in warp": "Tu nave ya está viajando por el warp.",
  "already there": "Tu nave ya está en ese destino.",
  "ship busy": "Tu nave está en un duelo naval: no puede saltar al warp.",
  "no ship": "Primero necesitas una nave.",
  "bad body": "Ese destino no es habitable.",
};

/** Course selection from the command deck. Travel itself is resolved server-side by ship_set_course. */
export function ShipTravel({ uid }: { uid: string }) {
  const { data } = useQuery(campaignQuery);
  const qc = useQueryClient();
  const [dest, setDest] = useState("");
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  const me = data?.fleet.find((f) => f.user_id === uid);
  if (!data) return null;
  if (!me) return <section className="mb-6 border border-border p-4 text-sm">Necesitas una nave para viajar por el sistema.</section>;
  const status = (id: string) => data.bodies.find((b) => b.id === id)?.status;
  const secs = me.body_id && dest ? travelSeconds(me.body_id, dest) : 0;

  async function go() {
    const { error } = await supabase.rpc("ship_set_course", { _body: dest });
    if (error) { toast.error(ERR[Object.keys(ERR).find((k) => error.message.includes(k)) ?? ""] ?? error.message); return; }
    toast.success(`Rumbo fijado a ${bodyName(dest)}`);
    setDest("");
    qc.invalidateQueries({ queryKey: ["campaign"] });
  }

  async function abort() {
    const { error } = await supabase.rpc("ship_abort_course");
    if (error) { toast.error(error.message.includes("already returning") ? "Ya estás regresando." : error.message.includes("not traveling") ? "Tu nave no está viajando." : error.message); return; }
    toast.success(`Salto anulado: regresando a ${bodyName(me!.travel_from)}`);
    qc.invalidateQueries({ queryKey: ["campaign"] });
  }

  return (
    <section aria-label="Navegación por el sistema" className="mb-6 border border-border p-4">
      <h2 className="mb-2 flex items-center gap-2 text-xl text-primary"><Navigation size={18} /> Navegación</h2>
      {me.body_id ? (
        <>
          <p className="mb-3 text-sm">Estacionada en <span className="text-primary">{bodyName(me.body_id)}</span>. Solo puedes desembarcar y atacar regiones aquí.</p>
          <div className="flex flex-wrap gap-2">
            <select value={dest} onChange={(e) => setDest(e.target.value)} className="min-w-[14rem] flex-1 border border-border bg-background px-2 py-2 text-sm" aria-label="Destino">
              <option value="">— Elegir destino —</option>
              {BODIES.filter((b) => b.playable && b.id !== me.body_id).map((b) => (
                <option key={b.id} value={b.id}>{b.kind === "moon" ? "↳ " : ""}{b.name} · {formatDuration(travelSeconds(me.body_id!, b.id))}{status(b.id) === "open" ? "" : " · bloqueado"}</option>
              ))}
            </select>
            <Button disabled={!dest} onClick={() => { if (confirm(`¿Saltar al warp hacia ${bodyName(dest)}? Tardarás ${formatDuration(secs)} y no podrás atacar ni ser atacado durante el viaje.`)) void go(); }}>Poner rumbo</Button>
          </div>
          {dest && <p className="mt-2 text-xs text-muted-foreground">Duración del viaje: {formatDuration(secs)}. Los demás capitanes solo verán que estás en el warp, no tu destino.{status(dest) !== "open" ? " Ese destino está bloqueado: podrás llegar, pero no desembarcar ni atacar." : ""}</p>}
        </>
      ) : (
        <>
          <p className="text-sm">{me.destination === me.travel_from ? <>Salto anulado: regresando a <span className="text-primary">{bodyName(me.destination)}</span></> : <>En el warp desde {bodyName(me.travel_from)} rumbo a <span className="text-primary">{bodyName(me.destination)}</span></>}{me.arrives_at && <> · llegada en {formatDuration(Math.max(0, (new Date(me.arrives_at).getTime() - Date.now()) / 1000))}</>}.</p>
          {me.destination !== me.travel_from && (
            <Button variant="outline" className="mt-3" onClick={() => { if (confirm(`¿Anular el salto y volver a ${bodyName(me.travel_from)}? El regreso tarda lo mismo que llevas viajando.`)) void abort(); }}>Anular salto y volver</Button>
          )}
        </>
      )}
    </section>
  );
}
