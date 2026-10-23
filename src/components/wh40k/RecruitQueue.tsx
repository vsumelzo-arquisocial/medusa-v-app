import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Terminal";
import { squadsQuery } from "@/lib/wh40k-units";

const KIND: Record<string, string> = { training: "Reclutando", retraining: "Reentrenando", restoring: "Reponiendo bajas" };

function left(ms: number) {
  if (ms <= 0) return "listo";
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/** Units currently being recruited, retrained or reinforced, with cancel + refund (server-side). */
export function RecruitQueue() {
  const qc = useQueryClient();
  const { data: squads = [] } = useQuery({ ...squadsQuery, refetchInterval: 30000 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const queue = squads.filter((s) => s.status in KIND && s.ready_at).sort((a, b) => a.ready_at!.localeCompare(b.ready_at!));

  async function cancel(id: string, name: string) {
    if (!confirm(`¿Cancelar la orden de ${name}? Se devuelven los créditos pagados.`)) return;
    const { data, error } = await supabase.rpc("wh40k_cancel_training", { _id: id });
    if (error) { toast.error(error.message.includes("not in progress") ? "Esa orden ya ha terminado" : "No se pudo cancelar"); }
    else toast.success(`Orden cancelada · ${data} créditos devueltos`);
    for (const k of ["wh40k-squads", "wh40k-recruits", "profile", "ship"]) qc.invalidateQueries({ queryKey: [k] });
  }

  return (
    <Panel title={`Cola de reclutamiento (${queue.length})`}>
      {!queue.length && <p className="text-xs text-muted-foreground">&gt; No hay nada en preparación.</p>}
      <ul className="space-y-1 text-xs">
        {queue.map((s) => {
          const end = new Date(s.ready_at!).getTime();
          const start = new Date(s.created_at).getTime();
          const pct = Math.min(100, Math.max(0, ((now - start) / Math.max(1, end - start)) * 100));
          return (
            <li key={s.id} className="border border-border p-2">
              <div className="flex items-center justify-between gap-2">
                <span><span className="text-primary">{s.nickname || s.unit_name}</span> ({s.models}) · {KIND[s.status]}</span>
                <button onClick={() => cancel(s.id, s.nickname || s.unit_name)} className="text-muted-foreground hover:text-destructive">Cancelar</button>
              </div>
              <div className="mt-1 h-1 bg-muted"><div className="h-full bg-primary" style={{ width: `${s.status === "training" ? pct : 50}%` }} /></div>
              <p className="mt-0.5 text-muted-foreground">Falta: {left(end - now)}</p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
