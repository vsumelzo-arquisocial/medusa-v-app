import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { Requirements } from "@/components/wh40k/Requirements";
import { profileQuery } from "@/lib/profile";
import { listQuery } from "@/lib/legions/queries";
import { patrolsQuery, pointsQuery, recruitsQuery, type Saved40kList } from "@/lib/wh40k-queries";
import { exportRoster, requirements, type Roster } from "@/lib/wh40k-lists";
import { exportPatrol, patrolSelection, type PatrolChoice } from "@/lib/wh40k-patrols";
import { get40kFaction } from "@/lib/warhammer40k-factions";

export const Route = createFileRoute("/_authenticated/listas/$id")({
  head: () => ({
    meta: [
      { title: "Lista de ejército — Atalaya" },
      { name: "description", content: "Revisa las unidades de tu lista importada y lo que te falta reclutar para jugarla." },
      { property: "og:title", content: "Lista de ejército — Atalaya" },
      { property: "og:description", content: "Unidades de la lista y estado de reclutamiento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(profileQuery),
    context.queryClient.ensureQueryData(recruitsQuery),
    context.queryClient.ensureQueryData(listQuery(params.id)),
  ]),
  component: ListPage,
});

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "lista"}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ListPage() {
  const { id } = Route.useParams();
  const { data: prof } = useSuspenseQuery(profileQuery);
  const { data: raw } = useSuspenseQuery(listQuery(id));
  const { data: recruits } = useSuspenseQuery(recruitsQuery);
  const list = raw as unknown as Saved40kList | null;
  const { data: points } = useQuery(pointsQuery(list?.army_faction ?? ""));
  const { data: patrols } = useQuery(patrolsQuery);
  const qc = useQueryClient();
  const [name, setName] = useState(list?.name ?? "");
  if (!list || list.game_system !== "40k") return <CommandShell isAdmin={prof.isAdmin}><Panel title="Lista no encontrada"><Link to="/listas" className="text-primary">← Listas</Link></Panel></CommandShell>;

  const roster = (list.roster ?? { units: [] }) as Roster & Partial<PatrolChoice>;
  const reqs = requirements(roster, recruits.filter((r) => r.faction === list.army_faction));
  const fname = get40kFaction(list.army_faction ?? "")?.name ?? "";
  const patrol = list.list_format === "patrulla" ? patrols?.find((p) => p.id === roster.patrolId) : undefined;
  const sel = patrol ? patrolSelection(patrol, roster as PatrolChoice) : null;

  async function rename() {
    const { error } = await supabase.from("army_lists").update({ name: name.trim() || list!.name, updated_at: new Date().toISOString() }).eq("id", list!.id);
    if (error) { toast.error("No se pudo guardar el nombre"); return; }
    toast.success("Nombre guardado");
    qc.invalidateQueries({ queryKey: ["lists"] });
  }
  function exportText() {
    if (patrol) download(name, exportPatrol(name, fname, patrol, roster as PatrolChoice));
    else if (points) download(name, exportRoster(name, fname, list!.points, roster, points));
  }

  return (
    <CommandShell isAdmin={prof.isAdmin}>
      <Link to="/listas" className="text-xs text-muted-foreground hover:text-primary">← Listas</Link>
      <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{fname} · {list.list_format === "patrulla" ? "Patrulla de combate" : `${list.points} puntos`}</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre de la lista" className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-xl text-primary" />
        <button onClick={rename} className="border border-primary px-3 py-2 text-xs uppercase text-primary hover:bg-accent">Guardar nombre</button>
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <Panel title="Unidades de la lista">
          <Requirements reqs={reqs} />
        </Panel>
        <div className="space-y-4">
          {patrol && (
            <Panel title={patrol.name}>
              {patrol.warlord && <p className="mb-1 text-xs"><span className="text-muted-foreground">Señor de la guerra:</span> {patrol.warlord}</p>}
              {sel?.enhancement && <p className="mb-1 text-xs"><span className="text-muted-foreground">Mejora:</span> {sel.enhancement.name}</p>}
              {sel?.objective && <p className="text-xs"><span className="text-muted-foreground">Objetivo secundario:</span> {sel.objective.name}</p>}
            </Panel>
          )}
          {!!roster.detachments?.length && <Panel title="Destacamentos"><p className="text-xs">{roster.detachments.join(", ")}</p></Panel>}
          <Panel title="Acciones">
            <button onClick={exportText} className="mb-2 w-full border border-border px-3 py-2 text-xs uppercase hover:border-primary">Exportar texto</button>
            <Link to="/listas/$id/imprimir" params={{ id: list.id }} className="block w-full border border-border px-3 py-2 text-center text-xs uppercase hover:border-primary">Imprimir</Link>
            <Link to="/reclutar" className="mt-2 block w-full border border-primary px-3 py-2 text-center text-xs uppercase text-primary hover:bg-accent">Reclutar lo que falta</Link>
          </Panel>
        </div>
      </div>
    </CommandShell>
  );
}
