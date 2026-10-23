import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Terminal";
import { honourById, SUPPORT_RULES } from "@/lib/honours";
import { units } from "@/lib/legions/data";

const unitName = (id: number) => units.find((u) => u.id === id)?.name ?? `Unidad ${id}`;

export function SupportTab({ gameId, me, active, myUnits, enemyUnits, enemyId, onLog }: { gameId: string; me: string; active: boolean; myUnits: number[]; enemyUnits: number[]; enemyId: string | null; onLog: (m: string) => void }) {
  const qc = useQueryClient();
  const { data: sup } = useQuery({ queryKey: ["supports"], queryFn: async () => (await supabase.rpc("get_supports")).data });
  const { data: mods } = useQuery({ queryKey: ["support-mods", me], queryFn: async () => (await supabase.from("ship_modules").select("module,level").eq("user_id", me).in("module", ["baterias", "bahia_pods"])).data ?? [] });
  const { data: hon } = useQuery({ queryKey: ["honours", gameId], queryFn: async () => (await supabase.from("honours").select("*").is("used_at", null).in("user_id", [me, enemyId ?? me])).data ?? [] });
  const lvl = (m: string) => mods?.find((x) => x.module === m)?.level ?? 0;
  const mine = (hon ?? []).filter((h) => h.user_id === me && myUnits.includes(h.unit_id));
  const theirs = (hon ?? []).filter((h) => h.user_id === enemyId && enemyUnits.includes(h.unit_id));

  async function useSupport(kind: "orbital" | "pod") {
    const { error } = await supabase.rpc("use_support", { _game: gameId, _kind: kind });
    if (error) { toast.error(kind === "orbital" ? "La lanza orbital no está cargada" : "No te quedan cápsulas"); return; }
    onLog(kind === "orbital" ? "BOMBARDEO ORBITAL" : "Desembarco con Drop Pod");
    qc.invalidateQueries({ queryKey: ["supports"] });
  }
  async function useHonour(id: string, label: string) {
    const { error } = await supabase.rpc("use_honour", { _id: id, _game: gameId });
    if (error) { toast.error("No se pudo usar"); return; }
    onLog(`usa ${label}`);
    qc.invalidateQueries({ queryKey: ["honours"] });
  }
  const btn = "border border-primary px-3 py-1 text-xs uppercase text-primary disabled:opacity-40";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Apoyo desde tu nave">
        <div className="space-y-4 text-sm">
          <div className="border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-primary">{SUPPORT_RULES.orbital.name}</span>
              <span className="text-xs">{!lvl("baterias") ? "Sin módulo" : sup?.orbital_charged ? "● CARGADA" : sup?.orbital_ready_at ? "Recargando…" : "Descargada"}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{SUPPORT_RULES.orbital.text}</p>
            <button disabled={!active || !sup?.orbital_charged} onClick={() => confirm("¿Disparar el bombardeo orbital? Se gasta la carga.") && useSupport("orbital")} className={`${btn} mt-2`}>Disparar</button>
          </div>
          <div className="border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-primary">{SUPPORT_RULES.pod.name}</span>
              <span className="text-xs">{!lvl("bahia_pods") ? "Sin módulo" : `${sup?.pods ?? 0} disponibles`}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{SUPPORT_RULES.pod.text}</p>
            <button disabled={!active || !(sup?.pods ?? 0)} onClick={() => useSupport("pod")} className={`${btn} mt-2`}>Usar cápsula</button>
          </div>
          <p className="text-[10px] text-muted-foreground">Reglas de la casa para la campaña de Medusa V.</p>
        </div>
      </Panel>
      <div className="space-y-6">
        <Panel title="Honores de tus veteranos">
          {!mine.length && <p className="text-sm text-muted-foreground">&gt; Ninguna unidad de tu lista tiene honores. Tus veteranos los ganan al azar en batalla.</p>}
          <ul className="space-y-2 text-sm">
            {mine.map((h) => { const a = honourById(h.ability); return (
              <li key={h.id} className="border border-border p-2">
                <div className="flex items-center justify-between gap-2"><span className="text-primary">✪ {a?.name}</span>
                  <button disabled={!active} onClick={() => useHonour(h.id, `${a?.name} (${h.bearer || unitName(h.unit_id)})`)} className={btn}>Usar</button></div>
                <div className="text-xs">{h.bearer || unitName(h.unit_id)}</div>
                <p className="text-xs text-muted-foreground">{a?.text}</p>
              </li>); })}
          </ul>
        </Panel>
        <Panel title="Honores del enemigo">
          {!theirs.length && <p className="text-sm text-muted-foreground">&gt; Sin honores conocidos.</p>}
          <ul className="space-y-1 text-xs">
            {theirs.map((h) => <li key={h.id}><span className="text-destructive">✪ {honourById(h.ability)?.name}</span> · {h.bearer || unitName(h.unit_id)} — {honourById(h.ability)?.text}</li>)}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
