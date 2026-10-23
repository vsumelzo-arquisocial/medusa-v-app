import { createFileRoute, Navigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { useState } from "react";
import { AdminRegions, AdminTools } from "@/components/admin/AdminTools";
import { campaignQuery } from "@/lib/campaign-queries";
import { REGION_TYPES } from "@/lib/planet";
import { BODIES, bodyName } from "@/lib/system";
import { FORCE_CLASSES, FORCE_NAMES, regionForce } from "@/lib/campaign-forces";
import { playersQuery, scenariosQuery, sizeLabel, STATUS_LABEL } from "@/lib/games";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, ShieldPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { deletePlayer, administratorIds, grantAdministrator } from "@/lib/admin-players.functions";

const usersQuery = queryOptions({
  queryKey: ["admin-users"],
  queryFn: async () => {
    const { data, error } = await supabase.from("profiles").select("id,email,leader_name,approved,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administración — Atalaya" }, { name: "description", content: "Aprobación de cuentas del club." }, { property: "og:title", content: "Administración — Atalaya" }, { property: "og:description", content: "Gestión de jugadores, recursos y campaña del club Atalaya." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  component: Admin,
});

function Admin() {
  const { data: me } = useSuspenseQuery(profileQuery);
  if (!me.isAdmin) return <Navigate to="/puente" />;
  return <CommandShell isAdmin><div className="space-y-6"><UserList /><AdminTools /><AdminNaval /><AdminCampaign /><AdminRegionsWrap /><AdminGames /><Scenarios /></div></CommandShell>;
}

function AdminNaval() {
  const qc = useQueryClient();
  const { data: raids } = useSuspenseQuery(queryOptions({ queryKey: ["naval-raids", "admin"], queryFn: async () => (await supabase.from("naval_raids").select("id,attacker_id,defender_id,deadline,status").eq("status", "pendiente")).data ?? [] }));
  const { data: players } = useSuspenseQuery(playersQuery);
  const [uid, setUid] = useState("");
  const nm = (id: string) => players.find((p) => p.id === id)?.leader_name ?? id.slice(0, 6);
  return (
    <Panel title="Combate naval">
      <ul className="mb-3 space-y-1 text-sm">{raids.length === 0 ? <li className="text-xs text-muted-foreground">Sin asaltos pendientes.</li> : raids.map((r) => (
        <li key={r.id} className="flex justify-between gap-2">{nm(r.attacker_id)} → {nm(r.defender_id)}
          <button className="text-xs text-destructive" onClick={async () => { const { error } = await supabase.rpc("admin_cancel_raid", { _id: r.id }); if (error) toast.error("No se pudo anular"); else { toast.success("Asalto anulado y coste devuelto"); qc.invalidateQueries({ queryKey: ["naval-raids"] }); } }}>anular</button></li>
      ))}</ul>
      <div className="flex gap-2">
        <select value={uid} onChange={(e) => setUid(e.target.value)} className="flex-1 border border-border bg-background px-2 py-1 text-sm"><option value="">— jugador —</option>{players.map((p) => <option key={p.id} value={p.id}>{p.leader_name}</option>)}</select>
        <button disabled={!uid} className="border border-primary px-3 text-xs text-primary" onClick={async () => { const { error } = await supabase.rpc("admin_repair_module", { _uid: uid, _module: null as unknown as string }); if (error) toast.error("Error"); else toast.success("Módulos reparados"); }}>Reparar todos sus módulos</button>
      </div>
    </Panel>
  );
}

const adminGamesQuery = queryOptions({
  queryKey: ["games", "admin"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_games");
    if (error) throw error;
    return data ?? [];
  },
});

function AdminGames() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(adminGamesQuery);
  const { data: players } = useSuspenseQuery(playersQuery);
  const name = (id: string | null) => (id ? players.find((p) => p.id === id)?.leader_name ?? "?" : "cualquiera");
  const disputed = data.filter((g) => (g.battle as { disputed?: boolean } | null)?.disputed);
  async function resolveDispute(id: string, action: "aplicar" | "eliminar") {
    let battle: unknown;
    if (action === "aplicar") {
      const raw = prompt("Opcional: PV corregidos como «creador,rival» (deja vacío para aplicar tal cual):", "");
      if (raw === null) return;
      const m = raw.trim().match(/^(\d+)\s*,\s*(\d+)$/);
      if (raw.trim() && !m) { toast.error("Formato no válido"); return; }
      if (m) battle = { vp: { creator: +m[1]!, opponent: +m[2]! } };
    } else if (!confirm("¿Eliminar este resultado? La partida quedará cancelada sin aplicar bajas.")) return;
    const { error } = await supabase.rpc("admin_resolve_battle", { _game: id, _action: action, ...(battle ? { _battle: battle as never } : {}) });
    if (error) { toast.error("No se pudo resolver la impugnación"); return; }
    toast.success(action === "aplicar" ? "Resultado aplicado" : "Resultado eliminado");
    qc.invalidateQueries({ queryKey: ["games"] });
  }
  return (
    <Panel title={`Partidas (${data.length})`}>
      {!!disputed.length && (
        <div className="mb-3 border border-destructive p-3">
          <div className="mb-2 text-xs uppercase text-destructive">⚠ Resultados impugnados ({disputed.length})</div>
          <ul className="space-y-2 text-sm">
            {disputed.map((g) => {
              const b = g.battle as { vp?: { creator?: number; opponent?: number }; dispute_note?: string } | null;
              return (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 border border-border px-3 py-2">
                  <span>
                    {name(g.creator_id)} vs {name(g.opponent_id)} · {b?.vp?.creator ?? 0}–{b?.vp?.opponent ?? 0} PV
                    {(b?.dispute_note) && <span className="ml-2 text-xs text-muted-foreground">«{b.dispute_note}»</span>}
                  </span>
                  <span className="flex gap-2">
                    <button onClick={() => resolveDispute(g.id, "aplicar")} className="border border-primary px-3 py-1 text-xs text-primary">Aplicar</button>
                    <button onClick={() => resolveDispute(g.id, "eliminar")} className="border border-destructive px-3 py-1 text-xs text-destructive">Eliminar</button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!data.length && <p className="text-sm text-muted-foreground">&gt; No hay partidas.</p>}
      <ul className="space-y-1 text-sm">
        {data.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 border border-border px-3 py-2">
            <span>
              {name(g.creator_id)} vs {name(g.opponent_id)} · {sizeLabel(g.size)} · [{STATUS_LABEL[g.status] ?? g.status}]
              {g.scheduled_at && <span className="ml-2 text-xs text-muted-foreground">{new Date(g.scheduled_at).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" })}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function UserList() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(usersQuery);
  const { data: adminIds } = useSuspenseQuery(queryOptions({ queryKey: ["admin-role-ids"], queryFn: () => administratorIds() }));
  const { data: me } = useSuspenseQuery(profileQuery);
  const removePlayer = useServerFn(deletePlayer);
  const grantAdmin = useServerFn(grantAdministrator);
  const [grantTarget, setGrantTarget] = useState<(typeof data)[number] | null>(null);
  const [granting, setGranting] = useState(false);
  async function grant() {
    if (!grantTarget || granting) return;
    setGranting(true);
    try {
      await grantAdmin({ data: { playerId: grantTarget.id } });
      setGrantTarget(null);
      toast.success("Permisos de administrador otorgados");
      await qc.invalidateQueries({ queryKey: ["admin-role-ids"] });
      await qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron otorgar los permisos");
    } finally { setGranting(false); }
  }
  const [target, setTarget] = useState<(typeof data)[number] | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  async function remove() {
    if (!target || confirmation !== "ELIMINAR" || deleting) return;
    setDeleting(true);
    try {
      await removePlayer({ data: { playerId: target.id, confirmation: "ELIMINAR" } });
      setTarget(null);
      setConfirmation("");
      toast.success("Jugador eliminado");
      await qc.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar el jugador");
    } finally { setDeleting(false); }
  }
  async function set(id: string, approved: boolean) {
    const { error } = await supabase.rpc("set_approval", { _user: id, _approved: approved });
    if (error) { toast.error(error.message); return; }
    toast.success(approved ? "Cuenta aprobada" : "Acceso revocado");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  }
  return (
    <Panel title="Solicitudes de acceso">
      <ul className="divide-y divide-border">
        {data.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <div className="text-sm">{u.email}</div>
              <div className="text-xs text-muted-foreground">{u.leader_name ?? "sin juramento"} · {u.approved ? "APROBADA" : "PENDIENTE"}</div>
              {adminIds.includes(u.id) && <div className="text-xs text-primary">ADMINISTRADOR</div>}
            </div>
             <div className="flex items-center gap-2">
             {!adminIds.includes(u.id) && <Button variant="outline" size="icon" title="Otorgar rol administrador" aria-label={`Otorgar administrador a ${u.leader_name ?? u.email ?? "jugador"}`} onClick={() => setGrantTarget(u)}><ShieldPlus /></Button>}
             {u.approved ? (
              <button onClick={() => set(u.id, false)} className="border border-destructive px-3 py-1 text-xs text-destructive">Revocar</button>
            ) : (
              <button onClick={() => set(u.id, true)} className="bg-primary px-3 py-1 text-xs text-primary-foreground">Aprobar</button>
            )}
             <Button variant="ghost" size="icon" className="text-destructive" title={u.id === me.user.id ? "No puedes eliminar tu propia cuenta" : "Eliminar jugador"} aria-label={`Eliminar jugador ${u.leader_name ?? u.email ?? "sin juramento"}`} disabled={u.id === me.user.id} onClick={() => { setTarget(u); setConfirmation(""); }}><Trash2 /></Button>
             </div>
          </li>
        ))}
      </ul>
      <AlertDialog open={!!grantTarget} onOpenChange={(open) => { if (!open && !granting) setGrantTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Otorgar rol administrador?</AlertDialogTitle>
            <AlertDialogDescription>{grantTarget?.leader_name ?? grantTarget?.email} podrá gestionar jugadores, recursos y campaña, eliminar otras cuentas y nombrar administradores.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={granting}>Cancelar</AlertDialogCancel>
            <Button disabled={granting} onClick={grant}><ShieldPlus />{granting ? "Otorgando…" : "Otorgar administrador"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!target} onOpenChange={(open) => { if (!open && !deleting) { setTarget(null); setConfirmation(""); } }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar jugador definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.leader_name ?? target?.email}. Se eliminarán su cuenta, nave, reservas, listas, veteranos y honores. Sus regiones quedarán neutrales y sus partidas pendientes se cancelarán. Los resultados ya jugados de los demás se conservarán. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="space-y-2 text-sm">Escribe ELIMINAR para confirmar
            <input aria-label="Confirmación de eliminación" autoComplete="off" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={deleting} className="block w-full border border-border bg-background px-3 py-2" />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={confirmation !== "ELIMINAR" || deleting} onClick={remove}><Trash2 />{deleting ? "Eliminando…" : "Eliminar definitivamente"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

function Scenarios() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(scenariosQuery);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("scenarios").insert({ name: name.trim(), description: desc.trim() });
    if (error) { toast.error("No se pudo añadir"); return; }
    setName(""); setDesc("");
    qc.invalidateQueries({ queryKey: ["scenarios"] });
  }
  async function remove(id: string) {
    await supabase.from("scenarios").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["scenarios"] });
  }
  return (
    <Panel title={`Escenarios (${data.length})`}>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="border border-border bg-background px-3 py-2 text-sm" />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción (opcional)" className="border border-border bg-background px-3 py-2 text-sm" />
        <button onClick={add} className="border border-primary px-3 py-2 text-xs text-primary">Añadir</button>
      </div>
      <ul className="divide-y divide-border">
        {data.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-2 text-sm">
            <span>{s.name}{s.description && <span className="ml-2 text-xs text-muted-foreground">{s.description}</span>}</span>
            <button onClick={() => remove(s.id)} className="text-xs text-muted-foreground hover:text-destructive">Borrar</button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function AdminCampaign() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(campaignQuery);
  const phase = data.campaign?.phase ?? "aproximacion";
  const refresh = () => qc.invalidateQueries();
  async function setPhase(p: string) {
    const { error } = await supabase.rpc("admin_set_phase", { _phase: p });
    if (error) toast.error(error.message); else { toast.success("Fase cambiada"); refresh(); }
  }
  async function reset() {
    if (prompt("Se anularán todas las conquistas en marcha, se liberarán las regiones de todos los planetas, se bloquearán todos y las naves volverán a Medusa V. Se conservan batallas y sus estados, honores, historiales y progreso personal. Escribe REINICIAR para confirmar") !== "REINICIAR") return;
    const { error } = await supabase.rpc("admin_restart_campaign_safe");
    if (error) toast.error(error.message); else { toast.success("Campaña reiniciada"); refresh(); }
  }
  async function edit(id: number, patch: { name?: string; type?: string; owner_id?: string | null }) {
    const { error } = await supabase.from("regions").update(patch as never).eq("id", id);
    if (error) toast.error(error.message); else refresh();
  }
  async function setBody(id: string, status: "open" | "locked") {
    if (status === "locked" && !confirm(`¿Bloquear ${bodyName(id)}? Los territorios quedan como están y se anulan los ataques pendientes allí.`)) return;
    const { error } = await supabase.rpc("admin_set_body_status", { _body: id, _status: status });
    if (error) toast.error(error.message); else { toast.success(status === "open" ? "Planeta abierto" : "Planeta bloqueado"); refresh(); }
  }
  const phaseLabel = phase === "conquista" ? "En curso" : phase === "finalizada" ? "Finalizada" : "Preparación";
  return (
    <Panel title={`Control de campaña · Sistema Medusa nº ${data.campaign?.number ?? 1}`}>
      <div className="mb-3 flex flex-wrap gap-2 text-xs uppercase">
        <span className="border border-border px-3 py-1">Fase: {phaseLabel}</span>
        {phase !== "conquista" && <button onClick={() => setPhase("conquista")} className="border border-primary px-3 py-1 text-primary">Iniciar campaña</button>}
        {phase === "conquista" && <button onClick={() => setPhase("aproximacion")} className="border border-border px-3 py-1">Pausar (preparación)</button>}
        {phase === "conquista" && <button onClick={() => confirm("¿Finalizar la campaña? Se congelan todos los plazos.") && setPhase("finalizada")} className="border border-border px-3 py-1">Finalizar campaña</button>}
        <Button variant="outline" size="sm" onClick={reset} className="text-destructive">Reiniciar campaña</Button>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">Abre los planetas y lunas donde se puede desembarcar y atacar. Un planeta bloqueado conserva sus territorios y se puede visitar, pero no conquistar.</p>
      <table className="mb-4 w-full text-xs">
        <thead><tr className="text-left text-muted-foreground"><th>Cuerpo</th><th>Regiones</th><th>Dominio</th><th>Estado</th></tr></thead>
        <tbody>{BODIES.filter((b) => b.playable).map((b) => {
          const rs = data.regions.filter((r) => r.body_id === b.id); const n = rs.length || 1;
          const shares = (["order", "chaos", "incursors"] as const).map((f) => ({ f, pct: Math.round((100 * rs.filter((r) => regionForce(r.owner_id, data.players) === f).length) / n) }));
          const full = shares.find((x) => x.pct === 100);
          const open = data.bodies.find((x) => x.id === b.id)?.status === "open";
          return <tr key={b.id} className="border-t border-border">
            <td className="py-1">{b.kind === "moon" ? "↳ " : ""}{b.name}</td><td>{rs.length}</td>
            <td>{shares.filter((x) => x.pct > 0).map((x) => <span key={x.f} className={`mr-2 ${FORCE_CLASSES[x.f]}`}>{FORCE_NAMES[x.f]} {x.pct} %</span>)}{full && open && <span className="ml-1 text-primary">· dominado: puedes bloquearlo</span>}</td>
            <td><button onClick={() => setBody(b.id, open ? "locked" : "open")} className={`border px-2 py-0.5 uppercase ${open ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{open ? "Abierto" : "Bloqueado"}</button></td>
          </tr>;
        })}</tbody>
      </table>
      <details>
        <summary className="cursor-pointer text-xs uppercase text-muted-foreground">Editar regiones ({data.regions.length})</summary>
        <ul className="mt-2 space-y-1 text-xs">
          {data.regions.map((r) => (
            <li key={r.id} className="grid grid-cols-[2rem_1fr_9rem_9rem] items-center gap-2">
              <span className="text-muted-foreground" title={bodyName(r.body_id)}>{r.id}</span>
              <input defaultValue={r.name} onBlur={(e) => e.target.value !== r.name && edit(r.id, { name: e.target.value })} className="border border-border bg-background px-2 py-1" />
              <select value={r.type} onChange={(e) => edit(r.id, { type: e.target.value })} className="border border-border bg-background px-1 py-1">
                {Object.entries(REGION_TYPES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
              </select>
              <select value={r.owner_id ?? ""} onChange={(e) => edit(r.id, { owner_id: e.target.value || null })} className="border border-border bg-background px-1 py-1">
                <option value="">Neutral</option>
                {data.players.map((p) => <option key={p.id} value={p.id}>{p.leader_name}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </details>
    </Panel>
  );
}

function AdminRegionsWrap() {
  const { data } = useSuspenseQuery(campaignQuery);
  return <AdminRegions regions={data.regions} players={data.players} />;
}
