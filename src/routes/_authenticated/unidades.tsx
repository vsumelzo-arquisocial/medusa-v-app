import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import type { Database } from "@/integrations/supabase/types";
import { profileQuery } from "@/lib/profile";
import { datasheetsQuery, findSheet, HISTORY_ES, squadHistoryQuery, squadsQuery, STATUS_ES, unitImage, type Datasheet } from "@/lib/wh40k-units";

export const Route = createFileRoute("/_authenticated/unidades")({
  head: () => ({ meta: [
    { title: "Unidades — Atalaya" },
    { name: "description", content: "Fichas de tus unidades reclutadas: miniaturas vivas, heridas, armas, historial de batallas y recuperación de caídos." },
    { property: "og:title", content: "Unidades — Atalaya" },
    { property: "og:description", content: "Fichas, bajas, reparaciones e historial de tus unidades." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: async ({ context }) => {
    const p = await context.queryClient.ensureQueryData(profileQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(squadsQuery),
      context.queryClient.ensureQueryData(squadHistoryQuery),
      context.queryClient.ensureQueryData(datasheetsQuery(p.profile?.army_faction ?? "")),
    ]);
  },
  component: Units,
});

type Squad = Database["public"]["Tables"]["wh40k_squads"]["Row"];

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" }) : "");

function Units() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const faction = prof.profile?.army_faction ?? "";
  const { data: squads } = useSuspenseQuery(squadsQuery);
  const { data: history } = useSuspenseQuery(squadHistoryQuery);
  const { data: sheets } = useSuspenseQuery(datasheetsQuery(faction));
  const [filter, setFilter] = useState<"todas" | "activas" | "caidas">("activas");
  // Units still being recruited live in the recruitment queue until they are ready.
  const visible = squads.filter((s) => s.faction === faction && s.status !== "dismissed" && s.status !== "training")
    .filter((s) => filter === "todas" || (filter === "caidas" ? s.status === "fallen" : s.status !== "fallen"));

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl text-primary glow">Unidades</h1>
        <p className="text-sm">Créditos: <span className="text-primary">{prof.profile?.imperial_credits}</span></p>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Cada unidad reclutada tiene su ficha. Las bajas hay que reponerlas y los vehículos repararlos; si cae, puedes reentrenarla para recuperar su legado. Perfiles y armas: Wahapedia (no oficial). <Link to="/reclutar" className="text-primary">Reclutar →</Link></p>
      <div className="mb-3 flex gap-2 text-xs">
        {(["activas", "caidas", "todas"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`border px-2 py-1 uppercase ${filter === f ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{f === "caidas" ? "Caídas" : f}</button>
        ))}
      </div>
      {!visible.length && <Panel title="Sin unidades"><p className="text-xs text-muted-foreground">&gt; No hay unidades en esta vista.</p></Panel>}
      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((s) => <SquadCard key={s.id} s={s} faction={faction} sheet={findSheet(sheets, s.unit_name)} history={history.filter((h) => h.squad_id === s.id)} />)}
      </div>
    </CommandShell>
  );
}

function SquadCard({ s, faction, sheet, history }: { s: Squad; faction: string; sheet: Datasheet | undefined; history: { id: string; kind: string; created_at: string; models_lost: number; wounds_lost: number; cost: number; note: string }[] }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(s.nickname);
  const saved = (s.loadout ?? {}) as Record<string, number>;
  const [gear, setGear] = useState<Record<string, number>>(saved);
  const clean = (g: Record<string, number>) => Object.fromEntries(Object.entries(g).filter(([, c]) => c > 0));
  const gearDirty = JSON.stringify(clean(gear)) !== JSON.stringify(clean(saved));
  const equipped = Object.entries(clean(saved));
  async function saveGear() {
    setBusy(true);
    const { error } = await supabase.rpc("wh40k_set_loadout", { _id: s.id, _loadout: clean(gear) });
    setBusy(false);
    if (error) { toast.error("No se pudo guardar el armamento"); return; }
    toast.success("Armamento guardado");
    ["wh40k-squads", "wh40k-squad-history"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }
  const { data: photo } = useQuery({
    queryKey: ["squad-photo", s.photo_path], enabled: !!s.photo_path, staleTime: 50 * 60 * 1000,
    queryFn: async () => (await supabase.storage.from("portraits").createSignedUrl(s.photo_path!, 3600)).data?.signedUrl ?? null,
  });
  const img = photo ?? unitImage(faction, sheet?.kind);
  async function uploadPhoto(f?: File) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Elige una imagen"); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("La imagen no puede superar 5 MB"); return; }
    setBusy(true);
    const ext = (f.name.split(".").pop() || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
    const path = `${s.user_id}/units/${s.id}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("portraits").upload(path, f, { contentType: f.type });
    const res = up.error ? up : await supabase.rpc("wh40k_set_squad_photo", { _id: s.id, _path: path });
    setBusy(false);
    if (res.error) { toast.error("No se pudo subir la foto"); return; }
    if (s.photo_path) void supabase.storage.from("portraits").remove([s.photo_path]);
    toast.success("Foto guardada");
    qc.invalidateQueries({ queryKey: ["wh40k-squads"] });
  }
  async function removePhoto() {
    setBusy(true);
    const { error } = await supabase.rpc("wh40k_set_squad_photo", { _id: s.id, _path: null as unknown as string });
    setBusy(false);
    if (error) { toast.error("No se pudo quitar la foto"); return; }
    if (s.photo_path) void supabase.storage.from("portraits").remove([s.photo_path]);
    qc.invalidateQueries({ queryKey: ["wh40k-squads"] });
  }
  const lostModels = s.models - s.models_alive;
  const lostWounds = s.wounds_max != null && s.wounds_left != null ? s.wounds_max - s.wounds_left : 0;

  async function rpc(fn: "wh40k_rename_squad" | "wh40k_restore_squad" | "wh40k_retrain_squad" | "wh40k_dismiss_squad", ok: string) {
    setBusy(true);
    const { error } = fn === "wh40k_rename_squad" ? await supabase.rpc(fn, { _id: s.id, _name: name.trim() }) : await supabase.rpc(fn, { _id: s.id });
    setBusy(false);
    if (error) { toast.error(error.message.includes('cargo full') ? 'Bodega llena: amplía la capacidad OC en Nave' : error.message.includes('OC unavailable') ? 'Faltan datos OC verificables para reservar espacio' : error.message.includes("credits") ? "No tienes créditos suficientes" : "No se pudo completar"); return; }
    toast.success(ok);
    ["wh40k-squads", "wh40k-squad-history", "wh40k-recruits", "profile", "ship"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }

  return (
    <div className={`border ${s.status === "fallen" ? "border-destructive/60 opacity-80" : "border-border"} bg-card`}>
      <div className="relative">
        {img && <img src={img} alt={s.unit_name} loading="lazy" width={768} height={512} className={`h-40 w-full object-cover ${s.status === "fallen" ? "grayscale" : ""}`} />}
        <div className="absolute right-2 top-2 flex gap-1 text-[10px] uppercase">
          <label className={`cursor-pointer border border-border bg-background/80 px-2 py-1 hover:border-primary ${busy ? "pointer-events-none opacity-40" : ""}`}>
            {s.photo_path ? "Cambiar foto" : "Subir foto"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {s.photo_path && <button disabled={busy} onClick={removePhoto} className="border border-border bg-background/80 px-2 py-1 hover:border-destructive disabled:opacity-40">Quitar</button>}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-background/80 px-3 py-1">
          <div className="text-sm text-primary">{s.nickname || s.unit_name}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.unit_name} · {s.points} pts · {STATUS_ES[s.status] ?? s.status}{s.ready_at && s.status !== "ready" && s.status !== "fallen" ? ` hasta ${fmt(s.ready_at)}` : ""}</div>
        </div>
      </div>
      <div className="space-y-3 p-3 text-xs">
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Nombre de la unidad" className="flex-1 border border-border bg-background px-2 py-1" />
          <button disabled={busy || name.trim() === s.nickname} onClick={() => rpc("wh40k_rename_squad", "Nombre guardado")} className="border border-border px-2 hover:border-primary disabled:opacity-40">Guardar</button>
        </div>

        <div>
          <div className="mb-1 text-muted-foreground">Miniaturas: {s.models_alive}/{s.models}</div>
          <div className="flex flex-wrap gap-0.5">{Array.from({ length: s.models }, (_, i) => <span key={i} className={`h-3 w-3 border ${i < s.models_alive ? "border-primary bg-primary" : "border-destructive"}`} />)}</div>
        </div>
        {s.wounds_max != null && (
          <div>
            <div className="mb-1 text-muted-foreground">Heridas: {s.wounds_left}/{s.wounds_max}</div>
            <div className="h-2 w-full border border-border"><div className="h-full bg-primary" style={{ width: `${((s.wounds_left ?? 0) / s.wounds_max) * 100}%` }} /></div>
          </div>
        )}

        {sheet && (
          <details>
            <summary className="cursor-pointer text-primary">Ficha y armamento</summary>
            <table className="mt-2 w-full text-left">
              <thead className="text-muted-foreground"><tr><th>Modelo</th><th>M</th><th>R</th><th>Sv</th><th>H</th><th>L</th><th>CO</th></tr></thead>
              <tbody>{sheet.models.map((m) => <tr key={m.name} className="border-t border-border"><td>{m.name}</td><td>{m.M}</td><td>{m.T}</td><td>{m.Sv}{m.inv ? ` (${m.inv}++)` : ""}</td><td>{m.W}</td><td>{m.Ld}</td><td>{m.OC}</td></tr>)}</tbody>
            </table>
            <table className="mt-2 w-full text-left">
              <thead className="text-muted-foreground"><tr><th>Equipada</th><th>Arma</th><th>Alc</th><th>A</th><th>HP/HA</th><th>F</th><th>FP</th><th>D</th></tr></thead>
              <tbody>{sheet.weapons.map((w, i) => <tr key={w.name + i} className={`border-t border-border ${(gear[w.name] ?? 0) > 0 ? "text-primary" : ""}`} title={w.traits}><td><input type="number" min={0} max={100} value={gear[w.name] ?? 0} onChange={(e) => setGear({ ...gear, [w.name]: Math.max(0, Math.min(100, Math.trunc(Number(e.target.value) || 0))) })} className="w-12 border border-border bg-background px-1" aria-label={`Cantidad de ${w.name}`} /></td><td>{w.name}</td><td>{w.range === "Melee" ? "CaC" : `${w.range}"`}</td><td>{w.A}</td><td>{w.skill}+</td><td>{w.S}</td><td>{w.AP}</td><td>{w.D}</td></tr>)}</tbody>
            </table>
            <div className="mt-2 flex items-center gap-2">
              <button disabled={busy || !gearDirty} onClick={saveGear} className="border border-primary px-2 py-1 text-primary hover:bg-accent disabled:opacity-40">Guardar armamento</button>
              <span className="text-muted-foreground">Indica cuántas copias de cada arma lleva la unidad.</span>
            </div>
          </details>
        )}
        {equipped.length > 0 && <div><span className="text-muted-foreground">Armamento: </span>{equipped.map(([n, c]) => `${c}× ${n}`).join(", ")}</div>}

        <div className="flex flex-wrap gap-2">
          {s.status === "damaged" && <button disabled={busy} onClick={() => rpc("wh40k_restore_squad", "Reparación en marcha")} className="border border-primary px-2 py-1 text-primary hover:bg-accent disabled:opacity-40">{lostWounds && !lostModels ? "Reparar" : "Reponer bajas"}</button>}
          {s.status === "fallen" && <button disabled={busy} onClick={() => rpc("wh40k_retrain_squad", "Reentrenamiento en marcha")} className="border border-primary px-2 py-1 text-primary hover:bg-accent disabled:opacity-40">Reentrenar (75% de su coste)</button>}
          <button disabled={busy} onClick={() => confirm(`¿Licenciar ${s.nickname || s.unit_name}? No se devuelven créditos.`) && rpc("wh40k_dismiss_squad", "Unidad licenciada")} className="ml-auto text-muted-foreground hover:text-destructive">Licenciar</button>
        </div>

        <details>
          <summary className="cursor-pointer text-muted-foreground">Historial ({history.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {history.map((h) => (
              <li key={h.id} className="border-l border-border pl-2">
                <span className="text-muted-foreground">{fmt(h.created_at)}</span> · {HISTORY_ES[h.kind] ?? h.kind}
                {h.models_lost > 0 && ` · −${h.models_lost} miniaturas`}{h.wounds_lost > 0 && ` · −${h.wounds_lost} heridas`}{h.cost > 0 && ` · ${h.cost} cr`}{h.note && ` · ${h.note}`}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
