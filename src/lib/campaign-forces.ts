import { get40kFaction } from '@/lib/warhammer40k-factions';

export const CAMPAIGN_FORCES = ['order', 'chaos', 'incursors'] as const;
export type CampaignForce = typeof CAMPAIGN_FORCES[number];
export const FORCE_NAMES = { order: 'Fuerzas del Orden', chaos: 'Fuerzas del Caos', incursors: 'Incursores', neutral: 'Neutral' } as const;
export const FORCE_CLASSES = { order: 'text-campaign-order', chaos: 'text-campaign-chaos', incursors: 'text-campaign-incursors', neutral: 'text-campaign-neutral' } as const;
export function campaignForce(faction: string | null | undefined): CampaignForce | null {
  const group = get40kFaction(faction ?? '')?.group;
  return group === 'imperium' ? 'order' : group === 'chaos' ? 'chaos' : group === 'xenos' ? 'incursors' : null;
}
export function regionForce(ownerId: string | null, players: { id: string; army_faction: string | null }[]) {
  return ownerId ? campaignForce(players.find(p => p.id === ownerId)?.army_faction) : 'neutral';
}
/** Canvas tints need resolved hex colors rather than CSS variable references. */
export function campaignColor(force: CampaignForce | 'neutral' | null): string {
  if (!force || typeof document === 'undefined') return 'transparent';
  return getComputedStyle(document.documentElement).getPropertyValue(`--campaign-${force}`).trim() || 'transparent';
}