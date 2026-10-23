import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function incomeRemaining(nextAt: string, serverAt: string, elapsedMs: number) {
  return Math.max(0, new Date(nextAt).getTime() - new Date(serverAt).getTime() - elapsedMs);
}

export const dailyIncomeQuery = queryOptions({
  queryKey: ["daily-income"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("daily_income_status");
    if (error) throw error;
    return { status: data?.[0] ?? null, receivedAt: Date.now() };
  },
});