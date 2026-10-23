import { useEffect, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Coins, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { dailyIncomeQuery, incomeRemaining } from "@/lib/daily-income";

export function DailyIncome() {
  const { data } = useSuspenseQuery(dailyIncomeQuery);
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!data.status) return null;
  const remaining = incomeRemaining(data.status.next_collection_at, data.status.server_now, Math.max(0, now - data.receivedAt));
  const seconds = Math.ceil(remaining / 1000);
  const countdown = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((n) => String(n).padStart(2, "0")).join(":");
  async function collect() {
    if (busy) return;
    setBusy(true);
    try {
      const { data: amount, error } = await supabase.rpc("collect_daily_income");
      if (error) { toast.error(error.message); return; }
      toast.success(`Recolectados ${amount} Créditos Imperiales`);
    } finally {
      await Promise.all([qc.invalidateQueries({ queryKey: ["daily-income"] }), qc.invalidateQueries({ queryKey: ["profile"] }), qc.invalidateQueries({ queryKey: ["ship"] })]);
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs">
      <span className="text-muted-foreground">Ingreso diario <span className="text-primary">+{data.status.amount} cr</span></span>
      {remaining === 0 ? <Button size="sm" onClick={collect} disabled={busy}><Coins className="size-4" />{busy ? "Recolectando…" : "Recolectar créditos"}</Button> :
        <span className="inline-flex items-center gap-2 text-muted-foreground"><Clock className="size-4" />Próxima recogida <span className="font-mono tabular-nums text-primary">{countdown}</span></span>}
    </div>
  );
}