import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { BannerEditor } from "@/components/BannerEditor";
import { ResetProfile } from "@/components/ResetProfile";
import { profileQuery } from "@/lib/profile";
import { armySelectionLabels } from "@/lib/warhammer40k-onboarding";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({ meta: [
    { title: "Perfil — Atalaya" },
    { name: "description", content: "Cambia tu retrato, el nombre de tu comandante y de tu fuerza, tu estandarte o reinicia tu perfil." },
    { property: "og:title", content: "Perfil — Atalaya" },
    { property: "og:description", content: "Retrato, nombres, estandarte y reinicio del perfil." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  component: Perfil,
});

function Perfil() {
  const { data } = useSuspenseQuery(profileQuery);
  const p = data.profile;
  const qc = useQueryClient();
  const [leader, setLeader] = useState(p?.leader_name ?? "");
  const [force, setForce] = useState(p?.force_name ?? "");
  const [busy, setBusy] = useState(false);
  if (!p?.approved || !p.oath_sworn_at || !p.army_faction) return <Navigate to="/puente" />;
  const army = armySelectionLabels(p.army_race, p.army_faction, p.army_variant);

  async function saveNames() {
    if (!leader.trim() || !force.trim()) { toast.error("Los nombres no pueden quedar vacíos"); return; }
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ leader_name: leader.trim().slice(0, 60), force_name: force.trim().slice(0, 60) }).eq("id", data.user.id);
    setBusy(false);
    if (error) { toast.error("No se pudieron guardar los nombres"); return; }
    toast.success("Nombres guardados");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }
  async function uploadPortrait(f?: File) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Elige una imagen"); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("La imagen no puede superar 5 MB"); return; }
    setBusy(true);
    const ext = f.type === "image/jpeg" ? "jpg" : f.type === "image/webp" ? "webp" : "png";
    const path = `${data.user.id}/leader-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("portraits").upload(path, f, { contentType: f.type });
    const res = up.error ? up : await supabase.from("profiles").update({ portrait_path: path }).eq("id", data.user.id);
    setBusy(false);
    if (res.error) { toast.error("No se pudo subir la foto"); return; }
    if (p!.portrait_path) void supabase.storage.from("portraits").remove([p!.portrait_path]);
    toast.success("Foto actualizada");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  return (
    <CommandShell isAdmin={data.isAdmin}>
      <h1 className="mb-4 text-2xl text-primary glow">Perfil</h1>
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <Panel title="Retrato">
          {data.portraitUrl && <img src={data.portraitUrl} alt={p.leader_name ?? "Líder"} className="aspect-square w-full border border-border object-cover" />}
          <label className={`mt-3 block cursor-pointer border border-primary px-3 py-2 text-center text-xs uppercase text-primary hover:bg-accent ${busy ? "pointer-events-none opacity-40" : ""}`}>
            Cambiar foto
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { void uploadPortrait(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <p className="mt-3 text-xs uppercase text-primary">{army.race}</p>
          <p className="text-xs text-muted-foreground">{army.faction}{army.variant ? ` · ${army.variant}` : ""}</p>
        </Panel>
        <div className="space-y-4">
          <Panel title="Nombres">
            <label className="block text-xs text-muted-foreground">Comandante
              <input value={leader} onChange={(e) => setLeader(e.target.value)} maxLength={60} className="mt-1 w-full border border-border bg-background px-2 py-1 text-sm text-foreground" />
            </label>
            <label className="mt-3 block text-xs text-muted-foreground">Fuerza
              <input value={force} onChange={(e) => setForce(e.target.value)} maxLength={60} className="mt-1 w-full border border-border bg-background px-2 py-1 text-sm text-foreground" />
            </label>
            <button disabled={busy || (leader.trim() === p.leader_name && force.trim() === p.force_name)} onClick={saveNames} className="mt-3 border border-primary px-3 py-2 text-xs uppercase text-primary hover:bg-accent disabled:opacity-40">Guardar nombres</button>
          </Panel>
          <BannerEditor color={p.map_color ?? "#5fc8ff"} emblem={p.map_emblem ?? ""} side={p.allegiance as never} legion={p.legion} faction={p.faction} armyFaction={p.army_faction} armyVariant={p.army_variant} />
          <Panel title="Zona peligrosa"><ResetProfile /></Panel>
        </div>
      </div>
    </CommandShell>
  );
}
