import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Terminal";
import { HONOURS, honourById } from "@/lib/honours";
import { units } from "@/lib/legions/data";

const uname = (id: number) => units.find((u) => u.id === id)?.name ?? `Unidad ${id}`;
const inp = "border border-border bg-background px-2 py-1 text-xs";
const btn = "border border-primary px-2 py-1 text-xs uppercase text-primary";
const red = "border border-destructive/60 px-2 py-1 text-xs text-destructive";

async function call(fn: string, args: Record<string, unknown>, ok: string, qc: ReturnType<typeof useQueryClient>) {
  const { error } = await supabase.rpc(fn as never, args as never);
  if (error) { toast.error(error.message); return false; }
  toast.success(ok);
  qc.invalidateQueries();
  return true;
}

/** Support console: fix any player's credits, reserves, honours, supports, engines and regions. */
export function AdminTools() {
  const qc = useQueryClient();
  const { data: players } = useQuery({ queryKey: ["admin-players"], queryFn: async () => (await supabase.from("profiles").select("id, leader_name, imperial_credits, renown").not("oath_sworn_at", "is", null).order("leader_name")).data ?? [] });
  const [uid, setUid] = useState("");
  const p = players?.find((x) => x.id === uid);
  const { data: d } = useQuery({
    queryKey: ["admin-player", uid], enabled: !!uid,
    queryFn: async () => {
      const [coll, hon, sup, dmg, lost] = await Promise.all([
        supabase.from("collection_items").select("unit_id, quantity").eq("user_id", uid).order("unit_id"),
        supabase.from("honours").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ship_supports").select("*").eq("user_id", uid).maybeSingle(),
        supabase.from("engine_damage").select("*").eq("user_id", uid),
        supabase.from("lost_engines").select("*").eq("user_id", uid),
      ]);
      return { coll: coll.data ?? [], hon: hon.data ?? [], sup: sup.data, dmg: dmg.data ?? [], lost: lost.data ?? [] };
    },
  });
  const [cr, setCr] = useState(0), [rn, setRn] = useState(0);
  const [addUnit, setAddUnit] = useState(""), [addQty, setAddQty] = useState(1);
  const [hUnit, setHUnit] = useState(""), [hBearer, setHBearer] = useState(""), [hAb, setHAb] = useState(HONOURS[0]!.id);
  const [pods, setPods] = useState(0);

  return (
    <Panel title="Consola de soporte · jugadores">
      <select value={uid} onChange={(e) => setUid(e.target.value)} className={`${inp} mb-3 w-full text-sm`}>
        <option value="">Elige un jugador…</option>
        {players?.map((x) => <option key={x.id} value={x.id}>{x.leader_name} · {x.imperial_credits} cr · {x.renown} Renombre</option>)}
      </select>
      <div className="mb-3 space-y-2 border border-primary p-3">
        <div className="text-sm text-primary">⏩ Saltar tiempos de espera (pruebas)</div>
        <p className="text-xs text-muted-foreground">Termina al instante reclutamientos, obras, reparaciones, recarga de apoyos, recolección diaria, ofensivas navales, regresos y tomas neutrales {uid ? "de este jugador" : "de todos los jugadores"}.</p>
        <div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => call("admin_force_queues", { _uid: uid || null }, "Reclutamientos y obras de la nave completados", qc)}>Forzar reclutamiento y obras</button>
          <button className={btn} onClick={() => call("admin_finish_travel", { _uid: uid || null }, "Saltos warp completados", qc)}>Completar saltos warp</button>
          <button className={btn} onClick={() => call("admin_skip_waits", { _uid: uid || null, _include_attacks: false }, "Tiempos eliminados", qc)}>Saltar esperas</button>
          <button className={red} onClick={() => { if (confirm("Los ataques entre jugadores sin batalla se resolverán AL AZAR ahora. ¿Seguir?")) void call("admin_skip_waits", { _uid: uid || null, _include_attacks: true }, "Tiempos eliminados (incl. ataques)", qc); }}>Incluir ataques a jugadores</button>
        </div>
      </div>
      {p && d && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 border border-border p-3">
            <div className="text-sm text-primary">Créditos y Renombre</div>
            <p className="text-xs">Ahora: {p.imperial_credits} créditos · {p.renown} Renombre</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label>± Créditos <input type="number" value={cr} onChange={(e) => setCr(Number(e.target.value))} className={`${inp} w-24`} /></label>
              <label>± Renombre <input type="number" value={rn} onChange={(e) => setRn(Number(e.target.value))} className={`${inp} w-20`} /></label>
              <button className={btn} onClick={async () => { if (await call("admin_adjust", { _uid: uid, _credits: cr, _renown: rn }, "Ajustado", qc)) { setCr(0); setRn(0); } }}>Aplicar</button>
            </div>
          </div>

          <div className="space-y-2 border border-border p-3">
            <div className="text-sm text-primary">Apoyo orbital</div>
            <p className="text-xs">Lanza: {d.sup?.orbital_charged ? "cargada" : "descargada"} · Cápsulas: {d.sup?.pods ?? 0}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label>Cápsulas <input type="number" min={0} value={pods} onChange={(e) => setPods(Number(e.target.value))} className={`${inp} w-16`} /></label>
              <button className={btn} onClick={() => call("admin_set_supports", { _uid: uid, _charged: true, _pods: pods }, "Lanza cargada", qc)}>Cargar lanza + fijar cápsulas</button>
              <button className={red} onClick={() => call("admin_set_supports", { _uid: uid, _charged: false, _pods: pods }, "Lanza descargada", qc)}>Descargar</button>
            </div>
          </div>

          <div className="space-y-2 border border-border p-3">
            <div className="text-sm text-primary">Reservas</div>
            <ul className="max-h-56 space-y-1 overflow-auto text-xs">
              {d.coll.map((c) => (
                <li key={c.unit_id} className="flex items-center justify-between gap-2">
                  <span>{uname(c.unit_id)}</span>
                  <input type="number" min={0} defaultValue={c.quantity} className={`${inp} w-16`} onBlur={(e) => Number(e.target.value) !== c.quantity && call("admin_set_unit", { _uid: uid, _unit: c.unit_id, _qty: Number(e.target.value) }, "Reservas actualizadas", qc)} />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <select value={addUnit} onChange={(e) => setAddUnit(e.target.value)} className={`${inp} flex-1`}><option value="">Añadir unidad…</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <input type="number" min={1} value={addQty} onChange={(e) => setAddQty(Number(e.target.value))} className={`${inp} w-16`} />
              <button disabled={!addUnit} className={btn} onClick={() => call("admin_set_unit", { _uid: uid, _unit: Number(addUnit), _qty: (d.coll.find((c) => c.unit_id === Number(addUnit))?.quantity ?? 0) + addQty }, "Unidad añadida", qc)}>Añadir</button>
            </div>
          </div>

          <div className="space-y-2 border border-border p-3">
            <div className="text-sm text-primary">Honores de veteranía</div>
            <ul className="max-h-40 space-y-1 overflow-auto text-xs">
              {d.hon.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2">
                  <span className={h.used_at ? "text-muted-foreground line-through" : ""}>✪ {honourById(h.ability)?.name} · {h.bearer || uname(h.unit_id)}</span>
                  <span className="flex gap-1">
                    {h.used_at && <button className={btn} onClick={() => call("admin_remove_honour", { _id: h.id, _restore: true }, "Honor restaurado", qc)}>Restaurar</button>}
                    <button className={red} onClick={() => confirm("¿Quitar este honor?") && call("admin_remove_honour", { _id: h.id, _restore: false }, "Honor quitado", qc)}>Quitar</button>
                  </span>
                </li>
              ))}
              {!d.hon.length && <li className="text-muted-foreground">Sin honores.</li>}
            </ul>
            <div className="grid gap-1 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <select value={hUnit} onChange={(e) => setHUnit(e.target.value)} className={inp}><option value="">Unidad…</option>{d.coll.map((c) => <option key={c.unit_id} value={c.unit_id}>{uname(c.unit_id)}</option>)}</select>
              <input value={hBearer} onChange={(e) => setHBearer(e.target.value)} placeholder="Portador" className={inp} />
              <select value={hAb} onChange={(e) => setHAb(e.target.value)} className={inp}>{HONOURS.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
              <button disabled={!hUnit} className={btn} onClick={() => call("admin_grant_honour", { _uid: uid, _unit: Number(hUnit), _bearer: hBearer, _ability: hAb }, "Honor concedido (gratis)", qc)}>Dar</button>
            </div>
          </div>

          <div className="space-y-2 border border-border p-3 lg:col-span-2">
            <div className="text-sm text-primary">Titanes y Caballeros dañados o caídos</div>
            <ul className="space-y-1 text-xs">
              {d.dmg.map((x) => <li key={x.id} className="flex justify-between gap-2"><span>⚠ {x.name || uname(x.unit_id)} · {x.wounds_lost}/{x.max_wounds}</span><button className={btn} onClick={() => call("admin_clear_damage", { _id: x.id, _restore_lost: false }, "Reparado", qc)}>Reparar gratis</button></li>)}
              {d.lost.map((x) => <li key={x.id} className="flex justify-between gap-2"><span>☠ {x.name || uname(x.unit_id)}</span><button className={btn} onClick={() => call("admin_clear_damage", { _id: x.id, _restore_lost: true }, "Devuelto a reservas", qc)}>Devolver a reservas</button></li>)}
              {!d.dmg.length && !d.lost.length && <li className="text-muted-foreground">Nada que reparar.</li>}
            </ul>
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Force region owners and resolve stuck attacks. */
export function AdminRegions({ regions, players }: { regions: { id: number; name: string; owner_id: string | null; is_spaceport: boolean }[]; players: { id: string; leader_name: string | null }[] }) {
  const qc = useQueryClient();
  const { data: attacks } = useQuery({ queryKey: ["admin-attacks"], queryFn: async () => (await supabase.from("region_attacks").select("*").is("resolved_at", null)).data ?? [] });
  const [reg, setReg] = useState(""), [owner, setOwner] = useState(""), [sp, setSp] = useState(false);
  const name = (id: string | null) => players.find((p) => p.id === id)?.leader_name ?? "—";
  return (
    <Panel title="Consola de soporte · regiones y ataques">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={reg} onChange={(e) => setReg(e.target.value)} className={inp}><option value="">Región…</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name} ({name(r.owner_id)})</option>)}</select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inp}><option value="">Neutral</option>{players.map((p) => <option key={p.id} value={p.id}>{p.leader_name}</option>)}</select>
        <label className="flex items-center gap-1"><input type="checkbox" checked={sp} onChange={(e) => setSp(e.target.checked)} /> Espaciopuerto</label>
        <button disabled={!reg} className={btn} onClick={() => confirm("¿Forzar el dueño de esta región?") && call("admin_force_region", { _region: Number(reg), _uid: owner || null, _spaceport: sp }, "Región actualizada", qc)}>Forzar conquista</button>
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {attacks?.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border border-border p-2">
            <span>⚔ {regions.find((r) => r.id === a.region_id)?.name}: {name(a.attacker_id)}{a.defender_id ? ` contra ${name(a.defender_id)}` : " (toma neutral)"} · vence {new Date(a.deadline).toLocaleString("es-ES")}</span>
            <span className="flex gap-1">
              <button className={btn} onClick={() => call("admin_resolve_attack", { _id: a.id, _winner: "atacante" }, "Gana el atacante", qc)}>Gana atacante</button>
              <button className={btn} onClick={() => call("admin_resolve_attack", { _id: a.id, _winner: "defensor" }, "Gana el defensor", qc)}>Gana defensor</button>
              <button className={red} onClick={() => call("admin_resolve_attack", { _id: a.id, _winner: "anular" }, "Ataque anulado", qc)}>Anular</button>
            </span>
          </li>
        ))}
        {!attacks?.length && <li className="text-muted-foreground">Sin ataques en curso.</li>}
      </ul>
    </Panel>
  );
}
