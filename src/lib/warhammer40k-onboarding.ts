import { z } from 'zod';
import { get40kFaction, WH40K_FACTIONS } from '@/lib/warhammer40k-factions';

export const RACES = [
  { id: 'humanity', name: 'Humanidad', factions: ['space-marines', 'grey-knights', 'adepta-sororitas', 'adeptus-custodes', 'adeptus-mechanicus', 'astra-militarum', 'imperial-agents', 'imperial-knights', 'chaos-space-marines', 'chaos-knights', 'death-guard', 'emperors-children', 'thousand-sons', 'world-eaters'] },
  { id: 'daemons', name: 'Demonios', factions: ['chaos-daemons'] },
  { id: 'aeldari', name: 'Aeldari', factions: ['aeldari', 'drukhari'] },
  { id: 'tau', name: 'T’au', factions: ['tau-empire'] },
  { id: 'orks', name: 'Orkos', factions: ['orks'] },
  { id: 'necrons', name: 'Necrones', factions: ['necrons'] },
  { id: 'tyranids', name: 'Tiránidos', factions: ['tyranids', 'genestealer-cults'] },
  { id: 'votann', name: 'Votann', factions: ['leagues-of-votann'] },
] as const;

export const factionsForRace = (race: string) => {
  const entry = RACES.find(r => r.id === race);
  return WH40K_FACTIONS.filter(f => entry?.factions.some(id => id === f.id));
};
export const armySelectionSchema = z.object({ race: z.string(), faction: z.string(), variant: z.string().nullable() }).superRefine((value, ctx) => {
  const faction = factionsForRace(value.race).find(f => f.id === value.faction);
  if (!faction) ctx.addIssue({ code: 'custom', message: 'Elige una facción de esta raza.' });
  if (value.variant && !faction?.variants.some(v => v.id === value.variant)) ctx.addIssue({ code: 'custom', message: 'La variante no pertenece a esta facción.' });
});
export const armySelectionLabels = (race: string | null, faction: string | null, variant: string | null) => ({
  race: RACES.find(r => r.id === race)?.name ?? '—',
  faction: get40kFaction(faction ?? '')?.name ?? '—',
  variant: get40kFaction(faction ?? '')?.variants.find(v => v.id === variant)?.name ?? null,
});