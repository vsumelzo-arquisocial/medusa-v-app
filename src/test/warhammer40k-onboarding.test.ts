import { describe, expect, it } from 'vitest';
import { armySelectionSchema, factionsForRace, RACES } from '@/lib/warhammer40k-onboarding';
describe('40k initial army selection', () => {
  it('uses race rather than loyalist/traitor and offers human Chaos armies together', () => {
    expect(RACES.map(r => r.id)).not.toContain('loyalist');
    expect(RACES.map(r => r.id)).not.toContain('traitor');
    expect(factionsForRace('humanity').map(f => f.id)).toEqual(expect.arrayContaining(['space-marines', 'chaos-space-marines', 'death-guard']));
  });
  it('rejects a faction belonging to another race', () => {
    expect(armySelectionSchema.safeParse({ race: 'orks', faction: 'space-marines', variant: null }).success).toBe(false);
    expect(armySelectionSchema.safeParse({ race: 'orks', faction: 'orks', variant: null }).success).toBe(true);
  });
  it('allows official chapters and rejects unrelated variants', () => {
    expect(armySelectionSchema.safeParse({ race: 'humanity', faction: 'space-marines', variant: 'blood-angels' }).success).toBe(true);
    expect(armySelectionSchema.safeParse({ race: 'tau', faction: 'tau-empire', variant: 'blood-angels' }).success).toBe(false);
  });
  it('offers both Eldar factions and keeps their official variants attached', () => {
    expect(factionsForRace('aeldari').map(f => f.id)).toEqual(['aeldari', 'drukhari']);
    expect(armySelectionSchema.safeParse({ race: 'aeldari', faction: 'aeldari', variant: 'ynnari' }).success).toBe(true);
  });
});