import { CAMPAIGN_FORCES, FORCE_CLASSES, FORCE_NAMES, regionForce } from '@/lib/campaign-forces';
import { CELLS } from '@/lib/planet';

export function CampaignLegend({ regions, players }: { regions: { owner_id: string | null }[]; players: { id: string; army_faction: string | null }[] }) {
  const displayed = regions.length ? regions : CELLS.map(() => ({ owner_id: null }));
  const total = displayed.length || 1;
  return <div className="grid grid-cols-2 gap-2 text-xs xl:grid-cols-4">
    {[...CAMPAIGN_FORCES, 'neutral' as const].map(force => <div key={force} className={FORCE_CLASSES[force]}>
      <span aria-hidden="true">■ </span>{FORCE_NAMES[force]} {Math.round(100 * displayed.filter(r => regionForce(r.owner_id, players) === force).length / total)} %
    </div>)}
  </div>;
}