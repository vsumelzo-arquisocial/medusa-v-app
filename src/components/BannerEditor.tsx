import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/Terminal";
import { emblemsFor, emblemsFor40k } from "@/lib/emblems";
import { EmblemIcon } from "@/components/EmblemIcon";
import type { Allegiance } from "@/lib/factions";

/** Shrinks an uploaded image to a 128px square PNG data URL. */
function toEmblem(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d")!;
      const s = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL("image/png"));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

export function BannerEditor({ color, emblem, side, legion, faction, armyFaction, armyVariant }: { color: string; emblem: string; side: Allegiance; legion?: string | null; faction?: string | null; armyFaction?: string | null; armyVariant?: string | null }) {
  const qc = useQueryClient();
  const list = armyFaction ? emblemsFor40k(armyFaction, armyVariant) : emblemsFor(side, legion, faction);
  const valid = emblem.startsWith("data:image") || list.some((x) => x.id === emblem);
  const [open, setOpen] = useState(!valid);
  const [c, setC] = useState(color);
  // Players who chose a Warhammer 40.000 army have no legacy allegiance, so the list can be empty.
  const [e, setE] = useState(valid ? emblem : (list[0]?.id ?? (emblem || "aquila")));
  async function upload(f?: File) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Elige una imagen"); return; }
    try { setE(await toEmblem(f)); } catch { toast.error("No se pudo leer la imagen"); }
  }
  async function save() {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ map_color: c, map_emblem: e }).eq("id", u.user!.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Estandarte actualizado");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["campaign"] });
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["strategos"] });
  }
  const preview = (
    <div className="grid h-20 w-20 shrink-0 place-items-center border-2" style={{ borderColor: c, background: `color-mix(in oklab, ${c} 18%, transparent)` }}>
      <EmblemIcon id={e} color={c} size={64} />
    </div>
  );
  if (!open) return (
    <Panel title="Tu estandarte en Medusa V">
      <div className="flex items-center gap-4">
        {preview}
        <button onClick={() => setOpen(true)} className="ml-auto border border-primary px-3 py-2 text-xs uppercase text-primary">Cambiar estandarte</button>
      </div>
    </Panel>
  );
  return (
    <Panel title="Tu estandarte en Medusa V">
      <div className="flex flex-wrap items-center gap-4">
        {preview}
        <label className="text-xs text-muted-foreground">Color
          <input type="color" value={c} onChange={(x) => setC(x.target.value)} aria-label="Color" className="mt-1 block h-10 w-16 border border-border bg-background" />
        </label>
        <label className="cursor-pointer border border-border px-3 py-2 text-xs uppercase hover:border-primary">
          Subir imagen propia
          <input type="file" accept="image/*" className="hidden" onChange={(x) => upload(x.target.files?.[0])} />
        </label>
        <div className="ml-auto flex gap-2">
          {valid && <button onClick={() => { setC(color); setE(emblem); setOpen(false); }} className="border border-border px-3 py-2 text-xs uppercase">Cancelar</button>}
          <button onClick={save} className="border border-primary px-3 py-2 text-xs uppercase text-primary">Guardar</button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-1 sm:grid-cols-12">
        {list.map((x) => (
          <button key={x.id} title={x.name} onClick={() => setE(x.id)} className={`aspect-square border p-1 ${x.id === e ? "border-primary bg-accent" : "border-border"}`}>
            <img src={x.src} alt={x.name} className="h-full w-full object-contain" loading="lazy" />
          </button>
        ))}
      </div>
    </Panel>
  );
}
