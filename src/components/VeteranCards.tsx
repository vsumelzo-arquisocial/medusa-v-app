import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Terminal";
import { honourById } from "@/lib/honours";
import { KIND_LABEL, STATUS_LABEL } from "@/lib/veterans";
import { units } from "@/lib/legions/data";

const unitName = (id: number) => units.find((u) => u.id === id)?.name ?? `Unidad ${id}`;
const RES: Record<string, string> = { victoria: "Victoria", derrota: "Derrota", empate: "Empate" };

/** Unique named cards for Titans, Knights and commanders: damage, Renown, battle log and honours won. */
export function VeteranCards({ uid }: { uid: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["veterans", uid],
    queryFn: async () => {
      await supabase.rpc("sync_my_veterans");
      const v = (await supabase.from("veterans").select("*").eq("user_id", uid).in("status", ["activo", "recuperando", "caido"]).order("created_at")).data ?? [];
      const ids = v.map((x) => x.id);
      const [b, h, d] = await Promise.all([
        ids.length ? supabase.from("veteran_battles").select("*").in("veteran_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
        ids.length ? supabase.from("honours").select("*").in("veteran_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
        supabase.from("engine_damage").select("*").eq("user_id", uid),
      ]);
      return { v, battles: b.data ?? [], honours: h.data ?? [], damage: d.data ?? [] };
    },
  });
  const [edit, setEdit] = useState<Record<string, string>>({});

  async function rename(id: string) {
    const n = (edit[id] ?? "").trim();
    if (!n) return;
    const { error } = await supabase.rpc("rename_veteran", { _id: id, _name: n });
    if (error) { toast.error("Nombre no válido (1–40 caracteres)"); return; }
    toast.success("Nombre registrado en los anales");
    setEdit((e) => { const { [id]: _, ...rest } = e; return rest; });
    qc.invalidateQueries({ queryKey: ["veterans"] });
  }

  const list = data?.v ?? [];
  return (
    <Panel title="Veteranos · Titanes, Caballeros y comandantes">
      <p className="mb-3 text-xs text-muted-foreground">Cada Titán, Caballero y comandante es único: tiene su nombre, su Renombre y su historial. Los honores de veteranía no se compran: se ganan al azar al sobrevivir a las batallas (más probable si vencen o son la unidad destacada).</p>
      {!list.length && <p className="text-sm text-muted-foreground">&gt; Aún no tienes Titanes, Caballeros ni comandantes en reservas.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((v) => {
          const dmg = data!.damage.find((d) => d.veteran_id === v.id);
          const bat = data!.battles.filter((b) => b.veteran_id === v.id);
          const hon = data!.honours.filter((h) => h.veteran_id === v.id);
          const unnamed = !v.name;
          const editing = unnamed || edit[v.id] !== undefined;
          return (
            <article key={v.id} className={`border p-3 ${v.status === "caido" ? "border-destructive/60 opacity-70" : "border-primary/60"} bg-card`}>
              <header className="flex items-start justify-between gap-2 border-b border-border pb-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{KIND_LABEL[v.kind] ?? v.kind} · {unitName(v.unit_id)}</p>
                  {editing ? (
                    <div className="mt-1 flex gap-1">
                      <input autoFocus={!unnamed} maxLength={40} value={edit[v.id] ?? ""} onChange={(e) => setEdit({ ...edit, [v.id]: e.target.value })} placeholder={unnamed ? "Ponle nombre…" : v.name} className="w-full border border-border bg-background px-2 py-0.5 text-sm" />
                      <button onClick={() => rename(v.id)} className="border border-primary px-2 text-xs text-primary">OK</button>
                    </div>
                  ) : (
                    <h3 className="font-display text-lg text-primary glow">«{v.name}» <button onClick={() => setEdit({ ...edit, [v.id]: v.name })} className="text-[10px] text-muted-foreground underline">renombrar</button></h3>
                  )}
                  {unnamed && <p className="mt-1 text-[10px] text-destructive">⚠ Sin nombre: bautízalo para que su leyenda quede registrada.</p>}
                </div>
                <div className="text-right">
                  <p className="font-mono text-xl text-primary">{v.renown}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Renombre</p>
                </div>
              </header>
              <p className="mt-2 text-xs">Estado: <span className={v.status === "caido" ? "text-destructive" : "text-primary"}>{STATUS_LABEL[v.status] ?? v.status}</span>
                {dmg && <span className="text-destructive"> · ⚠ {dmg.wounds_lost}/{dmg.max_wounds} heridas perdidas{dmg.repair_until ? " (reparando)" : ""}</span>}</p>
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Honores</p>
                {!hon.length ? <p className="text-xs text-muted-foreground">Ninguno aún.</p> : (
                  <ul className="space-y-0.5 text-xs">
                    {hon.map((h) => <li key={h.id} className={h.used_at ? "line-through opacity-50" : ""} title={honourById(h.ability)?.text}>✪ {honourById(h.ability)?.name ?? h.ability}{h.used_at ? " · gastado" : ""}</li>)}
                  </ul>
                )}
              </div>
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Registro de batallas · {bat.length}</p>
                {!bat.length ? <p className="text-xs text-muted-foreground">Sin batallas todavía.</p> : (
                  <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs">
                    {bat.map((b) => (
                      <li key={b.id}>{new Date(b.created_at).toLocaleDateString("es-ES")} · {RES[b.result] ?? b.result} · +{b.renown_gained}{b.mvp ? " · ★ destacado" : ""}{b.wounds_lost > 0 && !b.destroyed ? ` · ${b.wounds_lost} heridas` : ""}{b.destroyed ? " · ☠ caído" : ""}{b.honour ? ` · ganó «${honourById(b.honour)?.name ?? b.honour}»` : ""}</li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
