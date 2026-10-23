import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery } from "@/lib/profile";
import { CommandShell } from "@/components/CommandShell";
import { Panel } from "@/components/Terminal";
import { Button } from "@/components/ui/button";
import { RACES, factionsForRace, armySelectionSchema, armySelectionLabels } from "@/lib/warhammer40k-onboarding";
import { get40kFaction } from "@/lib/warhammer40k-factions";

export const Route = createFileRoute("/_authenticated/juramento")({
  head: () => ({ meta: [{ title: "Elige tu ejército — Atalaya 40.000" }, { name: "description", content: "Elige raza, facción y capítulo o variante oficial de tu ejército de Warhammer 40.000." }, { property: "og:title", content: "Elige tu ejército — Atalaya 40.000" }, { property: "og:description", content: "Define tu ejército, su comandante y su identidad." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  component: ArmySetup,
});
const field = "mt-2 w-full border border-input bg-background px-3 py-2 text-foreground outline-none focus:border-primary";
const choice = (selected: boolean) => `h-auto min-h-16 justify-start whitespace-normal rounded-none p-4 text-left ${selected ? "border-primary bg-accent text-primary glow-box" : "border-border"}`;

function ArmySetup() {
  const { data } = useSuspenseQuery(profileQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [race, setRace] = useState<string | null>(null);
  const [faction, setFaction] = useState<string | null>(null);
  const [variant, setVariant] = useState<string | null>(null);
  const [variantChosen, setVariantChosen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [leader, setLeader] = useState(data.profile?.leader_name ?? "");
  const [force, setForce] = useState(data.profile?.force_name ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!data.profile?.approved) return <Navigate to="/puente" />;
  if (data.profile.oath_sworn_at && data.profile.army_faction) return <Navigate to="/puente" />;
  const selectedFaction = get40kFaction(faction ?? "");
  const hasVariants = !!selectedFaction?.variants.length;
  const steps = ["Raza", "Facción", ...(hasVariants ? ["Variante"] : []), "Retrato", "Nombre"];
  const current = steps[step];
  const labels = armySelectionLabels(race, faction, variant);
  const next = () => setStep(s => s + 1);

  async function saveArmy() {
    const selection = armySelectionSchema.safeParse({ race, faction, variant });
    if (!selection.success || !leader.trim() || !force.trim() || (!file && !data.profile?.portrait_path)) return;
    setBusy(true);
    try {
      let portraitPath = data.profile?.portrait_path ?? null;
      if (file) {
        const ext = file.type === "image/jpeg" ? "jpg" : "png";
        portraitPath = `${data.user.id}/leader-${Date.now()}.${ext}`;
        const upload = await supabase.storage.from("portraits").upload(portraitPath, file);
        if (upload.error) throw upload.error;
      }
      const { data: saved, error } = await supabase.from("profiles").update({
        army_race: selection.data.race, army_faction: selection.data.faction, army_variant: selection.data.variant,
        portrait_path: portraitPath, leader_name: leader.trim(), force_name: force.trim(),
        oath_sworn_at: data.profile?.oath_sworn_at ?? new Date().toISOString(),
      }).eq("id", data.user.id).select("army_faction").single();
      if (error) throw error;
      if (saved.army_faction !== faction) throw new Error("No se ha guardado la selección del ejército.");
      await qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Tu ejército está preparado.");
      await navigate({ to: "/puente" });
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar el ejército."); }
    finally { setBusy(false); }
  }
  return <CommandShell isAdmin={data.isAdmin}>
    <h1 className="mb-2 text-2xl text-primary glow">Elige tu ejército</h1>
    <p className="mb-6 text-xs uppercase text-muted-foreground">Warhammer 40.000</p>
    <ol className="mb-6 flex flex-wrap gap-2 text-[10px] uppercase">{steps.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} className={`border px-2 py-1 ${i === step ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{i + 1}. {s}</li>)}</ol>
    {current === "Raza" && <Panel title="Elige tu raza"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{RACES.map(r => <Button key={r.id} variant="outline" aria-pressed={race === r.id} className={choice(race === r.id)} onClick={() => { setRace(r.id); setFaction(null); setVariant(null); setVariantChosen(false); }}>{r.name}</Button>)}</div><Button disabled={!race} onClick={next} className="mt-6">Continuar</Button></Panel>}
    {current === "Facción" && race && <Panel title={`Facción · ${labels.race}`}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{factionsForRace(race).map(f => <Button key={f.id} variant="outline" aria-pressed={faction === f.id} className={choice(faction === f.id)} onClick={() => { setFaction(f.id); setVariant(null); setVariantChosen(false); }}>{f.name}</Button>)}</div><Button disabled={!faction} onClick={next} className="mt-6">Continuar</Button></Panel>}
    {current === "Variante" && selectedFaction && <Panel title={faction === "space-marines" ? "Elige tu capítulo" : "Elige tu variante"}><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Button variant="outline" className={choice(variantChosen && !variant)} onClick={() => { setVariant(null); setVariantChosen(true); }}>Sin variante · {selectedFaction.name}</Button>{selectedFaction.variants.map(v => <Button key={v.id} variant="outline" aria-pressed={variant === v.id} className={choice(variant === v.id)} onClick={() => { setVariant(v.id); setVariantChosen(true); }}>{v.name}</Button>)}</div><Button disabled={!variantChosen} onClick={next} className="mt-6">Continuar</Button></Panel>}
    {current === "Retrato" && <Panel title="Retrato de tu comandante"><label className="flex aspect-square w-56 max-w-full cursor-pointer items-center justify-center border-2 border-dashed border-primary bg-background text-center text-xs uppercase text-primary">{preview || data.portraitUrl ? <img src={preview ?? data.portraitUrl ?? undefined} alt="Comandante" className="h-full w-full object-cover" /> : <span>+<br />Elegir retrato<br /><span className="text-muted-foreground">JPG o PNG · máx. 5 MB</span></span>}<input type="file" accept="image/jpeg,image/png" className="sr-only" aria-label="Retrato del comandante" onChange={e => { const f = e.target.files?.[0]; if (!f) return; if (!["image/jpeg", "image/png"].includes(f.type) || f.size > 5 * 1024 * 1024) { toast.error("Elige un JPG o PNG de hasta 5 MB."); return; } setFile(f); }} /></label><Button disabled={!file && !data.profile.portrait_path} onClick={next} className="mt-6">Continuar</Button></Panel>}
    {current === "Nombre" && <Panel title="Identidad del ejército"><p className="mb-5 text-sm text-primary">{labels.race} · {labels.faction}{labels.variant ? ` · ${labels.variant}` : ""}</p><div className="space-y-4"><label className="block text-xs uppercase text-muted-foreground">Nombre del comandante<input value={leader} maxLength={60} onChange={e => setLeader(e.target.value)} className={field} /></label><label className="block text-xs uppercase text-muted-foreground">Nombre de tu fuerza<input value={force} maxLength={80} onChange={e => setForce(e.target.value)} className={field} /></label></div><Button disabled={busy || !leader.trim() || !force.trim()} onClick={saveArmy} className="mt-6">{busy ? "Guardando…" : "Confirmar ejército"}</Button></Panel>}
    {step > 0 && <Button variant="link" disabled={busy} onClick={() => setStep(s => s - 1)} className="mt-4 text-muted-foreground">← Volver</Button>}
  </CommandShell>;
}
