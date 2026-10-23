import { Hammer, Wrench, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { moduleName } from '@/lib/ship-identity';
import type { Database } from '@/integrations/supabase/types';

type Job = Database['public']['Tables']['build_queue']['Row'];
type Fleet = Parameters<typeof moduleName>[1];
export function ShipWorkQueue({ jobs, identity, disabled, onCancel }: { jobs: Job[]; identity: Fleet; disabled: boolean; onCancel: (id: string) => void }) {
  return <section className="border-t border-border py-5" aria-label="Cola de trabajos">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl text-primary">Astillero · cola de trabajos</h2><span className={jobs.length >= 5 ? 'text-destructive' : 'text-muted-foreground'}>{jobs.length}/5 · {jobs.some(j => j.started_at) ? '1 en curso' : 'Sin trabajo activo'}</span></div>
    {!jobs.length && <p className="text-sm text-muted-foreground">Sin trabajos pendientes.</p>}
    <ol className="space-y-2 text-sm">{jobs.map((job, index) => <li key={job.id} className={`flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 ${job.started_at ? 'border-l-2 border-l-primary pl-3' : ''}`}>
      <div className="flex min-w-0 items-start gap-3"><span className="text-muted-foreground">{index + 1}.</span>{job.kind === 'build' ? <Hammer size={18} className="shrink-0 text-primary"/> : <Wrench size={18} className="shrink-0 text-primary"/>}<div>
        <p className="text-primary">{job.kind === 'hull_repair' ? `Reparar casco · +${job.repair_amount} PV` : `${job.kind === 'module_repair' ? 'Reparar' : 'Construir / mejorar'} ${moduleName(job.module, identity)}${job.kind === 'build' ? ` → N${job.target_level}` : ''}`}</p>
        <p className="mt-1 text-xs text-muted-foreground">{job.started_at && job.finishes_at ? `En curso · termina ${new Date(job.finishes_at).toLocaleString('es-ES', {dateStyle: 'short', timeStyle: 'short'})}` : 'En espera'} · {job.cost > 0 ? `${job.cost} cr pagados` : 'Trabajo previo pagado'}</p>
      </div></div>
      {!job.started_at && <Button variant="ghost" size="icon" title="Cancelar trabajo y devolver créditos" aria-label={`Cancelar trabajo ${index + 1}`} disabled={disabled} onClick={() => onCancel(job.id)}><X size={18}/></Button>}
    </li>)}</ol>
  </section>;
}