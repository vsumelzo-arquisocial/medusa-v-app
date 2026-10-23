import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Dices, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { attackResolutionQuery, consentState } from "@/lib/attack-resolution";

export function AttackResolution({ gameId, me }: { gameId: string; me: string }) {
  const { data } = useQuery(attackResolutionQuery(gameId));
  const qc = useQueryClient();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const { attack, region } = data;
  const state = consentState(attack, me, region.is_spaceport);
  if (!state.eligible) return null;

  async function confirm(agree: boolean) {
    setBusy(true);
    try {
      const { data: result, error } = await supabase.rpc("confirm_attack_auto_resolution", { _attack: attack.id, _confirm: agree });
      if (error) { toast.error(error.message); return; }
      toast.success(result === "pendiente" ? "Confirmación enviada: falta la del rival" : result === "rechazada" ? "Propuesta retirada; el ataque continúa" : result === "acuerdo_atacante" ? "El azar da la victoria al atacante" : "El azar da la victoria al defensor");
      await Promise.all(["attack-resolution", "campaign", "games", "profile", "strategos", "logros"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
    } finally { setBusy(false); setDialog(false); }
  }

  return <section aria-label={`Resolución de ${region.name}`} className="mt-3 space-y-2 border-t border-border pt-3 text-xs">
    <p className="text-primary">{region.name} · Resolución por acuerdo</p>
    <p className="text-muted-foreground">{state.mine ? "Has confirmado. Esperando al rival." : state.other ? "Tu rival propone resolver este ataque al azar." : "Sin propuesta de resolución."}</p>
    <div className="flex flex-wrap gap-2">
      {!state.mine && <Button variant="outline" size="sm" disabled={busy} onClick={() => setDialog(true)}><Dices />{state.other ? "Aceptar resolución" : "Proponer auto resolver"}</Button>}
      {(state.mine || state.other) && <Button variant="ghost" size="sm" disabled={busy} onClick={() => confirm(false)}><X />{state.mine ? "Retirar propuesta" : "Rechazar propuesta"}</Button>}
    </div>
    <AlertDialog open={dialog} onOpenChange={setDialog}>
      <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <AlertDialogTitle>¿Resolver {region.name} al azar?</AlertDialogTitle>
        <AlertDialogDescription>{state.other ? "Al confirmar se decide inmediatamente el ganador y se cierra este ataque." : "Tu rival deberá confirmar también; hasta entonces el ataque continúa."} Se mantienen las ventajas por regiones repetidas. No hay bajas, Renombre ni honores de batalla. Si gana el atacante, conquista la región y recibe los créditos de conquista.</AlertDialogDescription>
        <AlertDialogFooter><AlertDialogCancel>Volver</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void confirm(true); }}><Check />Confirmar</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}