import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Terminal";
import { playersQuery } from "@/lib/games";

interface Entry {
  kind: "partida" | "autoresolucion"; id: string; played_at: string | null; creator_id: string; opponent_id: string | null;
  winner_id: string | null; draw: boolean; battle_type: string | null; points: number | null;
  vp_creator: number | null; vp_opponent: number | null; reason: string; region_name: string | null; summaries: Record<string, string>;
}

export const compendiumQuery = queryOptions({
  queryKey: ["wh40k-compendium"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("wh40k_compendium");
    if (error) throw error;
    return (data ?? []) as unknown as Entry[];
  },
});

const AUTO_REASON: Record<string, string> = {
  acuerdo_atacante: "Auto resolución acordada · gana el atacante",
  acuerdo_defensor: "Auto resolución acordada · resiste el defensor",
};
const autoReason = (r: string) => AUTO_REASON[r] ?? (r.endsWith("_atacante") ? "Auto resolución · gana el atacante" : r.endsWith("_defensor") ? "Auto resolución · resiste el defensor" : `Auto resolución · ${r.replace(/_/g, " ")}`);

export function BattleCompendium({ me }: { me: string }) {
  const { data: entries } = useSuspenseQuery(compendiumQuery);
  const { data: players } = useSuspenseQuery(playersQuery);
  const qc = useQueryClient();
  const name = (uid: string | null) => players.find((p) => p.id === uid)?.leader_name ?? "—";
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  async function saveSummary(e: Entry) {
    const { error } = await supabase.rpc("wh40k_set_summary", { _kind: e.kind, _id: e.id, _text: text });
    if (error) { toast.error("No se pudo guardar el resumen"); return; }
    toast.success("Resumen guardado");
    setEditing(null);
    qc.invalidateQueries({ queryKey: compendiumQuery.queryKey });
  }

  return (
    <Panel title={`Compendio de batallas (${entries.length})`}>
      {!entries.length && <p className="text-sm text-muted-foreground">&gt; Aún no se ha librado ninguna batalla.</p>}
      <ul className="space-y-2">
        {entries.map((e) => {
          const key = `${e.kind}-${e.id}`;
          const author = me === e.creator_id || me === e.opponent_id;
          const sums = Object.entries(e.summaries ?? {});
          const expanded = open === key;
          return (
            <li key={key} className="border border-border p-2 text-xs">
              <button type="button" onClick={() => setOpen(expanded ? null : key)} className="w-full text-left">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className={e.winner_id === e.creator_id ? "text-primary" : ""}>{name(e.creator_id)}</span>
                    <span className="text-muted-foreground"> vs </span>
                    <span className={e.winner_id === e.opponent_id ? "text-primary" : ""}>{name(e.opponent_id)}</span>
                    {e.kind === "partida" && <span className="ml-2 text-muted-foreground">{e.vp_creator}–{e.vp_opponent} PV</span>}
                  </span>
                  <span className="text-muted-foreground">
                    {e.played_at ? new Date(e.played_at).toLocaleDateString("es-ES", { dateStyle: "medium" }) : ""}
                    {sums.length > 0 && <span className="ml-2 text-primary">✎ {sums.length}</span>}
                  </span>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {e.draw ? "Empate" : e.winner_id ? <>Victoria de <span className="text-primary">{name(e.winner_id)}</span></> : "Sin vencedor"}
                  {" · "}{e.kind === "autoresolucion" ? autoReason(e.reason) : `${e.battle_type === "patrulla" ? "Patrulla" : "Normal"} · ${e.points} pts`}
                  {e.region_name && <> · {e.region_name}</>}
                </div>
              </button>
              {expanded && (
                <div className="mt-2 space-y-2 border-t border-border pt-2">
                  {!sums.length && <p className="text-muted-foreground">Sin crónicas todavía.</p>}
                  {sums.map(([uid, s]) => (
                    <div key={uid}>
                      <div className="text-primary">Crónica de {name(uid)}</div>
                      <p className="whitespace-pre-wrap">{s}</p>
                    </div>
                  ))}
                  {author && editing !== key && (
                    <button onClick={() => { setEditing(key); setText(e.summaries?.[me] ?? ""); }} className="border border-border px-3 py-1 hover:border-primary hover:text-primary">
                      {e.summaries?.[me] ? "Editar mi crónica" : "Escribir crónica"}
                    </button>
                  )}
                  {editing === key && (
                    <div className="space-y-2">
                      <textarea value={text} maxLength={2000} rows={5} onChange={(ev) => setText(ev.target.value)}
                        className="w-full border border-border bg-background px-2 py-1 text-sm" placeholder="Cuenta cómo fue la batalla…" />
                      <div className="flex gap-2">
                        <button onClick={() => saveSummary(e)} className="border border-primary px-3 py-1 text-primary hover:bg-accent">Guardar</button>
                        <button onClick={() => setEditing(null)} className="border border-border px-3 py-1">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
