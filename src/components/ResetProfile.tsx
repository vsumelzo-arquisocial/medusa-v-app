import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function ResetProfile() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function go() {
    setBusy(true);
    const { error } = await supabase.rpc("reset_profile");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries();
    navigate({ to: "/juramento" });
  }
  if (!open) return <button onClick={() => setOpen(true)} className="mt-4 w-full border border-destructive/60 px-2 py-1 text-[10px] uppercase tracking-widest text-destructive hover:bg-destructive/10">Reiniciar perfil</button>;
  return (
    <div className="mt-4 border border-destructive p-3 text-xs">
      <p className="font-display text-sm text-destructive">⚠ Acción irreversible</p>
      <p className="mt-1 text-muted-foreground">Se borrará todo tu progreso: nave, módulos, unidades y armamento, colas de trabajos y reclutamiento, historiales personales, listas y territorios. Tus batallas pendientes se cancelarán. Créditos y renombre vuelven al inicio y deberás elegir de nuevo raza, facción y variante. Tu cuenta, aprobación y permisos se conservan; los resultados compartidos de partidas terminadas permanecen para tus rivales.</p>
      <p className="mt-2">Escribe <b className="text-destructive">REINICIAR</b> para confirmar:</p>
      <input value={text} onChange={(e) => setText(e.target.value)} className="mt-1 w-full border border-border bg-background px-2 py-1" />
      <div className="mt-2 flex gap-2">
        <button disabled={text !== "REINICIAR" || busy} onClick={go} className="flex-1 bg-destructive px-2 py-1 uppercase text-destructive-foreground disabled:opacity-40">Borrar todo</button>
        <button onClick={() => { setOpen(false); setText(""); }} className="flex-1 border border-border px-2 py-1 uppercase">Cancelar</button>
      </div>
    </div>
  );
}
