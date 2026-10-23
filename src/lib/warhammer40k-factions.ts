import catalogue from '@/data/warhammer40k/factions.json';
export type FactionGroup = 'imperium' | 'chaos' | 'xenos';
export const WH40K_CATALOGUE = catalogue;
export const WH40K_FACTIONS = catalogue.factions;
export const GROUP_NAMES = { imperium: 'Imperium', chaos: 'Caos', xenos: 'Xenos' } as const;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function searchFactions(query: string, group: FactionGroup | 'all' = 'all') {
 const term = normalize(query.trim());
 return WH40K_FACTIONS.filter(f => (group === 'all' || f.group === group) && normalize([f.name, f.officialName, ...f.variants.map(v => v.name), ...f.detachments.map(d => d.name)].join(' ')).includes(term));
}
export const get40kFaction = (id: string) => WH40K_FACTIONS.find(f => f.id === id);
