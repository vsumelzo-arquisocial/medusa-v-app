import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ESCORT_PROFILES, MAX_SQUADRONS, SHIPS_PER_SQUADRON } from "@/lib/naval2/factions";
import type { EscortType } from "@/lib/naval2/types";
import { raidError } from "@/lib/naval";

interface EscortRow {
  id: string;
  type: EscortType;
  ships: number;
}

const ROLE: Record<EscortType, string> = {
  fragatas: "2 dados de batería por nave en Cerca–Media (doctrina Ataque).",
  destructores: "2 torpedos por nave que se suman a tu salva, y 1 dado de batería.",
  piquetes: "+1 torreta contra torpedos y +1 dado de defensa contra abordajes por nave.",
};

/** Astillero de escoltas: hasta 3 escuadrones de 3 naves. */
export function EscortYard({ disabled }: { disabled: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: escorts = [] } = useQuery({
    queryKey: ["escorts"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("ship_escorts" as never)
        .select("id,type,ships")
        .eq("user_id" as never, (auth.user?.id ?? "") as never)
        .order("created_at" as never);
      if (error) throw error;
      return (data ?? []) as unknown as EscortRow[];
    },
  });

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) toast.error(raidError(error.message));
      else {
        toast.success(ok);
        for (const key of ["escorts", "profile", "ship"])
          void qc.invalidateQueries({ queryKey: [key] });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6" aria-label="Escoltas">
      <h2 className="mb-1 text-xl text-primary">
        Escoltas · {escorts.length}/{MAX_SQUADRONS}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Escuadrones de {SHIPS_PER_SQUADRON} naves que acompañan a tu capital en el combate naval.
        Cada nave cae con un impacto tras el escudo del escuadrón; las bajas se reponen pagando la
        parte proporcional.
      </p>
      {escorts.length > 0 && (
        <ul className="mb-4 grid gap-2 sm:grid-cols-3">
          {escorts.map((e) => {
            const missing = SHIPS_PER_SQUADRON - e.ships;
            const cost = Math.ceil((ESCORT_PROFILES[e.type].cost * missing) / SHIPS_PER_SQUADRON);
            return (
              <li key={e.id} className="border border-border p-3 text-xs">
                <p className="text-sm text-primary">{ESCORT_PROFILES[e.type].name}</p>
                <p aria-label={`${e.ships} de ${SHIPS_PER_SQUADRON} naves`}>
                  {"▲".repeat(e.ships)}
                  {"△".repeat(missing)}
                </p>
                <p className="mt-1 text-muted-foreground">{ROLE[e.type]}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {missing > 0 && (
                    <Button
                      size="sm"
                      disabled={busy || disabled}
                      onClick={() =>
                        void run(
                          () => supabase.rpc("reinforce_escort" as never, { _id: e.id } as never),
                          "Escuadrón reforzado",
                        )
                      }
                    >
                      Reponer ({cost} cr)
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={busy || disabled}
                    onClick={() => {
                      if (confirm("¿Desguazar este escuadrón? No se devuelven créditos."))
                        void run(
                          () => supabase.rpc("scrap_escort" as never, { _id: e.id } as never),
                          "Escuadrón desguazado",
                        );
                    }}
                  >
                    Desguazar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {escorts.length < MAX_SQUADRONS && (
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(ESCORT_PROFILES) as EscortType[]).map((t) => (
            <Button
              key={t}
              variant="outline"
              className="h-auto flex-col items-start whitespace-normal p-3 text-left"
              disabled={busy || disabled}
              onClick={() => {
                if (
                  confirm(
                    `¿Construir un escuadrón de ${ESCORT_PROFILES[t].name} por ${ESCORT_PROFILES[t].cost} créditos?`,
                  )
                )
                  void run(
                    () => supabase.rpc("build_escort" as never, { _type: t } as never),
                    "Escuadrón construido",
                  );
              }}
            >
              <span className="text-primary">
                {ESCORT_PROFILES[t].name} · {ESCORT_PROFILES[t].cost} cr
              </span>
              <span className="text-xs text-muted-foreground">{ROLE[t]}</span>
            </Button>
          ))}
        </div>
      )}
      {disabled && (
        <p className="mt-2 text-xs text-destructive">
          Nave enfrentada: el astillero de escoltas está cerrado hasta terminar el combate.
        </p>
      )}
    </section>
  );
}
