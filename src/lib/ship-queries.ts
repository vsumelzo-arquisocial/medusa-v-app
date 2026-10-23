import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export interface ShipStatus { max_hull: number; capacity: number; used_oc: number; unknown_oc: number; protected_credits: number; exposed_credits: number; recruitment_reduction: number; busy: boolean; server_now: string }
export const shipQuery = queryOptions({
  queryKey: ['ship'], refetchInterval: 30000,
  queryFn: async () => {
    const status = await supabase.rpc('ship_status');
    if (status.error) throw status.error;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? '';
    const [ship, modules, types, queue] = await Promise.all([
      supabase.from('ships').select('*').eq('user_id',uid).maybeSingle(),
      supabase.from('ship_modules').select('*').eq('user_id',uid),
      supabase.from('module_types').select('*').eq('active',true).order('sort'),
      supabase.from('build_queue').select('*').eq('user_id',uid).order('created_at').order('sequence'),
    ]);
    for (const result of [ship, modules, types, queue]) if (result.error) throw result.error;
    return { ship: ship.data, modules: modules.data ?? [], types: types.data ?? [], queue: queue.data ?? [], status: status.data as unknown as ShipStatus };
  },
});