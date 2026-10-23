import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Terminal";
import { units } from "@/lib/legions/data";

const unitName = (id: number) => units.find((u) => u.id === id)?.name ?? `Unidad ${id}`;
const left = (t: string) => { const m = Math.max(0, Math.round((new Date(t).getTime() - Date.now()) / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const ERR: Record<string, string> = { credits: "No tienes créditos suficientes", "no module": "Primero construye el módulo", capacity: "No caben más cápsulas", busy: "La bahía ya está fabricando", "already charged": "Ya está cargada o recargando", "no reserves": "No tienes suficientes cápsulas de ese tipo en Reservas" };
const POD_UNITS = [23, 25, 20, 24];
const POD_CAP = (lvl: number) => (lvl <= 0 ? 0 : lvl === 1 ? 10 : lvl === 2 ? 20 : 40);
const errMsg = (m: string) => Object.entries(ERR).find(([k]) => m.includes(k))?.[1] ?? m;

/** Orbital lance and drop pods, shown in the ship page. */
export function WarSupport({ uid, levels }: { uid: string; levels: Record<string, number> }) {
  const qc = useQueryClient();
  const { data: sup } = useQuery({ queryKey: ["supports"], queryFn: async () => (await supabase.rpc("get_supports")).data });
  const { data: dmg } = useQuery({ queryKey: ["engine-damage", uid], queryFn: async () => (await supabase.from("engine_damage").select("*").eq("user_id", uid).order("created_at")).data ?? [] });
  const { data: lost } = useQuery({ queryKey: ["lost-engines", uid], queryFn: async () => (await supabase.from("lost_engines").select("*").eq("user_id", uid).order("lost_at", { ascending: false })).data ?? [] });
  const { data: cat } = useQuery({ queryKey: ["unit-catalog"], queryFn: async () => (await supabase.from("unit_catalog").select("*")).data ?? [] });
  const { data: podStock } = useQuery({ queryKey: ["pod-stock", uid], queryFn: async () => {
    const [r, b] = await Promise.all([
      supabase.from("collection_items").select("unit_id, quantity").eq("user_id", uid).in("unit_id", POD_UNITS),
      supabase.from("pod_bay").select("unit_id, quantity").eq("user_id", uid),
    ]);
    return { res: new Map((r.data ?? []).map((x) => [x.unit_id, x.quantity])), bay: new Map((b.data ?? []).map((x) => [x.unit_id, x.quantity])) };
  } });
  const cost = (id: number) => cat?.find((c) => c.unit_id === id);
  const lance = levels['baterias'] ?? 0, pods = levels['bahia_pods'] ?? 0, reli = levels['gruas'] ?? 0;
  const reliPct = reli === 1 ? 0.6 : reli === 2 ? 0.45 : 0.3;

  async function call(fn: string, args: Record<string, unknown> | undefined, ok: string) {
    const { error } = await supabase.rpc(fn as never, args as never);
    if (error) { toast.error(errMsg(error.message)); return; }
    toast.success(ok);
    ["supports", "engine-damage", "lost-engines", "profile", "ship", "recruit-orders", "pod-stock", "collection"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }
  const btn = "border border-primary px-3 py-1 text-xs uppercase text-primary disabled:opacity-40";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Baterías orbitales · bombardeo">
        {!lance ? <p className="text-sm text-muted-foreground">&gt; Construye las Baterías orbitales para bombardear en batalla.</p> : (
          <div className="space-y-2 text-sm">
            <p>Estado: <span className="text-primary">{sup?.orbital_charged ? "● Cargada, lista para disparar" : sup?.orbital_ready_at ? `Recargando · faltan ${left(sup.orbital_ready_at)}` : "Descargada"}</span></p>
            <button disabled={!!sup?.orbital_charged || !!sup?.orbital_ready_at} onClick={() => call("recharge_orbital", undefined, "Recarga iniciada")} className={btn}>Recargar · 150 cr · {12 - 3 * (lance - 1)} h</button>
          </div>
        )}
      </Panel>
      <Panel title="Bahía de cápsulas de desembarco">
        {!pods ? <p className="text-sm text-muted-foreground">&gt; Construye la Bahía para cargar Drop Pods (10 / 20 / 40 por nivel).</p> : (
          <div className="space-y-2 text-sm">
            {(() => { const cap = POD_CAP(pods), ready = [...(podStock?.bay.values() ?? [])].reduce((a, b) => a + b, 0), room = Math.max(0, cap - ready); return (<>
              <p>Cápsulas cargadas y listas: <span className="text-primary">{ready} / {cap}</span></p>
              <p className="text-xs text-muted-foreground">Recluta cápsulas en <a href="/coleccion" className="text-primary underline">Reservas</a> y cárgalas aquí. Solo las cápsulas cargadas aparecen disponibles en tus listas Medusa V.</p>
              <ul className="space-y-1">
                {POD_UNITS.map((id) => { const stock = podStock?.res.get(id) ?? 0, inBay = podStock?.bay.get(id) ?? 0, n = Math.min(room, stock); return (
                  <li key={id} className="flex flex-wrap items-center justify-between gap-2 border border-border p-2">
                    <span>{unitName(id)} · <span className="text-primary">{inBay} cargadas</span> · {stock} en Reservas</span>
                    <span className="flex gap-2">
                      <button disabled={n < 1} onClick={() => call("load_pod_unit", { _unit: id, _qty: 1 }, "Cápsula cargada")} className={btn}>Cargar 1</button>
                      <button disabled={n < 1} onClick={() => call("load_pod_unit", { _unit: id, _qty: n }, `${n} cápsulas cargadas`)} className={btn}>Todas ({n})</button>
                    </span>
                  </li>); })}
              </ul>
            </>); })()}
          </div>
        )}
      </Panel>
    </div>
  );
}
