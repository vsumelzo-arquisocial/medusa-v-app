import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { deepStrikeError, deepStrikeQuery } from "@/lib/deep-strike";

/** Carga del módulo de asalto profundo y botón de recarga (página Nave). */
export function DeepStrikePanel({ disabled }: { disabled?: boolean }) {
  const { data } = useQuery(deepStrikeQuery);
  const qc = useQueryClient();
  if (!data || data.level < 1) return null;
  async function recharge() {
    const { error } = await supabase.rpc("deep_strike_recharge" as never);
    if (error) {
      toast.error(deepStrikeError(error.message));
      return;
    }
    toast.success("Recarga iniciada: lista en 24 h");
    for (const k of ["deep-strike", "profile"]) void qc.invalidateQueries({ queryKey: [k] });
  }
  return (
    <div className="mt-3 border border-border p-2 text-xs">
      <p className="flex items-center gap-2">
        <Rocket size={14} className={data.charged ? "text-emerald-400" : "text-muted-foreground"} />
        {!data.operational
          ? "Módulo averiado o en obras: no se puede usar."
          : data.charged
            ? "Cargado: lánzalo desde el mapa del planeta sobre una región no vecina."
            : data.ready_at
              ? "Recargando…"
              : "Sin carga."}
      </p>
      {data.ready_at && (
        <p className="mt-1 flex items-center gap-2 text-muted-foreground">
          <Clock size={13} /> Lista el{" "}
          {new Date(data.ready_at).toLocaleString("es-ES", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      )}
      {data.operational && !data.charged && !data.ready_at && (
        <Button
          size="sm"
          className="mt-2 w-full"
          disabled={disabled}
          onClick={() => void recharge()}
        >
          Recargar · {data.cost} cr · 24 h
        </Button>
      )}
    </div>
  );
}
