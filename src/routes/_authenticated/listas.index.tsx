import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { profileQuery } from "@/lib/profile";
import { listsQuery } from "@/lib/legions/queries";
import { patrolsQuery, pointsQuery, recruitsQuery, type Saved40kList } from "@/lib/wh40k-queries";
import { importRoster, isPlayable, requirements, type Roster } from "@/lib/wh40k-lists";
import { importPatrol, patrolsFor } from "@/lib/wh40k-patrols";
import { get40kFaction } from "@/lib/warhammer40k-factions";

export const Route = createFileRoute("/_authenticated/listas/")({
  head: () => ({
    meta: [
      { title: "Listas de ejército — Atalaya" },
      { name: "description", content: "Importa tus listas de Warhammer 40.000 y patrullas de combate desde la app oficial y mira qué te falta reclutar." },
      { property: "og:title", content: "Listas de ejército — Atalaya" },
      { property: "og:description", content: "Importa listas de la app oficial y prepáralas para la batalla." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: async ({ context }) => {
    const p = await context.queryClient.ensureQueryData(profileQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(listsQuery),
      context.queryClient.ensureQueryData(recruitsQuery),
      context.queryClient.ensureQueryData(pointsQuery(p.profile?.army_faction ?? "")),
    ]);
  },
  component: Listas,
});

function Listas() {
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data: lists } = useSuspenseQuery(listsQuery);
  const { data: recruits } = useSuspenseQuery(recruitsQuery);
  const faction = prof.profile?.army_faction ?? "";
  const { data: points } = useSuspenseQuery(pointsQuery(faction));
  const { data: patrols } = useQuery(patrolsQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [kind, setKind] = useState<"normal" | "patrulla">("normal");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const mine = (lists as unknown as Saved40kList[]).filter((l) => l.game_system === "40k");
  const myRecruits = recruits.filter((r) => r.faction === faction);
  const fname = get40kFaction(faction)?.name ?? "tu facción";

  async function insert(row: { name: string; points: number; roster: Roster | Record<string, unknown> }) {
    const { data, error } = await supabase.from("army_lists").insert({
      name: row.name, points: row.points, roster: row.roster as never, mode: "coleccion",
      user_id: prof.user.id, game_system: "40k", army_faction: faction, list_format: kind,
    }).select("id").single();
    if (error) { toast.error("No se pudo guardar la lista"); return; }
    await qc.invalidateQueries({ queryKey: ["lists"] });
    toast.success("Lista importada");
    navigate({ to: "/listas/$id", params: { id: data.id } });
  }

  function doImport() {
    if (kind === "patrulla") {
      const r = importPatrol(text, patrolsFor(patrols ?? [], faction), points.units.map((u) => u.name));
      if (!r) { toast.error(`No he reconocido ninguna patrulla de ${fname} en el texto`); return; }
      insert({ name: name.trim() || r.name || r.patrol.name, points: 500, roster: r.roster });
      return;
    }
    const r = importRoster(text, points);
    if (!r.roster.units.length) { toast.error(`No he reconocido unidades de ${fname} en el texto`); return; }
    if (r.unknown.length) toast.warning(`No reconocidas: ${r.unknown.slice(0, 5).join(", ")}`);
    insert({ name: name.trim() || r.name || "Lista importada", points: r.points ?? 2000, roster: r.roster });
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar esta lista?")) return;
    await supabase.from("army_lists").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["lists"] });
  }

  if (!faction) return <CommandShell isAdmin={prof.isAdmin}><Panel title="Sin ejército"><p>Elige tu raza y facción primero.</p><Link to="/juramento" className="text-primary">Ir al juramento →</Link></Panel></CommandShell>;

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{fname}</p>
      <h1 className="mb-4 text-2xl text-primary glow">Listas de ejército</h1>
      <div className="grid gap-6 md:grid-cols-[360px_1fr]">
        <Panel title="Importar de la app oficial">
          <div className="mb-3 grid grid-cols-2 gap-2">
            {([["normal", "Lista normal"], ["patrulla", "Patrulla de combate"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setKind(k)} className={`border p-2 text-xs ${kind === k ? "border-primary bg-accent text-primary" : "border-border"}`}>{l}</button>
            ))}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            En la app oficial de Warhammer 40.000 abre tu {kind === "patrulla" ? "patrulla" : "lista"}, usa «Exportar lista» como texto y pégalo aquí. Solo se aceptan listas de {fname}.
          </p>
          <label className="block text-xs uppercase text-muted-foreground">Nombre de la lista</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Si lo dejas vacío, uso el del texto" className="mb-2 w-full border border-border bg-background px-3 py-2 text-sm" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} className="w-full border border-border bg-background p-2 text-xs" placeholder={kind === "patrulla" ? "Combat Patrol: ..." : "Mi lista (2000 Points)..."} />
          <button onClick={doImport} disabled={!text.trim()} className="mt-2 w-full border border-primary px-3 py-2 text-xs uppercase text-primary hover:bg-accent disabled:opacity-40">Importar {kind === "patrulla" ? "patrulla" : "lista"}</button>
          <Link to="/reclutar" className="mt-3 block text-center text-xs text-muted-foreground hover:text-primary">Reclutamiento →</Link>
        </Panel>
        <Panel title="Tus listas">
          {!mine.length && <p className="text-sm text-muted-foreground">&gt; Aún no has importado ninguna lista.</p>}
          <ul className="space-y-2">
            {mine.map((l) => {
              const reqs = requirements((l.roster ?? { units: [] }) as Roster, myRecruits);
              const ok = isPlayable(reqs);
              const left = reqs.reduce((a, r) => a + Math.max(0, r.need - r.have), 0);
              return (
                <li key={l.id} className={`flex items-center justify-between gap-2 border p-3 ${ok ? "border-primary/60" : "border-border"}`}>
                  <Link to="/listas/$id" params={{ id: l.id }} className="flex-1 hover:text-primary">
                    <div>{l.name}</div>
                    <div className="text-xs text-muted-foreground">{l.list_format === "patrulla" ? "Patrulla de combate" : `${l.points} pts`} · {reqs.reduce((a, r) => a + r.need, 0)} unidades</div>
                    <div className={`text-xs ${ok ? "text-primary" : "text-destructive"}`}>{ok ? "✔ Jugable" : `✖ Faltan ${left} por reclutar`}</div>
                  </Link>
                  <button onClick={() => remove(l.id)} className="text-xs text-muted-foreground hover:text-destructive">Borrar</button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </CommandShell>
  );
}
